import { PrismaClient } from "@prisma/client";
import {
  consolidationResponseSchema,
  demandeResponseSchema,
  consolidationAvisCompletenessSchema,
  type ConsolidationResponse,
  type ConsolidationCreateRequest,
  type ConsolidationAddDemandesRequest,
  type DemandeResponse,
  type ConsolidationAvisCompletenessResponse,
} from "@dpmg/shared/zod";
import { AppError } from "../middleware/errorHandler";
import { activeDfcHabilitations, dfcScopeCovers } from "./demande.service";

const MANAGER_ROLES = ["DPMG_MANAGER", "SUPER_ADMIN", "TECHNICAL_ADMIN"] as const;

interface ConsolidationRow {
  id: string;
  reference: string;
  periodStart: Date;
  periodEnd: Date;
  status: string;
  createdById: string;
  transmittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface DemandeRow {
  id: string;
  reference: string;
  title: string;
  description: string;
  status: string;
  category: string;
  departmentId: string;
  authorId: string;
  consolidationId: string | null;
  createdAt: Date;
  updatedAt: Date;
  submittedAt: Date | null;
  satisfactionProofUrl: string | null;
  satisfactionObservations: string | null;
  closureReturnReason: string | null;
  departmentAvisMotif?: string | null;
  departmentAvisCommentaire?: string | null;
  executionStartedAt?: Date | null;
  department: { code: string; name: string };
  author: { firstName: string; lastName: string };
}

/**
 * Sous-ensemble du client Prisma utilisé par le module.
 * Les délégations `consolidation` / `demande` sont typées localement : le module
 * reste indépendant de la régénération du client Prisma et peut être testé avec
 * un double (mock) sans base de données.
 */
export interface ConsolidationDb {
  consolidation: {
    create(args: { data: Record<string, unknown>; include?: unknown }): Promise<ConsolidationRow>;
    findMany(args?: { where?: unknown; orderBy?: unknown }): Promise<ConsolidationRow[]>;
    findUnique(args: { where: { id?: string; reference?: string }; include?: unknown }): Promise<ConsolidationRow | null>;
    update(args: { where: { id: string }; data: Record<string, unknown>; include?: unknown }): Promise<ConsolidationRow>;
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
    delete(args: { where: { id: string } }): Promise<ConsolidationRow>;
    deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
  };
  demande: {
    findMany(args: { where: unknown; include?: unknown }): Promise<DemandeRow[]>;
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  };
  demandeDecision: {
    findMany(args: { where: unknown; select?: unknown }): Promise<Array<{ demandeId: string }>>;
  };
  userStructureRole: {
    findMany(args: { where: Record<string, unknown> }): Promise<Array<{ role: string; startDate: Date; endDate: Date | null }>>;
  };
  user: {
    findUnique(args: { where: { id: string }; select?: unknown }): Promise<{ status: string } | null>;
  };
  adminAuditLog: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
  $queryRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
  $transaction<T>(fn: (tx: ConsolidationDb) => Promise<T>): Promise<T>;
}

const defaultDb = new PrismaClient() as unknown as ConsolidationDb;

const demandeInclude = {
  department: { select: { code: true, name: true } },
  author: { select: { firstName: true, lastName: true } },
} as const;

async function writeAudit(
  db: ConsolidationDb,
  actorId: string,
  action: string,
  targetId: string,
  details: Record<string, unknown>
): Promise<void> {
  await db.adminAuditLog.create({
    data: { actorId, action, targetType: "Consolidation", targetId, details },
  });
}

function toDemandeResponse(row: DemandeRow): DemandeResponse {
  return demandeResponseSchema.parse({
    id: row.id,
    reference: row.reference,
    title: row.title,
    description: row.description,
    status: row.status,
    category: row.category,
    departmentId: row.departmentId,
    departmentCode: row.department.code,
    departmentName: row.department.name,
    authorId: row.authorId,
    authorFirstName: row.author.firstName,
    authorLastName: row.author.lastName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    submittedAt: row.submittedAt?.toISOString() ?? null,
    satisfactionProofUrl: row.satisfactionProofUrl ?? null,
    satisfactionObservations: row.satisfactionObservations ?? null,
    closureReturnReason: row.closureReturnReason ?? null,
    departmentAvisMotif: row.departmentAvisMotif ?? null,
    departmentAvisCommentaire: row.departmentAvisCommentaire ?? null,
    executionStartedAt: row.executionStartedAt?.toISOString() ?? null,
  });
}

async function findDemandes(db: ConsolidationDb, consolidationId: string): Promise<DemandeResponse[]> {
  const rows = await db.demande.findMany({
    where: { consolidationId },
    include: demandeInclude,
  });
  return rows.map(toDemandeResponse);
}

function toResponse(row: ConsolidationRow, demandes: DemandeResponse[]): ConsolidationResponse {
  return consolidationResponseSchema.parse({
    id: row.id,
    reference: row.reference,
    periodStart: row.periodStart.toISOString(),
    periodEnd: row.periodEnd.toISOString(),
    status: row.status,
    createdById: row.createdById,
    transmittedAt: row.transmittedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    demandes,
  });
}

function isoWeek(date: Date): { year: number; week: number } {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNumber = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return { year: target.getUTCFullYear(), week };
}

async function generateReference(periodStart: Date, explicit: string | undefined, db: ConsolidationDb): Promise<string> {
  if (explicit) {
    const existing = await db.consolidation.findUnique({ where: { reference: explicit } });
    if (existing) throw new AppError("REFERENCE_ALREADY_EXISTS", "Cette référence de consolidation existe déjà", 409);
    return explicit;
  }
  const { year, week } = isoWeek(periodStart);
  const base = `CONS-${year}-W${String(week).padStart(2, "0")}`;
  let candidate = base;
  for (let attempt = 0; attempt < 10; attempt++) {
    const existing = await db.consolidation.findUnique({ where: { reference: candidate } });
    if (!existing) return candidate;
    candidate = `${base}-${attempt + 1}`;
  }
  throw new AppError("REFERENCE_GENERATION_FAILED", "Impossible de générer une référence de consolidation unique", 500);
}

async function hasDfcRole(actorId: string, db: ConsolidationDb): Promise<boolean> {
  const roles = await db.userStructureRole.findMany({ where: { userId: actorId, role: "DFC_CONTROLLER" } });
  return roles.length > 0;
}

async function isManager(actorId: string, db: ConsolidationDb): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: actorId } });
  if (!user || user.status !== "ACTIVE") return false;
  const now = new Date();
  const roles = await db.userStructureRole.findMany({ where: { userId: actorId } });
  return roles.some(
    (r) =>
      (MANAGER_ROLES as readonly string[]).includes(r.role) &&
      r.startDate <= now &&
      (r.endDate === null || r.endDate >= now)
  );
}

