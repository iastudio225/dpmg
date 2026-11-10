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
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { PrismaClient, RoleType, StructureType, DemandeStatus, UserStatus } from "@prisma/client";
import app from "./app";

const RUN = randomBytes(3).toString("hex");

let server: Server;
let baseUrl: string;
let prisma: PrismaClient;

const userIds: string[] = [];
const createdDepartmentIds: string[] = [];
const createdStructureCodes: string[] = [];

let structId = "";
let deptId = "";
let codeA = "";
let authorId = "";
let dpmgId = "";
let dfcId = "";
let tokenDpmg = "";
let demandeId = "";

async function createStructure(code: string): Promise<string> {
  const s = await prisma.structure.create({ data: { code, name: `S ${code}`, type: StructureType.OTHER } });
  createdStructureCodes.push(code);
  return s.id;
}
async function createDepartment(code: string, structureId: string): Promise<string> {
  const d = await prisma.department.create({ data: { code, name: `D ${code}`, structureId } });
  createdDepartmentIds.push(d.id);
  return d.id;
}
async function createUser(tag: string, roles: { role: RoleType; structureId: string; scope: string }[], status = UserStatus.ACTIVE): Promise<string> {
  const u = await prisma.user.create({ data: { email: `${tag}-${RUN}@t.phase967.test`, firstName: tag, lastName: RUN, passwordHash: "h", status } });
  userIds.push(u.id);
  for (const r of roles) await prisma.userStructureRole.create({ data: { userId: u.id, structureId: r.structureId, role: r.role, scope: r.scope, startDate: new Date() } });
  const token = `tok-${RUN}-${tag}`;
  await prisma.session.create({ data: { userId: u.id, token, expiresAt: new Date(Date.now() + 3600000) } });
  if (tag === "dpmg") tokenDpmg = token;
  return u.id;
}

let disposeInterruptionCleanup: (() => void) | null = null;
async function deleteFixtures(): Promise<void> {
  await runCleanupSteps([
    ["outbox", () => prisma.notificationOutbox.deleteMany({ where: { demande: { authorId: { in: userIds } } } })],
    ["notifications", () => prisma.notification.deleteMany({ where: { userId: { in: userIds } } })],
    ["decisions", () => prisma.demandeDecision.deleteMany({ where: { demande: { authorId: { in: userIds } } } })],
    ["demandes", () => prisma.demande.deleteMany({ where: { authorId: { in: userIds } } })],
    ["sessions", () => prisma.session.deleteMany({ where: { userId: { in: userIds } } })],
    ["roles", () => prisma.userStructureRole.deleteMany({ where: { userId: { in: userIds } } })],
    ["users", () => prisma.user.deleteMany({ where: { id: { in: userIds } } })],
    ["structures", () => prisma.structure.deleteMany({ where: { code: { in: createdStructureCodes } } })],
    ["departments", () => prisma.department.deleteMany({ where: { id: { in: createdDepartmentIds } } })],
  ]);
}

async function api(path: string, token?: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } });
}

before(async () => {
  prisma = new PrismaClient();
  await sweepTestResidues(prisma);
  disposeInterruptionCleanup = installInterruptionCleanup(deleteFixtures);

  const s = await createStructure(`TST-${RUN}-S`);
  structId = s;
  codeA = `TST-${RUN}-A`;
  deptId = await createDepartment(codeA, structId);

  authorId = await createUser("auteur", [{ role: RoleType.EMPLOYEE, structureId: structId, scope: codeA }]);
  dpmgId = await createUser("dpmg", [{ role: RoleType.DPMG_MANAGER, structureId: structId, scope: "*" }]);
  dfcId = await createUser("dfc", [{ role: RoleType.DFC_CONTROLLER, structureId: structId, scope: "*" }]);

  // demande en attente de décision (avec avis départemental préalable)
  const dm = await prisma.demande.create({ data: { reference: `TST-${RUN}-D`, title: "t", description: "d", status: DemandeStatus.EN_ATTENTE_DECISION, category: "INFRASTRUCTURE", departmentId: deptId, authorId, submittedAt: new Date() } });
  demandeId = dm.id;
  await prisma.demandeDecision.create({ data: { demandeId, actorId: authorId, type: "AVIS_DEPARTEMENTAL" } });

  await new Promise<void>((resolveListen, rejectListen) => {
    server = app.listen(0, "127.0.0.1", () => { baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; resolveListen(); });
    server.on("error", rejectListen);
  });
});

