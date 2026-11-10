import "./test-env";
import { closeTestServer, installInterruptionCleanup, runCleanupSteps, sweepTestResidues } from "./test-fixtures";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { PrismaClient, RoleType, StructureType, UserStatus } from "@prisma/client";
import { hashPassword } from "./services/auth.service";
import app from "./app";

const RUN = randomBytes(3).toString("hex");

let server: Server;
let baseUrl: string;
let prisma: PrismaClient;

const userIds: string[] = [];
const createdStructureIds: string[] = [];

let adminToken = "";
let employeeToken = "";
let roleStructureId = "";
let parentStructureId = "";

async function createStructureRow(code: string, name: string, type: StructureType = StructureType.OTHER): Promise<string> {
  const s = await prisma.structure.create({ data: { code, name, type } });
  createdStructureIds.push(s.id);
  return s.id;
}

async function createUserWithRole(
  email: string,
  role: RoleType,
  structureId: string | null
): Promise<{ id: string; token: string }> {
  const hash = await hashPassword("StructPass1234!");
  const user = await prisma.user.create({
    data: { email, firstName: "Struct", lastName: "Test", passwordHash: hash, status: UserStatus.ACTIVE },
  });
  userIds.push(user.id);
  await prisma.userStructureRole.create({
    data: { userId: user.id, structureId, role, scope: "*", startDate: new Date(Date.now() - 30 * 86400000), endDate: null },
  });
  const token = `tok-${RUN}-${email}`;
  await prisma.session.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 3600000) },
  });
  return { id: user.id, token };
}

async function deleteFixtures(): Promise<void> {
  await runCleanupSteps([
    ["sessions", () => prisma.session.deleteMany({ where: { userId: { in: userIds } } })],
    ["roles", () => prisma.userStructureRole.deleteMany({ where: { userId: { in: userIds } } })],
    ["adminAuditLogs", () => prisma.adminAuditLog.deleteMany({ where: { actorId: { in: userIds } } })],
    ["users", () => prisma.user.deleteMany({ where: { id: { in: userIds } } })],
    ["structures", () => prisma.structure.deleteMany({ where: { id: { in: createdStructureIds } } })],
  ]);
}

before(async () => {
  prisma = new PrismaClient();
  await sweepTestResidues(prisma);
  installInterruptionCleanup(deleteFixtures);

  roleStructureId = await createStructureRow(`TST-${RUN}-ROLE`, `TST ${RUN} role`);
  parentStructureId = await createStructureRow(`TST-${RUN}-PARENT`, `TST ${RUN} parent`, StructureType.DIRECTION);

  // Les deux rôles d'administration donnent l'accès en écriture : avoir les deux
  // rend le compte insensible à un nettoyage concurrent des rôles TECHNICAL_ADMIN
  // par le reste de la suite.
  const admin = await createUserWithRole(`struct-admin-${RUN}@t.phase1000.test`, RoleType.TECHNICAL_ADMIN, null);
  await prisma.userStructureRole.create({
    data: {
      userId: admin.id,
      structureId: null,
      role: RoleType.SUPER_ADMIN,
      scope: "*",
      startDate: new Date(Date.now() - 30 * 86400000),
      endDate: null,
    },
  });
  adminToken = admin.token;

  const employee = await createUserWithRole(
    `struct-employee-${RUN}@t.phase1000.test`,
    RoleType.EMPLOYEE,
    roleStructureId
  );
  employeeToken = employee.token;

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
    installInterruptionCleanup(deleteFixtures);
    await closeTestServer(server).catch(() => {});
    if (prisma) await prisma.$disconnect().catch(() => {});
  }
});

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

test("GET /api/structures exige une authentification", async () => {
  const res = await api("/api/structures");
  assert.equal(res.status, 401);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "UNAUTHORIZED");
});

test("GET /api/structures est accessible en lecture à un utilisateur ordinaire", async () => {
  const res = await api("/api/structures", employeeToken);
  assert.equal(res.status, 200);
  const body = (await res.json()) as unknown[];
  assert.ok(Array.isArray(body));
});

test("POST /api/structures est interdit à un utilisateur ordinaire", async () => {
  const res = await api(
    "/api/structures",
    employeeToken,
    {
      method: "POST",
      body: JSON.stringify({ code: `TST-${RUN}-FORBIDDEN`, name: "Interdit", type: "OTHER" }),
    }
  );
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "FORBIDDEN");
});

