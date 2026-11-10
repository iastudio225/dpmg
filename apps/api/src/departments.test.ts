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
const createdDepartmentIds: string[] = [];

let adminToken = "";
let employeeToken = "";
let structAId = "";
let structBId = "";
let structCId = "";

async function createStructureRow(code: string): Promise<string> {
  const s = await prisma.structure.create({
    data: { code, name: `S ${code}`, type: StructureType.OTHER },
  });
  createdStructureIds.push(s.id);
  return s.id;
}

async function createUserWithRole(
  email: string,
  role: RoleType,
  structureId: string | null
): Promise<string> {
  const hash = await hashPassword("DeptPass1234!");
  const user = await prisma.user.create({
    data: { email, firstName: "Dept", lastName: "Test", passwordHash: hash, status: UserStatus.ACTIVE },
  });
  userIds.push(user.id);
  await prisma.userStructureRole.create({
    data: { userId: user.id, structureId, role, scope: "*", startDate: new Date(Date.now() - 30 * 86400000), endDate: null },
  });
  const token = `tok-${RUN}-${email}`;
  await prisma.session.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 3600000) },
  });
  return token;
}

async function deleteFixtures(): Promise<void> {
  await runCleanupSteps([
    ["sessions", () => prisma.session.deleteMany({ where: { userId: { in: userIds } } })],
    ["roles", () => prisma.userStructureRole.deleteMany({ where: { userId: { in: userIds } } })],
    ["adminAuditLogs", () => prisma.adminAuditLog.deleteMany({ where: { actorId: { in: userIds } } })],
    ["users", () => prisma.user.deleteMany({ where: { id: { in: userIds } } })],
    ["departments", () => prisma.department.deleteMany({ where: { id: { in: createdDepartmentIds } } })],
    ["structures", () => prisma.structure.deleteMany({ where: { id: { in: createdStructureIds } } })],
  ]);
}

before(async () => {
  prisma = new PrismaClient();
  await sweepTestResidues(prisma);
  installInterruptionCleanup(deleteFixtures);

  structAId = await createStructureRow(`TST-${RUN}-A`);
  structBId = await createStructureRow(`TST-${RUN}-B`);
  structCId = await createStructureRow(`TST-${RUN}-C`);

  adminToken = await createUserWithRole(`dept-admin-${RUN}@t.phase1000.test`, RoleType.TECHNICAL_ADMIN, null);
  employeeToken = await createUserWithRole(
    `dept-employee-${RUN}@t.phase1000.test`,
    RoleType.EMPLOYEE,
    structAId
  );

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

function trackDepartment(id: string): string {
  createdDepartmentIds.push(id);
  return id;
}

// 1. Non authentifié : 401.
test("GET /api/departments exige une authentification", async () => {
  const res = await api("/api/departments");
  assert.equal(res.status, 401);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "UNAUTHORIZED");
});

// 2. Employé authentifié : lecture autorisée.
test("GET /api/departments est accessible en lecture à un utilisateur ordinaire", async () => {
  const res = await api("/api/departments", employeeToken);
  assert.equal(res.status, 200);
  const body = (await res.json()) as unknown[];
  assert.ok(Array.isArray(body));
});

// 3. Employé : création refusée.
test("POST /api/departments est interdit à un utilisateur ordinaire", async () => {
  const res = await api(
    "/api/departments",
    employeeToken,
    {
      method: "POST",
      body: JSON.stringify({ name: "Interdit", code: `TST-${RUN}-X`, structureId: structAId }),
    }
  );
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "FORBIDDEN");
});

// 4. Création valide : 201.
test("POST /api/departments crée un département valide avec audit", async () => {
  const res = await api(
    "/api/departments",
    adminToken,
    {
      method: "POST",
      body: JSON.stringify({
        name: `Dép ${RUN}`,
        code: `TST-${RUN}-D1`,
        description: "Département de test",
        structureId: structAId,
      }),
    }
  );
  assert.equal(res.status, 201);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(typeof body["id"], "string");
  assert.equal(body["code"], `TST-${RUN}-D1`);
  assert.equal(body["structureId"], structAId);
  assert.equal(body["structureName"], `S TST-${RUN}-A`);
  assert.equal(body["status"], true);
  trackDepartment(body["id"] as string);

  const audit = await prisma.adminAuditLog.findFirst({
    where: { action: "CREATE_DEPARTMENT", targetId: body["id"] as string },
  });
  assert.ok(audit, "une trace CREATE_DEPARTMENT doit exister");
});