after(async () => {
  try { await deleteFixtures(); } finally {
    disposeInterruptionCleanup?.();
    disposeInterruptionCleanup = null;
    await closeTestServer(server).catch(() => {});
    if (prisma) await prisma.$disconnect().catch(() => {});
  }
});

test("notif 9.6.7 : approbation DPMG crée une Outbox pour le DFC", async () => {
  const res = await api(`/api/demandes/${demandeId}/dpmg/approve`, tokenDpmg, { method: "POST", body: JSON.stringify({}) });
  assert.equal(res.status, 200);
  const body = await res.json() as any;
  assert.equal(body.status, "EN_ATTENTE_FINANCEMENT");

  // vérifier l'outbox pour le DFC
  const outbox = await prisma.notificationOutbox.findMany({ where: { demandeId, type: "DEMANDE_EN_ATTENTE_FINANCEMENT" } });
  assert.ok(outbox.length >= 1, "au moins une entrée Outbox DFC doit être créée");
  assert.ok(outbox.some((o) => o.recipientUserId === dfcId), "Julie/DFC doit être destinataire");
});

test("notif 9.6.7 : priorité HIGH pour demande urgente", async () => {
  // créer une demande urgente
  const dm = await prisma.demande.create({ data: { reference: `TST-${RUN}-U`, title: "u", description: "d", status: DemandeStatus.EN_ATTENTE_DECISION, category: "INFRASTRUCTURE", departmentId: deptId, authorId, isUrgent: true, submittedAt: new Date() } });
  await prisma.demandeDecision.create({ data: { demandeId: dm.id, actorId: authorId, type: "AVIS_DEPARTEMENTAL" } });
  const res = await api(`/api/demandes/${dm.id}/dpmg/approve`, tokenDpmg, { method: "POST", body: JSON.stringify({}) });
  assert.equal(res.status, 200);
  const outbox = await prisma.notificationOutbox.findMany({ where: { demandeId: dm.id, type: "DEMANDE_EN_ATTENTE_FINANCEMENT" } });
  assert.ok(outbox.length >= 1);
  assert.equal(outbox[0]!.priority, "HIGH");
});

test("notif 9.6.7 : aucune Outbox DFC si la décision n'est pas une approbation", async () => {
  const dm = await prisma.demande.create({ data: { reference: `TST-${RUN}-R`, title: "r", description: "d", status: DemandeStatus.EN_ATTENTE_DECISION, category: "INFRASTRUCTURE", departmentId: deptId, authorId, submittedAt: new Date() } });
  await prisma.demandeDecision.create({ data: { demandeId: dm.id, actorId: authorId, type: "AVIS_DEPARTEMENTAL" } });
  const res = await api(`/api/demandes/${dm.id}/dpmg/refuse`, tokenDpmg, { method: "POST", body: JSON.stringify({ motif: "non" }) });
  assert.equal(res.status, 200);
  const outbox = await prisma.notificationOutbox.findMany({ where: { demandeId: dm.id, type: "DEMANDE_EN_ATTENTE_FINANCEMENT" } });
  assert.equal(outbox.length, 0);
});

test("notif 9.6.7 : pas de doublon (idempotence)", async () => {
  // La demande demandeId déjà approuvée → re-approbation impossible (statut changé)
  const outbox = await prisma.notificationOutbox.findMany({ where: { demandeId, type: "DEMANDE_EN_ATTENTE_FINANCEMENT" } });
  const countBefore = outbox.length;
  // tenter de re-approuver (doit échouer car statut != EN_ATTENTE_DECISION)
  const res = await api(`/api/demandes/${demandeId}/dpmg/approve`, tokenDpmg, { method: "POST", body: JSON.stringify({}) });
  assert.notEqual(res.status, 200);
  const countAfter = await prisma.notificationOutbox.count({ where: { demandeId, type: "DEMANDE_EN_ATTENTE_FINANCEMENT" } });
  assert.equal(countAfter, countBefore);
});
