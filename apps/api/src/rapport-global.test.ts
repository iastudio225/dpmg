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

let structDpmg = "";
let structB = "";
let deptA = "";
let deptB = "";
let authorId = "";
let tokenDpmg = "";
let tokenPlain = "";

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

async function createSession(userId: string, tag: string): Promise<string> {
  const token = `tok-${RUN}-${tag}`;
  await prisma.session.create({
    data: { userId, token, expiresAt: new Date(Date.now() + 3600 * 1000) },
  });
  return token;
}

let disposeInterruptionCleanup: (() => void) | null = null;
async function deleteFixtures(): Promise<void> {
  await runCleanupSteps([
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

  structDpmg = await createStructure(`TST-${RUN}-DPMG`);
  // Department.structureId est unique : chaque département a sa structure.
  structB = await createStructure(`TST-${RUN}-DB`);
  deptA = await createDepartment(`TST-${RUN}-A`, structDpmg);
  deptB = await createDepartment(`TST-${RUN}-B`, structB);

  const author = await prisma.user.create({
    data: {
      email: `author-${RUN}@t.rapport.test`,
      firstName: "a",
      lastName: RUN,
      passwordHash: "h",
      status: UserStatus.ACTIVE,
    },
  });
  userIds.push(author.id);
  authorId = author.id;

  const dpmg = await prisma.user.create({
    data: {
      email: `dpmg-${RUN}@t.rapport.test`,
      firstName: "d",
      lastName: RUN,
      passwordHash: "h",
      status: UserStatus.ACTIVE,
    },
  });
  userIds.push(dpmg.id);
  await prisma.userStructureRole.create({
    data: { userId: dpmg.id, structureId: structDpmg, role: RoleType.DPMG_MANAGER, scope: "*", startDate: new Date() },
  });
  tokenDpmg = await createSession(dpmg.id, "dpmg");

  const plain = await prisma.user.create({
    data: {
      email: `plain-${RUN}@t.rapport.test`,
      firstName: "p",
      lastName: RUN,
      passwordHash: "h",
      status: UserStatus.ACTIVE,
    },
  });
  userIds.push(plain.id);
  tokenPlain = await createSession(plain.id, "plain");

  // Demandes de référence.
  await prisma.demande.create({
    data: {
      reference: `TST-${RUN}-R1`,
      title: "Clôturée récente",
      description: "d",
      status: DemandeStatus.CLOTUREE,
      category: "INFRASTRUCTURE",
      departmentId: deptA,
      authorId,
      submittedAt: new Date(),
    },
  });
  await prisma.demande.create({
    data: {
      reference: `TST-${RUN}-R2`,
      title: "En attente d'exécution urgente",
      description: "d",
      status: DemandeStatus.EN_ATTENTE_EXECUTION,
      category: "INFRASTRUCTURE",
      departmentId: deptA,
      authorId,
      isUrgent: true,
      submittedAt: new Date(),
    },
  });
  await prisma.demande.create({
    data: {
      reference: `TST-${RUN}-R3`,
      title: "Clôturée il y a 60 jours",
      description: "d",
      status: DemandeStatus.CLOTUREE,
      category: "INFRASTRUCTURE",
      departmentId: deptB,
      authorId,
      submittedAt: new Date(Date.now() - 60 * 86400000),
      createdAt: new Date(Date.now() - 60 * 86400000),
    },
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server = app.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolveListen();
    });
    server.on("error", rejectListen);
  });
});

after(async () => {
  try {
    await deleteFixtures();
  } finally {
    disposeInterruptionCleanup?.();
    disposeInterruptionCleanup = null;
    await closeTestServer(server).catch(() => {});
    if (prisma) await prisma.$disconnect().catch(() => {});
  }
});

async function api(path: string, token?: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

test("rapport : un utilisateur sans rôle DPMG est refusé (403)", async () => {
  const res = await api("/api/rapports/global", tokenPlain);
  assert.equal(res.status, 403);
});

test("rapport : sans session, refusé (401)", async () => {
  const res = await api("/api/rapports/global");
  assert.equal(res.status, 401);
});

test("rapport global : agrégats et détail pour un DPMG", async () => {
  const res = await api(`/api/rapports/global?from=${isoDaysAgo(30)}&to=${isoToday()}`, tokenDpmg);
  assert.equal(res.status, 200);
  const body = (await res.json()) as any;

  assert.equal(body.total, 2, "la demande de -60 jours est hors période");
  assert.equal(body.urgentes, 1);
  assert.equal(body.cloturees, 1);

  const byStatus = Object.fromEntries(body.byStatus.map((s: any) => [s.status, s.count]));
  assert.equal(byStatus["CLOTUREE"], 1);
  assert.equal(byStatus["EN_ATTENTE_EXECUTION"], 1);

  assert.equal(body.byDepartment.length, 1);
  assert.equal(body.byDepartment[0].count, 2);

  assert.equal(body.byStructure.length, 1);
  assert.equal(body.byStructure[0].structureId, structDpmg);
  assert.equal(body.byStructure[0].count, 2);

  const refs = body.demandes.map((d: any) => d.reference);
  assert.ok(refs.includes(`TST-${RUN}-R1`));
  assert.ok(refs.includes(`TST-${RUN}-R2`));
  assert.ok(!refs.includes(`TST-${RUN}-R3`));

  const row = body.demandes.find((d: any) => d.reference === `TST-${RUN}-R2`);
  assert.equal(row.isUrgent, true);
  assert.equal(row.structureId, structDpmg);
  assert.ok(row.structureName);
});

test("rapport global : sans période, toutes les demandes visibles sont comptées", async () => {
  const res = await api("/api/rapports/global", tokenDpmg);
  assert.equal(res.status, 200);
  const body = (await res.json()) as any;
  assert.equal(body.total, 3);
  assert.equal(body.cloturees, 2);
});

test("rapport global : filtre statut", async () => {
  const res = await api(`/api/rapports/global?status=EN_ATTENTE_EXECUTION`, tokenDpmg);
  assert.equal(res.status, 200);
  const body = (await res.json()) as any;
  assert.equal(body.total, 1);
  assert.equal(body.demandes[0].status, "EN_ATTENTE_EXECUTION");
});

test("rapport global : filtre département", async () => {
  const res = await api(`/api/rapports/global?departmentId=${deptB}`, tokenDpmg);
  assert.equal(res.status, 200);
  const body = (await res.json()) as any;
  assert.equal(body.total, 1);
  assert.equal(body.demandes[0].reference, `TST-${RUN}-R3`);
});

test("rapport global : filtre urgence", async () => {
  const res = await api(`/api/rapports/global?urgent=true`, tokenDpmg);
  assert.equal(res.status, 200);
  const body = (await res.json()) as any;
  assert.equal(body.total, 1);
  assert.equal(body.urgentes, 1);
});

test("rapport global : date invalide → 400", async () => {
  const res = await api(`/api/rapports/global?from=abc`, tokenDpmg);
  assert.equal(res.status, 400);
  const body = (await res.json()) as any;
  assert.equal(body.code, "VALIDATION_ERROR");
});
