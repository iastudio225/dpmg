import argon2 from "argon2";
import { PrismaClient, UserStatus, RoleType } from "@prisma/client";

const prisma = new PrismaClient();

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
    parallelism: 1,
  });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export interface UserWithRoles {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
  phone: string | null;
  status: UserStatus;
  mustChangePassword: boolean;
  createdAt: Date;
  updatedAt: Date;
  structureRoles: Array<{
    id: string;
    role: RoleType;
    structureId: string | null;
    structureName: string | null;
    structureCode: string | null;
    structureType: string | null;
    scope: string | null;
    startDate: Date;
    endDate: Date | null;
    delegationNote: string | null;
  }>;
}

export async function findUserByEmail(email: string): Promise<UserWithRoles | null> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: {
      structureRoles: {
        where: {
          OR: [
            { endDate: null },
            { endDate: { gte: new Date() } },
          ],
          startDate: { lte: new Date() },
        },
        include: {
          structure: true,
        },
      },
    },
  });

  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    passwordHash: user.passwordHash,
    phone: user.phone,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    structureRoles: user.structureRoles.map((sr) => ({
      id: sr.id,
      role: sr.role,
      structureId: sr.structure?.id ?? null,
      structureName: sr.structure?.name ?? null,
      structureCode: sr.structure?.code ?? null,
      structureType: sr.structure?.type ?? null,
      scope: sr.scope,
      startDate: sr.startDate,
      endDate: sr.endDate,
      delegationNote: sr.delegationNote,
    })),
  };
}

export async function createSessionRecord(userId: string, token: string, expiresAt: Date) {
  return prisma.session.create({
    data: {
      userId,
      token,
      expiresAt,
    },
  });
}

export async function deleteSessionRecord(token: string) {
  return prisma.session.deleteMany({
    where: { token },
  });
}

export async function deleteExpiredSessions() {
  return prisma.session.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });
}

export async function findSessionByToken(token: string) {
  return prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });
}

export async function invalidateUserSessions(userId: string) {
  return prisma.session.deleteMany({
    where: { userId },
  });
}

export async function getUserActiveRoles(userId: string) {
  const now = new Date();
  return prisma.userStructureRole.findMany({
    where: {
      userId,
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
    },
    include: { structure: true },
  });
}