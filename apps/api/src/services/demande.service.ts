import { PrismaClient, Prisma, DemandeCategory as PrismaDemandeCategory, DemandeStatus, RoleType, UserStatus } from "@prisma/client";
import { randomBytes } from "crypto";
import { AppError } from "../middleware/errorHandler";
import {
  DEMANDE_CATEGORY_DEPARTMENT_CODE,
  DemandeResponse,
  demandeResponseSchema,
} from "@dpmg/shared/zod";
import { resolveValidatorForDemande } from "./validation.service";
import { createNotificationOutboxEntries } from "./notification.service";
import {
  deleteProofFile,
  saveProofFile,
  type ProofFileInput,
} from "./proof-storage.service";

const prisma = new PrismaClient();

const REFERENCE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const REFERENCE_ATTEMPTS = 5;

type DemandeWithRelations = Prisma.DemandeGetPayload<{
  include: {
    department: { select: { code: true; name: true } };
    author: {
      select: {
        firstName: true;
        lastName: true;
        structureRoles: {
          select: {
            role: true;
            structure: { select: { code: true } };
          };
        };
      };
    };
  };
}>;

function generateReferenceSuffix(): string {
  const bytes = randomBytes(5);
  let suffix = "";
  for (const byte of bytes) {
    suffix += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
  }
  return suffix;
}

function toResponse(demande: DemandeWithRelations): DemandeResponse {
  return demandeResponseSchema.parse({
    id: demande.id,
    reference: demande.reference,
    title: demande.title,
    description: demande.description,
    status: demande.status,
    category: demande.category,
    departmentId: demande.departmentId,
    departmentCode: demande.department.code,
    departmentName: demande.department.name,
    authorId: demande.authorId,
    authorFirstName: demande.author.firstName,
    authorLastName: demande.author.lastName,
    createdAt: demande.createdAt.toISOString(),
    updatedAt: demande.updatedAt.toISOString(),
    submittedAt: demande.submittedAt?.toISOString() ?? null,
    satisfactionProofUrl: demande.satisfactionProofUrl ?? null,
    satisfactionObservations: demande.satisfactionObservations ?? null,
    closureReturnReason: demande.closureReturnReason ?? null,
    departmentAvisMotif: (demande as any).decisions?.find((d: any) => d.type === "AVIS_DEPARTEMENTAL")?.motif ?? null,
    departmentAvisCommentaire: (demande as any).decisions?.find((d: any) => d.type === "AVIS_DEPARTEMENTAL")?.commentaire ?? null,
    executionStartedAt: demande.executionStartedAt?.toISOString() ?? null,
  });
}

const includeRelations = {
  department: { select: { code: true, name: true } },
  decisions: { orderBy: { createdAt: "desc" } },
  author: {
    select: {
      firstName: true,
      lastName: true,
      structureRoles: {
        select: {
          role: true,
          structure: { select: { code: true } },
        },
      },
    },
  },
} satisfies Prisma.DemandeInclude;

/**
 * Structure de référence servant de point de départ à la hiérarchie de validation.
 *
 * Priorité 1 : la structure du département de la demande (Department.structureId).
 *   Elle est unique et stable : elle ne dépend pas de l'historique des rôles de
 *   l'utilisateur.
 *
 * Repli : les structures des rôles structurels ACTIFS de l'auteur (bornes
 *   temporelles inclusives du projet). Si plusieurs structures restent possibles,
 *   aucune n'est choisie arbitrairement : une erreur métier est renvoyée.
 *   Un rôle expiré ne détermine jamais la structure de référence.
 */
export async function resolveReferenceStructureId(
  departmentStructureId: string | null,
  authorId: string
): Promise<string> {
  const now = new Date();

  // Priorité : agence active de l'auteur (si identifiable).
  const activeAgencyRoles = await prisma.userStructureRole.findMany({
    where: {
      userId: authorId,
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
      structure: { type: "AGENCY" },
    },
    select: { structureId: true },
  });
  const agencyStructures = [...new Set(activeAgencyRoles.map((r) => r.structureId).filter(Boolean))];

  if (agencyStructures.length === 1) {
    return agencyStructures[0]!;
  }
  if (agencyStructures.length > 1) {
    throw new AppError(
      "STRUCTURE_AMBIGUE",
      "L'auteur de la demande est rattaché à plusieurs agences actives : structure de référence indéterminée",
      403
    );
  }

  // Repli historique : structure du département, puis rôles actifs de l'auteur.
  if (departmentStructureId) {
    return departmentStructureId;
  }

  const activeRoles = await prisma.userStructureRole.findMany({
    where: {
      userId: authorId,
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
    },
    select: { structureId: true },
  });
  const structures = [...new Set(activeRoles.map((r) => r.structureId))];

  if (structures.length === 1) {
    return structures[0]!;
  }
  if (structures.length === 0) {
    throw new AppError(
      "AUCUN_VALIDATEUR",
      "Aucun validateur trouvé pour cette demande",
      403
    );
  }
  throw new AppError(
    "STRUCTURE_AMBIGUE",
    "L'auteur de la demande est rattaché à plusieurs structures actives : structure de référence indéterminée",
    403
  );
}

/**
 * Traduit les erreurs métier de la résolution du validateur en réponses API.
 */
function asValidatorError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  return new AppError("INTERNAL_ERROR", "Erreur interne du serveur", 500);
}

async function resolveDepartmentForCategory(
  category: PrismaDemandeCategory,
  departmentId?: string
) {
  const expectedCode = DEMANDE_CATEGORY_DEPARTMENT_CODE[category];

  if (departmentId) {
    const department = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!department) {
      throw new AppError("DEPARTMENT_NOT_FOUND", "Département introuvable", 400);
    }
    if (department.code !== expectedCode) {
      throw new AppError(
        "DEPARTMENT_CATEGORY_MISMATCH",
        `Le département sélectionné ne correspond pas à la catégorie ${category}`,
        400
      );
    }
    return department;
  }

  const department = await prisma.department.findUnique({ where: { code: expectedCode } });
  if (!department) {
    throw new AppError(
      "DEPARTMENT_NOT_FOUND",
      `Aucun département configuré pour la catégorie ${category}`,
      400
    );
  }
  return department;
}

export async function createDemande(
  authorId: string,
  input: { title: string; description: string; category: PrismaDemandeCategory; departmentId?: string }
): Promise<DemandeResponse> {
  const department = await resolveDepartmentForCategory(input.category, input.departmentId);
  const year = new Date().getFullYear();

  for (let attempt = 0; attempt < REFERENCE_ATTEMPTS; attempt++) {
    const reference = `DEM-${year}-${generateReferenceSuffix()}`;
    try {
      const demande = await prisma.demande.create({
        data: {
          reference,
          title: input.title,
          description: input.description,
          category: input.category,
          departmentId: department.id,
          authorId,
          status: DemandeStatus.BROUILLON,
        },
        include: includeRelations,
      });
      return toResponse(demande);
    } catch (error) {
      const isUniqueCollision =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!isUniqueCollision) throw error;
    }
  }

  throw new AppError("REFERENCE_GENERATION_FAILED", "Impossible de générer une référence unique", 500);
}

/**
 * Construit la clause de visibilité des demandes pour un utilisateur donné,
 * en réutilisant strictement les mêmes règles que listDemandes.
 * Aucun filtre supplémentaire (statut, département) n'est appliqué ici.
 */
async function resolveRegionalAgencyAuthorIds(userId: string): Promise<string[]> {
  const now = new Date();
  const regionalRoles = await prisma.userStructureRole.findMany({
    where: {
      userId,
      role: RoleType.HIERARCHICAL_MANAGER,
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
      user: { status: UserStatus.ACTIVE },
      structure: { type: "REGIONAL_DIRECTION" },
    },
    select: { structureId: true },
  });

  const regionalStructureIds = [...new Set(regionalRoles.map((r) => r.structureId).filter(Boolean))] as string[];
  // Aucune ouverture globale : une seule Direction Régionale active est requise.
  if (regionalStructureIds.length !== 1) {
    return [];
  }

  const agencies = await prisma.structure.findMany({
    where: {
      type: "AGENCY",
      parentId: regionalStructureIds[0],
      status: true,
    },
    select: { id: true },
  });
  const agencyIds = agencies.map((a) => a.id);
  if (agencyIds.length === 0) {
    return [];
  }

  const agencyRoles = await prisma.userStructureRole.findMany({
    where: {
      structureId: { in: agencyIds },
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
      user: { status: UserStatus.ACTIVE },
    },
    select: { userId: true },
  });

  return [...new Set(agencyRoles.map((r) => r.userId))];
}