async function assertManager(actorId: string, db: ConsolidationDb): Promise<void> {
  if (!(await isManager(actorId, db))) {
    throw new AppError("FORBIDDEN", "Vous n'êtes pas habilité à gérer les consolidations", 403);
  }
}

export async function createConsolidation(
  actorId: string,
  input: ConsolidationCreateRequest,
  db: ConsolidationDb = defaultDb
): Promise<ConsolidationResponse> {
  await assertManager(actorId, db);
  const periodStart = new Date(input.periodStart);
  const periodEnd = new Date(input.periodEnd);
  if (periodStart > periodEnd) {
    throw new AppError("VALIDATION_ERROR", "La date de début doit être antérieure ou égale à la date de fin", 400);
  }

  const reference = await generateReference(periodStart, input.reference, db);
  const row = await db.$transaction(async (tx) => {
    const created = await tx.consolidation.create({
      data: {
        reference,
        periodStart,
        periodEnd,
        status: "BROUILLON",
        createdById: actorId,
      },
    });
    await writeAudit(tx, actorId, "CREATE_CONSOLIDATION", created.id, {
      reference,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    });
    return created;
  });
  return toResponse(row, await findDemandes(db, row.id));
}

export async function listConsolidations(
  actorId: string,
  db: ConsolidationDb = defaultDb
): Promise<ConsolidationResponse[]> {
  const manager = await isManager(actorId, db);
  let isDfc = false;
  let dfcHabs: Array<{ scope: string | null }> = [];
  if (!manager) {
    dfcHabs = await activeDfcHabilitations(actorId, db);
    isDfc = dfcHabs.length > 0 || (await hasDfcRole(actorId, db));
    if (isDfc && dfcHabs.length === 0) {
      return [];
    }
  }

  const rows = await db.consolidation.findMany({
    where: manager ? {} : { status: "TRANSMISE" },
    orderBy: { createdAt: "desc" },
  });
  const result: ConsolidationResponse[] = [];
  for (const row of rows) {
    let demandes = await findDemandes(db, row.id);
    if (isDfc) {
      demandes = demandes.filter((d) => dfcHabs.some((h) => dfcScopeCovers(h.scope, d.departmentCode)));
      if (demandes.length === 0) continue;
    }
    result.push(toResponse(row, demandes));
  }
  return result;
}

