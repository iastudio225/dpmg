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
let tokenDpmg = "";

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

let disposeInterruptionCleanup: (() => void) | null = null;
async function deleteFixtures(): Promise<void> {
  await runCleanupSteps([
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

  structId = await createStructure(`TST-${RUN}-C`);
  codeA = `TST-${RUN}-C`;
  deptId = await createDepartment(codeA, structId);

  const author = await prisma.user.create({ data: { email: `author-${RUN}@t.phase973.test`, firstName: "a", lastName: RUN, passwordHash: "h", status: UserStatus.ACTIVE } });
  userIds.push(author.id);
  authorId = author.id;

  const dpmg = await prisma.user.create({ data: { email: `dpmg-${RUN}@t.phase973.test`, firstName: "d", lastName: RUN, passwordHash: "h", status: UserStatus.ACTIVE } });
  userIds.push(dpmg.id);
  dpmgId = dpmg.id;
  await prisma.userStructureRole.create({ data: { userId: dpmg.id, structureId: structId, role: RoleType.DPMG_MANAGER, scope: "*", startDate: new Date() } });
  tokenDpmg = `tok-${RUN}-dpmg`;
  await prisma.session.create({ data: { userId: dpmg.id, token: tokenDpmg, expiresAt: new Date(Date.now() + 3600000) } });

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

async function api(path: string, token?: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
}

test("DPMG cloturee : une demande CLOTUREE apparaît dans la liste DPMG", async () => {
  const dm = await prisma.demande.create({ data: { reference: `TST-${RUN}-CL`, title: "t", description: "d", status: "CLOTUREE", category: "INFRASTRUCTURE", departmentId: deptId, authorId, submittedAt: new Date() } });
  const res = await api("/api/demandes", tokenDpmg);
  assert.equal(res.status, 200);
  const body = await res.json() as any[];
  const refs = body.map((d: any) => d.reference);
  assert.ok(refs.includes(`TST-${RUN}-CL`), "la demande clôturée doit être visible");
});

test("DPMG cloturee : le filtre CLOTUREE retourne cette demande", async () => {
  const dm = await prisma.demande.create({ data: { reference: `TST-${RUN}-CL2`, title: "t", description: "d", status: "CLOTUREE", category: "INFRASTRUCTURE", departmentId: deptId, authorId, submittedAt: new Date() } });
  const res = await api("/api/demandes?status=CLOTUREE", tokenDpmg);
  assert.equal(res.status, 200);
  const body = await res.json() as any[];
  const refs = body.map((d: any) => d.reference);
  assert.ok(refs.includes(`TST-${RUN}-CL2`));
});

test("DPMG cloturee : un utilisateur non habilité ne gagne aucun accès", async () => {
  const dm = await prisma.demande.create({ data: { reference: `TST-${RUN}-CL3`, title: "t", description: "d", status: "CLOTUREE", category: "INFRASTRUCTURE", departmentId: deptId, authorId, submittedAt: new Date() } });
  const emp = await prisma.user.create({ data: { email: `emp-${RUN}@t.phase973.test`, firstName: "e", lastName: RUN, passwordHash: "h", status: UserStatus.ACTIVE } });
  userIds.push(emp.id);
  const tokenEmp = `tok-${RUN}-emp`;
  await prisma.session.create({ data: { userId: emp.id, token: tokenEmp, expiresAt: new Date(Date.now() + 3600000) } });
  const res = await api(`/api/demandes/${dm.id}`, tokenEmp);
  assert.equal(res.status, 404);
});

test("DPMG cloturee : la fiche détail renvoie 200 pour un DPMG habilité", async () => {
  const dm = await prisma.demande.create({ data: { reference: `TST-${RUN}-CL4`, title: "t", description: "d", status: "CLOTUREE", category: "INFRASTRUCTURE", departmentId: deptId, authorId, submittedAt: new Date() } });
  const res = await api(`/api/demandes/${dm.id}`, tokenDpmg);
  assert.equal(res.status, 200);
  const body = await res.json() as any;
  assert.equal(body.status, "CLOTUREE");
});