async function buildDemandeVisibilityWhere(
  userId: string,
  managerScopes: string[]
): Promise<Prisma.DemandeWhereInput> {
  const analyzableDepartmentIds = await resolveAnalyzableDepartmentIds(userId);
  const regionalAgencyAuthorIds = await resolveRegionalAgencyAuthorIds(userId);
  const dpmgDecisionDepartmentIds = await resolveDpmgDecisionDepartmentIds(userId);
  const dfcDecisionDepartmentIds = await resolveDfcDecisionDepartmentIds(userId);
  const executionDepartmentIds = await resolveExecutionDepartmentIds(userId);
  const dgDecisionDepartmentIds = await resolveDgDecisionDepartmentIds(userId);
  const cpmpDecisionDepartmentIds = await resolveCpmpDecisionDepartmentIds(userId);

  return {
    AND: [
      {
        OR: [
          { authorId: userId },
          ...(managerScopes.length > 0
            ? [
                { status: DemandeStatus.EN_ATTENTE_VALIDATION, department: { code: { in: managerScopes } } },
                { status: DemandeStatus.CLOTUREE, department: { code: { in: managerScopes } } },
              ]
            : []),
          ...(regionalAgencyAuthorIds.length > 0
            ? [
                // Un directeur régional suit toutes les demandes de ses agences,
                // quel que soit leur statut (sauf les brouillons, privés à l'auteur).
                {
                  authorId: { in: regionalAgencyAuthorIds },
                  status: { not: DemandeStatus.BROUILLON },
                },
              ]
            : []),
          ...(analyzableDepartmentIds.length > 0
            ? [{ status: DemandeStatus.EN_ATTENTE_ANALYSE, departmentId: { in: analyzableDepartmentIds } }]
            : []),
          // Visibilité DPMG étendue : toutes les étapes du pipeline couvertes par une habilitation DPMG active.
          ...(dpmgDecisionDepartmentIds.length > 0
            ? [
                { status: DemandeStatus.EN_ATTENTE_DECISION, departmentId: { in: dpmgDecisionDepartmentIds } },
                { status: DemandeStatus.EN_ATTENTE_ANALYSE, departmentId: { in: dpmgDecisionDepartmentIds } },
                { status: DemandeStatus.EN_ATTENTE_FINANCEMENT, departmentId: { in: dpmgDecisionDepartmentIds } },
                { status: DemandeStatus.EN_ATTENTE_EXECUTION, departmentId: { in: dpmgDecisionDepartmentIds } },
                { status: DemandeStatus.EN_ATTENTE_CONFIRMATION_SATISFACTION, departmentId: { in: dpmgDecisionDepartmentIds } },
                { status: DemandeStatus.CLOTUREE, departmentId: { in: dpmgDecisionDepartmentIds } },
              ]
            : []),
          ...(dfcDecisionDepartmentIds.length > 0
            ? [
                { status: DemandeStatus.EN_ATTENTE_FINANCEMENT, departmentId: { in: dfcDecisionDepartmentIds } },
                { status: DemandeStatus.EN_ATTENTE_EXECUTION, departmentId: { in: dfcDecisionDepartmentIds } },
              ]
            : []),
          // Visibilité département / exécution : demandes en attente d'exécution ou de confirmation
          // pour les départements couverts par une habilitation départementale/execution active.
          ...(dgDecisionDepartmentIds.length > 0
            ? [
                { status: DemandeStatus.EN_ATTENTE_FINANCEMENT, departmentId: { in: dgDecisionDepartmentIds } },
                { status: DemandeStatus.EN_ATTENTE_EXECUTION, departmentId: { in: dgDecisionDepartmentIds } },
                { status: DemandeStatus.EN_ATTENTE_CONFIRMATION_SATISFACTION, departmentId: { in: dgDecisionDepartmentIds } },
                { status: DemandeStatus.CLOTUREE, departmentId: { in: dgDecisionDepartmentIds } },
              ]
            : []),
          ...(cpmpDecisionDepartmentIds.length > 0
            ? [
                { status: DemandeStatus.EN_ATTENTE_FINANCEMENT, departmentId: { in: cpmpDecisionDepartmentIds } },
                { status: DemandeStatus.EN_ATTENTE_EXECUTION, departmentId: { in: cpmpDecisionDepartmentIds } },
                { status: DemandeStatus.EN_ATTENTE_CONFIRMATION_SATISFACTION, departmentId: { in: cpmpDecisionDepartmentIds } },
                { status: DemandeStatus.CLOTUREE, departmentId: { in: cpmpDecisionDepartmentIds } },
              ]
            : []),
          ...(executionDepartmentIds.length > 0
            ? [
                { status: DemandeStatus.EN_ATTENTE_EXECUTION, departmentId: { in: executionDepartmentIds } },
                { status: DemandeStatus.EN_ATTENTE_CONFIRMATION_SATISFACTION, departmentId: { in: executionDepartmentIds } },
                { status: DemandeStatus.CLOTUREE, departmentId: { in: executionDepartmentIds } },
              ]
            : []),
        ],
      },
    ],
  };
}

export async function listDemandes(
  userId: string,
  managerScopes: string[],
  filters: { status?: DemandeStatus; departmentId?: string }
): Promise<DemandeResponse[]> {
  const baseWhere = await buildDemandeVisibilityWhere(userId, managerScopes);
  const andClauses: Prisma.DemandeWhereInput[] = [...((baseWhere.AND as Prisma.DemandeWhereInput[] | undefined) ?? [])];

  if (filters.status) {
    andClauses.push({ status: filters.status });
  }
  if (filters.departmentId) {
    andClauses.push({ departmentId: filters.departmentId });
  }

  const demandes = await prisma.demande.findMany({
    where: { AND: andClauses },
    include: includeRelations,
    orderBy: { createdAt: "desc" },
  });

  return demandes.map(toResponse);
}

export async function findVisibleDemande(
  id: string,
  userId: string,
  managerScopes: string[]
): Promise<DemandeResponse | null> {
  const demande = await prisma.demande.findUnique({
    where: { id },
    include: includeRelations,
  });

  if (!demande) return null;

  const isAuthor = demande.authorId === userId;
  const isManagerView =
    demande.status !== DemandeStatus.BROUILLON && managerScopes.includes(demande.department.code);
  const analyzableDepartmentIds = await resolveAnalyzableDepartmentIds(userId);
  const isDepartmentManagerView =
    demande.status === DemandeStatus.EN_ATTENTE_ANALYSE &&
    analyzableDepartmentIds.includes(demande.departmentId);
  const regionalAgencyAuthorIds = await resolveRegionalAgencyAuthorIds(userId);
  const isRegionalManagerView =
    demande.status !== DemandeStatus.BROUILLON &&
    regionalAgencyAuthorIds.includes(demande.authorId);
  // Un décideur DPMG habilité accède à la fiche des demandes à lui soumettre.
  const isDpmgDecisionView =
    (demande.status === DemandeStatus.EN_ATTENTE_DECISION ||
      demande.status === DemandeStatus.EN_ATTENTE_ANALYSE ||
      demande.status === DemandeStatus.EN_ATTENTE_FINANCEMENT ||
      demande.status === DemandeStatus.EN_ATTENTE_EXECUTION ||
      demande.status === DemandeStatus.EN_ATTENTE_CONFIRMATION_SATISFACTION ||
      demande.status === DemandeStatus.CLOTUREE) &&
    (await resolveDpmgDecisionDepartmentIds(userId)).includes(demande.departmentId);
  // Un contrôleur DFC habilité accède à la fiche des demandes en attente de financement.
  const isDfcDecisionView =
    (demande.status === DemandeStatus.EN_ATTENTE_FINANCEMENT ||
      demande.status === DemandeStatus.EN_ATTENTE_EXECUTION) &&
    (await resolveDfcDecisionDepartmentIds(userId)).includes(demande.departmentId);

  const isDgView =
    (demande.status === DemandeStatus.EN_ATTENTE_FINANCEMENT ||
      demande.status === DemandeStatus.EN_ATTENTE_EXECUTION ||
      demande.status === DemandeStatus.EN_ATTENTE_CONFIRMATION_SATISFACTION ||
      demande.status === DemandeStatus.CLOTUREE) &&
    (await resolveDgDecisionDepartmentIds(userId)).includes(demande.departmentId);

  const isCpmpView =
    (demande.status === DemandeStatus.EN_ATTENTE_FINANCEMENT ||
      demande.status === DemandeStatus.EN_ATTENTE_EXECUTION ||
      demande.status === DemandeStatus.EN_ATTENTE_CONFIRMATION_SATISFACTION ||
      demande.status === DemandeStatus.CLOTUREE) &&
    (await resolveCpmpDecisionDepartmentIds(userId)).includes(demande.departmentId);

  const isExecutionView =
    (demande.status === DemandeStatus.EN_ATTENTE_EXECUTION ||
      demande.status === DemandeStatus.EN_ATTENTE_CONFIRMATION_SATISFACTION ||
      demande.status === DemandeStatus.CLOTUREE) &&
    (await resolveExecutionDepartmentIds(userId)).includes(demande.departmentId);

  if (!isAuthor && !isManagerView && !isDepartmentManagerView && !isRegionalManagerView && !isDpmgDecisionView && !isDfcDecisionView && !isExecutionView && !isDgView && !isCpmpView) return null;

  return toResponse(demande);
}

export async function updateDemande(
  id: string,
  userId: string,
  input: { title?: string; description?: string; category?: PrismaDemandeCategory; departmentId?: string }
): Promise<DemandeResponse> {
  const existing = await prisma.demande.findUnique({ where: { id } });

  if (!existing) {
    throw new AppError("NOT_FOUND", "Demande non trouvée", 404);
  }
  if (existing.authorId !== userId) {
    throw new AppError("FORBIDDEN", "Accès non autorisé : seul l'auteur peut modifier cette demande", 403);
  }
  if (!["BROUILLON", "RETOURNEE"].includes(existing.status)) {
    throw new AppError("DEMANDE_NOT_DRAFT", "Seul un brouillon ou une demande retournée peut être modifiée", 403);
  }

  const nextCategory = input.category ?? existing.category;
  const nextDepartmentId =
    input.departmentId ?? (nextCategory === existing.category ? existing.departmentId : undefined);
  const department = await resolveDepartmentForCategory(nextCategory, nextDepartmentId);

  const updateData: any = {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    category: nextCategory,
    departmentId: department.id,
  };

  // Guarded update to prevent concurrent modification
  const result = await prisma.demande.updateMany({
    where: { id, authorId: existing.authorId, status: { in: ["BROUILLON", "RETOURNEE"] } },
    data: updateData,
  });

  if (result.count === 0) {
    throw new AppError("DEMANDE_NOT_DRAFT", "Impossible de modifier la demande (modification concurrente ou statut modifié)", 403);
  }

  const demande = await prisma.demande.update({
    where: { id },
    data: updateData,
    include: includeRelations,
  });

  return toResponse(demande);
}

