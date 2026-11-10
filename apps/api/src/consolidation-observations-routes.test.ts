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
const createdConsolidationIds: string[] = [];

let dgToken = "";
let cpmpToken = "";
let ordinaryToken = "";
let dgInactiveToken = "";
let dgExpiredToken = "";
let dgScopeMismatchToken = "";
let demandeId = "";
let consolidationId = "";
let broillonConsolidationId = "";

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

  const makeUser = async (tag: string, status: "ACTIVE" | "SUSPENDED", role: RoleType, scope: string, endDate?: Date) => {
    const u = await prisma.user.create({
      data: { email: `${tag}-${RUN}@t.phase4.test`, firstName: tag, lastName: RUN, passwordHash: await hashPassword("Pass1234!"), status: status as any },
    });
    userIds.push(u.id);
    await prisma.userStructureRole.create({
      data: { userId: u.id, structureId: null, role, scope, startDate: new Date(Date.now() - 86400000), endDate: endDate ?? null },
    });
    const token = `tok-${tag}-${RUN}`;
    await prisma.session.create({ data: { userId: u.id, token, expiresAt: new Date(Date.now() + 3600000) } });
    return { user: u, token };
  };

  const dg = await makeUser("dg", "ACTIVE", RoleType.DG_USER, "*");
  dgToken = dg.token;
  const cpmp = await makeUser("cpmp", "ACTIVE", RoleType.CPMP_USER, "*");
  cpmpToken = cpmp.token;
  const ord = await makeUser("ord", "ACTIVE", RoleType.EMPLOYEE, "INFRA");
  ordinaryToken = ord.token;

  const dgInactive = await makeUser("dginact", "SUSPENDED", RoleType.DG_USER, "*");
  dgInactiveToken = dgInactive.token;

  const dgExpired = await makeUser("dgexp", "ACTIVE", RoleType.DG_USER, "*", new Date(Date.now() - 86400000));
  dgExpiredToken = dgExpired.token;

  const dgMismatch = await makeUser("dgmis", "ACTIVE", RoleType.DG_USER, "OTHER");
  dgScopeMismatchToken = dgMismatch.token;

  // author + demande
  const author = await prisma.user.create({
    data: { email: `author-${RUN}@t.phase4.test`, firstName: "Author", lastName: RUN, passwordHash: await hashPassword("Pass1234!"), status: "ACTIVE" as any },
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

  // DPMG manager to create consolidation? We'll create consolidation directly in TRANSMITTED.
  const consolidation = await prisma.consolidation.create({
    data: {
      reference: `TST-${RUN}-CONS`,
      periodStart: new Date("2026-11-04T00:00:00Z"),
      periodEnd: new Date("2026-11-10T23:59:59Z"),
      status: "TRANSMISE" as any,
      createdById: author.id,
      transmittedAt: new Date(),
    },
  });
  createdConsolidationIds.push(consolidation.id);
  consolidationId = consolidation.id;

  // attach demande
  await prisma.demande.update({ where: { id: demande.id }, data: { consolidationId: consolidation.id } });

  // broillon consolidation
  const broillon = await prisma.consolidation.create({
    data: {
      reference: `TST-${RUN}-CONS-B`,
      periodStart: new Date("2026-11-04T00:00:00Z"),
      periodEnd: new Date("2026-11-10T23:59:59Z"),
      status: "BROUILLON" as any,
      createdById: author.id,
    },
  });
  createdConsolidationIds.push(broillon.id);
  broillonConsolidationId = broillon.id;

  await new Promise<void>((resolveListen, rejectListen) => {
    server = app.listen(0, "127.0.0.1", () => resolveListen());
    server.on("error", rejectListen);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  try {
    await prisma.consolidationObservation.deleteMany({ where: { consolidationId: { in: createdConsolidationIds } } });
    await prisma.demande.updateMany({ where: { id: { in: createdDemandeIds } }, data: { consolidationId: null } });
    await prisma.consolidation.deleteMany({ where: { id: { in: createdConsolidationIds } } });
    await prisma.demande.deleteMany({ where: { id: { in: createdDemandeIds } } });
    await prisma.adminAuditLog.deleteMany({ where: { actorId: { in: userIds } } });
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

test("ajout d'une observation DG autorisée", async () => {
  const res = await api(`/api/consolidations/${consolidationId}/observations`, dgToken, {
    method: "POST",
    body: JSON.stringify({ commentaire: "Obs DG route" }),
  });
  assert.equal(res.status, 201);
  const body = (await res.json()) as { role: string; actorId: string };
  assert.equal(body.role, "DG_USER");
});

test("ajout d'une observation CPMP autorisée", async () => {
  const res = await api(`/api/consolidations/${consolidationId}/observations`, cpmpToken, {
    method: "POST",
    body: JSON.stringify({ commentaire: "Obs CPMP route" }),
  });
  assert.equal(res.status, 201);
  const body = (await res.json()) as { role: string };
  assert.equal(body.role, "CPMP_USER");
});

test("consultation des observations autorisée", async () => {
  const res = await api(`/api/consolidations/${consolidationId}/observations`, dgToken);
  assert.equal(res.status, 200);
  const body = (await res.json()) as unknown[];
  assert.ok(Array.isArray(body) && body.length >= 2);
});

test("refus sans authentification", async () => {
  const res = await api(`/api/consolidations/${consolidationId}/observations`, undefined, {
    method: "POST",
    body: JSON.stringify({ commentaire: "x" }),
  });
  assert.equal(res.status, 401);
});

test("refus d'un utilisateur sans rôle DG/CPMP", async () => {
  const res = await api(`/api/consolidations/${consolidationId}/observations`, ordinaryToken, {
    method: "POST",
    body: JSON.stringify({ commentaire: "x" }),
  });
  assert.equal(res.status, 403);
});

test("refus d'un compte inactif", async () => {
  const res = await api(`/api/consolidations/${consolidationId}/observations`, dgInactiveToken, {
    method: "POST",
    body: JSON.stringify({ commentaire: "x" }),
  });
  assert.equal(res.status, 403);
});

test("refus d'une habilitation expirée", async () => {
  const res = await api(`/api/consolidations/${consolidationId}/observations`, dgExpiredToken, {
    method: "POST",
    body: JSON.stringify({ commentaire: "x" }),
  });
  assert.equal(res.status, 403);
});

test("refus d'un scope non autorisé", async () => {
  const res = await api(`/api/consolidations/${consolidationId}/observations`, dgScopeMismatchToken, {
    method: "POST",
    body: JSON.stringify({ commentaire: "x" }),
  });
  assert.equal(res.status, 403);
});

test("refus d'une consolidation en brouillon", async () => {
  const res = await api(`/api/consolidations/${broillonConsolidationId}/observations`, dgToken, {
    method: "POST",
    body: JSON.stringify({ commentaire: "x" }),
  });
  assert.equal(res.status, 404);
});

test("refus d'un commentaire invalide", async () => {
  const res = await api(`/api/consolidations/${consolidationId}/observations`, dgToken, {
    method: "POST",
    body: JSON.stringify({ commentaire: "   " }),
  });
  assert.equal(res.status, 400);
});

test("le rôle ne peut pas être falsifié dans le corps", async () => {
  const res = await api(`/api/consolidations/${consolidationId}/observations`, dgToken, {
    method: "POST",
    body: JSON.stringify({ commentaire: "obs", role: "CPMP_USER", actorId: "fake" }),
  });
  assert.equal(res.status, 201);
  const body = (await res.json()) as { role: string; actorId: string };
  assert.equal(body.role, "DG_USER");
  assert.notEqual(body.actorId, "fake");
});