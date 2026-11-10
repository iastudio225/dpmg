import { PrismaClient, Prisma, UserStatus, RoleType } from "@prisma/client";
import type { UserResponse, UserRoleResponse } from "@dpmg/shared";
import { hashPassword, verifyPassword } from "./auth.service";
import { AppError } from "../middleware/errorHandler";

const prisma = new PrismaClient();

const TECHNICAL_ADMIN_ROLE: RoleType = "TECHNICAL_ADMIN";
const SUPER_ADMIN_ROLE: RoleType = "SUPER_ADMIN";
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export interface UserListFilters {
  search?: string;
  status?: UserStatus;
  role?: RoleType;
  page?: number;
  limit?: number;
}

export interface UserRoleAssignmentInput {
  role: RoleType;
  structureId?: string | null;
  scope?: string | null;
  startDate?: string;
  endDate?: string;
  delegationNote?: string | null;
  delegatedFromUserId?: string | null;
}

export interface UserRoleUpdateInput {
  scope?: string | null;
  startDate?: string;
  endDate?: string;
  delegationNote?: string | null;
}

function toUserResponse(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  status: UserStatus;
  mustChangePassword: boolean;
  createdAt: Date;
  updatedAt: Date;
  roles?: UserRoleResponse[];
}): UserResponse {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    ...(user.roles ? { roles: user.roles } : {}),
  };
}

function toUserRoleResponse(
  role: {
    id: string;
    role: RoleType;
    structureId: string | null;
    structure: { id: string; name: string; code: string; type: string } | null;
    scope: string | null;
    startDate: Date;
    endDate: Date | null;
    delegationNote: string | null;
  }
): UserRoleResponse {
  return {
    id: role.id,
    role: role.role,
    structureId: role.structureId,
    structureName: role.structure?.name ?? null,
    structureCode: role.structure?.code ?? null,
    structureType: (role.structure?.type as UserRoleResponse["structureType"]) ?? null,
    scope: role.scope,
    startDate: role.startDate.toISOString(),
    endDate: role.endDate?.toISOString() ?? null,
    delegationNote: role.delegationNote,
  };
}

function activeRolesWhere(now: Date) {
  return {
    startDate: { lte: now },
    OR: [{ endDate: null }, { endDate: { gte: now } }],
  };
}

async function createAuditLog(
  tx: Prisma.TransactionClient,
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  details: Record<string, unknown> | undefined
) {
  return tx.adminAuditLog.create({
    data: {
      actorId,
      action,
      targetType,
      targetId,
      ...(details ? { details: details as Prisma.InputJsonValue } : {}),
    },
  });
}

async function runSerializable<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const maxAttempts = 3;
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Transaction sérialisable : verrou fiable contre les opérations concurrentes
      // sur les protections critiques (dernier administrateur technique actif).
      return await prisma.$transaction(fn, { isolationLevel: "Serializable" });
    } catch (error) {
      lastError = error;
      const code = (error as { code?: string } | null)?.code;
      const retryable = code === "P2034" || code === "P2031";
      if (!retryable) throw error;
    }
  }
  throw lastError;
}

async function countActiveTechnicalAdmins(
  tx: Prisma.TransactionClient,
  excludeUserId?: string
): Promise<number> {
  const now = new Date();
  const userFilter: Prisma.UserWhereInput = { status: UserStatus.ACTIVE };
  if (excludeUserId) {
    userFilter.id = { not: excludeUserId };
  }

  return tx.userStructureRole.count({
    where: {
      role: TECHNICAL_ADMIN_ROLE,
      user: userFilter,
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
    },
  });
}

async function assertNotLastTechnicalAdmin(
  tx: Prisma.TransactionClient,
  targetUserId: string
): Promise<void> {
  const remaining = await countActiveTechnicalAdmins(tx, targetUserId);
  if (remaining === 0) {
    throw new AppError(
      "LAST_TECHNICAL_ADMIN",
      "Action refusée : l'utilisateur est le dernier administrateur technique actif",
      409
    );
  }
}