export async function submitDemande(id: string, userId: string): Promise<DemandeResponse> {
  const existing = await prisma.demande.findUnique({
    where: { id },
    include: { department: true },
  });

  if (!existing) {
    throw new AppError("NOT_FOUND", "Demande non trouvée", 404);
  }
  if (existing.authorId !== userId) {
    throw new AppError("FORBIDDEN", "Accès non autorisé : seul l'auteur peut soumettre cette demande", 403);
  }

  // Only BROUILLON and RETOURNEE can be submitted
  if (!["BROUILLON", "RETOURNEE"].includes(existing.status)) {
    if (existing.status === DemandeStatus.REFUSEE) {
      throw new AppError("DEMANDE_REFUSEE", "Une demande refusée ne peut pas être resoumise", 403);
    }
    throw new AppError("ALREADY_SUBMITTED", "Seulement un brouillon ou une demande retournée peut être soumise", 403);
  }

  let referenceStructureId = "";
  // Resolve validator before transaction (read-only).
  // La structure de référence est celle du département de la demande ; à défaut,
  // les structures des rôles structurels actifs de l'auteur.
  try {
    referenceStructureId = await resolveReferenceStructureId(
      existing.department.structureId,
      existing.authorId
    );
    await resolveValidatorForDemande(existing.authorId, referenceStructureId);
  } catch (error) {
    if (error instanceof AppError && error.code === "AUCUN_VALIDATEUR") {
      throw new AppError("AUCUN_VALIDATEUR", "Aucun validateur trouvé pour cette demande", 403);
    }
    if (error instanceof AppError && error.code === "VALIDATEUR_AMBIGU") {
      throw new AppError("VALIDATEUR_AMBIGU", "Plusieurs responsables possibles - designation explicite requise", 403);
    }
    throw asValidatorError(error);
  }

  // Atomic transaction: update status + create decision history + outbox
  let updatedDemande: DemandeWithRelations;
  try {
    updatedDemande = await prisma.$transaction(async (tx) => {
      const result = await tx.demande.update({
        where: {
          id,
          authorId: existing.authorId,
          status: { in: [DemandeStatus.BROUILLON, DemandeStatus.RETOURNEE] },
        },
        data: { status: DemandeStatus.EN_ATTENTE_VALIDATION, submittedAt: new Date() },
        include: includeRelations,
      });
      await tx.demandeDecision.create({
        data: {
          demandeId: id,
          actorId: userId,
          type: "SOUMISSION",
          motif: null,
          commentaire: null,
        },
      });
      await createNotificationOutboxEntries(tx, {
        type: "DEMANDE_SOUMISE",
        demande: {
          id: existing.id,
          authorId: existing.authorId,
          departmentId: existing.departmentId,
          department: { code: existing.department.code, structureId: existing.department.structureId ?? null },
          isUrgent: existing.isUrgent,
        },
        authorStructureId: referenceStructureId,
        eventSourceId: id,
      });
      return result;
    });
  } catch (error: any) {
    if (error.code === "P2034") {
      throw new AppError("ALREADY_SUBMITTED", "Cette demande a déjà été soumise ou modifiée par un autre utilisateur", 403);
    }
    throw error;
  }

  return toResponse(updatedDemande);
}

/**
 * Contrôle d'accès des actions de validation hiérarchique (approve / refuse / return).
 *
 * L'action n'est autorisée que si l'acteur est le VALIDATEUR DÉSIGNÉ de la demande.
 * Le validateur désigné est déterminé à partir de la hiérarchie de l'AUTEUR de la
 * demande (et non de celle de l'acteur), en écartant l'auteur lui-même et en ne
 * retenant que les habilitations et délégations actives à la date du jour.
 */
async function validateDecisionUser(userId: string, demandeId: string): Promise<void> {
  const existing = await prisma.demande.findUnique({
    where: { id: demandeId },
    include: { department: { select: { structureId: true } } },
  });
  if (!existing) {
    throw new AppError("NOT_FOUND", "Demande non trouvée", 404);
  }
  if (existing.authorId === userId) {
    throw new AppError("FORBIDDEN", "L'auteur ne peut pas agir sur sa propre demande", 403);
  }

  // Le validateur désigné se déduit de la structure du DÉPARTEMENT de la demande
  // (Department.structureId) et non d'un identifiant de département ni du rôle
  // structurel le plus récent de l'utilisateur.
  let designatedValidatorId: string;
  try {
    const referenceStructureId = await resolveReferenceStructureId(
      existing.department.structureId,
      existing.authorId
    );
    designatedValidatorId = await resolveValidatorForDemande(
      existing.authorId,
      referenceStructureId,
      { excludeAuthor: true }
    );
  } catch (error) {
    if (error instanceof AppError && error.code === "AUCUN_VALIDATEUR") {
      throw new AppError("AUCUN_VALIDATEUR", "Aucun validateur trouvé pour cette demande", 403);
    }
    if (error instanceof AppError && error.code === "VALIDATEUR_AMBIGU") {
      throw new AppError("VALIDATEUR_AMBIGU", "Plusieurs responsables possibles - designation explicite requise", 403);
    }
    throw asValidatorError(error);
  }

  // La présence d'un validateur dans la hiérarchie ne suffit pas :
  // l'acteur doit être ce validateur désigné.
  if (designatedValidatorId !== userId) {
    throw new AppError(
      "FORBIDDEN",
      "Vous n'êtes pas le validateur désigné pour cette demande",
      403
    );
  }
}

export async function approveDemande(id: string, userId: string): Promise<DemandeResponse> {
  const existing = await prisma.demande.findUnique({ where: { id }, include: { department: { select: { code: true, structureId: true } } } });
  if (!existing) {
    throw new AppError("NOT_FOUND", "Demande non trouvée", 404);
  }
  if (existing.status !== DemandeStatus.EN_ATTENTE_VALIDATION) {
    throw new AppError("DEMANDE_NOT_DRAFT", "Seule une demande en attente de validation peut être approuvée", 403);
  }
  await validateDecisionUser(userId, id);
  // Atomic transaction: update status + create decision history + outbox
  let updatedDemande: DemandeWithRelations;
  try {
    updatedDemande = await prisma.$transaction(async (tx) => {
      const result = await tx.demande.update({
        where: {
          id,
          authorId: existing.authorId,
          status: DemandeStatus.EN_ATTENTE_VALIDATION,
        },
        data: { status: DemandeStatus.EN_ATTENTE_ANALYSE },
        include: includeRelations,
      });
      await tx.demandeDecision.create({
        data: {
          demandeId: id,
          actorId: userId,
          type: "APPROBATION",
          motif: null,
          commentaire: null,
        },
      });
      await createNotificationOutboxEntries(tx, {
        type: "DEMANDE_VALIDEE",
        demande: {
          id: existing.id,
          authorId: existing.authorId,
          departmentId: existing.departmentId,
          department: { code: existing.department.code, structureId: existing.department.structureId ?? null },
          isUrgent: existing.isUrgent,
        },
        eventSourceId: id,
      });
      await createNotificationOutboxEntries(tx, {
        type: "DEMANDE_EN_ATTENTE_ANALYSE",
        demande: {
          id: existing.id,
          reference: existing.reference,
          authorId: existing.authorId,
          departmentId: existing.departmentId,
          department: { code: existing.department.code, structureId: existing.department.structureId ?? null },
          isUrgent: existing.isUrgent,
        },
        eventSourceId: id,
      });
      return result;
    });
  } catch (error: any) {
    if (error.code === "P2034") {
      throw new AppError("ALREADY_SUBMITTED", "Cette demande a déjà été modifiée ou soumise par un autre utilisateur", 403);
    }
    throw error;
  }
  return toResponse(updatedDemande);
}

export async function refuseDemande(id: string, userId: string, motif: string): Promise<DemandeResponse> {
  const existing = await prisma.demande.findUnique({ where: { id }, include: { department: { select: { code: true, structureId: true } } } });
  if (!existing) {
    throw new AppError("NOT_FOUND", "Demande non trouvée", 404);
  }
  if (existing.status !== DemandeStatus.EN_ATTENTE_VALIDATION) {
    throw new AppError("DEMANDE_NOT_DRAFT", "Seule une demande en attente de validation peut être refusée", 403);
  }
  if (!motif || motif.trim() === "") {
    throw new AppError("VALIDATION_ERROR", "Le motif du refus est requis", 400);
  }
  await validateDecisionUser(userId, id);
  // Atomic transaction: update status + create decision history + outbox
  let updatedDemande: DemandeWithRelations;
  try {
    updatedDemande = await prisma.$transaction(async (tx) => {
      const result = await tx.demande.update({
        where: {
          id,
          authorId: existing.authorId,
          status: DemandeStatus.EN_ATTENTE_VALIDATION,
        },
        data: { status: DemandeStatus.REFUSEE },
        include: includeRelations,
      });
      await tx.demandeDecision.create({
        data: {
          demandeId: id,
          actorId: userId,
          type: "REFUS",
          motif: motif.trim(),
          commentaire: null,
        },
      });
      await createNotificationOutboxEntries(tx, {
        type: "DEMANDE_REFUSEE",
        demande: {
          id: existing.id,
          authorId: existing.authorId,
          departmentId: existing.departmentId,
          department: { code: existing.department.code, structureId: existing.department.structureId ?? null },
          isUrgent: existing.isUrgent,
        },
        eventSourceId: id,
      });
      return result;
    });
  } catch (error: any) {
    if (error.code === "P2034") {
      throw new AppError("ALREADY_SUBMITTED", "Cette demande a déjà été modifiée ou soumise par un autre utilisateur", 403);
    }
    throw error;
  }
  return toResponse(updatedDemande);
}

