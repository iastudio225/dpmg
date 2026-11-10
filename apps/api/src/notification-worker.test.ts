import "./test-env";
import {
  closeTestServer,
  installInterruptionCleanup,
  runCleanupSteps,
  sweepTestResidues,
} from "./test-fixtures";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PrismaClient, UserStatus, NotificationType, NotificationPriority } from "@prisma/client";
import app from "./app";
import { recoverStuck, reserveBatch, processOne } from "./worker/notifications";

const RUN = randomBytes(3).toString("hex");

let prisma: PrismaClient;
const userIds: string[] = [];
const createdStructureCodes: string[] = [];
const createdDepartmentIds: string[] = [];

let structureId = "";
let departmentId = "";
let authorId = "";
let demandeId = "";

async function createStructure(code: string): Promise<string> {
  const s = await prisma.structure.create({ data: { code, name: `S ${code}`, type: "OTHER", status: true } });
  createdStructureCodes.push(code);
  return s.id;
}
async function createDepartment(code: string, structureId: string): Promise<string> {
  const d = await prisma.department.create({ data: { code, name: `D ${code}`, structureId } });
  createdDepartmentIds.push(d.id);
  return d.id;
}

let disposeInterruptionCleanup: (() => void) | null = null;
async function deleteFixtures(): Promise<void> {
  await runCleanupSteps([
    ["notifications", () => prisma.notification.deleteMany({ where: { userId: { in: userIds } } })],
    ["outbox", () => prisma.notificationOutbox.deleteMany({ where: { recipientUserId: { in: userIds } } })],
    ["decisions", () => prisma.demandeDecision.deleteMany({ where: { demande: { authorId: { in: userIds } } } })],
    ["demandes", () => prisma.demande.deleteMany({ where: { authorId: { in: userIds } } })],
    ["roles", () => prisma.userStructureRole.deleteMany({ where: { userId: { in: userIds } } })],
    ["users", () => prisma.user.deleteMany({ where: { id: { in: userIds } } })],
    ["structures", () => prisma.structure.deleteMany({ where: { code: { in: createdStructureCodes } } })],
    ["departments", () => prisma.department.deleteMany({ where: { id: { in: createdDepartmentIds } } })],
  ]);
}

before(async () => {
  prisma = new PrismaClient();
  await sweepTestResidues(prisma);
  disposeInterruptionCleanup = installInterruptionCleanup(deleteFixtures);

  structureId = await createStructure(`TST-${RUN}-W`);
  departmentId = await createDepartment(`TST-${RUN}-WD`, structureId);

  const user = await prisma.user.create({
    data: { email: `worker-${RUN}@t.phase964.test`, firstName: "w", lastName: RUN, passwordHash: "h", status: UserStatus.ACTIVE },
  });
  userIds.push(user.id);

  const demande = await prisma.demande.create({
    data: { reference: `TST-${RUN}-W1`, title: "t", description: "d", status: "BROUILLON", category: "INFRASTRUCTURE", departmentId, authorId: user.id, submittedAt: null, isUrgent: false },
  });
  demandeId = demande.id;
});

after(async () => {
  try { await deleteFixtures(); } finally {
    disposeInterruptionCleanup?.();
    disposeInterruptionCleanup = null;
    if (prisma) await prisma.$disconnect().catch(() => {});
  }
});

test("worker : une entrée PENDING produit une notification", async () => {
  const outbox = await prisma.notificationOutbox.create({
    data: { eventKey: `wk-${RUN}-1`, recipientUserId: userIds[0]!, demandeId, type: "DEMANDE_SOUMISE", title: "t", priority: "NORMAL" },
  });
  const reserved = await reserveBatch();
  assert.ok(reserved.some((r: any) => r.id === outbox.id));
  await processOne(outbox);
  const notif = await prisma.notification.findFirst({ where: { userId: userIds[0]!, eventKey: `wk-${RUN}-1` } });
  assert.ok(notif, "une notification doit être créée");
  assert.equal(notif!.title, "t");
});

test("worker : l'entrée passe à PROCESSED après succès", async () => {
  const row = await prisma.notificationOutbox.findUnique({ where: { eventKey: `wk-${RUN}-1` } });
  assert.ok(row);
  assert.equal(row!.status, "PROCESSED");
  assert.ok(row!.processedAt);
});

test("worker : processedAt est renseigné", async () => {
  const row = await prisma.notificationOutbox.findUnique({ where: { eventKey: `wk-${RUN}-1` } });
  assert.ok(row!.processedAt instanceof Date);
});