export async function getConsolidation(
  id: string,
  actorId: string,
  db: ConsolidationDb = defaultDb
): Promise<ConsolidationResponse> {
  const row = await db.consolidation.findUnique({ where: { id } });
  if (!row) throw new AppError("NOT_FOUND", "Consolidation introuvable", 404);
  const manager = await isManager(actorId, db);
  if (!manager && row.status !== "TRANSMISE") {
    throw new AppError("NOT_FOUND", "Consolidation introuvable", 404);
  }

  let demandes = await findDemandes(db, row.id);
  let isDfc = false;
  let dfcHabs: Array<{ scope: string | null }> = [];
  if (!manager) {
    dfcHabs = await activeDfcHabilitations(actorId, db);
    isDfc = dfcHabs.length > 0 || (await hasDfcRole(actorId, db));
    if (isDfc) {
      if (dfcHabs.length === 0) {
        throw new AppError("NOT_FOUND", "Consolidation introuvable", 404);
      }
      demandes = demandes.filter((d) => dfcHabs.some((h) => dfcScopeCovers(h.scope, d.departmentCode)));
      if (demandes.length === 0) {
        throw new AppError("NOT_FOUND", "Consolidation introuvable", 404);
      }
    }
  }

  if (isDfc) {
    await db.adminAuditLog.create({
      data: {
        actorId,
        action: "CONSULTATION_DFC_CONSOLIDATION",
        targetType: "Consolidation",
        targetId: row.id,
        details: {
          reference: row.reference,
          scope: dfcHabs.map((h) => h.scope),
        },
      },
    });
  }

  return toResponse(row, demandes);
}

export async function addDemandes(
  id: string,
  actorId: string,
  input: ConsolidationAddDemandesRequest,
  db: ConsolidationDb = defaultDb
): Promise<ConsolidationResponse> {
  await assertManager(actorId, db);
  const row = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Consolidation" WHERE id = ${id} FOR UPDATE`;
    const consolidation = await tx.consolidation.findUnique({ where: { id } });
    if (!consolidation) throw new AppError("NOT_FOUND", "Consolidation introuvable", 404);
    if (consolidation.status !== "BROUILLON") {
      throw new AppError("CONSOLIDATION_NOT_DRAFT", "Une consolidation transmise ne peut plus être modifiée", 409);
    }

    const ids = [...new Set(input.demandeIds)];
    const demandes = await tx.demande.findMany({ where: { id: { in: ids } }, include: demandeInclude });
    if (demandes.length !== ids.length) {
      throw new AppError("DEMANDE_NOT_FOUND", "Une ou plusieurs demandes sont introuvables", 404);
    }
    const already = demandes.filter((d) => d.consolidationId !== null && d.consolidationId !== id);
    if (already.length > 0) {
      throw new AppError("DEMANDE_ALREADY_CONSOLIDATED", "Une demande est déjà rattachée à une autre consolidation", 409);
    }

    await tx.demande.updateMany({
      where: { id: { in: ids }, consolidationId: null },
      data: { consolidationId: id },
    });
    await writeAudit(tx, actorId, "ADD_CONSOLIDATION_DEMANDES", id, { demandeIds: ids });
    return consolidation;
  });
  return toResponse(row, await findDemandes(db, row.id));
}

export async function removeDemande(
  id: string,
  actorId: string,
  demandeId: string,
  db: ConsolidationDb = defaultDb
): Promise<ConsolidationResponse> {
  await assertManager(actorId, db);
  const row = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Consolidation" WHERE id = ${id} FOR UPDATE`;
    const consolidation = await tx.consolidation.findUnique({ where: { id } });
    if (!consolidation) throw new AppError("NOT_FOUND", "Consolidation introuvable", 404);
    if (consolidation.status !== "BROUILLON") {
      throw new AppError("CONSOLIDATION_NOT_DRAFT", "Une consolidation transmise ne peut plus être modifiée", 409);
    }
    const demandes = await tx.demande.findMany({ where: { id: demandeId }, include: demandeInclude });
    const demande = demandes[0];
    if (!demande || demande.consolidationId !== id) {
      throw new AppError("DEMANDE_NOT_IN_CONSOLIDATION", "Cette demande n'est pas rattachée à cette consolidation", 404);
    }
    await tx.demande.updateMany({ where: { id: demandeId }, data: { consolidationId: null } });
    await writeAudit(tx, actorId, "REMOVE_CONSOLIDATION_DEMANDE", id, { demandeId });
    return consolidation;
  });
  return toResponse(row, await findDemandes(db, row.id));
}