export async function returnDemande(id: string, userId: string, motif?: string, commentaire?: string): Promise<DemandeResponse> {
  const existing = await prisma.demande.findUnique({ where: { id }, include: { department: { select: { code: true, structureId: true } } } });
  if (!existing) {
    throw new AppError("NOT_FOUND", "Demande non trouvée", 404);
  }
  if (existing.status !== DemandeStatus.EN_ATTENTE_VALIDATION) {
    throw new AppError("DEMANDE_NOT_DRAFT", "Seule une demande en attente de validation peut être retournée", 403);
  }
  if (!motif && !commentaire) {
    throw new AppError("VALIDATION_ERROR", "Le motif ou le commentaire de retour est requis", 400);
  }
  await validateDecisionUser(userId, id);
  // Atomic transaction: update status + create decision history + outbox
  let updatedDemande: DemandeWithRelations;
  try {
    updatedDemande = await prisma.$transaction(async (tx) => {
      const result = await tx.demande.update({
        where: {
          id,
          authorId: existing.authorId,
          status: DemandeStatus.EN_ATTENTE_VALIDATION,
        },
        data: { status: DemandeStatus.RETOURNEE },
        include: includeRelations,
      });
      await tx.demandeDecision.create({
        data: {
          demandeId: id,
          actorId: userId,
          type: "RETOUR",
          motif: motif ? motif.trim() : null,
          commentaire: commentaire ? commentaire.trim() : null,
        },
      });
      await createNotificationOutboxEntries(tx, {
        type: "DEMANDE_RETOURNEE",
        demande: {
          id: existing.id,
          authorId: existing.authorId,
          departmentId: existing.departmentId,
          department: { code: existing.department.code, structureId: existing.department.structureId ?? null },
          isUrgent: existing.isUrgent,
        },
        eventSourceId: id,
      });
      return result;
    });
  } catch (error: any) {
    if (error.code === "P2034") {
      throw new AppError("ALREADY_SUBMITTED", "Cette demande a déjà été modifiée ou soumise par un autre utilisateur", 403);
    }
    throw error;
  }
  return toResponse(updatedDemande);
}

/** Cible d'une habilitation : le périmètre (scope) et la structure visés. */
interface DepartmentTarget {
  scope: string | null;
  structureId: string;
}

/**
 * Habilitation départementale active d'un utilisateur.
 *
 * - `own` : cible propre au rôle (DEPARTMENT_MANAGER ou DEPARTMENT_DELEGATE) ;
 * - `delegatorTargets` : cibles des DEPARTMENT_MANAGER actifs du délégant.
 *   Vide pour un DEPARTMENT_MANAGER direct, qui n'est pas une délégation.
 */
interface DepartmentHabilitation {
  role: RoleType;
  own: DepartmentTarget;
  delegatorTargets: DepartmentTarget[];
}

/**
 * Règles départementales partagées entre l'AUTORISATION d'un avis et la
 * VISIBILITÉ des demandes à analyser, afin que les deux ne puissent pas diverger.
 *
 * Le modèle de données relie les rôles à une `Structure` (UserStructureRole.structureId)
 * alors que la demande porte un `Department` (Department.structureId). Les deux
 * identifiants ne sont PAS interchangeables : le pont est `Department.structureId`.
 */
function targetsDepartment(
  target: DepartmentTarget,
  department: { code: string; structureId: string | null }
): boolean {
  // `scope: "*"` n'accorde aucun périmètre (cf. managerScopesFromRequest).
  if (target.scope === "*") return false;
  if (target.scope === department.code) return true;
  // Rattachement structurel : Department.structureId -> Structure.id
  if (department.structureId && target.structureId === department.structureId) return true;
  return false;
}

/**
 * Une habilitation couvre un département si sa propre cible le couvre et, pour
 * une délégation départementale, si le délégant couvre également ce département.
 */
function habilitationCoversDepartment(
  habilitation: DepartmentHabilitation,
  department: { code: string; structureId: string | null }
): boolean {
  if (!targetsDepartment(habilitation.own, department)) return false;
  if (habilitation.role === RoleType.DEPARTMENT_DELEGATE) {
    return habilitation.delegatorTargets.some((t) => targetsDepartment(t, department));
  }
  return true;
}

/**
 * Habilitations départementales ACTIVES de l'utilisateur (bornes temporelles
 * inclusives du projet). Pour une délégation DEPARTMENT_DELEGATE, les cibles du
 * délégant sont résolues afin que la délégation ne soit retenue que si le
 * délégant est lui-même habilité.
 */
async function activeDepartmentHabilitations(userId: string): Promise<DepartmentHabilitation[]> {
  const now = new Date();

  const roles = await prisma.userStructureRole.findMany({
    where: {
      userId,
      role: { in: [RoleType.DEPARTMENT_MANAGER, RoleType.DEPARTMENT_DELEGATE] },
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
    },
    select: {
      role: true,
      scope: true,
      structureId: true,
      delegatedFromUserId: true,
    },
  });

  // Exclure les rôles sans structure (ex: TECHNICAL_ADMIN global) :
  // ils ne peuvent pas fournir d'habilitations départementales.
  const rolesWithStructure = roles.filter(
    (r): r is { structureId: string } & typeof r => r.structureId !== null
  );

  const delegatorIds = [
    ...new Set(
      rolesWithStructure
        .filter((r) => r.role === RoleType.DEPARTMENT_DELEGATE && r.delegatedFromUserId !== null)
        .map((r) => r.delegatedFromUserId!)
    ),
  ];

  const delegatorRoles = delegatorIds.length
    ? (
        await prisma.userStructureRole.findMany({
          where: {
            userId: { in: delegatorIds },
            role: RoleType.DEPARTMENT_MANAGER,
            startDate: { lte: now },
            OR: [{ endDate: null }, { endDate: { gte: now } }],
          },
          select: { userId: true, scope: true, structureId: true },
        })
      ).filter((d): d is { structureId: string } & typeof d => d.structureId !== null)
    : [];

  return rolesWithStructure.map((r) => ({
    role: r.role,
    own: { scope: r.scope, structureId: r.structureId },
    delegatorTargets:
      r.role === RoleType.DEPARTMENT_DELEGATE && r.delegatedFromUserId !== null
        ? delegatorRoles
            .filter((d) => d.userId === r.delegatedFromUserId)
            .map((d) => ({ scope: d.scope, structureId: d.structureId }))
        : [],
  }));
}

/**
 * Identifiants des départements dont l'utilisateur peut enregistrer un avis
 * departmental. Utilisé pour la visibilité des demandes EN_ATTENTE_ANALYSE :
 * les règles sont identiques à celles de l'autorisation d'avis.
 */
async function resolveAnalyzableDepartmentIds(userId: string): Promise<string[]> {
  const habilitations = await activeDepartmentHabilitations(userId);
  if (habilitations.length === 0) return [];

  const departments = await prisma.department.findMany({
    select: { id: true, code: true, structureId: true },
  });

  return departments
    .filter((d) => habilitations.some((h) => habilitationCoversDepartment(h, d)))
    .map((d) => d.id);
}

/**
 * Autorisation d'enregistrement d'un avis départemental.
 *
 * Un rôle est retenu si et seulement si :
 *  - il est de type DEPARTMENT_MANAGER (ou DEPARTMENT_DELEGATE délégation valide) ;
 *  - il est actif à la date du jour (startDate <= now, endDate null ou >= now) ;
 *  - il cible le département de la demande, soit par `scope === department.code`
 *    (convention projet utilisée par managerScopesFromRequest), soit par rattachement
 *    à la structure du département ;
 *  - il ne porte pas `scope: "*"`, qui ne confère aucun droit sur un département.
 *
 * Les règles sont partagées avec la visibilité de la liste (resolveAnalyzableDepartmentIds).
 */
async function assertDepartmentAvisAuthorizer(
  userId: string,
  department: { code: string; structureId: string | null }
): Promise<void> {
  const habilitations = await activeDepartmentHabilitations(userId);
  const authorized = habilitations.some((h) => habilitationCoversDepartment(h, department));

  if (!authorized) {
    throw new AppError(
      "FORBIDDEN",
      "Vous n'êtes pas habilité pour le département concerné",
      403
    );
  }
}

/**
 * Habilitation DPMG active d'un utilisateur.
 *
 * - `scope` : périmètre de compétence du rôle DPMG ;
 * - `delegatorScopes` : périmètres des DPMG_MANAGER actifs du délégant.
 *   Vide pour un DPMG_MANAGER direct, qui n'est pas une délégation.
 */
interface DpmgHabilitation {
  role: RoleType;
  scope: string | null;
  delegatorScopes: (string | null)[];
}

/**
 * Compétence DPMG sur un département.
 *
 * Le pouvoir de décider vient du RÔLE (DPMG_MANAGER / DPMG_DELEGATE) et de son
 * habilitation active ; `scope` n'est jamais un privilège implicite :
 *  - un `scope: "*"` n'accorde de compétence qu'aux porteurs d'un rôle DPMG ;
 *    seul `scope: "*"` SEUL, sans rôle DPMG, ne donne aucun droit ;
 *  - un `scope` portant un code de département limite la compétence à ce
 *    département ;
 *  - un `scope` nul ne donne aucune compétence.
 */
function dpmgScopeCovers(scope: string | null, departmentCode: string): boolean {
  if (!scope) return false;
  if (scope === "*") return true;
  return scope === departmentCode;
}

/**
 * Habilitations DPMG ACTIVES de l'utilisateur (bornes temporelles inclusives du
 * projet). Pour une délégation DPMG_DELEGATE, la délégation n'est retenue que si
 * le délégant est lui-même DPMG_MANAGER actif et compétent.
 */