test("POST /api/structures crée une structure et journalise l'audit", async () => {
  const res = await api(
    "/api/structures",
    adminToken,
    {
      method: "POST",
      body: JSON.stringify({
        code: `TST-${RUN}-AG`,
        name: `Agence ${RUN}`,
        type: "AGENCY",
        parentId: parentStructureId,
      }),
    }
  );
  assert.equal(res.status, 201);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(typeof body["id"], "string");
  assert.equal(body["code"], `TST-${RUN}-AG`);
  assert.equal(body["parentName"], `TST ${RUN} parent`);
  createdStructureIds.push(body["id"] as string);

  const audit = await prisma.adminAuditLog.findFirst({
    where: { action: "CREATE_STRUCTURE", targetId: body["id"] as string },
  });
  assert.ok(audit, "une trace CREATE_STRUCTURE doit exister");
  const details = JSON.stringify(audit.details ?? {});
  assert.ok(!details.includes("password"));
});

test("POST /api/structures rejette un code déjà utilisé (409)", async () => {
  const res = await api(
    "/api/structures",
    adminToken,
    {
      method: "POST",
      body: JSON.stringify({ code: `TST-${RUN}-AG`, name: "Doublon", type: "AGENCY" }),
    }
  );
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "CODE_ALREADY_EXISTS");
});

test("POST /api/structures rejette un code invalide (400)", async () => {
  const res = await api(
    "/api/structures",
    adminToken,
    {
      method: "POST",
      body: JSON.stringify({ code: "code invalide!", name: "Invalide", type: "OTHER" }),
    }
  );
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "VALIDATION_ERROR");
});

test("GET /api/structures filtre par recherche et type", async () => {
  const res = await api(`/api/structures?search=${RUN}&type=AGENCY`, adminToken);
  assert.equal(res.status, 200);
  const body = (await res.json()) as Array<{ code: string; type: string }>;
  assert.ok(body.length >= 1);
  assert.ok(body.every((s) => s.type === "AGENCY"));
});

test("GET /api/structures/:id renvoie 404 pour une structure inconnue", async () => {
  const res = await api("/api/structures/00000000-0000-0000-0000-000000000000", adminToken);
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "STRUCTURE_NOT_FOUND");
});

test("PUT /api/structures/:id modifie les champs autorisés", async () => {
  const created = await prisma.structure.findUnique({ where: { code: `TST-${RUN}-AG` } });
  assert.ok(created);

  const res = await api(
    `/api/structures/${created!.id}`,
    adminToken,
    { method: "PUT", body: JSON.stringify({ name: `Agence ${RUN} modifiée`, type: "POINT_OF_SALE" }) }
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { name: string; type: string; code: string };
  assert.equal(body.name, `Agence ${RUN} modifiée`);
  assert.equal(body.type, "POINT_OF_SALE");
  assert.equal(body.code, `TST-${RUN}-AG`);

  const audit = await prisma.adminAuditLog.findFirst({
    where: { action: "UPDATE_STRUCTURE", targetId: created!.id },
  });
  assert.ok(audit, "une trace UPDATE_STRUCTURE doit exister");
});

test("PUT /api/structures/:id refuse un parent créant un cycle", async () => {
  const created = await prisma.structure.findUnique({ where: { code: `TST-${RUN}-AG` } });
  assert.ok(created);

  const res = await api(
    `/api/structures/${created!.id}`,
    adminToken,
    { method: "PUT", body: JSON.stringify({ parentId: created!.id }) }
  );
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "PARENT_CYCLE");
});

test("PUT /api/structures/:id/status bascule le statut et journalise l'audit", async () => {
  const created = await prisma.structure.findUnique({ where: { code: `TST-${RUN}-AG` } });
  assert.ok(created);

  const deactivate = await api(
    `/api/structures/${created!.id}/status`,
    adminToken,
    { method: "PUT", body: JSON.stringify({ status: false }) }
  );
  assert.equal(deactivate.status, 200);
  const deactivateBody = (await deactivate.json()) as { status: boolean };
  assert.equal(deactivateBody.status, false);

  const activate = await api(
    `/api/structures/${created!.id}/status`,
    adminToken,
    { method: "PUT", body: JSON.stringify({ status: true }) }
  );
  assert.equal(activate.status, 200);
  const activateBody = (await activate.json()) as { status: boolean };
  assert.equal(activateBody.status, true);

  const audit = await prisma.adminAuditLog.findFirst({
    where: { action: "CHANGE_STRUCTURE_STATUS", targetId: created!.id },
  });
  assert.ok(audit, "une trace CHANGE_STRUCTURE_STATUS doit exister");
});