/**
 * Vérifie qu'un acteur privilégié (TECHNICAL_ADMIN ou SUPER_ADMIN) ne peut pas
 * agir sur un autre compte privilégié.
 * - TECHNICAL_ADMIN ne peut pas gérer TECHNICAL_ADMIN ni SUPER_ADMIN.
 * - SUPER_ADMIN ne peut pas gérer un autre SUPER_ADMIN.
 * - L'auto-action reste autorisée.
 */
async function assertNotOtherPrivilegedAdmin(
  tx: Prisma.TransactionClient,
  actorId: string,
  targetUserId: string
): Promise<void> {
  if (actorId === targetUserId) return;

  const now = new Date();

  // Rôles actifs de l'acteur
  const actorRoles = await tx.userStructureRole.findMany({
    where: {
      userId: actorId,
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
    },
  });

  const actorIsSuperAdmin = actorRoles.some((r) => r.role === SUPER_ADMIN_ROLE);
  const actorIsTechnicalAdmin = actorRoles.some(
    (r) => r.role === TECHNICAL_ADMIN_ROLE
  );

  // Rôles actifs de la cible
  const targetRoles = await tx.userStructureRole.findMany({
    where: {
      userId: targetUserId,
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
    },
  });

  const targetIsSuperAdmin = targetRoles.some(
    (r) => r.role === SUPER_ADMIN_ROLE
  );
  const targetIsTechnicalAdmin = targetRoles.some(
    (r) => r.role === TECHNICAL_ADMIN_ROLE
  );

  // TECHNICAL_ADMIN (sans SUPER_ADMIN) ne peut gérer ni TECHNICAL_ADMIN ni SUPER_ADMIN
  if (actorIsTechnicalAdmin && !actorIsSuperAdmin) {
    if (targetIsTechnicalAdmin || targetIsSuperAdmin) {
      throw new AppError(
        "TECHNICAL_ADMIN_PROTECTED",
        "Action refusée : ce compte est protégé",
        403
      );
    }
  }

  // SUPER_ADMIN ne peut pas gérer un autre SUPER_ADMIN
  if (actorIsSuperAdmin && targetIsSuperAdmin) {
    throw new AppError(
      "SUPER_ADMIN_PROTECTED",
      "Action refusée : ce compte est un super administrateur protégé",
      403
    );
  }
}

async function countActiveSuperAdmins(
  tx: Prisma.TransactionClient,
  excludeUserId?: string
): Promise<number> {
  const now = new Date();
  const userFilter: Prisma.UserWhereInput = { status: UserStatus.ACTIVE };
  if (excludeUserId) {
    userFilter.id = { not: excludeUserId };
  }

  return tx.userStructureRole.count({
    where: {
      role: SUPER_ADMIN_ROLE,
      user: userFilter,
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
    },
  });
}

async function assertNotLastSuperAdmin(
  tx: Prisma.TransactionClient,
  targetUserId: string
): Promise<void> {
  const remaining = await countActiveSuperAdmins(tx, targetUserId);
  if (remaining === 0) {
    throw new AppError(
      "LAST_SUPER_ADMIN",
      "Action refusée : l'utilisateur est le dernier super administrateur actif",
      409
    );
  }
}