async function activeDpmgHabilitations(userId: string): Promise<DpmgHabilitation[]> {
  const now = new Date();

  const roles = await prisma.userStructureRole.findMany({
    where: {
      userId,
      role: { in: [RoleType.DPMG_MANAGER, RoleType.DPMG_DELEGATE] },
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
    },
    select: {
      role: true,
      scope: true,
      delegatedFromUserId: true,
    },
  });

  const delegatorIds = [
    ...new Set(
      roles
        .filter((r) => r.role === RoleType.DPMG_DELEGATE && r.delegatedFromUserId !== null)
        .map((r) => r.delegatedFromUserId!)
    ),
  ];

  const delegatorRoles = delegatorIds.length
    ? await prisma.userStructureRole.findMany({
        where: {
          userId: { in: delegatorIds },
          role: RoleType.DPMG_MANAGER,
          startDate: { lte: now },
          OR: [{ endDate: null }, { endDate: { gte: now } }],
        },
        select: { userId: true, scope: true },
      })
    : [];

  return roles.map((r) => ({
    role: r.role,
    scope: r.scope,
    delegatorScopes:
      r.role === RoleType.DPMG_DELEGATE && r.delegatedFromUserId !== null
        ? delegatorRoles
            .filter((d) => d.userId === r.delegatedFromUserId)
            .map((d) => d.scope)
        : [],
  }));
}

/**
 * Une habilitation DPMG couvre un département si sa propre compétence le couvre
 * et, pour une délégation, si le délégant couvre également ce département.
 */
function dpmgHabilitationCovers(
  habilitation: DpmgHabilitation,
  departmentCode: string
): boolean {
  if (!dpmgScopeCovers(habilitation.scope, departmentCode)) return false;
  if (habilitation.role === RoleType.DPMG_DELEGATE) {
    return habilitation.delegatorScopes.some((s) => dpmgScopeCovers(s, departmentCode));
  }
  return true;
}

/**
 * Contrôle d'accès à la décision DPMG.
 * L'auteur de la demande ne peut pas décider de sa propre demande.
 */
async function assertDpmgDecisionAuthorizer(userId: string, departmentCode: string): Promise<void> {
  const habilitations = await activeDpmgHabilitations(userId);
  const authorized = habilitations.some((h) => dpmgHabilitationCovers(h, departmentCode));

  if (!authorized) {
    throw new AppError(
      "FORBIDDEN",
      "Vous n'êtes pas habilité à décider pour la DPMG sur ce département",
      403
    );
  }
}

/**
 * Identifiants des départements dont l'utilisateur peut prendre une décision
 * DPMG. Utilisé pour la visibilité des demandes EN_ATTENTE_DECISION : les règles
 * sont identiques à celles de l'autorisation de décision.
 */
async function resolveDpmgDecisionDepartmentIds(userId: string): Promise<string[]> {
  const habilitations = await activeDpmgHabilitations(userId);
  if (habilitations.length === 0) return [];

  const departments = await prisma.department.findMany({
    select: { id: true, code: true },
  });

  return departments
    .filter((d) => habilitations.some((h) => dpmgHabilitationCovers(h, d.code)))
    .map((d) => d.id);
}

export async function avisDemande(
  id: string,
  userId: string,
  motif?: string | null,
  commentaire?: string | null
): Promise<DemandeResponse> {
  const existing = await prisma.demande.findUnique({
    where: { id },
    include: { department: { select: { code: true, structureId: true } } },
  });
  if (!existing) {
    throw new AppError("NOT_FOUND", "Demande non trouvée", 404);
  }
  // Seule une demande en EN_ATTENTE_ANALYSE peut recevoir un avis départemental
  if (existing.status !== DemandeStatus.EN_ATTENTE_ANALYSE) {
    throw new AppError(
      "DEMANDE_NOT_ANALYSE",
      "Seule une demande en attente d'analyse peut recevoir un avis départemental",
      403
    );
  }
  // Interdire à l'auteur de poster son propre avis
  if (existing.authorId === userId) {
    throw new AppError("FORBIDDEN", "L'auteur ne peut pas enregistrer son propre avis", 403);
  }
  // Autorisation départementale : habilitation active sur le département réel de la demande
  await assertDepartmentAvisAuthorizer(userId, existing.department);

  // Transaction atomique : mettre à jour le statut + créer l'entrée de décision + outbox
  let updatedDemande: DemandeWithRelations;
  try {
    updatedDemande = await prisma.$transaction(async (tx) => {
      const result = await tx.demande.update({
        where: {
          id,
          authorId: existing.authorId,
          status: DemandeStatus.EN_ATTENTE_ANALYSE,
        },
        data: { status: DemandeStatus.EN_ATTENTE_DECISION },
        include: includeRelations,
      });
      await tx.demandeDecision.create({
        data: {
          demandeId: id,
          actorId: userId,
          type: "AVIS_DEPARTEMENTAL",
          motif: motif?.trim() ?? null,
          commentaire: commentaire?.trim() ?? null,
        },
      });
      await createNotificationOutboxEntries(tx, {
        type: "AVIS_DEPARTEMENTAL",
        demande: {
          id: existing.id,
          authorId: existing.authorId,
          departmentId: existing.departmentId,
          department: { code: existing.department.code, structureId: existing.department.structureId ?? null },
          isUrgent: existing.isUrgent,
        },
        eventSourceId: id,
      });
      // Recharger pour inclure la nouvelle décision dans la réponse
      const updated = await tx.demande.findUnique({
        where: { id },
        include: includeRelations,
      });
      return updated!;
    });
  } catch (error: any) {
    // P2025 : le statut attendu EN_ATTENTE_ANALYSE n'est plus valide (demande déjà
    // traitée entre-temps ou répétition de la requête). La transaction est annulée :
    // aucun avis orphelin, aucun statut partiellement modifié.
    if (error.code === "P2025") {
      throw new AppError(
        "DEMANDE_NOT_ANALYSE",
        "La demande n'est plus en attente d'analyse : aucun avis n'a été enregistré",
        403
      );
    }
    // P2034 : conflit d'écriture détecté par le client Prisma
    if (error.code === "P2034") {
      throw new AppError(
        "CONCURRENT_MODIFICATION",
        "Cette demande a été modifiée ou traitée par un autre utilisateur",
        409
      );
    }
    throw error;
  }
  return toResponse(updatedDemande);
}

/**
 * Décisions DPMG possibles et leurs effets.
 *
 * `APPROBATION` : la demande attend le contrôle financier DFC. Elle ne signifie
 *   pas que les fonds sont disponibles.
 * `REFUS` : la demande est refusée, motif obligatoire.
 * `RETOUR` : la demande est rendue à son auteur pour correction, motif obligatoire.
 */
export type DpmgDecision = "APPROBATION" | "REFUS" | "RETOUR";

const DPMG_DECISION_TARGET_STATUS: Record<DpmgDecision, DemandeStatus> = {
  APPROBATION: DemandeStatus.EN_ATTENTE_FINANCEMENT,
  REFUS: DemandeStatus.REFUSEE,
  RETOUR: DemandeStatus.RETOURNEE,
};

const DPMG_DECISION_TYPE: Record<DpmgDecision, "DECISION_DPMG_APPROBATION" | "DECISION_DPMG_REFUS" | "DECISION_DPMG_RETOUR"> = {
  APPROBATION: "DECISION_DPMG_APPROBATION",
  REFUS: "DECISION_DPMG_REFUS",
  RETOUR: "DECISION_DPMG_RETOUR",
};

/**
 * Enregistre une décision DPMG sur une demande en attente de décision.
 *
 * Le statut de la demande et l'entrée d'historique sont modifiés dans une seule
 * transaction Prisma : la mise à jour est conditionnée au statut attendu, ce qui
 * rend une répétition ou une concurrence impossible à aboutir (P2025).
 */
export async function decisionDpmgDemande(
  id: string,
  userId: string,
  decision: DpmgDecision,
  motif?: string | null,
  commentaire?: string | null
): Promise<DemandeResponse> {
  const existing = await prisma.demande.findUnique({
    where: { id },
    include: { department: { select: { code: true } } },
  });
  if (!existing) {
    throw new AppError("NOT_FOUND", "Demande non trouvée", 404);
  }
  // Seule une demande en attente de décision peut recevoir une décision DPMG
  if (existing.status !== DemandeStatus.EN_ATTENTE_DECISION) {
    throw new AppError(
      "DEMANDE_NOT_DECISION",
      "Seule une demande en attente de décision peut recevoir une décision DPMG",
      403
    );
  }
  // L'auteur ne peut pas décider de sa propre demande
  if (existing.authorId === userId) {
    throw new AppError("FORBIDDEN", "L'auteur ne peut pas décider de sa propre demande", 403);
  }
  // Habilitation DPMG active et compétente sur le département de la demande
  await assertDpmgDecisionAuthorizer(userId, existing.department.code);

  const targetStatus = DPMG_DECISION_TARGET_STATUS[decision];
  const decisionType = DPMG_DECISION_TYPE[decision];

  // Transaction atomique : mise à jour du statut + création de l'événement d'historique + outbox
  let updatedDemande: DemandeWithRelations;
  try {
    updatedDemande = await prisma.$transaction(async (tx) => {
      const result = await tx.demande.update({
        where: {
          id,
          authorId: existing.authorId,
          status: DemandeStatus.EN_ATTENTE_DECISION,
        },
        data: { status: targetStatus },
        include: includeRelations,
      });
      await tx.demandeDecision.create({
        data: {
          demandeId: id,
          actorId: userId,
          type: decisionType,
          motif: motif?.trim() ? motif.trim() : null,
          commentaire: commentaire?.trim() ? commentaire.trim() : null,
        },
      });
      const notifType =
        decision === "APPROBATION"
          ? "DECISION_DPMG_APPROBATION"
          : decision === "REFUS"
          ? "DECISION_DPMG_REFUS"
          : "DECISION_DPMG_RETOUR";
      await createNotificationOutboxEntries(tx, {
        type: notifType,
        demande: {
          id: existing.id,
          authorId: existing.authorId,
          departmentId: existing.departmentId,
          department: { code: existing.department.code, structureId: null },
          isUrgent: existing.isUrgent,
        },
        eventSourceId: id,
      });
      if (decision === "APPROBATION") {
        await createNotificationOutboxEntries(tx, {
          type: "DEMANDE_EN_ATTENTE_FINANCEMENT",
          demande: {
            id: existing.id,
            authorId: existing.authorId,
            departmentId: existing.departmentId,
            department: { code: existing.department.code, structureId: null },
            isUrgent: existing.isUrgent,
          },
          eventSourceId: id,
        });
      }
      return result;
    });
  } catch (error: any) {
    // P2025 : le statut attendu EN_ATTENTE_DECISION n'est plus valide (demande déjà
    // traitée entre-temps ou répétition de la requête). La transaction est annulée :
    // aucune décision orpheline, aucun statut partiellement modifié.
    if (error.code === "P2025") {
      throw new AppError(
        "DEMANDE_NOT_DECISION",
        "La demande n'est plus en attente de décision : aucune décision n'a été enregistrée",
        403
      );
    }
    // P2034 : conflit d'écriture détecté par le client Prisma
    if (error.code === "P2034") {
      throw new AppError(
        "CONCURRENT_MODIFICATION",
        "Cette demande a été modifiée ou traitée par un autre utilisateur",
        409
      );
    }
    throw error;
  }
  return toResponse(updatedDemande);
}
// ---------------------------------------------------------------------------
// Contrôle financier DFC.
// ---------------------------------------------------------------------------

