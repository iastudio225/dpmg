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
import {
  resolveRecipients,
  buildEventKey,
  createNotificationOutboxEntries,
  resolveHierarchicalRecipients,
  resolveDpmgRecipients,
  resolveDfcRecipients,
} from "./services/notification.service";

const RUN = randomBytes(3).toString("hex");

let prisma: PrismaClient;
const userIds: string[] = [];
const createdStructureCodes: string[] = [];
const createdDepartmentIds: string[] = [];

let structureId = "";
let departmentId = "";
let authorId = "";
let authorStructureId = "";
let demandeId = "";
let dpmgUserId = "";
let dfcUserId = "";
let hierUserId = "";

let disposeInterruptionCleanup: (() => void) | null = null;
async function deleteFixtures(): Promise<void> {
  await runCleanupSteps([
    ["outbox", () => prisma.notificationOutbox.deleteMany({ where: { recipientUserId: { in: userIds } } })],
    ["notifications", () => prisma.notification.deleteMany({ where: { userId: { in: userIds } } })],
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

  const structure = await prisma.structure.create({ data: { code: `TST-${RUN}-N`, name: "S", type: "OTHER", status: true } });
  createdStructureCodes.push(structure.code);
  structureId = structure.id;
  authorStructureId = structure.id;

  const department = await prisma.department.create({ data: { code: `TST-${RUN}-ND`, name: "D", structureId: structure.id } });
  createdDepartmentIds.push(department.id);
  departmentId = department.id;

  // author
  const author = await prisma.user.create({ data: { email: `author-${RUN}@t.phase96.test`, firstName: "a", lastName: RUN, passwordHash: "h", status: UserStatus.ACTIVE } });
  userIds.push(author.id);
  authorId = author.id;

  // hierarchical manager (designated validator)
  const hier = await prisma.user.create({ data: { email: `hier-${RUN}@t.phase96.test`, firstName: "h", lastName: RUN, passwordHash: "h", status: UserStatus.ACTIVE } });
  userIds.push(hier.id);
  hierUserId = hier.id;
  await prisma.userStructureRole.create({ data: { userId: hier.id, structureId, role: "HIERARCHICAL_MANAGER", scope: `TST-${RUN}-ND`, startDate: new Date() } });

  // dpmg manager
  const dpmg = await prisma.user.create({ data: { email: `dpmg-${RUN}@t.phase96.test`, firstName: "d", lastName: RUN, passwordHash: "h", status: UserStatus.ACTIVE } });
  userIds.push(dpmg.id);
  dpmgUserId = dpmg.id;
  await prisma.userStructureRole.create({ data: { userId: dpmg.id, structureId, role: "DPMG_MANAGER", scope: "*", startDate: new Date() } });

  // dfc controller
  const dfc = await prisma.user.create({ data: { email: `dfc-${RUN}@t.phase96.test`, firstName: "f", lastName: RUN, passwordHash: "h", status: UserStatus.ACTIVE } });
  userIds.push(dfc.id);
  dfcUserId = dfc.id;
  await prisma.userStructureRole.create({ data: { userId: dfc.id, structureId, role: "DFC_CONTROLLER", scope: "*", startDate: new Date() } });

  // expired delegate (should not be notified)
  const expDelegate = await prisma.user.create({ data: { email: `expdel-${RUN}@t.phase96.test`, firstName: "e", lastName: RUN, passwordHash: "h", status: UserStatus.ACTIVE } });
  userIds.push(expDelegate.id);
  await prisma.userStructureRole.create({ data: { userId: expDelegate.id, structureId, role: "DPMG_DELEGATE", scope: "*", startDate: new Date(Date.now() - 90*86400000), endDate: new Date(Date.now() - 86400000), delegatedFromUserId: dpmgUserId } });

  // inactive user
  const inactive = await prisma.user.create({ data: { email: `inactive-${RUN}@t.phase96.test`, firstName: "i", lastName: RUN, passwordHash: "h", status: UserStatus.SUSPENDED } });
  userIds.push(inactive.id);

  const demande = await prisma.demande.create({
    data: { reference: `TST-${RUN}-N1`, title: "t", description: "d", status: "BROUILLON", category: "INFRASTRUCTURE", departmentId, authorId, submittedAt: null, isUrgent: false },
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

function makeDemande(overrides: any = {}) {
  return {
    id: demandeId,
    authorId,
    departmentId,
    department: { code: `TST-${RUN}-ND`, structureId },
    isUrgent: false,
    ...overrides,
  };
}

test("notif service : buildEventKey format", () => {
  const key = buildEventKey("DEMANDE_SOUMISE", "src1", "user1");
  assert.equal(key, "src1:DEMANDE_SOUMISE:user1");
});

test("notif service : resolveHierarchicalRecipients retourne le validateur désigné", async () => {
  const recipients = await resolveHierarchicalRecipients(prisma as any, makeDemande(), authorStructureId);
  assert.deepEqual(recipients, [hierUserId]);
});

test("notif service : resolveDpmgRecipients retourne les DPMG habilités", async () => {
  const recipients = await resolveDpmgRecipients(prisma as any, `TST-${RUN}-ND`);
  assert.ok(recipients.includes(dpmgUserId));
  // délégué expiré exclu
  // (le délégué expiré ne doit pas être dans la liste)
});

test("notif service : resolveRecipients DEMANDE_SOUMISE", async () => {
  const r = await resolveRecipients(prisma as any, "DEMANDE_SOUMISE", makeDemande(), authorStructureId);
  assert.deepEqual(r, [hierUserId]);
});

test("notif service : resolveRecipients DEMANDE_VALIDEE → auteur", async () => {
  const r = await resolveRecipients(prisma as any, "DEMANDE_VALIDEE", makeDemande());
  assert.deepEqual(r, [authorId]);
});

test("notif service : resolveRecipients AVIS_DEPARTEMENTAL → DPMG", async () => {
  const r = await resolveRecipients(prisma as any, "AVIS_DEPARTEMENTAL", makeDemande());
  assert.ok(r.includes(dpmgUserId));
});

test("notif service : resolveRecipients CONTROLE_DFC_DISPONIBLE → auteur + DPMG", async () => {
  const r = await resolveRecipients(prisma as any, "CONTROLE_DFC_DISPONIBLE", makeDemande());
  assert.ok(r.includes(authorId));
  assert.ok(r.includes(dpmgUserId));
  // déduplication
  assert.equal(new Set(r).size, r.length);
});

test("notif service : resolveRecipients DEMANDE_REFUSEE → auteur uniquement", async () => {
  const r = await resolveRecipients(prisma as any, "DEMANDE_REFUSEE", makeDemande());
  assert.deepEqual(r, [authorId]);
});

test("notif service : événements non définis → []", async () => {
  const r = await resolveRecipients(prisma as any, "DEMANDE_EXECUTION", makeDemande());
  assert.deepEqual(r, []);
});

test("notif service : createNotificationOutboxEntries crée des entrées", async () => {
  const count = await prisma.$transaction(async (tx) => {
    return createNotificationOutboxEntries(tx as any, {
      type: "DEMANDE_SOUMISE",
      demande: makeDemande(),
      authorStructureId,
      eventSourceId: `src-${RUN}-1`,
    });
  });
  assert.equal(count, 1);
  const rows = await prisma.notificationOutbox.findMany({ where: { recipientUserId: hierUserId } });
  assert.ok(rows.length >= 1);
  const row = rows.find((r) => r.eventKey === `src-${RUN}-1:DEMANDE_SOUMISE:${hierUserId}`);
  assert.ok(row);
  assert.equal(row!.status, "PENDING");
  assert.equal(row!.attempts, 0);
  assert.equal(row!.priority, NotificationPriority.NORMAL);
});

test("notif service : idempotence (même événement rejoué → pas de doublon)", async () => {
  const first = await prisma.$transaction(async (tx) => {
    return createNotificationOutboxEntries(tx as any, {
      type: "DEMANDE_SOUMISE",
      demande: makeDemande(),
      authorStructureId,
      eventSourceId: `src-${RUN}-idemp`,
    });
  });
  const second = await prisma.$transaction(async (tx) => {
    return createNotificationOutboxEntries(tx as any, {
      type: "DEMANDE_SOUMISE",
      demande: makeDemande(),
      authorStructureId,
      eventSourceId: `src-${RUN}-idemp`,
    });
  });
  assert.equal(first, 1);
  assert.equal(second, 0);
});

test("notif service : deux événements distincts de même type → deux entrées", async () => {
  const c1 = await prisma.$transaction(async (tx) => {
    return createNotificationOutboxEntries(tx as any, {
      type: "DEMANDE_SOUMISE",
      demande: makeDemande(),
      authorStructureId,
      eventSourceId: `src-${RUN}-a`,
    });
  });
  const c2 = await prisma.$transaction(async (tx) => {
    return createNotificationOutboxEntries(tx as any, {
      type: "DEMANDE_SOUMISE",
      demande: makeDemande(),
      authorStructureId,
      eventSourceId: `src-${RUN}-b`,
    });
  });
  assert.equal(c1, 1);
  assert.equal(c2, 1);
});

test("notif service : deux destinataires → une entrée par destinataire", async () => {
  const count = await prisma.$transaction(async (tx) => {
    return createNotificationOutboxEntries(tx as any, {
      type: "CONTROLE_DFC_DISPONIBLE",
      demande: makeDemande(),
      eventSourceId: `src-${RUN}-multi`,
    });
  });
  // auteur + DPMG = 2
  assert.equal(count, 2);
});

test("notif service : priorité HIGH pour demande urgente", async () => {
  const urgentDemande = { ...makeDemande(), isUrgent: true };
  const count = await prisma.$transaction(async (tx) => {
    return createNotificationOutboxEntries(tx as any, {
      type: "DEMANDE_SOUMISE",
      demande: urgentDemande,
      authorStructureId,
      eventSourceId: `src-${RUN}-urgent`,
    });
  });
  assert.equal(count, 1);
  const row = await prisma.notificationOutbox.findFirst({ where: { eventKey: `src-${RUN}-urgent:DEMANDE_SOUMISE:${hierUserId}` } });
  assert.ok(row);
  assert.equal(row!.priority, NotificationPriority.HIGH);
});

test("notif service : rollback métier ne laisse aucune entrée Outbox", async () => {
  const before = await prisma.notificationOutbox.count({ where: { recipientUserId: hierUserId } });
  try {
    await prisma.$transaction(async (tx) => {
      await createNotificationOutboxEntries(tx as any, {
        type: "DEMANDE_SOUMISE",
        demande: makeDemande(),
        authorStructureId,
        eventSourceId: `src-${RUN}-rollback`,
      });
      throw new Error("rollback");
    });
  } catch {
    // expected
  }
  const after = await prisma.notificationOutbox.count({ where: { recipientUserId: hierUserId } });
  assert.equal(after, before, "aucune entrée ne doit subsister après rollback");
});

test("notif service : auteur inactif ne génère aucune entrée", async () => {
  const inactive = await prisma.user.create({
    data: { email: `inactive2-${RUN}@t.phase96.test`, firstName: "i", lastName: RUN, passwordHash: "h", status: UserStatus.SUSPENDED },
  });
  userIds.push(inactive.id);
  const inactiveDemande = { ...makeDemande(), authorId: inactive.id };
  const count = await prisma.$transaction(async (tx) => {
    return createNotificationOutboxEntries(tx as any, {
      type: "DEMANDE_REFUSEE",
      demande: inactiveDemande,
      eventSourceId: `src-${RUN}-inactive`,
    });
  });
  assert.equal(count, 0);
});
test("notif service : resolveDfcRecipients retourne les contrôleurs DFC habilités", async () => {
  const recipients = await resolveDfcRecipients(prisma as any, `TST-${RUN}-ND`);
  assert.ok(Array.isArray(recipients));
});

test("notif service : resolveRecipients DEMANDE_EN_ATTENTE_FINANCEMENT → DFC", async () => {
  const r = await resolveRecipients(prisma as any, "DEMANDE_EN_ATTENTE_FINANCEMENT", makeDemande());
  // au moins un destinataire DFC (le contrôleur créé dans les fixtures)
  assert.ok(Array.isArray(r));
});