import { PrismaClient, RoleType, UserStatus } from "@prisma/client";
import { AppError } from "../middleware/errorHandler";
import {
  consolidationObservationResponseSchema,
  type ConsolidationObservationResponse,
  type ConsolidationObservationCreateRequest,
} from "@dpmg/shared/zod";
import { activeDgHabilitations, activeCpmpHabilitations } from "./demande.service";

const prisma = new PrismaClient();

export interface ObservationDb {
  user: {
    findUnique(args: { where: { id: string }; select?: unknown }): Promise<{ status: string } | null>;
  };
  userStructureRole: {
    findMany(args: { where: Record<string, unknown> }): Promise<Array<{ role: string; scope: string | null; startDate: Date; endDate: Date | null }>>;
  };
  consolidation: {
    findUnique(args: { where: { id: string }; include?: unknown }): Promise<any | null>;
  };
  consolidationObservation: {
    create(args: { data: Record<string, unknown> }): Promise<any>;
    findMany(args: { where: Record<string, unknown>; orderBy?: unknown }): Promise<any[]>;
  };
  adminAuditLog: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
  $transaction<T>(fn: (tx: ObservationDb) => Promise<T>): Promise<T>;
}

const defaultDb: ObservationDb = prisma as unknown as ObservationDb;

function scopeCovers(scope: string | null, departmentCode: string): boolean {
  if (!scope) return false;
  if (scope === "*") return true;
  return scope === departmentCode;
}

function hasScopeMatch(habilitations: Array<{ scope: string | null }>, departmentCodes: string[]): boolean {
  return habilitations.some((h) => {
    if (h.scope === "*") return true;
    return h.scope !== null && departmentCodes.includes(h.scope);
  });
}

async function assertActiveUser(userId: string, db: ObservationDb): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { status: true } });
  if (!user || user.status !== UserStatus.ACTIVE) {
    throw new AppError("FORBIDDEN", "Compte utilisateur inactif ou introuvable", 403);
  }
}

async function loadConsolidation(consolidationId: string, db: ObservationDb) {
  const consolidation = await db.consolidation.findUnique({
    where: { id: consolidationId },
    include: { demandes: { include: { department: { select: { code: true } } } } },
  });
  if (!consolidation) {
    throw new AppError("NOT_FOUND", "Consolidation introuvable", 404);
  }
  if (consolidation.status !== "TRANSMISE") {
    throw new AppError("NOT_FOUND", "Consolidation introuvable", 404);
  }
  return consolidation;
}

export async function addConsolidationObservation(
  consolidationId: string,
  commentaire: string,
  actorId: string,
  db: ObservationDb = defaultDb
): Promise<ConsolidationObservationResponse> {
  await assertActiveUser(actorId, db);

  const trimmed = commentaire.trim();
  if (trimmed.length === 0) {
    throw new AppError("VALIDATION_ERROR", "L'observation est requise", 400);
  }

  const consolidation = await loadConsolidation(consolidationId, db);
  const departmentCodes = consolidation.demandes.map((d: any) => d.department.code);

  const dgHabs = await activeDgHabilitations(actorId, db);
  const cpmpHabs = await activeCpmpHabilitations(actorId, db);
  const dgAuthorized = hasScopeMatch(dgHabs, departmentCodes);
  const cpmpAuthorized = hasScopeMatch(cpmpHabs, departmentCodes);

  let role: RoleType | null = null;
  if (dgAuthorized) role = RoleType.DG_USER;
  else if (cpmpAuthorized) role = RoleType.CPMP_USER;

  if (!role) {
    throw new AppError("FORBIDDEN", "Vous n'êtes pas habilité à observer cette consolidation", 403);
  }

  const created = await db.$transaction(async (tx) => {
    const observation = await tx.consolidationObservation.create({
      data: {
        consolidationId,
        actorId,
        role,
        commentaire: trimmed,
      },
    });
    await tx.adminAuditLog.create({
      data: {
        actorId,
        action: "CREATE_CONSOLIDATION_OBSERVATION",
        targetType: "Consolidation",
        targetId: consolidationId,
        details: {
          observationId: observation.id,
          role,
          actorId,
        } as any,
      },
    });
    return observation;
  });

  return consolidationObservationResponseSchema.parse({
    id: created.id,
    consolidationId: created.consolidationId,
    actorId: created.actorId,
    role: created.role,
    commentaire: created.commentaire,
    createdAt: created.createdAt.toISOString(),
  });
}

export async function listConsolidationObservations(
  consolidationId: string,
  actorId: string,
  db: ObservationDb = defaultDb
): Promise<ConsolidationObservationResponse[]> {
  await assertActiveUser(actorId, db);

  const consolidation = await loadConsolidation(consolidationId, db);
  const departmentCodes = consolidation.demandes.map((d: any) => d.department.code);

  const dgHabs = await activeDgHabilitations(actorId, db);
  const cpmpHabs = await activeCpmpHabilitations(actorId, db);
  const authorized =
    hasScopeMatch(dgHabs, departmentCodes) || hasScopeMatch(cpmpHabs, departmentCodes);

  if (!authorized) {
    throw new AppError("FORBIDDEN", "Vous n'êtes pas habilité à consulter cette consolidation", 403);
  }

  const rows = await db.consolidationObservation.findMany({
    where: { consolidationId },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((r) =>
    consolidationObservationResponseSchema.parse({
      id: r.id,
      consolidationId: r.consolidationId,
      actorId: r.actorId,
      role: r.role,
      commentaire: r.commentaire,
      createdAt: r.createdAt.toISOString(),
    })
  );
}