export interface DfcHabilitation {
  role: RoleType;
  scope: string | null;
}

export function dfcScopeCovers(scope: string | null, departmentCode: string): boolean {
  if (!scope) return false;
  if (scope === "*") return true;
  return scope === departmentCode;
}

export async function activeDfcHabilitations(userId: string, db: any = prisma): Promise<DfcHabilitation[]> {
  const now = new Date();
  const roles = await db.userStructureRole.findMany({
    where: {
      userId,
      role: RoleType.DFC_CONTROLLER,
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
    },
    select: { role: true, scope: true },
  });
  return roles;
}

async function assertDfcController(userId: string, departmentCode: string, db: any = prisma): Promise<void> {
  const habilitations = await activeDfcHabilitations(userId, db);
  const authorized = habilitations.some((h) => dfcScopeCovers(h.scope, departmentCode));
  if (!authorized) {
    throw new AppError(
      "FORBIDDEN",
      "Vous n'êtes pas habilité à contrôler le financement de ce département",
      403
    );
  }
}

async function resolveDfcDecisionDepartmentIds(userId: string): Promise<string[]> {
  const habilitations = await activeDfcHabilitations(userId);
  if (habilitations.length === 0) return [];
  const departments = await prisma.department.findMany({ select: { id: true, code: true } });
  return departments
    .filter((d) => habilitations.some((h) => dfcScopeCovers(h.scope, d.code)))
    .map((d) => d.id);
}

// ---------------------------------------------------------------------------
// Consultation DG / CPMP.
// ---------------------------------------------------------------------------

export interface DgHabilitation {
  role: RoleType;
  scope: string | null;
}

export interface CpmpHabilitation {
  role: RoleType;
  scope: string | null;
}

function dgScopeCovers(scope: string | null, departmentCode: string): boolean {
  if (!scope) return false;
  if (scope === "*") return true;
  return scope === departmentCode;
}

function cpmpScopeCovers(scope: string | null, departmentCode: string): boolean {
  if (!scope) return false;
  if (scope === "*") return true;
  return scope === departmentCode;
}

export async function activeDgHabilitations(userId: string, db: any = prisma): Promise<DgHabilitation[]> {
  const now = new Date();
  const roles = await db.userStructureRole.findMany({
    where: {
      userId,
      role: RoleType.DG_USER,
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
      user: { status: UserStatus.ACTIVE },
    },
    select: { role: true, scope: true },
  });
  return roles;
}

export async function activeCpmpHabilitations(userId: string, db: any = prisma): Promise<CpmpHabilitation[]> {
  const now = new Date();
  const roles = await db.userStructureRole.findMany({
    where: {
      userId,
      role: RoleType.CPMP_USER,
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
      user: { status: UserStatus.ACTIVE },
    },
    select: { role: true, scope: true },
  });
  return roles;
}

async function assertDgObserver(userId: string, departmentCode: string): Promise<void> {
  const habilitations = await activeDgHabilitations(userId);
  const authorized = habilitations.some((h) => dgScopeCovers(h.scope, departmentCode));
  if (!authorized) {
    throw new AppError("FORBIDDEN", "Vous n'êtes pas habilité à consulter cet élément pour le DG", 403);
  }
}

async function assertCpmpObserver(userId: string, departmentCode: string): Promise<void> {
  const habilitations = await activeCpmpHabilitations(userId);
  const authorized = habilitations.some((h) => cpmpScopeCovers(h.scope, departmentCode));
  if (!authorized) {
    throw new AppError("FORBIDDEN", "Vous n'êtes pas habilité à consulter cet élément pour la CPMP", 403);
  }
}

async function resolveDgDecisionDepartmentIds(userId: string): Promise<string[]> {
  const habilitations = await activeDgHabilitations(userId);
  if (habilitations.length === 0) return [];
  const departments = await prisma.department.findMany({ select: { id: true, code: true } });
  return departments
    .filter((d) => habilitations.some((h) => dgScopeCovers(h.scope, d.code)))
    .map((d) => d.id);
}

async function resolveCpmpDecisionDepartmentIds(userId: string): Promise<string[]> {
  const habilitations = await activeCpmpHabilitations(userId);
  if (habilitations.length === 0) return [];
  const departments = await prisma.department.findMany({ select: { id: true, code: true } });
  return departments
    .filter((d) => habilitations.some((h) => cpmpScopeCovers(h.scope, d.code)))
    .map((d) => d.id);
}

export type DfcResult = "DISPONIBLE" | "INDISPONIBLE";

export async function controlDfcDemande(
  id: string,
  userId: string,
  result: DfcResult,
  motif?: string | null,
  consolidationId?: string | null,
  db: any = prisma
): Promise<DemandeResponse> {
  // Autorisation DFC (hors transaction : lecture seule, ne dépend pas du statut).
  // Récupérer le département de la demande pour le contrôle de périmètre.
  const demandeForAuth = await db.demande.findUnique({
    where: { id },
    include: { department: { select: { code: true } } },
  });
  if (!demandeForAuth) {
    throw new AppError("NOT_FOUND", "Demande non trouvée", 404);
  }

  // Si le contrôle est initié depuis une consolidation, vérifier l'appartenance.
  if (consolidationId) {
    const consolidation = await db.consolidation.findUnique({ where: { id: consolidationId } });
    if (!consolidation || consolidation.status !== "TRANSMISE") {
      throw new AppError("NOT_FOUND", "Consolidation introuvable ou non transmise", 404);
    }
    if (demandeForAuth.consolidationId !== consolidationId) {
      throw new AppError("DEMANDE_NOT_IN_CONSOLIDATION", "Cette demande n'appartient pas à la consolidation indiquée", 404);
    }
  }

  await assertDfcController(userId, demandeForAuth.department.code, db);

  const targetStatus =
    result === "DISPONIBLE"
      ? DemandeStatus.EN_ATTENTE_EXECUTION
      : DemandeStatus.EN_ATTENTE_FINANCEMENT;
  const decisionType =
    result === "DISPONIBLE"
      ? "DECISION_DFC_DISPONIBLE"
      : "DECISION_DFC_INDISPONIBLE";

  // Transaction sérialisable : garantit qu'une seule décision concurrente aboutit,
  // y compris lorsque le statut source est conservé (cas INDISPONIBLE).
  let updatedDemande: DemandeWithRelations;
  try {
    updatedDemande = await db.$transaction(
      async (tx: any) => {
        // Verrouillage de ligne pour serialiser les controles concurrents,
        // y compris le cas INDISPONIBLE qui conserve le statut source.
        await tx.$queryRaw`SELECT id FROM "Demande" WHERE id = ${id} FOR UPDATE`;
        const existing = await tx.demande.findUnique({
          where: { id },
          include: { department: { select: { code: true } } },
        });
        if (!existing) {
          throw new AppError("NOT_FOUND", "Demande non trouvée", 404);
        }
        if (existing.status !== DemandeStatus.EN_ATTENTE_FINANCEMENT) {
          throw new AppError(
            "DEMANDE_NOT_FINANCEMENT",
            "Seule une demande en attente de financement peut être contrôlée par le DFC",
            403
          );
        }
        const dpmgApproval = await tx.demandeDecision.findFirst({
          where: { demandeId: id, type: "DECISION_DPMG_APPROBATION" },
        });
        if (!dpmgApproval) {
          throw new AppError(
            "DEMANDE_NOT_DPMG_APPROVED",
            "La demande n'a pas reçu l'approbation DPMG requise",
            403
          );
        }

        const [resultRow] = await Promise.all([
          tx.demande.update({
            where: {
              id,
              authorId: existing.authorId,
              status: DemandeStatus.EN_ATTENTE_FINANCEMENT,
            },
            data: { status: targetStatus },
            include: includeRelations,
          }),
          tx.demandeDecision.create({
            data: {
              demandeId: id,
              actorId: userId,
              type: decisionType,
              motif: motif?.trim() ? motif.trim() : null,
              commentaire: null,
            },
          }),
        ]);
        // Notification Outbox
        await createNotificationOutboxEntries(tx, {
          type: result === "DISPONIBLE" ? "CONTROLE_DFC_DISPONIBLE" : "CONTROLE_DFC_INDISPONIBLE",
          demande: {
            id: existing.id,
            authorId: existing.authorId,
            departmentId: existing.departmentId,
            department: { code: existing.department.code, structureId: null },
            isUrgent: existing.isUrgent,
          },
          eventSourceId: id,
        });
        return resultRow;
      },
      { isolationLevel: "Serializable" }
    );
  } catch (error: any) {
    if (error instanceof AppError) {
      throw error;
    }
    if (error.code === "P2025") {
      throw new AppError(
        "DEMANDE_NOT_FINANCEMENT",
        "La demande n'est plus en attente de financement : aucun contrôle n'a été enregistré",
        403
      );
    }
    if (error.code === "P2034" || error.code === "P2031" || error.code === "P2010") {
      throw new AppError(
        "CONCURRENT_MODIFICATION",
        "Cette demande a été modifiée ou traitée par un autre utilisateur",
        409
      );
    }
    throw error;
  }
  return toResponse(updatedDemande);
}

