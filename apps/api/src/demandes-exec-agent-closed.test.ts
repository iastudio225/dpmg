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
let execAgentId = "";
let tokenExec = "";
let tokenOther = "";

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

  structId = await createStructure(`TST-${RUN}-E`);
  codeA = `TST-${RUN}-E`;
  deptId = await createDepartment(codeA, structId);

  const author = await prisma.user.create({ data: { email: `author-${RUN}@t.phase975.test`, firstName: "a", lastName: RUN, passwordHash: "h", status: UserStatus.ACTIVE } });
  userIds.push(author.id);
  authorId = author.id;

  const exec = await prisma.user.create({ data: { email: `exec-${RUN}@t.phase975.test`, firstName: "e", lastName: RUN, passwordHash: "h", status: UserStatus.ACTIVE } });
  userIds.push(exec.id);
  execAgentId = exec.id;
  await prisma.userStructureRole.create({ data: { userId: exec.id, structureId: structId, role: RoleType.EXECUTION_AGENT, scope: codeA, startDate: new Date() } });
  tokenExec = `tok-${RUN}-exec`;
  await prisma.session.create({ data: { userId: exec.id, token: tokenExec, expiresAt: new Date(Date.now() + 3600000) } });

  // Other department user
  const otherStructId = await createStructure(`TST-${RUN}-O`);
  const otherDeptId = await createDepartment(`TST-${RUN}-O`, otherStructId);
  const otherUser = await prisma.user.create({ data: { email: `other-${RUN}@t.phase975.test`, firstName: "o", lastName: RUN, passwordHash: "h", status: UserStatus.ACTIVE } });
  userIds.push(otherUser.id);
  await prisma.userStructureRole.create({ data: { userId: otherUser.id, structureId: otherStructId, role: RoleType.EXECUTION_AGENT, scope: `TST-${RUN}-O`, startDate: new Date() } });
  tokenOther = `tok-${RUN}-other`;
  await prisma.session.create({ data: { userId: otherUser.id, token: tokenOther, expiresAt: new Date(Date.now() + 3600000) } });

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

async function api(path: string, token?: string, options?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...options });
}

test("exec agent closed : une demande CLOTUREE apparaît dans la liste", async () => {
  const dm = await prisma.demande.create({ data: { reference: `TST-${RUN}-CL`, title: "t", description: "d", status: "CLOTUREE", category: "INFRASTRUCTURE", departmentId: deptId, authorId, submittedAt: new Date(), satisfactionProofUrl: "https://example.com/proof.pdf" } });
  const res = await api("/api/demandes?status=CLOTUREE", tokenExec);
  assert.equal(res.status, 200);
  const body = await res.json() as any[];
  const refs = body.map((d: any) => d.reference);
  assert.ok(refs.includes(`TST-${RUN}-CL`), "la demande clôturée doit être visible pour l'agent d'exécution");
});

test("exec agent closed : le détail est consultable", async () => {
  const dm = await prisma.demande.create({ data: { reference: `TST-${RUN}-CL2`, title: "t", description: "d", status: "CLOTUREE", category: "INFRASTRUCTURE", departmentId: deptId, authorId, submittedAt: new Date(), satisfactionProofUrl: "https://example.com/proof.pdf", satisfactionObservations: "obs" } });
  const res = await api(`/api/demandes/${dm.id}`, tokenExec);
  assert.equal(res.status, 200);
  const body = await res.json() as any;
  assert.equal(body.status, "CLOTUREE");
  assert.equal(body.satisfactionProofUrl, "https://example.com/proof.pdf");
  assert.equal(body.satisfactionObservations, "obs");
});

test("exec agent closed : accès refusé pour un autre département", async () => {
  const dm = await prisma.demande.create({ data: { reference: `TST-${RUN}-CL3`, title: "t", description: "d", status: "CLOTUREE", category: "INFRASTRUCTURE", departmentId: deptId, authorId, submittedAt: new Date() } });
  const res = await api(`/api/demandes/${dm.id}`, tokenOther);
  assert.equal(res.status, 404);
});

test("exec agent closed : pas d'action possible sur une demande clôturée", async () => {
  const dm = await prisma.demande.create({ data: { reference: `TST-${RUN}-CL4`, title: "t", description: "d", status: "CLOTUREE", category: "INFRASTRUCTURE", departmentId: deptId, authorId, submittedAt: new Date() } });
  const res = await api(`/api/demandes/${dm.id}/execution/start`, tokenExec, { method: "POST" });
  assert.equal(res.status, 403);
});

test("exec agent closed : pas de fuite du justificatif vers un non-autorisé", async () => {
  const dm = await prisma.demande.create({ data: { reference: `TST-${RUN}-CL5`, title: "t", description: "d", status: "CLOTUREE", category: "INFRASTRUCTURE", departmentId: deptId, authorId, submittedAt: new Date(), satisfactionProofUrl: "https://example.com/secret.pdf" } });
  const res = await api(`/api/demandes/${dm.id}`, tokenOther);
  assert.equal(res.status, 404);
});
