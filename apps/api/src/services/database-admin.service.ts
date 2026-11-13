import { PrismaClient, RoleType } from "@prisma/client";
import { Client } from "pg";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { verifyPassword } from "./auth.service";
import { AppError } from "../middleware/errorHandler";

const prisma = new PrismaClient();

const TECHNICAL_ADMIN: RoleType = "TECHNICAL_ADMIN";
const ADVISORY_LOCK_KEY = 847291034;

export interface BackupResult {
  success: boolean;
  backupReference: string;
  createdAt: string;
  sizeBytes: number;
}

export interface ResetResult {
  success: boolean;
  backupReference: string;
  deletedCounts: Record<string, number>;
}

async function withAdvisoryLock<T>(fn: () => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    const result = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [ADVISORY_LOCK_KEY]
    );
    if (!result.rows[0]?.locked) {
      throw new AppError("OPERATION_IN_PROGRESS", "Another database operation is in progress", 409);
    }
    return await fn();
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]);
    } catch {
      // ignore unlock errors during cleanup
    }
    try {
      await client.end();
    } catch {
      // ignore close errors during cleanup
    }
  }
}

function validateConfirmation(confirmationText: string) {
  if (confirmationText !== "REINITIALISER") {
    throw new AppError("INVALID_CONFIRMATION", "Confirmation text must be exactly REINITIALISER", 400);
  }
}

async function verifyCurrentPassword(userId: string, currentPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("NOT_FOUND", "User not found", 404);
  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) throw new AppError("INVALID_PASSWORD", "Invalid current password", 400);
}

export async function createBackup(): Promise<BackupResult> {
  const backupDir = process.env["BACKUP_DIR"] || "D:\\dpmg\\backups";
  await fs.promises.mkdir(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `dpmg-backup-${timestamp}.dump`;
  const fullPath = path.join(backupDir, filename);

  const dbUrl = process.env["DATABASE_URL"];
  if (!dbUrl) throw new AppError("CONFIG_ERROR", "DATABASE_URL is not configured", 500);

  // pg_dump uses libpq and does not accept Prisma's "?schema=" query parameter.
  const dumpUrl: string = dbUrl.split("?")[0] as string;

  await new Promise<void>((resolve, reject) => {
    const child = spawn("pg_dump", ["--dbname", dumpUrl, "--format=custom", "--file", fullPath], {
      windowsHide: true,
    });
    let stderr = "";
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pg_dump failed with code ${code}: ${stderr}`));
    });
  });

  const stat = await fs.promises.stat(fullPath);
  if (!stat.isFile() || stat.size <= 0) {
    throw new AppError("BACKUP_FAILED", "Backup verification failed: file missing or empty", 500);
  }

  return {
    success: true,
    backupReference: filename,
    createdAt: new Date().toISOString(),
    sizeBytes: stat.size,
  };
}

export async function resetOperational(
  actorId: string,
  currentPassword: string,
  confirmationText: string
): Promise<ResetResult> {
  validateConfirmation(confirmationText);
  await verifyCurrentPassword(actorId, currentPassword);

  return withAdvisoryLock(async () => {
    const backup = await createBackup();
    if (!backup.success) throw new AppError("BACKUP_FAILED", "Backup failed", 500);

    const counts: Record<string, number> = {};
    try {
      await prisma.$transaction(async (tx) => {
        counts["notifications"] = (await tx.notification.deleteMany({})).count;
        counts["notificationOutboxes"] = (await tx.notificationOutbox.deleteMany({})).count;
        counts["demandeDecisions"] = (await tx.demandeDecision.deleteMany({})).count;
        counts["consolidationObservations"] = (await tx.consolidationObservation.deleteMany({})).count;
        counts["demandes"] = (await tx.demande.deleteMany({})).count;
        counts["consolidations"] = (await tx.consolidation.deleteMany({})).count;
        counts["sessions"] = (await tx.session.deleteMany({})).count;

        await tx.adminAuditLog.create({
          data: {
            actorId,
            action: "DB_RESET_OPERATIONAL",
            targetType: "Database",
            targetId: "operational",
            details: { deletedCounts: counts, backupReference: backup.backupReference },
          },
        });
      });

      return { success: true, backupReference: backup.backupReference, deletedCounts: counts };
    } catch (e) {
      throw e;
    }
  });
}

export async function resetFull(
  actorId: string,
  currentPassword: string,
  confirmationText: string
): Promise<ResetResult> {
  validateConfirmation(confirmationText);
  await verifyCurrentPassword(actorId, currentPassword);

  return withAdvisoryLock(async () => {
    const backup = await createBackup();
    if (!backup.success) throw new AppError("BACKUP_FAILED", "Backup failed", 500);

    const techUsers = await prisma.user.findMany({
      where: { structureRoles: { some: { role: TECHNICAL_ADMIN } } },
      select: { id: true },
    });
    const techIds = techUsers.map((u) => u.id);

    if (techIds.length === 0) {
      throw new AppError(
        "NO_TECHNICAL_ADMIN",
        "Réinitialisation refusée : aucun compte administrateur technique à conserver.",
        400
      );
    }

    const auditActorId = techIds.includes(actorId) ? actorId : techIds[0]!;

    const counts: Record<string, number> = {};
    try {
      await prisma.$transaction(async (tx) => {
        counts["adminAuditLogsRemoved"] = (
          await tx.adminAuditLog.deleteMany({ where: { actorId: { notIn: techIds } } })
        ).count;

        counts["notifications"] = (await tx.notification.deleteMany({})).count;
        counts["notificationOutboxes"] = (await tx.notificationOutbox.deleteMany({})).count;
        counts["demandeDecisions"] = (await tx.demandeDecision.deleteMany({})).count;
        counts["consolidationObservations"] = (await tx.consolidationObservation.deleteMany({})).count;
        counts["demandes"] = (await tx.demande.deleteMany({})).count;
        counts["consolidations"] = (await tx.consolidation.deleteMany({})).count;
        counts["sessions"] = (await tx.session.deleteMany({})).count;

        counts["userStructureRolesRemoved"] = (
          await tx.userStructureRole.deleteMany({
            where: {
              OR: [
                { userId: { notIn: techIds } },
                { userId: { in: techIds }, structureId: { not: null } },
              ],
            },
          })
        ).count;

        counts["departments"] = (await tx.department.deleteMany({})).count;
        counts["structures"] = (await tx.structure.deleteMany({})).count;

        counts["usersRemoved"] = (
          await tx.user.deleteMany({ where: { id: { notIn: techIds } } })
        ).count;

        await tx.adminAuditLog.create({
          data: {
            actorId: auditActorId,
            action: "DB_RESET_FULL",
            targetType: "Database",
            targetId: "full",
            details: { deletedCounts: counts, backupReference: backup.backupReference, preservedTechnicalAdmins: techIds.length },
          },
        });
      });

      return { success: true, backupReference: backup.backupReference, deletedCounts: counts };
    } catch (e) {
      throw e;
    }
  });
}