export interface DemandeStats {
  totalVisible: number;
  brouillons: number;
  enAttenteValidation: number;
  enAttenteAnalyse: number;
  enAttenteDecision: number;
  enAttenteFinancement: number;
  enAttenteExecution: number;
  retournees: number;
  refusees: number;
  urgentes: number;
}

export async function getDemandeStats(
  userId: string,
  managerScopes: string[]
): Promise<DemandeStats> {
  const where = await buildDemandeVisibilityWhere(userId, managerScopes);

  const grouped = await prisma.demande.groupBy({
    by: ["status"],
    where,
    _count: { _all: true },
  });

  const counts: Record<string, number> = {
    BROUILLON: 0,
    EN_ATTENTE_VALIDATION: 0,
    EN_ATTENTE_ANALYSE: 0,
    EN_ATTENTE_DECISION: 0,
    EN_ATTENTE_FINANCEMENT: 0,
    EN_ATTENTE_EXECUTION: 0,
    RETOURNEE: 0,
    REFUSEE: 0,
  };
  for (const g of grouped) {
    counts[g.status] = g._count._all;
  }

  const totalVisible = Object.values(counts).reduce((a, b) => a + b, 0);

const urgentCount = await prisma.demande.count({
    where: { AND: [...((where.AND as Prisma.DemandeWhereInput[]) ?? []), { isUrgent: true }] },
  });

  return {
    totalVisible,
    brouillons: counts["BROUILLON"] ?? 0,
    enAttenteValidation: counts["EN_ATTENTE_VALIDATION"] ?? 0,
    enAttenteAnalyse: counts["EN_ATTENTE_ANALYSE"] ?? 0,
    enAttenteDecision: counts["EN_ATTENTE_DECISION"] ?? 0,
    enAttenteFinancement: counts["EN_ATTENTE_FINANCEMENT"] ?? 0,
    enAttenteExecution: counts["EN_ATTENTE_EXECUTION"] ?? 0,
    retournees: counts["RETOURNEE"] ?? 0,
    refusees: counts["REFUSEE"] ?? 0,
    urgentes: urgentCount,
  };
}

// ---------------------------------------------------------------------------
// Exécution, satisfaction et clôture (lot 9.7).
// ---------------------------------------------------------------------------

interface DepartmentExecutionHabilitation {
  role: RoleType;
  scope: string | null;
}

async function activeDepartmentExecutionHabilitations(userId: string): Promise<DepartmentExecutionHabilitation[]> {
  const now = new Date();
  return prisma.userStructureRole.findMany({
    where: {
      userId,
      role: { in: [RoleType.DEPARTMENT_MANAGER, RoleType.DEPARTMENT_DELEGATE, RoleType.EXECUTION_AGENT] },
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
      user: { status: UserStatus.ACTIVE },
    },
    select: { role: true, scope: true },
  });
}

function departmentExecutionScopeCovers(scope: string | null, departmentCode: string): boolean {
  if (!scope) return false;
  if (scope === "*") return true;
  return scope === departmentCode;
}

async function assertDepartmentExecutionAuthorizer(userId: string, departmentCode: string): Promise<void> {
  const habilitations = await activeDepartmentExecutionHabilitations(userId);
  const authorized = habilitations.some((h) => departmentExecutionScopeCovers(h.scope, departmentCode));
  if (!authorized) {
    throw new AppError("FORBIDDEN", "Vous n'êtes pas habilité à exécuter cette demande pour ce département", 403);
  }
}

async function resolveExecutionDepartmentIds(userId: string): Promise<string[]> {
  const habilitations = await activeDepartmentExecutionHabilitations(userId);
  if (habilitations.length === 0) return [];
  const departments = await prisma.department.findMany({ select: { id: true, code: true } });
  return departments
    .filter((d) => habilitations.some((h) => departmentExecutionScopeCovers(h.scope, d.code)))
    .map((d) => d.id);
}

export async function startExecution(id: string, userId: string): Promise<DemandeResponse> {
  const existing = await prisma.demande.findUnique({
    where: { id },
    include: { department: { select: { code: true, structureId: true } } },
  });
  if (!existing) throw new AppError("NOT_FOUND", "Demande non trouvée", 404);
  if (existing.status !== DemandeStatus.EN_ATTENTE_EXECUTION) {
    throw new AppError("DEMANDE_NOT_EXECUTION", "Seule une demande en attente d'exécution peut être prise en charge", 403);
  }
  await assertDepartmentExecutionAuthorizer(userId, existing.department.code);

  let updatedDemande: DemandeWithRelations;
  try {
    updatedDemande = await prisma.$transaction(async (tx) => {
      const result = await tx.demande.update({
        where: { id, authorId: existing.authorId, status: DemandeStatus.EN_ATTENTE_EXECUTION },
        data: { executionStartedAt: new Date(), executionStartedBy: userId },
        include: includeRelations,
      });
      await tx.demandeDecision.create({
        data: { demandeId: id, actorId: userId, type: "DEMANDE_EXECUTION", motif: null, commentaire: null },
      });
      return result;
    });
  } catch (error: any) {
    if (error.code === "P2025") throw new AppError("DEMANDE_NOT_EXECUTION", "La demande n'est plus en attente d'exécution", 403);
    if (error.code === "P2034" || error.code === "P2031") throw new AppError("CONCURRENT_MODIFICATION", "Cette demande a été modifiée par un autre utilisateur", 409);
    throw error;
  }
  return toResponse(updatedDemande);
}

export async function declareSatisfaction(
  id: string,
  userId: string,
  proofUrl: string | null,
  observations?: string | null,
  file?: ProofFileInput
): Promise<DemandeResponse> {
  const existing = await prisma.demande.findUnique({
    where: { id },
    include: { department: { select: { code: true, structureId: true } } },
  });
  if (!existing) throw new AppError("NOT_FOUND", "Demande non trouvée", 404);
  if (existing.status !== DemandeStatus.EN_ATTENTE_EXECUTION) {
    throw new AppError("DEMANDE_NOT_EXECUTION", "Seule une demande en attente d'exécution peut être déclarée satisfaite", 403);
  }
  if (!existing.executionStartedAt) {
    throw new AppError("DEMANDE_NOT_STARTED", "La prise en charge de l'exécution est requise avant la déclaration de satisfaction", 403);
  }

  // Justificatif : soit un fichier téléversé, soit une URL externe.
  let proofLocation = proofUrl?.trim() ?? "";
  if (!file) {
    if (proofLocation === "") {
      throw new AppError("VALIDATION_ERROR", "Le justificatif est requis", 400);
    }
    try {
      new URL(proofLocation);
    } catch {
      throw new AppError("VALIDATION_ERROR", "URL de justificatif invalide", 400);
    }
  }

  await assertDepartmentExecutionAuthorizer(userId, existing.department.code);

  // L'écriture du fichier précède la transaction : on la supprime si la
  // transition échoue pour ne pas laisser de justificatif orphelin.
  let fileStored = false;
  if (file) {
    const stored = await saveProofFile(id, file);
    proofLocation = stored.url;
    fileStored = true;
  }

  let updatedDemande: DemandeWithRelations;
  try {
    updatedDemande = await prisma.$transaction(async (tx) => {
      const result = await tx.demande.update({
        where: { id, authorId: existing.authorId, status: DemandeStatus.EN_ATTENTE_EXECUTION },
        data: {
          status: DemandeStatus.EN_ATTENTE_CONFIRMATION_SATISFACTION,
          satisfactionProofUrl: proofLocation,
          satisfactionObservations: observations?.trim() ? observations.trim() : null,
          satisfiedBy: null,
        },
        include: includeRelations,
      });
      await tx.demandeDecision.create({
        data: { demandeId: id, actorId: userId, type: "DEMANDE_EXECUTEE", motif: null, commentaire: observations?.trim() ? observations.trim() : null },
      });
      await createNotificationOutboxEntries(tx, {
        type: "DEMANDE_EXECUTEE",
        demande: {
          id: existing.id,
          authorId: existing.authorId,
          departmentId: existing.departmentId,
          department: { code: existing.department.code, structureId: existing.department.structureId ?? null },
          isUrgent: existing.isUrgent,
        },
        eventSourceId: id,
      });
      return result;
    });
  } catch (error: any) {
    if (fileStored) {
      await deleteProofFile(id).catch(() => {
        /* nettoyage best-effort */
      });
    }
    if (error.code === "P2025") throw new AppError("DEMANDE_NOT_EXECUTION", "La demande n'est plus en attente d'exécution", 403);
    if (error.code === "P2034" || error.code === "P2031") throw new AppError("CONCURRENT_MODIFICATION", "Cette demande a été modifiée par un autre utilisateur", 409);
    throw error;
  }
  return toResponse(updatedDemande);
}

