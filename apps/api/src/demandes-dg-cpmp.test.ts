import "./test-env";
import { closeTestServer, installInterruptionCleanup, runCleanupSteps, sweepTestResidues } from "./test-fixtures";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { PrismaClient, RoleType, StructureType, DemandeStatus } from "@prisma/client";
import { hashPassword } from "./services/auth.service";
import app from "./app";

const RUN = randomBytes(3).toString("hex");

let server: Server;
let baseUrl: string;
let prisma: PrismaClient;

const userIds: string[] = [];
const createdStructureIds: string[] = [];
const createdDepartmentIds: string[] = [];
const createdDemandeIds: string[] = [];

let dgToken = "";
let cpmpToken = "";
let ordinaryToken = "";
let dgInactiveToken = "";
let cpmpInactiveToken = "";
let demandeId = "";
let ordinaryUserId = "";

async function api(path: string, token?: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
}

before(async () => {
  prisma = new PrismaClient();
  await sweepTestResidues(prisma);
  installInterruptionCleanup(async () => {});

  const struct = await prisma.structure.create({
    data: { code: `TST-${RUN}-S`, name: `S ${RUN}`, type: StructureType.OTHER },
  });
  createdStructureIds.push(struct.id);

  const dept = await prisma.department.create({
    data: { code: `TST-${RUN}-D`, name: `D ${RUN}`, status: true },
  });
  createdDepartmentIds.push(dept.id);

  // DG user
  const dgUser = await prisma.user.create({
    data: { email: `dg-${RUN}@t.phase4.test`, firstName: "DG", lastName: "Test", passwordHash: await hashPassword("Pass1234!"), status: "ACTIVE" as any },
  });
  userIds.push(dgUser.id);
  await prisma.userStructureRole.create({
    data: { userId: dgUser.id, structureId: null, role: RoleType.DG_USER, scope: "*", startDate: new Date(Date.now() - 86400000) },
  });
  dgToken = `tok-dg-${RUN}`;
  await prisma.session.create({ data: { userId: dgUser.id, token: dgToken, expiresAt: new Date(Date.now() + 3600000) } });

  // CPMP user
  const cpmpUser = await prisma.user.create({
    data: { email: `cpmp-${RUN}@t.phase4.test`, firstName: "CPMP", lastName: "Test", passwordHash: await hashPassword("Pass1234!"), status: "ACTIVE" as any },
  });
  userIds.push(cpmpUser.id);
  await prisma.userStructureRole.create({
    data: { userId: cpmpUser.id, structureId: null, role: RoleType.CPMP_USER, scope: "*", startDate: new Date(Date.now() - 86400000) },
  });
  cpmpToken = `tok-cpmp-${RUN}`;
  await prisma.session.create({ data: { userId: cpmpUser.id, token: cpmpToken, expiresAt: new Date(Date.now() + 3600000) } });

  // ordinary user
  const ordUser = await prisma.user.create({
    data: { email: `ord-${RUN}@t.phase4.test`, firstName: "Ord", lastName: "Test", passwordHash: await hashPassword("Pass1234!"), status: "ACTIVE" as any },
  });
  ordinaryUserId = ordUser.id;
  userIds.push(ordUser.id);
  ordinaryToken = `tok-ord-${RUN}`;
  await prisma.session.create({ data: { userId: ordUser.id, token: ordinaryToken, expiresAt: new Date(Date.now() + 3600000) } });

  // DG inactif
  const dgInactiveUser = await prisma.user.create({
    data: { email: `dg-inact-${RUN}@t.phase4.test`, firstName: "DG", lastName: "Inactive", passwordHash: await hashPassword("Pass1234!"), status: "SUSPENDED" as any },
  });
  userIds.push(dgInactiveUser.id);
  await prisma.userStructureRole.create({
    data: { userId: dgInactiveUser.id, structureId: null, role: RoleType.DG_USER, scope: "*", startDate: new Date(Date.now() - 86400000) },
  });
  dgInactiveToken = `tok-dg-inact-${RUN}`;
  await prisma.session.create({ data: { userId: dgInactiveUser.id, token: dgInactiveToken, expiresAt: new Date(Date.now() + 3600000) } });

  // CPMP inactif
  const cpmpInactiveUser = await prisma.user.create({
    data: { email: `cpmp-inact-${RUN}@t.phase4.test`, firstName: "CPMP", lastName: "Inactive", passwordHash: await hashPassword("Pass1234!"), status: "DISABLED" as any },
  });
  userIds.push(cpmpInactiveUser.id);
  await prisma.userStructureRole.create({
    data: { userId: cpmpInactiveUser.id, structureId: null, role: RoleType.CPMP_USER, scope: "*", startDate: new Date(Date.now() - 86400000) },
  });
  cpmpInactiveToken = `tok-cpmp-inact-${RUN}`;
  await prisma.session.create({ data: { userId: cpmpInactiveUser.id, token: cpmpInactiveToken, expiresAt: new Date(Date.now() + 3600000) } });

  // demande in EN_ATTENTE_FINANCEMENT
  const author = await prisma.user.create({
    data: { email: `author-${RUN}@t.phase4.test`, firstName: "Author", lastName: "Test", passwordHash: await hashPassword("Pass1234!"), status: "ACTIVE" as any },
  });
  userIds.push(author.id);
  const demande = await prisma.demande.create({
    data: {
      reference: `TST-${RUN}-DEM`,
      title: "Test",
      description: "Test",
      category: "INFRASTRUCTURE",
      departmentId: dept.id,
      authorId: author.id,
      status: DemandeStatus.EN_ATTENTE_FINANCEMENT,
    },
  });
  createdDemandeIds.push(demande.id);
  demandeId = demande.id;

  await new Promise<void>((resolveListen, rejectListen) => {
    server = app.listen(0, "127.0.0.1", () => resolveListen());
    server.on("error", rejectListen);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  try {
    await prisma.demande.deleteMany({ where: { id: { in: createdDemandeIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userStructureRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.department.deleteMany({ where: { id: { in: createdDepartmentIds } } });
    await prisma.structure.deleteMany({ where: { id: { in: createdStructureIds } } });
  } finally {
    await closeTestServer(server).catch(() => {});
    if (prisma) await prisma.$disconnect().catch(() => {});
  }
});

test("DG_USER peut consulter la demande transmise", async () => {
  const res = await api(`/api/demandes/${demandeId}`, dgToken);
  assert.equal(res.status, 200);
});

test("CPMP_USER peut consulter la demande transmise", async () => {
  const res = await api(`/api/demandes/${demandeId}`, cpmpToken);
  assert.equal(res.status, 200);
});

test("utilisateur ordinaire ne peut pas consulter", async () => {
  const res = await api(`/api/demandes/${demandeId}`, ordinaryToken);
  assert.equal(res.status, 404);
});

test("non authentifié rejeté", async () => {
  const res = await api(`/api/demandes/${demandeId}`);
  assert.equal(res.status, 401);
});

test("DG peut enregistrer une observation", async () => {
  const res = await api(`/api/demandes/${demandeId}/observations`, dgToken, {
    method: "POST",
    body: JSON.stringify({ commentaire: "Obs DG" }),
  });
  assert.equal(res.status, 201);
  const body = (await res.json()) as { type: string; authorId: string };
  assert.equal(body.type, "OBSERVATION_DG");
});

test("CPMP peut enregistrer une observation", async () => {
  const res = await api(`/api/demandes/${demandeId}/observations`, cpmpToken, {
    method: "POST",
    body: JSON.stringify({ commentaire: "Obs CPMP" }),
  });
  assert.equal(res.status, 201);
  const body = (await res.json()) as { type: string };
  assert.equal(body.type, "OBSERVATION_CPMP");
});

test("historique des observations consultable", async () => {
  const res = await api(`/api/demandes/${demandeId}/observations`, dgToken);
  assert.equal(res.status, 200);
  const body = (await res.json()) as unknown[];
  assert.ok(Array.isArray(body) && body.length >= 2);
});

test("observation ne modifie pas le statut", async () => {
  const row = await prisma.demande.findUnique({ where: { id: demandeId } });
  assert.equal(row?.status, DemandeStatus.EN_ATTENTE_FINANCEMENT);
});

test("DG inactif ne peut pas consulter", async () => {
  const res = await api(`/api/demandes/${demandeId}`, dgInactiveToken);
  assert.equal(res.status, 403);
});

test("CPMP inactif ne peut pas consulter", async () => {
  const res = await api(`/api/demandes/${demandeId}`, cpmpInactiveToken);
  assert.equal(res.status, 403);
});

test("DG inactif ne peut pas consulter les observations", async () => {
  const res = await api(`/api/demandes/${demandeId}/observations`, dgInactiveToken);
  assert.equal(res.status, 403);
});

test("DG inactif ne peut pas enregistrer une observation", async () => {
  const res = await api(`/api/demandes/${demandeId}/observations`, dgInactiveToken, {
    method: "POST",
    body: JSON.stringify({ commentaire: "x" }),
  });
  assert.equal(res.status, 403);
});

test("CPMP inactif ne peut pas enregistrer une observation", async () => {
  const res = await api(`/api/demandes/${demandeId}/observations`, cpmpInactiveToken, {
    method: "POST",
    body: JSON.stringify({ commentaire: "x" }),
  });
  assert.equal(res.status, 403);
});