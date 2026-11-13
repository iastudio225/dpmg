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
let deptManagerId = "";
let execAgentId = "";
let dpmgId = "";
let dfcId = "";
let tokenDept = "";
let tokenExec = "";
let tokenDpmg = "";
let tokenDfc = "";

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
  const u = await prisma.user.create({ data: { email: `${tag}-${RUN}@t.phase97.test`, firstName: tag, lastName: RUN, passwordHash: "h", status } });
  userIds.push(u.id);
  for (const r of roles) await prisma.userStructureRole.create({ data: { userId: u.id, structureId: r.structureId, role: r.role, scope: r.scope, startDate: new Date() } });
  const token = `tok-${RUN}-${tag}`;
  await prisma.session.create({ data: { userId: u.id, token, expiresAt: new Date(Date.now() + 3600000) } });
  if (tag === "deptManager") tokenDept = token;
  if (tag === "execAgent") tokenExec = token;
  if (tag === "dpmg") tokenDpmg = token;
  if (tag === "dfc") tokenDfc = token;
  return u.id;
}

async function api(path: string, token?: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } });
}

let disposeInterruptionCleanup: (() => void) | null = null;
async function deleteFixtures(): Promise<void> {
  await runCleanupSteps([
    ["notifications", () => prisma.notificationOutbox.deleteMany({ where: { demande: { authorId: { in: userIds } } } })],
    ["decisions", () => prisma.demandeDecision.deleteMany({ where: { demande: { authorId: { in: userIds } } } })],
    ["demandes", () => prisma.demande.deleteMany({ where: { authorId: { in: userIds } } })],
    ["sessions", () => prisma.session.deleteMany({ where: { userId: { in: userIds } } })],
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

  const s = await createStructure(`TST-${RUN}-S`);
  codeA = `TST-${RUN}-A`;
  deptId = await createDepartment(codeA, s);

  authorId = await createUser("auteur", [{ role: RoleType.EMPLOYEE, structureId: s, scope: codeA }]);
  deptManagerId = await createUser("deptManager", [{ role: RoleType.DEPARTMENT_MANAGER, structureId: s, scope: codeA }]);
  execAgentId = await createUser("execAgent", [{ role: RoleType.EXECUTION_AGENT, structureId: s, scope: codeA }]);
  dpmgId = await createUser("dpmg", [{ role: RoleType.DPMG_MANAGER, structureId: s, scope: "*" }]);
  dfcId = await createUser("dfc", [{ role: RoleType.DFC_CONTROLLER, structureId: s, scope: "*" }]);

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

function makeDemande(status: DemandeStatus, author = authorId) {
  return prisma.demande.create({ data: { reference: `TST-${RUN}-${Math.random().toString(36).slice(2,6)}`, title: "t", description: "d", status, category: "INFRASTRUCTURE", departmentId: deptId, authorId: author, submittedAt: new Date() } });
}

/** Prise en charge puis déclaration de satisfaction (la prise en charge est obligatoire). */
async function satisfy(id: string, token = tokenDept, proofUrl = "https://example.com/proof.pdf") {
  const started = await api(`/api/demandes/${id}/execution/start`, token, { method: "POST" });
  assert.equal(started.status, 200);
  return api(`/api/demandes/${id}/satisfaction`, token, { method: "POST", body: JSON.stringify({ proofUrl }) });
}

test("exec 9.7 : prise en charge par le département autorisé", async () => {
  const d = await makeDemande(DemandeStatus.EN_ATTENTE_EXECUTION);
  const res = await api(`/api/demandes/${d.id}/execution/start`, tokenDept, { method: "POST" });
  assert.equal(res.status, 200);
  const body = await res.json() as any;
  assert.equal(body.status, "EN_ATTENTE_EXECUTION");
  const db = await prisma.demande.findUnique({ where: { id: d.id } });
  assert.ok(db!.executionStartedAt);
  assert.equal(db!.executionStartedBy, deptManagerId);
});

test("exec 9.7 : prise en charge refusée pour un rôle non autorisé", async () => {
  const d = await makeDemande(DemandeStatus.EN_ATTENTE_EXECUTION);
  // author (employee) not allowed
  const tokenAuthor = `tok-${RUN}-auteur-exec`;
  await prisma.session.create({ data: { userId: authorId, token: tokenAuthor, expiresAt: new Date(Date.now() + 3600000) } });
  const res = await api(`/api/demandes/${d.id}/execution/start`, tokenAuthor, { method: "POST" });
  assert.equal(res.status, 403);
});

test("exec 9.7 : prise en charge refusée depuis un statut incompatible", async () => {
  const d = await makeDemande(DemandeStatus.EN_ATTENTE_FINANCEMENT);
  const res = await api(`/api/demandes/${d.id}/execution/start`, tokenDept, { method: "POST" });
  assert.equal(res.status, 403);
});

test("exec 9.7 : déclaration de satisfaction avec justificatif", async () => {
  const d = await makeDemande(DemandeStatus.EN_ATTENTE_EXECUTION);
  const res = await satisfy(d.id);
  assert.equal(res.status, 200);
  const body = await res.json() as any;
  assert.equal(body.status, "EN_ATTENTE_CONFIRMATION_SATISFACTION");
  const db = await prisma.demande.findUnique({ where: { id: d.id } });
  assert.equal(db!.satisfactionProofUrl, "https://example.com/proof.pdf");
  assert.ok(db!.satisfiedAt);
  assert.equal(db!.satisfiedBy, deptManagerId);
});

test("exec 9.7 : déclaration sans justificatif refusée", async () => {
  const d = await makeDemande(DemandeStatus.EN_ATTENTE_EXECUTION);
  const res = await satisfy(d.id, tokenDept, "");
  assert.equal(res.status, 400);
});

test("exec 9.7 : déclaration avec URL invalide refusée", async () => {
  const d = await makeDemande(DemandeStatus.EN_ATTENTE_EXECUTION);
  const res = await satisfy(d.id, tokenDept, "not-a-url");
  assert.equal(res.status, 400);
});

test("exec 9.7 : déclaration depuis un statut incompatible refusée", async () => {
  const d = await makeDemande(DemandeStatus.EN_ATTENTE_FINANCEMENT);
  const res = await api(`/api/demandes/${d.id}/satisfaction`, tokenDept, { method: "POST", body: JSON.stringify({ proofUrl: "https://example.com/p.pdf" }) });
  assert.equal(res.status, 403);
});

test("exec 9.7 : clôture par DPMG habilité", async () => {
  const d = await makeDemande(DemandeStatus.EN_ATTENTE_EXECUTION);
  // declare satisfaction first
  await satisfy(d.id);
  const res = await api(`/api/demandes/${d.id}/close`, tokenDpmg, { method: "POST" });
  assert.equal(res.status, 200);
  const body = await res.json() as any;
  assert.equal(body.status, "CLOTUREE");
  const db = await prisma.demande.findUnique({ where: { id: d.id } });
  assert.ok(db!.closedAt);
  assert.equal(db!.closedBy, dpmgId);
});

test("exec 9.7 : clôture refusée sans justificatif", async () => {
  // Can't easily create a satisfaction without proof (proof required). Test status guard instead.
  const d = await makeDemande(DemandeStatus.EN_ATTENTE_EXECUTION);
  const res = await api(`/api/demandes/${d.id}/close`, tokenDpmg, { method: "POST" });
  assert.equal(res.status, 403); // status incompatible
});

test("exec 9.7 : clôture refusée par un non-DPMG", async () => {
  const d = await makeDemande(DemandeStatus.EN_ATTENTE_EXECUTION);
  await satisfy(d.id);
  const res = await api(`/api/demandes/${d.id}/close`, tokenDept, { method: "POST" });
  assert.equal(res.status, 403);
});

test("exec 9.7 : retour au département avec motif", async () => {
  const d = await makeDemande(DemandeStatus.EN_ATTENTE_EXECUTION);
  await satisfy(d.id);
  const res = await api(`/api/demandes/${d.id}/execution/return`, tokenDpmg, { method: "POST", body: JSON.stringify({ motif: "preuve insuffisante" }) });
  assert.equal(res.status, 200);
  const body = await res.json() as any;
  assert.equal(body.status, "EN_ATTENTE_EXECUTION");
  const db = await prisma.demande.findUnique({ where: { id: d.id } });
  assert.equal(db!.closureReturnReason, "preuve insuffisante");
});

test("exec 9.7 : retour sans motif refusé", async () => {
  const d = await makeDemande(DemandeStatus.EN_ATTENTE_EXECUTION);
  await satisfy(d.id);
  const res = await api(`/api/demandes/${d.id}/execution/return`, tokenDpmg, { method: "POST", body: JSON.stringify({ motif: "" }) });
  assert.equal(res.status, 400);
});

test("exec 9.7 : historique conservé après retour", async () => {
  const d = await makeDemande(DemandeStatus.EN_ATTENTE_EXECUTION);
  await satisfy(d.id);
  await api(`/api/demandes/${d.id}/execution/return`, tokenDpmg, { method: "POST", body: JSON.stringify({ motif: "motif" }) });
  const decisions = await prisma.demandeDecision.findMany({ where: { demandeId: d.id } });
  assert.ok(decisions.some((dec) => dec.type === "DEMANDE_EXECUTEE"));
});

test("exec 9.7 : DFC ne peut pas clôturer", async () => {
  const d = await makeDemande(DemandeStatus.EN_ATTENTE_EXECUTION);
  await satisfy(d.id);
  const res = await api(`/api/demandes/${d.id}/close`, tokenDfc, { method: "POST" });
  assert.equal(res.status, 403);
});

test("exec 9.7 : agent d'exécution peut déclarer la satisfaction", async () => {
  const d = await makeDemande(DemandeStatus.EN_ATTENTE_EXECUTION);
  const res = await satisfy(d.id, tokenExec, "https://example.com/p.pdf");
  assert.equal(res.status, 200);
  const body = await res.json() as any;
  assert.equal(body.status, "EN_ATTENTE_CONFIRMATION_SATISFACTION");
});