// 5. Code dupliqué : 409.
test("POST /api/departments rejette un code déjà utilisé (409)", async () => {
  const res = await api(
    "/api/departments",
    adminToken,
    {
      method: "POST",
      body: JSON.stringify({ name: "Doublon", code: `TST-${RUN}-D1`, structureId: structBId }),
    }
  );
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "CODE_ALREADY_EXISTS");
});

// 6. Structure inexistante : 404 (convention STRUCTURE_NOT_FOUND du Lot 1).
test("POST /api/departments rejette une structure inexistante (404)", async () => {
  const res = await api(
    "/api/departments",
    adminToken,
    {
      method: "POST",
      body: JSON.stringify({
        name: "Orphelin",
        code: `TST-${RUN}-ORPH`,
        structureId: "00000000-0000-0000-0000-000000000000",
      }),
    }
  );
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "STRUCTURE_NOT_FOUND");
});

// 7. Structure déjà affectée : 409.
test("POST /api/departments rejette une structure déjà rattachée (409)", async () => {
  const res = await api(
    "/api/departments",
    adminToken,
    {
      method: "POST",
      body: JSON.stringify({ name: "Conflit", code: `TST-${RUN}-CONF`, structureId: structAId }),
    }
  );
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "STRUCTURE_ALREADY_ASSIGNED");
});

// 8. Lecture d'un département : 200.
test("GET /api/departments/:id renvoie le détail du département", async () => {
  const created = await prisma.department.findUnique({ where: { code: `TST-${RUN}-D1` } });
  assert.ok(created);

  const res = await api(`/api/departments/${created!.id}`, adminToken);
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body["id"], created!.id);
  assert.equal(body["structureId"], structAId);
});

// 9. Département inexistant : 404.
test("GET /api/departments/:id renvoie 404 pour un département inconnu", async () => {
  const res = await api("/api/departments/00000000-0000-0000-0000-000000000000", adminToken);
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "DEPARTMENT_NOT_FOUND");
});

// 10. Modification valide : 200.
test("PUT /api/departments/:id modifie les champs autorisés", async () => {
  const created = await prisma.department.findUnique({ where: { code: `TST-${RUN}-D1` } });
  assert.ok(created);

  const res = await api(
    `/api/departments/${created!.id}`,
    adminToken,
    { method: "PUT", body: JSON.stringify({ name: `Dép ${RUN} modifié`, description: "Description modifiée" }) }
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { name: string; description: string };
  assert.equal(body.name, `Dép ${RUN} modifié`);
  assert.equal(body.description, "Description modifiée");

  const audit = await prisma.adminAuditLog.findFirst({
    where: { action: "UPDATE_DEPARTMENT", targetId: created!.id },
  });
  assert.ok(audit, "une trace UPDATE_DEPARTMENT doit exister");
});

// 11. Modification avec structure déjà affectée : 409.
test("PUT /api/departments/:id refuse une structure rattachée à un autre département (409)", async () => {
  // Créer un second département sur structB pour rendre la structure indisponible.
  const otherRes = await api(
    "/api/departments",
    adminToken,
    {
      method: "POST",
      body: JSON.stringify({ name: `Autre ${RUN}`, code: `TST-${RUN}-D2`, structureId: structBId }),
    }
  );
  assert.equal(otherRes.status, 201);
  const otherBody = (await otherRes.json()) as Record<string, unknown>;
  trackDepartment(otherBody["id"] as string);

  const created = await prisma.department.findUnique({ where: { code: `TST-${RUN}-D1` } });
  assert.ok(created);

  const res = await api(
    `/api/departments/${created!.id}`,
    adminToken,
    { method: "PUT", body: JSON.stringify({ structureId: structBId }) }
  );
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "STRUCTURE_ALREADY_ASSIGNED");
});