export async function listUsers(filters: UserListFilters): Promise<UserResponse[]> {
  const page = filters.page ?? DEFAULT_PAGE;
  const limit = Math.min(filters.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const now = new Date();

  const where: Prisma.UserWhereInput = {};
  if (filters.status) {
    where.status = filters.status;
  }
  if (filters.role) {
    where.structureRoles = { some: { role: filters.role } };
  }
  if (filters.search) {
    const term = filters.search.trim();
    where.OR = [
      { firstName: { contains: term, mode: "insensitive" } },
      { lastName: { contains: term, mode: "insensitive" } },
      { email: { contains: term, mode: "insensitive" } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
    include: {
      structureRoles: {
        where: activeRolesWhere(now),
        include: { structure: true },
      },
    },
  });

  return users.map((user) =>
    toUserResponse({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      status: user.status,
      mustChangePassword: user.mustChangePassword,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      roles: user.structureRoles.map((r) =>
        toUserRoleResponse({
          id: r.id,
          role: r.role,
          structureId: r.structureId,
          structure: r.structure ?? null,
          scope: r.scope,
          startDate: r.startDate,
          endDate: r.endDate,
          delegationNote: r.delegationNote,
        })
      ),
    })
  );
}

export async function getUserById(userId: string): Promise<{ user: UserResponse; roles: UserRoleResponse[] }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      structureRoles: {
        where: activeRolesWhere(new Date()),
        include: { structure: true },
      },
    },
  });

  if (!user) {
    throw new AppError("USER_NOT_FOUND", "Utilisateur non trouvé", 404);
  }

  const roles = user.structureRoles.map((r) =>
    toUserRoleResponse({
      id: r.id,
      role: r.role,
      structureId: r.structureId,
      structure: r.structure ?? null,
      scope: r.scope,
      startDate: r.startDate,
      endDate: r.endDate,
      delegationNote: r.delegationNote,
    })
  );

  return { user: toUserResponse(user), roles };
}

export async function createUser(
  actorId: string,
  input: {
    email: string;
    firstName: string;
    lastName: string;
    phone?: string | null;
    status?: UserStatus;
    password: string;
    roles?: UserRoleAssignmentInput[];
  }
): Promise<UserResponse> {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError("EMAIL_ALREADY_EXISTS", "Un utilisateur existe déjà avec cet e-mail", 409);
  }

  const passwordHash = await hashPassword(input.password);

  const user = await runSerializable(async (tx) => {
    // Seul un SUPER_ADMIN peut créer un utilisateur avec le rôle SUPER_ADMIN.
    if (input.roles && input.roles.some((r) => r.role === SUPER_ADMIN_ROLE)) {
      const actorRoles = await tx.userStructureRole.findMany({
        where: {
          userId: actorId,
          startDate: { lte: new Date() },
          OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
        },
      });
      const actorIsSuperAdmin = actorRoles.some(
        (r) => r.role === SUPER_ADMIN_ROLE
      );
      if (!actorIsSuperAdmin) {
        throw new AppError(
          "SUPER_ADMIN_PROTECTED",
          "Action refusée : seul un super administrateur peut créer un compte super administrateur",
          403
        );
      }
    }

    const created = await tx.user.create({
      data: {
        email,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        phone: input.phone ?? null,
        passwordHash,
        status: input.status ?? UserStatus.ACTIVE,
        // Un mot de passe défini par un administrateur est un mot de passe temporaire :
        // l'utilisateur doit le changer à la première connexion.
        mustChangePassword: true,
      },
    });

    if (input.roles && input.roles.length > 0) {
      for (const role of input.roles) {
        // TECHNICAL_ADMIN peut être créé sans rattachement à une structure (global).
        // Aucun rattachement fictif n'est créé : structureId reste null et scope est forcé à "*".
        if (role.role === TECHNICAL_ADMIN_ROLE && (!role.structureId || role.structureId.trim() === "")) {
          await tx.userStructureRole.create({
            data: {
              userId: created.id,
              structureId: null,
              role: role.role,
              scope: "*",
              startDate: role.startDate ? new Date(role.startDate) : new Date(),
              endDate: role.endDate ? new Date(role.endDate) : null,
              delegationNote: role.delegationNote ?? null,
              delegatedFromUserId: role.delegatedFromUserId ?? null,
            },
          });
        } else {
          await tx.userStructureRole.create({
            data: {
              userId: created.id,
              structureId: role.structureId,
              role: role.role,
              scope: role.scope ?? null,
              startDate: role.startDate ? new Date(role.startDate) : new Date(),
              endDate: role.endDate ? new Date(role.endDate) : null,
              delegationNote: role.delegationNote ?? null,
              delegatedFromUserId: role.delegatedFromUserId ?? null,
            },
          });
        }
      }
    }

    await createAuditLog(tx, actorId, "CREATE_USER", "User", created.id, {
      email: created.email,
      firstName: created.firstName,
      lastName: created.lastName,
      status: created.status,
      roles: (input.roles ?? []).map((r) => ({
        role: r.role,
        structureId: r.structureId,
        scope: r.scope ?? null,
      })),
    });

    return created;
  });

  return toUserResponse(user);
}

