import { PrismaClient, RoleType, UserStatus } from "@prisma/client";
import { AppError } from "../middleware/errorHandler";

const prisma = new PrismaClient();

export interface ResolveValidatorOptions {
  /**
   * Exclure l'auteur de la demande parmi les candidats.
   * L'auteur ne peut jamais être son propre validateur.
   *
   * Par défaut, l'auteur n'est PAS exclu : ce comportement est utilisé par le
   * contrôle de soumission, qui vérifie uniquement qu'un validateur existe dans
   * la hiérarchie de l'auteur.
   */
  excludeAuthor?: boolean;
}

/**
 * Vérifie qu'une délégation couvre le périmètre du pouvoir délégué.
 *
 * La délégation remplace le délégant à l'identique : le périmètre du délégué
 * doit donc être le même que celui du délégant, sans restriction supplémentaire.
 * Un délégant sans périmètre explicite (null) délègue la totalité de son pouvoir.
 *
 * `scope: "*"` n'est admis que pour un transfert à périmètre IDENTIQUE
 * (délégant "*" / délégué "*") : le délégué reçoit exactement le pouvoir du
 * délégant, borné à la structure de la délégation et à sa période de validité.
 * Le délégué n'obtient jamais un périmètre plus large que celui du délégant.
 */
function delegationCoversScope(delegatorScope: string | null, delegateScope: string | null): boolean {
  // Un délégué au périmètre global n'est recevable que si le délégant l'est aussi.
  if (delegateScope === "*") {
    return delegatorScope === "*";
  }
  // Un délégant sans périmètre explicite délègue la totalité de son pouvoir.
  if (delegatorScope === null) {
    return true;
  }
  // Un délégant au périmètre global ne peut déléguer qu'à périmètre global :
  // la substitution partielle n'est pas prise en charge par le résolveur.
  if (delegatorScope === "*") {
    return false;
  }
  return delegateScope === delegatorScope;
}

interface ValidDelegation {
  delegateUserId: string;
  delegatorUserId: string;
}

/**
 * Détermine le validateur désigné pour une demande.
 *
 * La recherche remonte la hiérarchie des structures, en partant de la structure
 * de l'auteur, et retient comme candidats :
 *  - les HIERARCHICAL_MANAGER dont l'habilitation est ACTIVE à la date du jour
 *    (startDate <= now, endDate null ou >= now) et dont le compte est ACTIF ;
 *  - les DELEGATED_REPRESENTATIVE dont la délégation est ACTIVE, dont le compte
 *    est ACTIF et dont le délégant est lui-même un HIERARCHICAL_MANAGER actif et
 *    habilité sur le même périmètre à cette structure.
 *
 * Règle de délégation : pendant une délégation active et valide, le délégué
 * REMPLACE le délégant. Les deux ne sont donc pas comptés comme deux validateurs
 * concurrents, et le délégant ne peut pas exercer lui-même le pouvoir délégué.
 * La substitution porte sur la seule structure où la délégation est enregistrée
 * et ne s'étend pas aux autres structures.
 *
 * Si aucun candidat n'est trouvé au niveau courant, la recherche se poursuit au
 * niveau de la structure parente. En fin de hiérarchie, AUCUN_VALIDATEUR est levé.
 * Si plusieurs candidats coexistent réellement au même niveau, VALIDATEUR_AMBIGU
 * est levé : le système refuse de désigner arbitrairement un utilisateur.
 *
 * @param authorId identifiant de l'auteur de la demande
 * @param authorStructureId identifiant de la STRUCTURE de l'auteur (et non du département)
 * @param options options de résolution (voir ResolveValidatorOptions)
 * @returns l'identifiant du validateur désigné
 */
export async function resolveValidatorForDemande(
  authorId: string,
  authorStructureId: string,
  options: ResolveValidatorOptions = {}
): Promise<string> {
  const now = new Date();
  let currentStructureId = authorStructureId;

  while (currentStructureId) {
    // 1. HIERARCHICAL_MANAGER actifs à cette structure.
    //    L'auteur peut être écarté : il ne peut pas se valider lui-même.
    const managers = await prisma.userStructureRole.findMany({
      where: {
        structureId: currentStructureId,
        role: RoleType.HIERARCHICAL_MANAGER,
        startDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
        user: { status: UserStatus.ACTIVE },
      },
      include: { user: true },
    });

    // 2. Délégations actives : DELEGATED_REPRESENTATIVE dont la délégation est
    //    active à la date du jour. Le délégant doit être un HIERARCHICAL_MANAGER
    //    lui-même actif, habilité sur le même périmètre à cette structure.
    const delegatedRoles = await prisma.userStructureRole.findMany({
      where: {
        structureId: currentStructureId,
        role: RoleType.DELEGATED_REPRESENTATIVE,
        delegatedFromUserId: { not: null },
        startDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
        user: { status: UserStatus.ACTIVE },
      },
      include: {
        user: true,
        delegatedFrom: {
          include: {
            structureRoles: {
              include: {
                structure: true,
              },
            },
          },
        },
      },
    });

    const delegations: ValidDelegation[] = [];
    for (const role of delegatedRoles) {
      const delegator = role.delegatedFrom;
      if (!delegator) continue;
      if (delegator.status !== UserStatus.ACTIVE) continue;

      const delegatorRole = delegator.structureRoles.find(
        (sr) =>
          sr.role === RoleType.HIERARCHICAL_MANAGER &&
          sr.structureId === currentStructureId &&
          sr.startDate <= now &&
          (sr.endDate === null || sr.endDate >= now)
      );
      if (!delegatorRole) continue;
      if (!delegationCoversScope(delegatorRole.scope, role.scope)) continue;

      delegations.push({ delegateUserId: role.userId, delegatorUserId: delegator.id });
    }

    // 3. Pendant une délégation valide, le délégué REMPLACE le délégant :
    //    le délégant sort du calcul des candidats pour ce pouvoir.
    const delegatedPowers = new Set(delegations.map((d) => d.delegatorUserId));

    const managerCandidates = managers
      .filter((r) => !delegatedPowers.has(r.userId))
      .filter((r) => (options.excludeAuthor ? r.userId !== authorId : true))
      .map((r) => r.userId);

    const repCandidates = delegations
      .filter((d) => (options.excludeAuthor ? d.delegateUserId !== authorId : true))
      .map((d) => d.delegateUserId);

    const allCandidates = [...new Set([...managerCandidates, ...repCandidates])];

    if (allCandidates.length === 1) {
      return allCandidates[0] as string;
    }

    if (allCandidates.length > 1) {
      throw new AppError(
        "VALIDATEUR_AMBIGU",
        "Plusieurs responsables possibles - designation explicite requise",
        403
      );
    }

    // Passage à la structure parente.
    // En fin de hiérarchie (structure racine sans parent), on termine le parcours
    // avec une chaîne vide afin de sortir de la boucle et de renvoyer
    // AUCUN_VALIDATEUR au lieu de boucler indéfiniment.
    const structure = await prisma.structure.findUnique({
      where: { id: currentStructureId },
      include: { parent: true },
    });
    currentStructureId = structure?.parentId ?? "";
  }

  throw new AppError(
    "AUCUN_VALIDATEUR",
    "Aucun validateur trouvé dans la hiérarchie",
    403
  );
}
