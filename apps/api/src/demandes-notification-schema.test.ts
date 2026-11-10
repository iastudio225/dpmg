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
import { PrismaClient, UserStatus, NotificationType, NotificationPriority, NotificationOutboxStatus } from "@prisma/client";
import app from "./app";

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

  structureId = await createStructure(`TST-${RUN}-N`);
  departmentId = await createDepartment(`TST-${RUN}-ND`, structureId);

  const user = await prisma.user.create({
    data: { email: `notif-${RUN}@t.phase96.test`, firstName: "notif", lastName: RUN, passwordHash: "h", status: UserStatus.ACTIVE },
  });
  userIds.push(user.id);

  const demande = await prisma.demande.create({
    data: { reference: `TST-${RUN}-N1`, title: "t", description: "d", status: "BROUILLON", category: "INFRASTRUCTURE", departmentId, authorId: user.id, submittedAt: null },
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

test("schema 9.6.1 : création d'une notification pour un utilisateur", async () => {
  const n = await prisma.notification.create({
    data: { userId: userIds[0]!, eventKey: `evt-${RUN}-1`, type: NotificationType.DEMANDE_SOUMISE, title: "titre" },
  });
  assert.ok(n.id);
  assert.equal(n.isRead, false);
  assert.equal(n.priority, NotificationPriority.NORMAL);
  assert.ok(n.createdAt);
  assert.equal(n.demandeId, null);
  assert.equal(n.readAt, null);
});

test("schema 9.6.1 : notification associée à une demande existante", async () => {
  const n = await prisma.notification.create({
    data: { userId: userIds[0]!, demandeId, eventKey: `evt-${RUN}-2`, type: NotificationType.DEMANDE_SOUMISE, title: "t" },
  });
  assert.equal(n.demandeId, demandeId);
});

test("schema 9.6.1 : notification sans demande associée", async () => {
  const n = await prisma.notification.create({
    data: { userId: userIds[0]!, eventKey: `evt-${RUN}-3`, type: NotificationType.DEMANDE_SOUMISE, title: "t" },
  });
  assert.equal(n.demandeId, null);
});

test("schema 9.6.1 : unicité (userId, eventKey)", async () => {
  await prisma.notification.create({
    data: { userId: userIds[0]!, eventKey: `evt-${RUN}-uniq`, type: NotificationType.DEMANDE_SOUMISE, title: "t" },
  });
  let threw = false;
  try {
    await prisma.notification.create({
      data: { userId: userIds[0]!, eventKey: `evt-${RUN}-uniq`, type: NotificationType.DEMANDE_SOUMISE, title: "t2" },
    });
  } catch (e: any) {
    threw = true;
    assert.equal(e.code, "P2002");
  }
  assert.ok(threw, "la contrainte d'unicité doit être violée");
});

test("schema 9.6.1 : création d'une entrée Outbox", async () => {
  const o = await prisma.notificationOutbox.create({
    data: { eventKey: `out-${RUN}-1`, recipientUserId: userIds[0]!, type: NotificationType.DEMANDE_SOUMISE, title: "t" },
  });
  assert.ok(o.id);
  assert.equal(o.status, NotificationOutboxStatus.PENDING);
  assert.equal(o.attempts, 0);
  assert.ok(o.availableAt);
  assert.equal(o.processedAt, null);
  assert.equal(o.lastError, null);
});

test("schema 9.6.1 : unicité eventKey dans l'Outbox", async () => {
  await prisma.notificationOutbox.create({
    data: { eventKey: `out-${RUN}-uniq`, recipientUserId: userIds[0]!, type: NotificationType.DEMANDE_SOUMISE, title: "t" },
  });
  let threw = false;
  try {
    await prisma.notificationOutbox.create({
      data: { eventKey: `out-${RUN}-uniq`, recipientUserId: userIds[0]!, type: NotificationType.DEMANDE_SOUMISE, title: "t2" },
    });
  } catch (e: any) {
    threw = true;
    assert.equal(e.code, "P2002");
  }
  assert.ok(threw, "la contrainte d'unicité doit être violée");
});

test("schema 9.6.1 : valeurs par défaut de l'Outbox", async () => {
  const o = await prisma.notificationOutbox.create({
    data: { eventKey: `out-${RUN}-defaults`, recipientUserId: userIds[0]!, type: NotificationType.DEMANDE_SOUMISE, title: "t" },
  });
  assert.equal(o.priority, NotificationPriority.NORMAL);
  assert.equal(o.status, NotificationOutboxStatus.PENDING);
  assert.equal(o.attempts, 0);
  assert.ok(o.availableAt);
  assert.ok(o.createdAt);
});

test("schema 9.6.1 : enums acceptés", async () => {
  const n = await prisma.notification.create({
    data: { userId: userIds[0]!, eventKey: `evt-${RUN}-enum`, type: NotificationType.CONTROLE_DFC_DISPONIBLE, title: "t", priority: NotificationPriority.HIGH },
  });
  assert.equal(n.type, NotificationType.CONTROLE_DFC_DISPONIBLE);
  assert.equal(n.priority, NotificationPriority.HIGH);
  const o = await prisma.notificationOutbox.create({
    data: { eventKey: `out-${RUN}-enum`, recipientUserId: userIds[0]!, type: NotificationType.DEMANDE_CLOTUREE, title: "t", status: NotificationOutboxStatus.FAILED, priority: NotificationPriority.HIGH },
  });
  assert.equal(o.status, NotificationOutboxStatus.FAILED);
  assert.equal(o.priority, NotificationPriority.HIGH);
});

test("schema 9.6.1 : notification avec message et priorité HIGH", async () => {
  const n = await prisma.notification.create({
    data: { userId: userIds[0]!, eventKey: `evt-${RUN}-msg`, type: NotificationType.DEMANDE_SOUMISE, title: "titre", message: "message court", priority: NotificationPriority.HIGH },
  });
  assert.equal(n.message, "message court");
  assert.equal(n.priority, NotificationPriority.HIGH);
});

test("schema 9.6.1 : outbox avec demande associée et lastError", async () => {
  const o = await prisma.notificationOutbox.create({
    data: { eventKey: `out-${RUN}-dem`, recipientUserId: userIds[0]!, demandeId, type: NotificationType.DEMANDE_SOUMISE, title: "t", lastError: "erreur technique" },
  });
  assert.equal(o.demandeId, demandeId);
  assert.equal(o.lastError, "erreur technique");
});

test("schema 9.6.1 : comportement SetNull si la demande est supprimée", async () => {
  // Créer une demande dédiée et une notification liée
  const d = await prisma.demande.create({
    data: { reference: `TST-${RUN}-NDEL`, title: "t", description: "d", status: "BROUILLON", category: "INFRASTRUCTURE", departmentId, authorId: userIds[0]!, submittedAt: null },
  });
  const n = await prisma.notification.create({
    data: { userId: userIds[0]!, demandeId: d.id, eventKey: `evt-${RUN}-del`, type: NotificationType.DEMANDE_SOUMISE, title: "t" },
  });
  assert.equal(n.demandeId, d.id);
  // Supprimer la demande
  await prisma.demande.delete({ where: { id: d.id } });
  const updated = await prisma.notification.findUnique({ where: { id: n.id } });
  assert.ok(updated, "la notification doit être conservée");
  assert.equal(updated!.demandeId, null, "demandeId doit être null (SetNull)");
});