export async function updateUser(
  actorId: string,
  userId: string,
  input: { firstName?: string; lastName?: string; phone?: string | null; email?: string }
): Promise<UserResponse> {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    throw new AppError("USER_NOT_FOUND", "Utilisateur non trouvé", 404);
  }

  if (input.email) {
    const email = input.email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing && existing.id !== userId) {
      throw new AppError("EMAIL_ALREADY_EXISTS", "Un utilisateur existe déjà avec cet e-mail", 409);
    }
  }

  const updated = await runSerializable(async (tx) => {
    // Un TECHNICAL_ADMIN ne peut pas modifier un autre administrateur technique.
    await assertNotOtherPrivilegedAdmin(tx, actorId, userId);

    const data: { firstName?: string; lastName?: string; phone?: string | null; email?: string } = {};
    if (input.firstName !== undefined) data.firstName = input.firstName.trim();
    if (input.lastName !== undefined) data.lastName = input.lastName.trim();
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.email !== undefined) data.email = input.email.trim().toLowerCase();

    const user = await tx.user.update({ where: { id: userId }, data });

    await createAuditLog(tx, actorId, "UPDATE_USER", "User", userId, {
      changedFields: Object.keys(data),
    });

    return user;
  });

  return toUserResponse(updated);
}

export async function changeUserStatus(
  actorId: string,
  userId: string,
  status: UserStatus
): Promise<UserResponse> {
  if (actorId === userId) {
    throw new AppError("SELF_DISABLE_FORBIDDEN", "Un administrateur ne peut pas désactiver son propre compte", 403);
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      structureRoles: {
        where: activeRolesWhere(new Date()),
        include: { structure: true },
      },
    },
  });
  if (!target) {
    throw new AppError("USER_NOT_FOUND", "Utilisateur non trouvé", 404);
  }

  const holdsTechnicalAdmin = target.structureRoles.some((r) => r.role === TECHNICAL_ADMIN_ROLE);
  const holdsSuperAdmin = target.structureRoles.some((r) => r.role === SUPER_ADMIN_ROLE);
  const isLastActiveTechnicalAdmin = holdsTechnicalAdmin && (await countActiveTechnicalAdmins(prisma, userId)) === 0;
  const isLastActiveSuperAdmin = holdsSuperAdmin && (await countActiveSuperAdmins(prisma, userId)) === 0;

  if (isLastActiveTechnicalAdmin && status !== UserStatus.ACTIVE) {
    throw new AppError(
      "LAST_TECHNICAL_ADMIN",
      "Action refusée : protection du dernier administrateur technique actif",
      409
    );
  }

  if (isLastActiveSuperAdmin && status !== UserStatus.ACTIVE) {
    throw new AppError(
      "LAST_SUPER_ADMIN",
      "Action refusée : protection du dernier super administrateur actif",
      409
    );
  }

  const updated = await runSerializable(async (tx) => {
    // Un TECHNICAL_ADMIN ne peut pas modifier le statut d'un autre administrateur technique.
    await assertNotOtherPrivilegedAdmin(tx, actorId, userId);

    const user = await tx.user.update({ where: { id: userId }, data: { status } });

    if (status !== UserStatus.ACTIVE) {
      await tx.session.deleteMany({ where: { userId } });
    }

    await createAuditLog(tx, actorId, "CHANGE_USER_STATUS", "User", userId, {
      oldStatus: target.status,
      newStatus: status,
    });

    return user;
  });

  return toUserResponse(updated);
}