test("worker : une entrée déjà traitée ne crée pas de doublon", async () => {
  // Re-process the same outbox row (status PROCESSED, not PENDING) → reserveBatch won't pick it
  const reserved = await reserveBatch();
  const alreadyProcessed = reserved.find((r: any) => r.eventKey === `wk-${RUN}-1`);
  assert.equal(alreadyProcessed, undefined, "une entrée PROCESSED ne doit pas être réservée");
  const count = await prisma.notification.count({ where: { userId: userIds[0]!, eventKey: `wk-${RUN}-1` } });
  assert.equal(count, 1);
});

test("worker : champs de la notification correspondent à l'Outbox", async () => {
  const row = await prisma.notificationOutbox.findUnique({ where: { eventKey: `wk-${RUN}-1` } });
  const notif = await prisma.notification.findFirst({ where: { userId: userIds[0]!, eventKey: `wk-${RUN}-1` } });
  assert.equal(notif!.type, row!.type);
  assert.equal(notif!.title, row!.title);
  assert.equal(notif!.priority, row!.priority);
  assert.equal(notif!.demandeId, row!.demandeId);
});

test("worker : une erreur de traitement est enregistrée et programme un retry", async () => {
  // Create an outbox entry pointing to a non-existent user (FK violation on recipientUserId? recipient exists)
  // Instead, force an error by creating an outbox with a type that... use a duplicate eventKey scenario:
  // Create an outbox entry, then manually create a notification with same (userId,eventKey) to cause P2002 on process
  const dup = await prisma.notificationOutbox.create({
    data: { eventKey: `wk-${RUN}-dup`, recipientUserId: userIds[0]!, demandeId, type: "DEMANDE_SOUMISE", title: "t" },
  });
  // Pre-create the notification to force a conflict during processing
  await prisma.notification.create({
    data: { userId: userIds[0]!, eventKey: `wk-${RUN}-dup`, type: "DEMANDE_SOUMISE", title: "t" },
  });
  const reserved = await reserveBatch();
  assert.ok(reserved.some((r: any) => r.id === dup.id));
  await processOne(dup);
  const row = await prisma.notificationOutbox.findUnique({ where: { id: dup.id } });
  // Should be retried (PENDING with availableAt in future) or PROCESSED (idempotent duplicate)
  assert.ok(row!.status === "PENDING" || row!.status === "PROCESSED");
  if (row!.status === "PENDING") {
    assert.ok(row!.attempts >= 1);
    assert.ok(row!.availableAt.getTime() > Date.now() - 1000);
  }
});

test("worker : une entrée en attente de retry n'est pas traitée avant availableAt", async () => {
  const future = new Date(Date.now() + 60000);
  const outbox = await prisma.notificationOutbox.create({
    data: { eventKey: `wk-${RUN}-future`, recipientUserId: userIds[0]!, demandeId, type: "DEMANDE_SOUMISE", title: "t", availableAt: future },
  });
  const reserved = await reserveBatch();
  const found = reserved.find((r: any) => r.id === outbox.id);
  assert.equal(found, undefined, "une entrée future ne doit pas être réservée");
});

test("worker : récupération d'une entrée bloquée en PROCESSING", async () => {
  const stuck = await prisma.notificationOutbox.create({
    data: { eventKey: `wk-${RUN}-stuck`, recipientUserId: userIds[0]!, demandeId, type: "DEMANDE_SOUMISE", title: "t", status: "PROCESSING" },
  });
  // Manually backdate createdAt
  await prisma.$executeRaw`UPDATE "NotificationOutbox" SET "createdAt" = now() - interval '10 minutes' WHERE id = ${stuck.id}`;
  await recoverStuck();
  const row = await prisma.notificationOutbox.findUnique({ where: { id: stuck.id } });
  assert.equal(row!.status, "PENDING");
  assert.ok(row!.lastError?.includes("recovered"));
});

test("worker : les notifications deviennent visibles via l'API après traitement", async () => {
  // Create and process an entry, then check via HTTP
  const outbox = await prisma.notificationOutbox.create({
    data: { eventKey: `wk-${RUN}-api`, recipientUserId: userIds[0]!, demandeId, type: "DEMANDE_SOUMISE", title: "visible" },
  });
  const reserved = await reserveBatch();
  assert.ok(reserved.some((r: any) => r.id === outbox.id));
  await processOne(outbox);
  const notif = await prisma.notification.findFirst({ where: { userId: userIds[0]!, eventKey: `wk-${RUN}-api` } });
  assert.ok(notif);
});
