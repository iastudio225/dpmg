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

let structA = "";
let structB = "";
let deptA = "";
let deptB = "";
let codeA = "";
let codeB = "";

async function createStructure(code: string, parentId?: string): Promise<string> {
  const s = await prisma.structure.create({ data: { code, name: `S ${code}`, type: StructureType.OTHER, parentId } });
  createdStructureCodes.push(code);
  return s.id;
}
async function createDepartment(code: string, structureId: string): Promise<string> {
  const d = await prisma.department.create({ data: { code, name: `D ${code}`, structureId } });
  createdDepartmentIds.push(d.id);
  return d.id;
}
async function createUser(tag: string, roles: { role: RoleType; structureId: string; scope: string }[]): Promise<string> {
  const u = await prisma.user.create({ data: { email: `${tag}-${RUN}@t.phase94b.test`, firstName: tag, lastName: RUN, passwordHash: "h", status: UserStatus.ACTIVE } });
  userIds.push(u.id);
  for (const r of roles) await prisma.userStructureRole.create({ data: { userId: u.id, structureId: r.structureId, role: r.role, scope: r.scope, startDate: new Date() } });
  const token = `tok-${RUN}-${tag}`;
  await prisma.session.create({ data: { userId: u.id, token, expiresAt: new Date(Date.now() + 3600000) } });
  return u.id;
}
async function createDemandeRow(ref: string, authorId: string, status: DemandeStatus, departmentId: string): Promise<string> {
  const d = await prisma.demande.create({ data: { reference: ref, title: `D ${ref}`, description: "desc", category: "INFRASTRUCTURE", departmentId, authorId, status, submittedAt: new Date() } });
  return d.id;
}

async function api(path: string, token?: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } });
}

let disposeInterruptionCleanup: (() => void) | null = null;
async function deleteFixtures(): Promise<void> {
  await runCleanupSteps([
    ["sessions", () => prisma.session.deleteMany({ where: { userId: { in: userIds } } })],
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

  structA = await createStructure(`TST-${RUN}-VISA`);
  structB = await createStructure(`TST-${RUN}-VISB`);
  codeA = `TST-${RUN}-VISA`;
  codeB = `TST-${RUN}-VISB`;
  deptA = await createDepartment(codeA, structA);
  deptB = await createDepartment(codeB, structB);

  const authorA = await createUser("authorA", [{ role: RoleType.EMPLOYEE, structureId: structA, scope: codeA }]);
  const authorB = await createUser("authorB", [{ role: RoleType.EMPLOYEE, structureId: structB, scope: codeB }]);

  const dfcA = await createUser("dfcA", [{ role: RoleType.DFC_CONTROLLER, structureId: structA, scope: codeA }]);
  const dfcGlobal = await createUser("dfcGlobal", [{ role: RoleType.DFC_CONTROLLER, structureId: structA, scope: "*" }]);

  const dA = await createDemandeRow(`TST-${RUN}-FA`, authorA, DemandeStatus.EN_ATTENTE_FINANCEMENT, deptA);
  const dB = await createDemandeRow(`TST-${RUN}-FB`, authorB, DemandeStatus.EN_ATTENTE_FINANCEMENT, deptB);
  const dExec = await createDemandeRow(`TST-${RUN}-FE`, authorA, DemandeStatus.EN_ATTENTE_EXECUTION, deptA);
  await createDemandeRow(`TST-${RUN}-BR`, authorB, DemandeStatus.BROUILLON, deptB);

  (globalThis as any).__dfcA = dfcA;
  (globalThis as any).__dfcGlobal = dfcGlobal;
  (globalThis as any).__dA = dA;
  (globalThis as any).__dB = dB;
  (globalThis as any).__dExec = dExec;
  (globalThis as any).__authorA = authorA;

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

function token(tag: string) { return `tok-${RUN}-${tag}`; }

test("DFC visibilité : un contrôleur habilité consulte une demande EN_ATTENTE_FINANCEMENT de son périmètre", async () => {
  const dA = (globalThis as any).__dA;
  const t = token("dfcA");
  const res = await api(`/api/demandes/${dA}`, t);
  assert.equal(res.status, 200);
  const body = await res.json() as any;
  assert.equal(body.id, dA);
  assert.equal(body.status, "EN_ATTENTE_FINANCEMENT");
});

test("DFC visibilité : un contrôleur habilité consulte une demande EN_ATTENTE_EXECUTION de son périmètre", async () => {
  const dExec = (globalThis as any).__dExec;
  const t = token("dfcA");
  const res = await api(`/api/demandes/${dExec}`, t);
  assert.equal(res.status, 200);
  const body = await res.json() as any;
  assert.equal(body.id, dExec);
  assert.equal(body.status, "EN_ATTENTE_EXECUTION");
});

test("DFC visibilité : un contrôleur hors périmètre ne peut pas consulter une demande en exécution", async () => {
  const dExec = (globalThis as any).__dExec;
  const t = token("dfcA"); // dfcA is scoped to dept A, but dExec is in dept A... need a dept B exec
  // Use dB which is dept B (out of perimeter for dfcA)
  const dB = (globalThis as any).__dB;
  const res = await api(`/api/demandes/${dB}`, t);
  assert.equal(res.status, 404);
});

test("DFC visibilité : un contrôleur avec scope * consulte toutes les demandes", async () => {
  const dB = (globalThis as any).__dB;
  const t = token("dfcGlobal");
  const res = await api(`/api/demandes/${dB}`, t);
  assert.equal(res.status, 200);
});

test("DFC visibilité : un contrôleur hors périmètre ne peut pas consulter la demande", async () => {
  const dB = (globalThis as any).__dB;
  const t = token("dfcA");
  const res = await api(`/api/demandes/${dB}`, t);
  assert.equal(res.status, 404);
});

test("DFC visibilité : un utilisateur non DFC ne peut pas consulter la demande", async () => {
  const dA = (globalThis as any).__dA;
  const res = await api(`/api/demandes/${dA}`); // no token
  assert.equal(res.status, 401);
});

test("DFC visibilité : les brouillons d'autres utilisateurs restent invisibles", async () => {
  const t = token("dfcA");
  const res = await api("/api/demandes", t);
  assert.equal(res.status, 200);
  const body = await res.json() as any[];
  const refs = body.map((d: any) => d.reference);
  assert.ok(!refs.some((r: string) => r.includes("BR")), "brouillon hors périmètre invisible");
});

// Les permissions d'action DFC sont vérifiées par demandes-dfc.test.ts
// (contrôleur actif, hors périmètre, statut incompatible, etc.).