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
let tokenDept = "";

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

  const author = await prisma.user.create({ data: { email: `author-${RUN}@t.phase974.test`, firstName: "a", lastName: RUN, passwordHash: "h", status: UserStatus.ACTIVE } });
  userIds.push(author.id);
  authorId = author.id;

  const deptMgr = await prisma.user.create({ data: { email: `dept-${RUN}@t.phase974.test`, firstName: "d", lastName: RUN, passwordHash: "h", status: UserStatus.ACTIVE } });
  userIds.push(deptMgr.id);
  deptManagerId = deptMgr.id;
  await prisma.userStructureRole.create({ data: { userId: deptMgr.id, structureId: structId, role: RoleType.DEPARTMENT_MANAGER, scope: codeA, startDate: new Date() } });
  tokenDept = `tok-${RUN}-dept`;
  await prisma.session.create({ data: { userId: deptMgr.id, token: tokenDept, expiresAt: new Date(Date.now() + 3600000) } });

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

test("dept closed : une demande CLOTUREE apparaît dans la liste du département", async () => {
  const dm = await prisma.demande.create({ data: { reference: `TST-${RUN}-CL`, title: "t", description: "d", status: "CLOTUREE", category: "INFRASTRUCTURE", departmentId: deptId, authorId, submittedAt: new Date() } });
  const res = await api("/api/demandes?status=CLOTUREE", tokenDept);
  assert.equal(res.status, 200);
  const body = await res.json() as any[];
  const refs = body.map((d: any) => d.reference);
  assert.ok(refs.includes(`TST-${RUN}-CL`));
});

test("dept closed : le détail est consultable en lecture seule", async () => {
  const dm = await prisma.demande.create({ data: { reference: `TST-${RUN}-CL2`, title: "t", description: "d", status: "CLOTUREE", category: "INFRASTRUCTURE", departmentId: deptId, authorId, submittedAt: new Date(), satisfactionProofUrl: "https://example.com/p.pdf" } });
  const res = await api(`/api/demandes/${dm.id}`, tokenDept);
  assert.equal(res.status, 200);
  const body = await res.json() as any;
  assert.equal(body.status, "CLOTUREE");
  assert.equal(body.satisfactionProofUrl, "https://example.com/p.pdf");
});

test("dept closed : un utilisateur d'un autre département ne gagne aucun accès", async () => {
  const dm = await prisma.demande.create({ data: { reference: `TST-${RUN}-CL3`, title: "t", description: "d", status: "CLOTUREE", category: "INFRASTRUCTURE", departmentId: deptId, authorId, submittedAt: new Date() } });
  const other = await prisma.user.create({ data: { email: `other-${RUN}@t.phase974.test`, firstName: "o", lastName: RUN, passwordHash: "h", status: UserStatus.ACTIVE } });
  userIds.push(other.id);
  await prisma.userStructureRole.create({ data: { userId: other.id, structureId: structId, role: RoleType.DEPARTMENT_MANAGER, scope: `AUTRE-${RUN}`, startDate: new Date() } });
  const tokenOther = `tok-${RUN}-other`;
  await prisma.session.create({ data: { userId: other.id, token: tokenOther, expiresAt: new Date(Date.now() + 3600000) } });
  const res = await api(`/api/demandes/${dm.id}`, tokenOther);
  assert.equal(res.status, 404);
});

test("dept closed : les permissions d'action restent refusées sur une demande clôturée", async () => {
  const dm = await prisma.demande.create({ data: { reference: `TST-${RUN}-CL4`, title: "t", description: "d", status: "CLOTUREE", category: "INFRASTRUCTURE", departmentId: deptId, authorId, submittedAt: new Date() } });
  // close endpoint (DPMG only) → 403 for dept manager
  const res = await fetch(`${baseUrl}/api/demandes/${dm.id}/close`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenDept}` } });
  assert.equal(res.status, 403);
});