export async function resetPassword(
  actorId: string,
  userId: string,
  temporaryPassword: string
): Promise<{ temporaryPassword: string; mustChangePassword: boolean }> {
  const passwordHash = await hashPassword(temporaryPassword);

  const user = await runSerializable(async (tx) => {
    // Un TECHNICAL_ADMIN ne peut pas réinitialiser le mot de passe d'un autre administrateur technique.
    await assertNotOtherPrivilegedAdmin(tx, actorId, userId);

    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword: true,
      },
    });

    await tx.session.deleteMany({ where: { userId } });

    await createAuditLog(tx, actorId, "RESET_PASSWORD", "User", userId, {
      reason: "admin_reset",
      mustChangePassword: true,
    });

    return updated;
  });

  return { temporaryPassword, mustChangePassword: user.mustChangePassword };
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<{ mustChangePassword: boolean }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError("USER_NOT_FOUND", "Utilisateur non trouvé", 404);
  }

  const isValid = await verifyPassword(currentPassword, user.passwordHash);
  if (!isValid) {
    throw new AppError("INVALID_CREDENTIALS", "Mot de passe actuel incorrect", 401);
  }

  const passwordHash = await hashPassword(newPassword);
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      mustChangePassword: false,
    },
  });

  await prisma.adminAuditLog.create({
    data: {
      actorId: userId,
      action: "CHANGE_PASSWORD",
      targetType: "User",
      targetId: userId,
      details: { mustChangePassword: false },
    },
  });

  return { mustChangePassword: updated.mustChangePassword };
}

export async function invalidateSessions(actorId: string, userId: string): Promise<{ invalidated: number }> {
  return runSerializable(async (tx) => {
    // Un TECHNICAL_ADMIN ne peut pas invalider les sessions d'un autre administrateur technique.
    await assertNotOtherPrivilegedAdmin(tx, actorId, userId);

    const invalidated = await tx.session.deleteMany({ where: { userId } });

    await tx.adminAuditLog.create({
      data: {
        actorId,
        action: "INVALIDATE_SESSIONS",
        targetType: "User",
        targetId: userId,
        details: { reason: "admin_action" },
      },
    });

    return { invalidated: invalidated.count };
  });
}

