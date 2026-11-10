import { PrismaClient, Prisma, StructureType } from "@prisma/client";
import type { StructureResponse, StructureListQuery } from "@dpmg/shared";
import { AppError } from "../middleware/errorHandler";

const prisma = new PrismaClient();

interface StructureRecord {
  id: string;
  code: string;
  name: string;
  type: StructureType;
  parentId: string | null;
  parent: { name: string } | null;
  status: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toStructureResponse(row: StructureRecord): StructureResponse {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    parentId: row.parentId,
    parentName: row.parent?.name ?? null,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const parentInclude = { parent: { select: { name: true } } } as const;

/** Écriture d'une trace d'audit administrative (jamais de secret). */
async function writeAudit(
  tx: Prisma.TransactionClient,
  actorId: string,
  action: string,
  targetId: string,
  details: Prisma.InputJsonValue
): Promise<void> {
  await tx.adminAuditLog.create({
    data: { actorId, action, targetType: "Structure", targetId, details },
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * Vérifie qu'une nouvelle structure parente n'introduit pas de cycle.
 * Remonte la chaîne des parents depuis `newParentId` : si on rencontre
 * `structureId`, le nouveau parent est la structure elle-même ou un descendant.
 */
async function assertNoParentCycle(structureId: string, newParentId: string): Promise<void> {
  if (newParentId === structureId) {
    throw new AppError("PARENT_CYCLE", "Une structure ne peut pas être son propre parent", 400);
  }
  const seen = new Set<string>();
  let current: string | null = newParentId;
  while (current !== null) {
    if (current === structureId) {
      throw new AppError("PARENT_CYCLE", "Le parent choisi serait un descendant de la structure", 400);
    }
    if (seen.has(current)) break;
    seen.add(current);
    const parent: { parentId: string | null } | null = await prisma.structure.findUnique({
      where: { id: current },
      select: { parentId: true },
    });
    current = parent?.parentId ?? null;
  }
}

export async function listStructures(filters: StructureListQuery): Promise<StructureResponse[]> {
  const rows = await prisma.structure.findMany({
    where: {
      ...(filters.search
        ? {
            OR: [
              { code: { contains: filters.search, mode: "insensitive" } },
              { name: { contains: filters.search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.status !== undefined ? { status: filters.status } : {}),
    },
    include: parentInclude,
    orderBy: [{ type: "asc" }, { name: "asc" }],
    skip: (filters.page - 1) * filters.limit,
    take: filters.limit,
  });
  return rows.map(toStructureResponse);
}

export async function getStructureById(structureId: string): Promise<StructureResponse> {
  const row = await prisma.structure.findUnique({ where: { id: structureId }, include: parentInclude });
  if (!row) {
    throw new AppError("STRUCTURE_NOT_FOUND", "Structure introuvable", 404);
  }
  return toStructureResponse(row);
}

export async function createStructure(
  actorId: string,
  input: { code: string; name: string; type: StructureType; parentId?: string | null }
): Promise<StructureResponse> {
  if (input.parentId) {
    const parent = await prisma.structure.findUnique({ where: { id: input.parentId }, select: { id: true } });
    if (!parent) {
      throw new AppError("PARENT_NOT_FOUND", "Structure parente introuvable", 404);
    }
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.structure.create({
        data: {
          code: input.code,
          name: input.name,
          type: input.type,
          parentId: input.parentId ?? null,
        },
        include: parentInclude,
      });
      await writeAudit(tx, actorId, "CREATE_STRUCTURE", row.id, {
        code: row.code,
        name: row.name,
        type: row.type,
        parentId: row.parentId,
      });
      return row;
    });
    return toStructureResponse(created);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError("CODE_ALREADY_EXISTS", "Ce code de structure existe déjà", 409);
    }
    throw error;
  }
}

export async function updateStructure(
  actorId: string,
  structureId: string,
  input: { code?: string; name?: string; type?: StructureType; parentId?: string | null }
): Promise<StructureResponse> {
  const existing = await prisma.structure.findUnique({ where: { id: structureId }, select: { id: true } });
  if (!existing) {
    throw new AppError("STRUCTURE_NOT_FOUND", "Structure introuvable", 404);
  }

  if (input.parentId) {
    const parent = await prisma.structure.findUnique({ where: { id: input.parentId }, select: { id: true } });
    if (!parent) {
      throw new AppError("PARENT_NOT_FOUND", "Structure parente introuvable", 404);
    }
    await assertNoParentCycle(structureId, input.parentId);
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.structure.update({
        where: { id: structureId },
        data: {
          ...(input.code !== undefined ? { code: input.code } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.type !== undefined ? { type: input.type } : {}),
          ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        },
        include: parentInclude,
      });
      await writeAudit(tx, actorId, "UPDATE_STRUCTURE", row.id, {
        code: row.code,
        name: row.name,
        type: row.type,
        parentId: row.parentId,
      });
      return row;
    });
    return toStructureResponse(updated);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError("CODE_ALREADY_EXISTS", "Ce code de structure existe déjà", 409);
    }
    throw error;
  }
}

export async function changeStructureStatus(
  actorId: string,
  structureId: string,
  status: boolean
): Promise<StructureResponse> {
  const existing = await prisma.structure.findUnique({ where: { id: structureId }, select: { id: true } });
  if (!existing) {
    throw new AppError("STRUCTURE_NOT_FOUND", "Structure introuvable", 404);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.structure.update({
      where: { id: structureId },
      data: { status },
      include: parentInclude,
    });
    await writeAudit(tx, actorId, "CHANGE_STRUCTURE_STATUS", row.id, {
      code: row.code,
      status: row.status,
    });
    return row;
  });
  return toStructureResponse(updated);
}