// 12. Modification conservant sa propre structure : autorisée.
test("PUT /api/departments/:id conserve la propre structure du département", async () => {
  const created = await prisma.department.findUnique({ where: { code: `TST-${RUN}-D1` } });
  assert.ok(created);
  assert.equal(created!.structureId, structAId);

  const res = await api(
    `/api/departments/${created!.id}`,
    adminToken,
    { method: "PUT", body: JSON.stringify({ structureId: structAId, code: `TST-${RUN}-D1` }) }
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { structureId: string };
  assert.equal(body.structureId, structAId);
});

// 13 + 14. Désactivation puis réactivation : 200.
test("PUT /api/departments/:id/status désactive puis réactive un département", async () => {
  const created = await prisma.department.findUnique({ where: { code: `TST-${RUN}-D1` } });
  assert.ok(created);

  const deactivate = await api(
    `/api/departments/${created!.id}/status`,
    adminToken,
    { method: "PUT", body: JSON.stringify({ status: false }) }
  );
  assert.equal(deactivate.status, 200);
  const deactivateBody = (await deactivate.json()) as { status: boolean };
  assert.equal(deactivateBody.status, false);

  const activate = await api(
    `/api/departments/${created!.id}/status`,
    adminToken,
    { method: "PUT", body: JSON.stringify({ status: true }) }
  );
  assert.equal(activate.status, 200);
  const activateBody = (await activate.json()) as { status: boolean };
  assert.equal(activateBody.status, true);

  const audit = await prisma.adminAuditLog.findFirst({
    where: { action: "CHANGE_DEPARTMENT_STATUS", targetId: created!.id },
  });
  assert.ok(audit, "une trace CHANGE_DEPARTMENT_STATUS doit exister");
});

// 15. Vérification des entrées d'audit (aucun secret, types cibles corrects).
test("les traces d'audit des départements ne contiennent aucun secret", async () => {
  const created = await prisma.department.findUnique({ where: { code: `TST-${RUN}-D1` } });
  assert.ok(created);

  const logs = await prisma.adminAuditLog.findMany({
    where: { targetType: "Department", targetId: created!.id },
  });
  assert.ok(logs.length >= 3, "CREATE, UPDATE et CHANGE_STATUS doivent être journalisés");
  const actions = logs.map((l) => l.action);
  assert.ok(actions.includes("CREATE_DEPARTMENT"));
  assert.ok(actions.includes("UPDATE_DEPARTMENT"));
  assert.ok(actions.includes("CHANGE_DEPARTMENT_STATUS"));

  const serialized = JSON.stringify(logs.map((l) => l.details));
  assert.ok(!serialized.toLowerCase().includes("password"));
  assert.ok(!serialized.includes("DeptPass1234"));
});

// Bonus : nom en doublon (contrainte @unique du modèle).
test("POST /api/departments rejette un nom déjà utilisé (409)", async () => {
  const existing = await prisma.department.findUnique({ where: { code: `TST-${RUN}-D1` } });
  assert.ok(existing);

  const res = await api(
    "/api/departments",
    adminToken,
    {
      method: "POST",
      body: JSON.stringify({ name: existing!.name, code: `TST-${RUN}-D3`, structureId: structCId }),
    }
  );
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "NAME_ALREADY_EXISTS");
});

// Bonus : validation (structure manquante).
test("POST /api/departments exige une structure de rattachement", async () => {
  const res = await api(
    "/api/departments",
    adminToken,
    { method: "POST", body: JSON.stringify({ name: "Sans structure", code: `TST-${RUN}-NOSTRUCT` }) }
  );
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "VALIDATION_ERROR");
});

// Bonus : filtres de liste.
test("GET /api/departments filtre par recherche et structure", async () => {
  const res = await api(`/api/departments?search=${RUN}`, adminToken);
  assert.equal(res.status, 200);
  const body = (await res.json()) as Array<{ code: string; name: string }>;
  assert.ok(body.length >= 1);
  assert.ok(body.every((d) => d.code.includes(RUN) || d.name.includes(RUN)));

  const filtered = await api(`/api/departments?structureId=${structCId}`, adminToken);
  assert.equal(filtered.status, 200);
  const filteredBody = (await filtered.json()) as Array<{ structureId: string | null }>;
  assert.ok(filteredBody.every((d) => d.structureId === structCId));
});