export async function getAvisCompleteness(
  consolidationId: string,
  actorId: string,
  db: ConsolidationDb = defaultDb
): Promise<ConsolidationAvisCompletenessResponse> {
  const row = await db.consolidation.findUnique({ where: { id: consolidationId } });
  if (!row) throw new AppError("NOT_FOUND", "Consolidation introuvable", 404);
  const manager = await isManager(actorId, db);
  if (!manager && row.status !== "TRANSMISE") {
    throw new AppError("NOT_FOUND", "Consolidation introuvable", 404);
  }

  const demandes = await db.demande.findMany({
    where: { consolidationId },
    include: { department: { select: { code: true, name: true } } },
  });

  const demandeIds = demandes.map((d: any) => d.id);
  const avisRows =
    demandeIds.length > 0
      ? await db.demandeDecision.findMany({
          where: { demandeId: { in: demandeIds }, type: "AVIS_DEPARTEMENTAL" },
          select: { demandeId: true },
        })
      : [];
  const avecAvis = new Set(avisRows.map((r: any) => r.demandeId));

  const avisAttendus = demandes.map((d: any) => ({
    demandeId: d.id,
    departmentCode: d.department.code,
    departmentName: d.department.name,
  }));
  const avisManquants = avisAttendus.filter((a) => !avecAvis.has(a.demandeId));

  return consolidationAvisCompletenessSchema.parse({
    complete: avisManquants.length === 0,
    totalDemandes: demandes.length,
    demandesAvecAvis: demandes.filter((d: any) => avecAvis.has(d.id)).length,
    demandesSansAvis: avisManquants.length,
    avisAttendus,
    avisManquants,
  });
}

export async function transmitConsolidation(
  id: string,
  actorId: string,
  db: ConsolidationDb = defaultDb
): Promise<ConsolidationResponse> {
  await assertManager(actorId, db);
  const row = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Consolidation" WHERE id = ${id} FOR UPDATE`;
    const consolidation = await tx.consolidation.findUnique({ where: { id } });
    if (!consolidation) throw new AppError("NOT_FOUND", "Consolidation introuvable", 404);
    if (consolidation.status !== "BROUILLON") {
      throw new AppError("CONSOLIDATION_NOT_DRAFT", "Cette consolidation a déjà été transmise", 409);
    }
    const demandes = await tx.demande.findMany({ where: { consolidationId: id }, include: demandeInclude });
    if (demandes.length === 0) {
      throw new AppError("CONSOLIDATION_EMPTY", "Une consolidation vide ne peut pas être transmise", 400);
    }

    // Vérification de complétude des avis départementaux.
    const demandeIds = demandes.map((d: any) => d.id);
    const avisRows =
      demandeIds.length > 0
        ? await tx.demandeDecision.findMany({
            where: { demandeId: { in: demandeIds }, type: "AVIS_DEPARTEMENTAL" },
            select: { demandeId: true },
          })
        : [];
    const avecAvis = new Set(avisRows.map((r: any) => r.demandeId));
    const manquants = demandes.filter((d: any) => !avecAvis.has(d.id));
    if (manquants.length > 0) {
      throw new AppError("CONSOLIDATION_AVIS_INCOMPLET", "Tous les avis départementaux attendus ne sont pas enregistrés", 409, {
        demandesSansAvis: manquants.map((d: any) => ({ demandeId: d.id, departmentCode: d.department.code })),
      });
    }

    // Transition atomique : ne réussit que si le statut est encore BROUILLON.
    const updatedCount = await tx.consolidation.updateMany({
      where: { id, status: "BROUILLON" },
      data: { status: "TRANSMISE", transmittedAt: new Date() },
    });
    if (updatedCount.count === 0) {
      throw new AppError("CONSOLIDATION_NOT_DRAFT", "Cette consolidation a déjà été transmise", 409);
    }
    const updated = await tx.consolidation.findUnique({ where: { id } });
    if (!updated) {
      throw new AppError("NOT_FOUND", "Consolidation introuvable", 404);
    }
    await writeAudit(tx, actorId, "TRANSMIT_CONSOLIDATION", id, {
      reference: consolidation.reference,
      demandeCount: demandes.length,
    });
    return updated;
  });
  return toResponse(row, await findDemandes(db, row.id));
}

export async function deleteConsolidation(
  id: string,
  actorId: string,
  db: ConsolidationDb = defaultDb
): Promise<{ deleted: boolean }> {
  await assertManager(actorId, db);
  await db.$transaction(async (tx) => {
    const consolidation = await tx.consolidation.findUnique({ where: { id } });
    if (!consolidation) throw new AppError("NOT_FOUND", "Consolidation introuvable", 404);
    if (consolidation.status !== "BROUILLON") {
      throw new AppError("CONSOLIDATION_TRANSMITTED", "Une consolidation transmise ne peut pas être supprimée", 409);
    }
    // Suppression atomique : ne réussit que si le statut est encore BROUILLON.
    const deleted = await tx.consolidation.deleteMany({ where: { id, status: "BROUILLON" } });
    if (deleted.count === 0) {
      throw new AppError("CONSOLIDATION_TRANSMITTED", "Une consolidation transmise ne peut pas être supprimée", 409);
    }
    await tx.demande.updateMany({ where: { consolidationId: id }, data: { consolidationId: null } });
    await writeAudit(tx, actorId, "DELETE_CONSOLIDATION", id, { reference: consolidation.reference });
  });
  return { deleted: true };
}