export async function assignUserRole(actorId: string, userId: string, input: UserRoleAssignmentInput): Promise<void> {
  const actor = await prisma.user.findUnique({ where: { id: actorId } });
  if (!actor) {
    throw new AppError("USER_NOT_FOUND", "Utilisateur non trouvé", 404);
  }

  // TECHNICAL_ADMIN et SUPER_ADMIN peuvent être créés sans structure (rôle global) :
  // pas de vérification de structure, périmètre forcé à "*".
  const isGlobalAdmin =
    (input.role === TECHNICAL_ADMIN_ROLE || input.role === SUPER_ADMIN_ROLE) &&
    (!input.structureId || input.structureId.trim() === "");

  if (!isGlobalAdmin) {
    if (!input.structureId || input.structureId.trim() === "") {
      throw new AppError("VALIDATION_ERROR", "L'identifiant de la structure est requis pour ce rôle", 400);
    }
    const structure = await prisma.structure.findUnique({ where: { id: input.structureId } });
    if (!structure) {
      throw new AppError("NOT_FOUND", "Structure non trouvée", 404);
    }
  }

  if (actorId === userId && input.role === TECHNICAL_ADMIN_ROLE) {
    throw new AppError(
      "SELF_ROLE_FORBIDDEN",
      "Un administrateur ne peut pas se donner le rôle administrateur technique",
      403
    );
  }

  const startDate = input.startDate ? new Date(input.startDate) : new Date();
  const endDate = input.endDate ? new Date(input.endDate) : null;
  if (endDate && endDate < startDate) {
    throw new AppError("VALIDATION_ERROR", "La date de fin ne peut pas être antérieure à la date de début", 400);
  }

  if (input.role === TECHNICAL_ADMIN_ROLE && input.delegatedFromUserId) {
    throw new AppError("VALIDATION_ERROR", "Un rôle administrateur technique ne peut pas être délégué", 400);
  }

  await runSerializable(async (tx) => {
    // Seul un SUPER_ADMIN peut attribuer le rôle SUPER_ADMIN.
    if (input.role === SUPER_ADMIN_ROLE) {
      const actorRoles = await tx.userStructureRole.findMany({
        where: {
          userId: actorId,
          startDate: { lte: new Date() },
          OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
        },
      });
      const actorIsSuperAdmin = actorRoles.some(
        (r) => r.role === SUPER_ADMIN_ROLE
      );
      if (!actorIsSuperAdmin) {
        throw new AppError(
          "SUPER_ADMIN_PROTECTED",
          "Action refusée : seul un super administrateur peut attribuer ce rôle",
          403
        );
      }
    }

    // Un TECHNICAL_ADMIN ne peut pas attribuer le rôle TECHNICAL_ADMIN à un autre compte.
    if (input.role === TECHNICAL_ADMIN_ROLE && actorId !== userId) {
      throw new AppError(
        "TECHNICAL_ADMIN_PROTECTED",
        "Action refusée : vous ne pouvez pas attribuer le rôle administrateur technique à un autre compte",
        403
      );
    }

    // Un TECHNICAL_ADMIN ne peut pas modifier les habilitations d'un autre administrateur technique.
    await assertNotOtherPrivilegedAdmin(tx, actorId, userId);

    await tx.userStructureRole.create({
      data: {
        userId,
        structureId: isGlobalAdmin ? null : input.structureId,
        role: input.role,
        scope: isGlobalAdmin ? "*" : (input.scope ?? null),
        startDate,
        endDate,
        delegationNote: input.delegationNote ?? null,
        delegatedFromUserId: input.delegatedFromUserId ?? null,
      },
    });

    await createAuditLog(tx, actorId, "ASSIGN_ROLE", "UserStructureRole", userId, {
      role: input.role,
      structureId: isGlobalAdmin ? null : input.structureId,
      scope: isGlobalAdmin ? "*" : (input.scope ?? null),
      startDate: startDate.toISOString(),
      endDate: endDate?.toISOString() ?? null,
      delegatedFromUserId: input.delegatedFromUserId ?? null,
      ...(input.role === TECHNICAL_ADMIN_ROLE ? { verifiedProcedurally: true } : {}),
    });
  });
}

export async function updateUserRole(
  actorId: string,
  userId: string,
  roleId: string,
  input: UserRoleUpdateInput
): Promise<void> {
  const existing = await prisma.userStructureRole.findUnique({ where: { id: roleId } });
  if (!existing) {
    throw new AppError("NOT_FOUND", "Rôle utilisateur introuvable", 404);
  }

  const startDate = input.startDate ? new Date(input.startDate) : existing.startDate;
  const endDate = input.endDate ? new Date(input.endDate) : existing.endDate;
  if (endDate && endDate < startDate) {
    throw new AppError("VALIDATION_ERROR", "La date de fin ne peut pas être antérieure à la date de début", 400);
  }

  const effectiveEnd = endDate;
  const willBeInactive = effectiveEnd !== null && effectiveEnd < new Date();

  await runSerializable(async (tx) => {
    // Un TECHNICAL_ADMIN ne peut pas modifier les habilitations d'un autre administrateur technique.
    await assertNotOtherPrivilegedAdmin(tx, actorId, existing.userId);

    if (existing.role === TECHNICAL_ADMIN_ROLE && willBeInactive) {
      await assertNotLastTechnicalAdmin(tx, existing.userId);
    }

    if (existing.role === SUPER_ADMIN_ROLE && willBeInactive) {
      await assertNotLastSuperAdmin(tx, existing.userId);
    }

    const result = await tx.userStructureRole.update({
      where: { id: roleId },
      data: {
        scope: input.scope === undefined ? undefined : input.scope,
        startDate: input.startDate === undefined ? undefined : new Date(input.startDate),
        endDate: input.endDate === undefined ? undefined : new Date(input.endDate),
        delegationNote: input.delegationNote === undefined ? undefined : input.delegationNote,
      },
    });

    await createAuditLog(tx, actorId, "UPDATE_ROLE", "UserStructureRole", userId, {
      role: result.role,
      structureId: result.structureId,
      scope: result.scope,
      startDate: result.startDate.toISOString(),
      endDate: result.endDate?.toISOString() ?? null,
      delegationNote: result.delegationNote,
    });

    return result;
  });
}