export async function confirmSatisfaction(id: string, userId: string): Promise<DemandeResponse> {
  const existing = await prisma.demande.findUnique({
    where: { id },
    include: { department: { select: { code: true, structureId: true } } },
  });
  if (!existing) throw new AppError("NOT_FOUND", "Demande non trouvée", 404);
  if (existing.authorId !== userId) {
    throw new AppError("FORBIDDEN", "Seul le demandeur peut confirmer la satisfaction", 403);
  }
  if (existing.status !== DemandeStatus.EN_ATTENTE_CONFIRMATION_SATISFACTION) {
    throw new AppError("DEMANDE_NOT_CONFIRMATION", "La demande n'est pas en attente de confirmation de satisfaction", 403);
  }
  if (existing.satisfiedBy) {
    throw new AppError("DEMANDE_ALREADY_CONFIRMED", "La satisfaction a déjà été confirmée", 409);
  }
  if (!existing.satisfactionProofUrl) {
    throw new AppError("VALIDATION_ERROR", "Le justificatif est requis pour confirmer la satisfaction", 400);
  }
  let updatedDemande: DemandeWithRelations;
  try {
    updatedDemande = await prisma.$transaction(async (tx) => {
      const result = await tx.demande.update({
        where: { id, authorId: existing.authorId, status: DemandeStatus.EN_ATTENTE_CONFIRMATION_SATISFACTION, satisfiedBy: null },
        data: {
          status: DemandeStatus.EN_ATTENTE_CONFIRMATION_SATISFACTION,
          satisfiedAt: new Date(),
          satisfiedBy: userId,
        },
        include: includeRelations,
      });
      await tx.demandeDecision.create({
        data: { demandeId: id, actorId: userId, type: "DEMANDE_EXECUTEE", motif: null, commentaire: existing.satisfactionObservations },
      });
      return result;
    });
  } catch (error: any) {
    if (error.code === "P2025") throw new AppError("DEMANDE_NOT_VALIDATION", "La demande n'est plus en attente de validation", 403);
    if (error.code === "P2034" || error.code === "P2031") throw new AppError("CONCURRENT_MODIFICATION", "Cette demande a été modifiée par un autre utilisateur", 409);
    throw error;
  }
  return toResponse(updatedDemande);
}

export async function closeDemande(id: string, userId: string): Promise<DemandeResponse> {
  const existing = await prisma.demande.findUnique({
    where: { id },
    include: { department: { select: { code: true, structureId: true } } },
  });
  if (!existing) throw new AppError("NOT_FOUND", "Demande non trouvée", 404);
  if (existing.status !== DemandeStatus.EN_ATTENTE_CONFIRMATION_SATISFACTION) {
    throw new AppError("DEMANDE_NOT_CONFIRMATION", "Seule une demande en attente de confirmation peut être clôturée", 403);
  }
  if (!existing.satisfactionProofUrl) {
    throw new AppError("VALIDATION_ERROR", "Le justificatif est requis pour clôturer", 400);
  }
  if (!existing.satisfiedBy) {
    throw new AppError("DEMANDE_NOT_CONFIRMED", "La satisfaction doit être confirmée par le demandeur avant clôture", 403);
  }
  await assertDpmgDecisionAuthorizer(userId, existing.department.code);

  let updatedDemande: DemandeWithRelations;
  try {
    updatedDemande = await prisma.$transaction(async (tx) => {
      const result = await tx.demande.update({
        where: { id, authorId: existing.authorId, status: DemandeStatus.EN_ATTENTE_CONFIRMATION_SATISFACTION },
        data: { status: DemandeStatus.CLOTUREE, closedAt: new Date(), closedBy: userId },
        include: includeRelations,
      });
      await tx.demandeDecision.create({
        data: { demandeId: id, actorId: userId, type: "DEMANDE_CLOTUREE", motif: null, commentaire: null },
      });
      await createNotificationOutboxEntries(tx, {
        type: "DEMANDE_CLOTUREE",
        demande: {
          id: existing.id,
          authorId: existing.authorId,
          departmentId: existing.departmentId,
          department: { code: existing.department.code, structureId: existing.department.structureId ?? null },
          isUrgent: existing.isUrgent,
        },
        eventSourceId: id,
      });
      return result;
    });
  } catch (error: any) {
    if (error.code === "P2025") throw new AppError("DEMANDE_NOT_CONFIRMATION", "La demande n'est plus en attente de confirmation", 403);
    if (error.code === "P2034" || error.code === "P2031") throw new AppError("CONCURRENT_MODIFICATION", "Cette demande a été modifiée par un autre utilisateur", 409);
    throw error;
  }
  return toResponse(updatedDemande);
}

export async function returnDemandeForExecution(id: string, userId: string, motif: string): Promise<DemandeResponse> {
  const existing = await prisma.demande.findUnique({
    where: { id },
    include: { department: { select: { code: true, structureId: true } } },
  });
  if (!existing) throw new AppError("NOT_FOUND", "Demande non trouvée", 404);
  if (existing.status !== DemandeStatus.EN_ATTENTE_CONFIRMATION_SATISFACTION) {
    throw new AppError("DEMANDE_NOT_CONFIRMATION", "Seule une demande en attente de confirmation peut être retournée", 403);
  }
  if (!motif || motif.trim() === "") {
    throw new AppError("VALIDATION_ERROR", "Le motif du retour est requis", 400);
  }
  await assertDpmgDecisionAuthorizer(userId, existing.department.code);

  let updatedDemande: DemandeWithRelations;
  try {
    updatedDemande = await prisma.$transaction(async (tx) => {
      const result = await tx.demande.update({
        where: { id, authorId: existing.authorId, status: DemandeStatus.EN_ATTENTE_CONFIRMATION_SATISFACTION },
        data: { status: DemandeStatus.EN_ATTENTE_EXECUTION, closureReturnReason: motif.trim() },
        include: includeRelations,
      });
      await tx.demandeDecision.create({
        data: { demandeId: id, actorId: userId, type: "RETOUR", motif: motif.trim(), commentaire: null },
      });
      await createNotificationOutboxEntries(tx, {
        type: "DEMANDE_RETOURNEE",
        demande: {
          id: existing.id,
          authorId: existing.authorId,
          departmentId: existing.departmentId,
          department: { code: existing.department.code, structureId: existing.department.structureId ?? null },
          isUrgent: existing.isUrgent,
        },
        eventSourceId: id,
      });
      return result;
    });
  } catch (error: any) {
    if (error.code === "P2025") throw new AppError("DEMANDE_NOT_CONFIRMATION", "La demande n'est plus en attente de confirmation", 403);
    if (error.code === "P2034" || error.code === "P2031") throw new AppError("CONCURRENT_MODIFICATION", "Cette demande a été modifiée par un autre utilisateur", 409);
    throw error;
  }
  return toResponse(updatedDemande);
}



export interface ObservationResponse {
  id: string;
  demandeId: string;
  authorId: string;
  type: "OBSERVATION_DG" | "OBSERVATION_CPMP";
  commentaire: string | null;
  createdAt: string;
}

export async function addObservation(
  id: string,
  userId: string,
  commentaire: string
): Promise<ObservationResponse> {
  const existing = await prisma.demande.findUnique({
    where: { id },
    include: { department: { select: { code: true } } },
  });
  if (!existing) {
    throw new AppError("NOT_FOUND", "Demande non trouv�e", 404);
  }

  const dgHab = await activeDgHabilitations(userId);
  const cpmpHab = await activeCpmpHabilitations(userId);
  const dgAuthorized = dgHab.some((h) => dgScopeCovers(h.scope, existing.department.code));
  const cpmpAuthorized = cpmpHab.some((h) => cpmpScopeCovers(h.scope, existing.department.code));

  let type: "OBSERVATION_DG" | "OBSERVATION_CPMP" | null = null;
  if (dgAuthorized) type = "OBSERVATION_DG";
  else if (cpmpAuthorized) type = "OBSERVATION_CPMP";

  if (!type) {
    throw new AppError("FORBIDDEN", "Vous n'�tes pas habilit� � enregistrer une observation sur cette demande", 403);
  }

  const visible = await findVisibleDemande(id, userId, []);
  if (!visible) {
    throw new AppError("NOT_FOUND", "Demande non trouv�e", 404);
  }

  const created = await prisma.demandeDecision.create({
    data: {
      demandeId: id,
      actorId: userId,
      type,
      motif: null,
      commentaire: commentaire.trim(),
    },
  });

  return {
    id: created.id,
    demandeId: created.demandeId,
    authorId: created.actorId,
    type,
    commentaire: created.commentaire,
    createdAt: created.createdAt.toISOString(),
  };
}

export async function listObservations(id: string, userId: string): Promise<ObservationResponse[]> {
  const demande = await prisma.demande.findUnique({ where: { id } });
  if (!demande) {
    throw new AppError("NOT_FOUND", "Demande non trouv�e", 404);
  }

  const visible = await findVisibleDemande(id, userId, []);
  if (!visible) {
    throw new AppError("NOT_FOUND", "Demande non trouv�e", 404);
  }

  const rows = await prisma.demandeDecision.findMany({
    where: {
      demandeId: id,
      type: { in: ["OBSERVATION_DG", "OBSERVATION_CPMP"] },
    },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((r) => ({
    id: r.id,
    demandeId: r.demandeId,
    authorId: r.actorId,
    type: r.type as "OBSERVATION_DG" | "OBSERVATION_CPMP",
    commentaire: r.commentaire,
    createdAt: r.createdAt.toISOString(),
  }));
}
