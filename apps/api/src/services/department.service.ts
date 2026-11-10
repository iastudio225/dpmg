import { PrismaClient, Prisma } from "@prisma/client";
import type { DepartmentResponse, DepartmentListQuery } from "@dpmg/shared";
import { AppError } from "../middleware/errorHandler";

const prisma = new PrismaClient();

interface DepartmentRecord {
  id: string;
  name: string;
  code: string;
  description: string | null;
  status: boolean;
  structureId: string | null;
  structure: { name: string; code: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDepartmentResponse(row: DepartmentRecord): DepartmentResponse {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description,
    status: row.status,
    structureId: row.structureId,
    structureName: row.structure?.name ?? null,
    structureCode: row.structure?.code ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const structureInclude = { structure: { select: { name: true, code: true } } } as const;

/** Écriture d'une trace d'audit administrative (jamais de secret). */
async function writeAudit(
  tx: Prisma.TransactionClient,
  actorId: string,
  action: string,
  targetId: string,
  details: Prisma.InputJsonValue
): Promise<void> {
  await tx.adminAuditLog.create({
    data: { actorId, action, targetType: "Department", targetId, details },
  });
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Champ en conflit d'un violation d'unicité (name, code ou structureId). */
function uniqueViolationField(error: unknown): string | undefined {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const target = error.meta?.["target"];
    if (Array.isArray(target)) return target.map(String).join(", ");
    if (typeof target === "string") return target;
  }
  return undefined;
}

export async function listDepartments(filters: DepartmentListQuery): Promise<DepartmentResponse[]> {
  const rows = await prisma.department.findMany({
    where: {
      ...(filters.search
        ? {
            OR: [
              { code: { contains: filters.search, mode: "insensitive" } },
              { name: { contains: filters.search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(filters.structureId ? { structureId: filters.structureId } : {}),
      ...(filters.status !== undefined ? { status: filters.status } : {}),
    },
    include: structureInclude,
    orderBy: [{ name: "asc" }],
    skip: (filters.page - 1) * filters.limit,
    take: filters.limit,
  });
  return rows.map(toDepartmentResponse);
}

export async function getDepartmentById(departmentId: string): Promise<DepartmentResponse> {
  const row = await prisma.department.findUnique({ where: { id: departmentId }, include: structureInclude });
  if (!row) {
    throw new AppError("DEPARTMENT_NOT_FOUND", "Département introuvable", 404);
  }
  return toDepartmentResponse(row);
}

/** Vérifie l'existence de la structure et qu'elle n'est pas déjà rattachée à un AUTRE département. */
async function assertStructureAssignable(structureId: string, excludingDepartmentId?: string): Promise<void> {
  const structure = await prisma.structure.findUnique({ where: { id: structureId }, select: { id: true } });
  if (!structure) {
    throw new AppError("STRUCTURE_NOT_FOUND", "Structure introuvable", 404);
  }

  const assigned = await prisma.department.findFirst({
    where: { structureId, ...(excludingDepartmentId ? { id: { not: excludingDepartmentId } } : {}) },
    select: { id: true },
  });
  if (assigned) {
    throw new AppError(
      "STRUCTURE_ALREADY_ASSIGNED",
      "Cette structure est déjà rattachée à un autre département",
      409
    );
  }
}

export async function createDepartment(
  actorId: string,
  input: { name: string; code: string; description?: string | null; structureId: string }
): Promise<DepartmentResponse> {
  await assertStructureAssignable(input.structureId);

  try {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.department.create({
        data: {
          name: input.name,
          code: input.code,
          description: input.description ?? null,
          structureId: input.structureId,
          status: true,
        },
        include: structureInclude,
      });
      await writeAudit(tx, actorId, "CREATE_DEPARTMENT", row.id, {
        code: row.code,
        name: row.name,
        structureId: row.structureId,
      });
      return row;
    });
    return toDepartmentResponse(created);
  } catch (error) {
    const field = uniqueViolationField(error);
    if (field === "code") {
      throw new AppError("CODE_ALREADY_EXISTS", "Ce code de département existe déjà", 409);
    }
    if (field === "name") {
      throw new AppError("NAME_ALREADY_EXISTS", "Ce nom de département existe déjà", 409);
    }
    if (isUniqueViolation(error)) {
      throw new AppError("STRUCTURE_ALREADY_ASSIGNED", "Cette structure est déjà rattachée à un autre département", 409);
    }
    throw error;
  }
}

export async function updateDepartment(
  actorId: string,
  departmentId: string,
  input: { name?: string; code?: string; description?: string | null; structureId?: string }
): Promise<DepartmentResponse> {
  const existing = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true, structureId: true },
  });
  if (!existing) {
    throw new AppError("DEPARTMENT_NOT_FOUND", "Département introuvable", 404);
  }

  // Conserver la propre structure du département reste autorisé.
  if (input.structureId && input.structureId !== existing.structureId) {
    await assertStructureAssignable(input.structureId, departmentId);
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.department.update({
        where: { id: departmentId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.code !== undefined ? { code: input.code } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.structureId !== undefined ? { structureId: input.structureId } : {}),
        },
        include: structureInclude,
      });
      await writeAudit(tx, actorId, "UPDATE_DEPARTMENT", row.id, {
        code: row.code,
        name: row.name,
        structureId: row.structureId,
      });
      return row;
    });
    return toDepartmentResponse(updated);
  } catch (error) {
    const field = uniqueViolationField(error);
    if (field === "code") {
      throw new AppError("CODE_ALREADY_EXISTS", "Ce code de département existe déjà", 409);
    }
    if (field === "name") {
      throw new AppError("NAME_ALREADY_EXISTS", "Ce nom de département existe déjà", 409);
    }
    if (isUniqueViolation(error)) {
      throw new AppError("STRUCTURE_ALREADY_ASSIGNED", "Cette structure est déjà rattachée à un autre département", 409);
    }
    throw error;
  }
}

export async function changeDepartmentStatus(
  actorId: string,
  departmentId: string,
  status: boolean
): Promise<DepartmentResponse> {
  const existing = await prisma.department.findUnique({ where: { id: departmentId }, select: { id: true } });
  if (!existing) {
    throw new AppError("DEPARTMENT_NOT_FOUND", "Département introuvable", 404);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.department.update({
      where: { id: departmentId },
      data: { status },
      include: structureInclude,
    });
    await writeAudit(tx, actorId, "CHANGE_DEPARTMENT_STATUS", row.id, {
      code: row.code,
      status: row.status,
    });
    return row;
  });
  return toDepartmentResponse(updated);
}