export async function removeUserRole(actorId: string, userId: string, roleId: string): Promise<void> {
  const existing = await prisma.userStructureRole.findUnique({ where: { id: roleId } });
  if (!existing) {
    throw new AppError("NOT_FOUND", "Rôle utilisateur introuvable", 404);
  }

  if (existing.role === TECHNICAL_ADMIN_ROLE || existing.role === SUPER_ADMIN_ROLE) {
    await runSerializable(async (tx) => {
      // Un TECHNICAL_ADMIN ne peut pas retirer le rôle TECHNICAL_ADMIN d'un autre compte.
      // Un SUPER_ADMIN ne peut pas retirer le rôle SUPER_ADMIN d'un autre compte.
      await assertNotOtherPrivilegedAdmin(tx, actorId, existing.userId);

      const now = new Date();
      const roleToCheck =
        existing.role === SUPER_ADMIN_ROLE ? SUPER_ADMIN_ROLE : TECHNICAL_ADMIN_ROLE;
      const count = await tx.userStructureRole.count({
        where: {
          role: roleToCheck,
          user: { status: UserStatus.ACTIVE },
          startDate: { lte: now },
          OR: [{ endDate: null }, { endDate: { gte: now } }],
          id: { not: existing.userId },
        },
      });
      if (count === 0) {
        throw new AppError(
          existing.role === SUPER_ADMIN_ROLE
            ? "LAST_SUPER_ADMIN"
            : "LAST_TECHNICAL_ADMIN",
          existing.role === SUPER_ADMIN_ROLE
            ? "Action refusée : protection du dernier super administrateur actif"
            : "Action refusée : protection du dernier administrateur technique actif",
          409
        );
      }
    });
  }

  await runSerializable(async (tx) => {
    await tx.userStructureRole.delete({ where: { id: roleId } });

    await createAuditLog(tx, actorId, "REMOVE_ROLE", "UserStructureRole", userId, {
      role: existing.role,
      structureId: existing.structureId,
    });
  });
}

export async function listAuditLogs(
  actorId: string,
  filters: {
    actorId?: string;
    action?: string;
    targetType?: string;
    targetId?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }
): Promise<unknown[]> {
  const page = filters.page ?? DEFAULT_PAGE;
  const limit = Math.min(filters.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  const where: Prisma.AdminAuditLogWhereInput = {};
  if (filters.actorId) where.actorId = filters.actorId;
  if (filters.action) where.action = filters.action;
  if (filters.targetType) where.targetType = filters.targetType;
  if (filters.targetId) where.targetId = filters.targetId;
  if (filters.from || filters.to) {
    where.createdAt = {};
    if (filters.from) where.createdAt.gte = new Date(filters.from);
    if (filters.to) where.createdAt.lte = new Date(filters.to);
  }

  const logs = await prisma.adminAuditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
  });

  return logs.map((log) => ({
    id: log.id,
    actorId: log.actorId,
    action: log.action,
    targetType: log.targetType,
    targetId: log.targetId,
    details: log.details as Record<string, unknown> | null,
    createdAt: log.createdAt.toISOString(),
  }));
}
