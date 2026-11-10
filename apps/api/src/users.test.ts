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
const createdStructureCodes: string[] = [];

let structId = "";
let adminTechId = "";
let adminTechToken = "";

async function createStructure(code: string): Promise<string> {
  const s = await prisma.structure.create({ data: { code, name: `S ${code}`, type: StructureType.OTHER } });
  createdStructureIds.push(s.id);
  createdStructureCodes.push(code);
  return s.id;
}

async function createUserWithPassword(email: string, password: string): Promise<string> {
  const hash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, firstName: "John", lastName: "Doe", passwordHash: hash, status: UserStatus.ACTIVE },
  });
  userIds.push(user.id);
  return user.id;
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
  const disposeInterruptionCleanup = installInterruptionCleanup(deleteFixtures);

  structId = await createStructure(`TST-${RUN}-C`);

  const techHash = await hashPassword("TechPass1234!");
  const tech = await prisma.user.create({
    data: { email: `tech-${RUN}@t.phase1000.test`, firstName: "Tech", lastName: "Admin", passwordHash: techHash, status: UserStatus.ACTIVE },
  });
  userIds.push(tech.id);
  adminTechId = tech.id;

  // Nettoyage des résidus d'exécutions précédentes : supprimer tout autre
  // TECHNICAL_ADMIN pour garantir qu'adminTechId est le seul au départ.
  await prisma.userStructureRole.deleteMany({
    where: { role: RoleType.TECHNICAL_ADMIN, userId: { not: tech.id } },
  });

  await prisma.userStructureRole.create({
    data: { userId: tech.id, structureId: structId, role: RoleType.TECHNICAL_ADMIN, scope: "*", startDate: new Date(Date.now() - 30 * 86400000), endDate: null },
  });
  adminTechToken = `tok-${RUN}-tech`;
  await prisma.session.create({ data: { userId: tech.id, token: adminTechToken, expiresAt: new Date(Date.now() + 3600000) } });

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

test("GET /api/users est réservé aux TECHNICAL_ADMIN", async () => {
  const managerHash = await hashPassword("ManagerPass1234!");
  const manager = await prisma.user.create({ data: { email: `mgr-${RUN}@t.phase1000.test`, firstName: "M", lastName: "Gr", passwordHash: managerHash, status: UserStatus.ACTIVE } });
  userIds.push(manager.id);
  await prisma.userStructureRole.create({
    data: { userId: manager.id, structureId: structId, role: RoleType.DPMG_MANAGER, scope: "*" },
  });
  const managerToken = `tok-${RUN}-mgr`;
  await prisma.session.create({ data: { userId: manager.id, token: managerToken, expiresAt: new Date(Date.now() + 3600000) } });

  const res = await api("/api/users", managerToken);
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "FORBIDDEN");
});

test("GET /api/users/audit-logs est une route statique (résolution avant /:id)", async () => {
  const res = await api("/api/users/audit-logs", adminTechToken);
  assert.equal(res.status, 200);
  const body = (await res.json()) as Array<{ action: string }>;
  assert.ok(Array.isArray(body));
});

test("POST /api/users crée un utilisateur avec mot de passe temporaire (mustChangePassword)", async () => {
  const res = await api(
    "/api/users",
    adminTechToken,
    {
      method: "POST",
      body: JSON.stringify({
        email: `new-${RUN}@t.phase1000.test`,
        firstName: "New",
        lastName: "User",
        phone: null,
        status: "ACTIVE",
        password: "TempPass1234!",
        roles: [{ role: "EMPLOYEE", structureId: structId, scope: "*" }],
      }),
    }
  );
  assert.equal(res.status, 201);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body["mustChangePassword"], true);
  assert.equal("passwordHash" in body, false);
  assert.equal(typeof body["id"], "string");

  const created = await prisma.user.findUnique({ where: { email: `new-${RUN}@t.phase1000.test` } });
  assert.ok(created);
  assert.equal(created.mustChangePassword, true);
  assert.notEqual(created.passwordHash, "TempPass1234!");
});

test("GET /api/users/:id renvoie le détail sans passwordHash", async () => {
  const created = await prisma.user.findUnique({ where: { email: `new-${RUN}@t.phase1000.test` } });
  assert.ok(created);
  const res = await api(`/api/users/${created!.id}`, adminTechToken);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { user: Record<string, unknown>; roles: unknown[] };
  assert.equal("passwordHash" in body.user, false);
  assert.equal(typeof body.user["mustChangePassword"], "boolean");
  assert.ok(Array.isArray(body.roles));
});

test("PUT /api/users/:id modifie les informations autorisées", async () => {
  const created = await prisma.user.findUnique({ where: { email: `new-${RUN}@t.phase1000.test` } });
  assert.ok(created);
  const res = await api(
    `/api/users/${created!.id}`,
    adminTechToken,
    {
      method: "PUT",
      body: JSON.stringify({ firstName: "Updated", lastName: "Name", phone: "+33000000000" }),
    }
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { firstName: string };
  assert.equal(body.firstName, "Updated");
});

test("PUT /api/users/:id/status interdit l'auto-désactivation", async () => {
  const res = await api(
    `/api/users/${adminTechId}/status`,
    adminTechToken,
    { method: "PUT", body: JSON.stringify({ status: "DISABLED" }) }
  );
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "SELF_DISABLE_FORBIDDEN");
});

test("PUT /api/users/:id/status bascule un compte entre ACTIVE et DISABLED", async () => {
  const targetHash = await hashPassword("TargetPass1234!");
  const target = await prisma.user.create({ data: { email: `target-${RUN}@t.phase1000.test`, firstName: "T", lastName: "Arget", passwordHash: targetHash, status: UserStatus.ACTIVE } });
  userIds.push(target.id);

  const disableRes = await api(`/api/users/${target.id}/status`, adminTechToken, { method: "PUT", body: JSON.stringify({ status: "DISABLED" }) });
  assert.equal(disableRes.status, 200);

  const enableRes = await api(`/api/users/${target.id}/status`, adminTechToken, { method: "PUT", body: JSON.stringify({ status: "ACTIVE" }) });
  assert.equal(enableRes.status, 200);
});

test("PUT /api/users/:id/roles/:roleId refuse de rendre le dernier administrateur technique inactive", async () => {
  const role = await prisma.userStructureRole.findFirst({ where: { userId: adminTechId, role: RoleType.TECHNICAL_ADMIN } });
  assert.ok(role);

  const res = await api(
    `/api/users/${adminTechId}/roles/${role!.id}`,
    adminTechToken,
    { method: "PUT", body: JSON.stringify({ endDate: new Date(Date.now() - 2 * 86400000).toISOString() }) }
  );
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "LAST_TECHNICAL_ADMIN");
});

test("POST /api/users/:id/reset-password réinitialise et invalide les sessions", async () => {
  const created = await prisma.user.findUnique({ where: { email: `new-${RUN}@t.phase1000.test` } });
  assert.ok(created);

  const tempToken = `tok-${RUN}-temp`;
  await prisma.session.create({ data: { userId: created!.id, token: tempToken, expiresAt: new Date(Date.now() + 3600000) } });

  const res = await api(
    `/api/users/${created!.id}/reset-password`,
    adminTechToken,
    { method: "POST", body: JSON.stringify({ password: "TempPass1234!" }) }
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { temporaryPassword: string; success: boolean };
  assert.equal(body.temporaryPassword, "TempPass1234!");
  assert.equal(body.success, true);

  const updated = await prisma.user.findUnique({ where: { email: `new-${RUN}@t.phase1000.test` } });
  assert.ok(updated);
  assert.equal(updated.mustChangePassword, true);

  const sessionCheck = await api("/api/auth/me", tempToken);
  assert.equal(sessionCheck.status, 401);
});

test("le changement obligatoire de mot de passe autorise change-password puis réouvre l'accès", async () => {
  const userId = await createUserWithPassword(`mcp-${RUN}@t.phase1000.test`, "McpPass1234!");

  await prisma.user.update({
    where: { id: userId },
    data: { mustChangePassword: true },
  });

  const token = `tok-${RUN}-mcp`;
  await prisma.session.create({ data: { userId, token, expiresAt: new Date(Date.now() + 3600000) } });

  const blocked = await api("/api/users", token);
  assert.equal(blocked.status, 403);
  const blockedBody = (await blocked.json()) as { code: string };
  assert.equal(blockedBody.code, "MUST_CHANGE_PASSWORD");

  const changeRes = await api(
    "/api/auth/change-password",
    token,
    {
      method: "POST",
      body: JSON.stringify({ currentPassword: "McpPass1234!", newPassword: "NewPass1234!" }),
    }
  );
  assert.equal(changeRes.status, 200);
  const changeBody = (await changeRes.json()) as { mustChangePassword: boolean };
  assert.equal(changeBody.mustChangePassword, false);

  const updatedUser = await prisma.user.findUnique({ where: { id: userId } });
  assert.ok(updatedUser);
  assert.equal(updatedUser.mustChangePassword, false);

  const allowedRes = await api("/api/auth/me", token);
  assert.equal(allowedRes.status, 200);
  const allowedBody = (await allowedRes.json()) as { user: { mustChangePassword: boolean } };
  assert.equal(allowedBody.user.mustChangePassword, false);
});

test("le journal d'audit persiste les événements d'administration sans données sensibles", async () => {
  const res = await api("/api/users/audit-logs", adminTechToken);
  assert.equal(res.status, 200);
  const body = (await res.json()) as Array<{
    action: string;
    details: Record<string, unknown> | null;
    createdAt: string;
  }>;
  assert.ok(body.length > 0);
  const actions = body.map((l) => l.action);
  assert.ok(actions.includes("CREATE_USER") || actions.includes("UPDATE_USER"));
  const resetLog = body.find((l) => l.action === "RESET_PASSWORD");
  assert.ok(resetLog);
  const detailsJson = JSON.stringify(resetLog.details ?? {});
  assert.ok(!detailsJson.includes("TempPass1234"));
  assert.ok(!detailsJson.includes("password"));
});

test("POST /api/users crée un TECHNICAL_ADMIN global sans structure (scope = '*')", async () => {
  const res = await api(
    "/api/users",
    adminTechToken,
    {
      method: "POST",
      body: JSON.stringify({
        email: `global-tech-${RUN}@t.phase1000.test`,
        firstName: "Global",
        lastName: "Tech",
        phone: null,
        status: "ACTIVE",
        password: "GlobalTech1234!",
        roles: [{ role: "TECHNICAL_ADMIN", structureId: null, scope: "*" }],
      }),
    }
  );
  assert.equal(res.status, 201);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(typeof body["id"], "string");
  assert.equal(body["mustChangePassword"], true);
  assert.equal("passwordHash" in body, false);

  const created = await prisma.user.findUnique({ where: { email: `global-tech-${RUN}@t.phase1000.test` } });
  assert.ok(created);
  userIds.push(created!.id);

  const role = await prisma.userStructureRole.findFirst({
    where: { userId: created!.id, role: RoleType.TECHNICAL_ADMIN },
  });
  assert.ok(role);
  assert.equal(role!.structureId, null);
  assert.equal(role!.scope, "*");
});

test("POST /api/users rejette un rôle métier sans structureId", async () => {
  const res = await api(
    "/api/users",
    adminTechToken,
    {
      method: "POST",
      body: JSON.stringify({
        email: `no-struct-${RUN}@t.phase1000.test`,
        firstName: "No",
        lastName: "Structure",
        phone: null,
        status: "ACTIVE",
        password: "NoStruct1234!",
        roles: [{ role: "EMPLOYEE", structureId: null, scope: null }],
      }),
    }
  );
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string; details?: Record<string, unknown> };
  assert.equal(body.code, "VALIDATION_ERROR");
});

test("POST /api/users attribue le périmètre global à un TECHNICAL_ADMIN sans structureId omis", async () => {
  const res = await api(
    "/api/users",
    adminTechToken,
    {
      method: "POST",
      body: JSON.stringify({
        email: `omitted-struct-${RUN}@t.phase1000.test`,
        firstName: "Omitted",
        lastName: "Structure",
        phone: null,
        status: "ACTIVE",
        password: "Omitted1234!",
        roles: [{ role: "TECHNICAL_ADMIN" }],
      }),
    }
  );
  assert.equal(res.status, 201);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(typeof body["id"], "string");

  const created = await prisma.user.findUnique({ where: { email: `omitted-struct-${RUN}@t.phase1000.test` } });
  assert.ok(created);
  userIds.push(created!.id);

  const role = await prisma.userStructureRole.findFirst({
    where: { userId: created!.id, role: RoleType.TECHNICAL_ADMIN },
  });
  assert.ok(role);
  assert.equal(role!.structureId, null);
  assert.equal(role!.scope, "*");
});

test("POST /api/auth/login pour un TECHNICAL_ADMIN global : pas de structure, scope = '*', aucun rôle métier", async () => {
  // Créer un TECHNICAL_ADMIN global
  const createRes = await api(
    "/api/users",
    adminTechToken,
    {
      method: "POST",
      body: JSON.stringify({
        email: `connect-global-${RUN}@t.phase1000.test`,
        firstName: "Connect",
        lastName: "Global",
        phone: null,
        status: "ACTIVE",
        password: "ConnectGlobal1234!",
        roles: [{ role: "TECHNICAL_ADMIN" }],
      }),
    }
  );
  assert.equal(createRes.status, 201);

  // Login avec ce compte (le token est en cookie, pas dans le body)
  const loginRes = await api("/api/auth/login", undefined, {
    method: "POST",
    body: JSON.stringify({
      email: `connect-global-${RUN}@t.phase1000.test`,
      password: "ConnectGlobal1234!",
    }),
  });
  assert.equal(loginRes.status, 200);

  const loginBody = (await loginRes.json()) as {
    user: Record<string, unknown>;
    roles: Array<{ role: string; structureId: string | null; scope: string | null }>;
  };
  assert.ok(Array.isArray(loginBody.roles));
  const techRoles = loginBody.roles.filter((r) => r.role === "TECHNICAL_ADMIN");
  assert.equal(techRoles.length, 1);
  const techRole = techRoles[0];
  assert.ok(techRole);
  assert.equal(techRole!.structureId, null);
  assert.equal(techRole!.scope, "*");
  // Aucun rôle métier
  const metierRoles = loginBody.roles.filter((r) =>
    !["TECHNICAL_ADMIN"].includes(r.role)
  );
  assert.equal(metierRoles.length, 0);
});

test("POST /api/auth/login rejette un TECHNICAL_ADMIN global avec mauvais mot de passe", async () => {
  const loginRes = await api("/api/auth/login", undefined, {
    method: "POST",
    body: JSON.stringify({
      email: `connect-global-${RUN}@t.phase1000.test`,
      password: "WrongPassword1234!",
    }),
  });
  assert.equal(loginRes.status, 401);
});

test("Konan peut modifier un utilisateur ordinaire", async () => {
  const targetHash = await hashPassword("OrdinaryPass1234!");
  const target = await prisma.user.create({
    data: { email: `ordinary-${RUN}@t.phase1000.test`, firstName: "Ordinary", lastName: "User", passwordHash: targetHash, status: UserStatus.ACTIVE },
  });
  userIds.push(target.id);

  const res = await api(
    `/api/users/${target.id}`,
    adminTechToken,
    { method: "PUT", body: JSON.stringify({ firstName: "Updated", lastName: "Name" }) }
  );
  assert.equal(res.status, 200);
});

test("Konan peut réinitialiser le mot de passe d'un utilisateur ordinaire", async () => {
  const target = await prisma.user.findUnique({ where: { email: `new-${RUN}@t.phase1000.test` } });
  assert.ok(target);

  const res = await api(
    `/api/users/${target!.id}/reset-password`,
    adminTechToken,
    { method: "POST", body: JSON.stringify({ password: "TempPass1234!" }) }
  );
  assert.equal(res.status, 200);
});

test("Konan ne peut pas modifier un autre TECHNICAL_ADMIN", async () => {
  const otherTechHash = await hashPassword("OtherTechPass1234!");
  const otherTech = await prisma.user.create({
    data: { email: `other-tech-${RUN}@t.phase1000.test`, firstName: "Other", lastName: "Tech", passwordHash: otherTechHash, status: UserStatus.ACTIVE },
  });
  userIds.push(otherTech.id);
  await prisma.userStructureRole.create({
    data: { userId: otherTech.id, structureId: structId, role: RoleType.TECHNICAL_ADMIN, scope: "*", startDate: new Date(Date.now() - 30 * 86400000), endDate: null },
  });

  const res = await api(
    `/api/users/${otherTech.id}`,
    adminTechToken,
    { method: "PUT", body: JSON.stringify({ firstName: "Hacked", lastName: "Name" }) }
  );
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "TECHNICAL_ADMIN_PROTECTED");
});

test("Konan ne peut pas désactiver un autre TECHNICAL_ADMIN", async () => {
  const otherTechHash = await hashPassword("OtherTechPass1234!");
  const otherTech = await prisma.user.create({
    data: { email: `other-tech2-${RUN}@t.phase1000.test`, firstName: "Other", lastName: "Tech2", passwordHash: otherTechHash, status: UserStatus.ACTIVE },
  });
  userIds.push(otherTech.id);
  await prisma.userStructureRole.create({
    data: { userId: otherTech.id, structureId: structId, role: RoleType.TECHNICAL_ADMIN, scope: "*", startDate: new Date(Date.now() - 30 * 86400000), endDate: null },
  });

  const res = await api(
    `/api/users/${otherTech.id}/status`,
    adminTechToken,
    { method: "PUT", body: JSON.stringify({ status: "DISABLED" }) }
  );
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "TECHNICAL_ADMIN_PROTECTED");
});

test("Konan ne peut pas réinitialiser le mot de passe d'un autre TECHNICAL_ADMIN", async () => {
  const otherTechHash = await hashPassword("OtherTechPass1234!");
  const otherTech = await prisma.user.create({
    data: { email: `other-tech3-${RUN}@t.phase1000.test`, firstName: "Other", lastName: "Tech3", passwordHash: otherTechHash, status: UserStatus.ACTIVE },
  });
  userIds.push(otherTech.id);
  await prisma.userStructureRole.create({
    data: { userId: otherTech.id, structureId: structId, role: RoleType.TECHNICAL_ADMIN, scope: "*", startDate: new Date(Date.now() - 30 * 86400000), endDate: null },
  });

  const res = await api(
    `/api/users/${otherTech.id}/reset-password`,
    adminTechToken,
    { method: "POST", body: JSON.stringify({ password: "TempPass1234!" }) }
  );
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "TECHNICAL_ADMIN_PROTECTED");
});

test("Konan ne peut pas ajouter le rôle TECHNICAL_ADMIN à un autre compte", async () => {
  const ordinaryHash = await hashPassword("OrdinaryPass1234!");
  const ordinary = await prisma.user.create({
    data: { email: `ordinary2-${RUN}@t.phase1000.test`, firstName: "Ordinary", lastName: "User2", passwordHash: ordinaryHash, status: UserStatus.ACTIVE },
  });
  userIds.push(ordinary.id);
  await prisma.userStructureRole.create({
    data: { userId: ordinary.id, structureId: structId, role: RoleType.EMPLOYEE, scope: "*", startDate: new Date(Date.now() - 30 * 86400000), endDate: null },
  });

  const res = await api(
    `/api/users/${ordinary.id}/roles`,
    adminTechToken,
    { method: "POST", body: JSON.stringify({ role: "TECHNICAL_ADMIN", structureId: structId, scope: "*" }) }
  );
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "TECHNICAL_ADMIN_PROTECTED");
});

test("Konan ne peut pas retirer le rôle TECHNICAL_ADMIN d'un autre compte", async () => {
  const otherTechHash = await hashPassword("OtherTechPass1234!");
  const otherTech = await prisma.user.create({
    data: { email: `other-tech4-${RUN}@t.phase1000.test`, firstName: "Other", lastName: "Tech4", passwordHash: otherTechHash, status: UserStatus.ACTIVE },
  });
  userIds.push(otherTech.id);
  const role = await prisma.userStructureRole.create({
    data: { userId: otherTech.id, structureId: structId, role: RoleType.TECHNICAL_ADMIN, scope: "*", startDate: new Date(Date.now() - 30 * 86400000), endDate: null },
  });

  const res = await api(
    `/api/users/${otherTech.id}/roles/${role.id}`,
    adminTechToken,
    { method: "DELETE" }
  );
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "TECHNICAL_ADMIN_PROTECTED");
});

test("Konan ne peut pas modifier les habilitations d'un autre TECHNICAL_ADMIN", async () => {
  const otherTechHash = await hashPassword("OtherTechPass1234!");
  const otherTech = await prisma.user.create({
    data: { email: `other-tech5-${RUN}@t.phase1000.test`, firstName: "Other", lastName: "Tech5", passwordHash: otherTechHash, status: UserStatus.ACTIVE },
  });
  userIds.push(otherTech.id);
  const role = await prisma.userStructureRole.create({
    data: { userId: otherTech.id, structureId: structId, role: RoleType.TECHNICAL_ADMIN, scope: "*", startDate: new Date(Date.now() - 30 * 86400000), endDate: null },
  });

  const res = await api(
    `/api/users/${otherTech.id}/roles/${role.id}`,
    adminTechToken,
    { method: "PUT", body: JSON.stringify({ scope: "LIMITED" }) }
  );
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "TECHNICAL_ADMIN_PROTECTED");
});

test("la protection du dernier administrateur technique fonctionne toujours", async () => {
  // Nettoyer les autres TECHNICAL_ADMIN créés par les tests précédents
  // pour garantir qu'adminTechId est le dernier actif.
  await prisma.userStructureRole.deleteMany({
    where: { role: RoleType.TECHNICAL_ADMIN, userId: { not: adminTechId } },
  });

  const role = await prisma.userStructureRole.findFirst({ where: { userId: adminTechId, role: RoleType.TECHNICAL_ADMIN } });
  assert.ok(role);

  const res = await api(
    `/api/users/${adminTechId}/roles/${role!.id}`,
    adminTechToken,
    { method: "PUT", body: JSON.stringify({ endDate: new Date(Date.now() - 2 * 86400000).toISOString() }) }
  );
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "LAST_TECHNICAL_ADMIN");
});


test("SUPER_ADMIN peut créer un utilisateur avec le rôle SUPER_ADMIN", async () => {
  const refuseRes = await api(
    "/api/users",
    adminTechToken,
    {
      method: "POST",
      body: JSON.stringify({
        email: `super-refuse-${RUN}@t.phase1000.test`,
        firstName: "Refuse",
        lastName: "Super",
        phone: null,
        status: "ACTIVE",
        password: "SuperRefuse1234!",
        roles: [{ role: "SUPER_ADMIN", structureId: null, scope: "*" }],
      }),
    }
  );
  assert.equal(refuseRes.status, 403);
  const refuseBody = (await refuseRes.json()) as { code: string };
  assert.equal(refuseBody.code, "SUPER_ADMIN_PROTECTED");
});

test("SUPER_ADMIN peut modifier un TECHNICAL_ADMIN", async () => {
  const superHash = await hashPassword("SuperPass1234!");
  const superUser = await prisma.user.create({
    data: { email: `super-${RUN}@t.phase1000.test`, firstName: "Super", lastName: "Admin", passwordHash: superHash, status: UserStatus.ACTIVE },
  });
  userIds.push(superUser.id);
  await prisma.userStructureRole.create({
    data: { userId: superUser.id, structureId: structId, role: RoleType.SUPER_ADMIN, scope: "*", startDate: new Date(Date.now() - 30 * 86400000), endDate: null },
  });
  const superToken = `tok-${RUN}-super`;
  await prisma.session.create({ data: { userId: superUser.id, token: superToken, expiresAt: new Date(Date.now() + 3600000) } });

  const techHash = await hashPassword("TechTarget1234!");
  const techTarget = await prisma.user.create({
    data: { email: `tech-target-${RUN}@t.phase1000.test`, firstName: "Tech", lastName: "Target", passwordHash: techHash, status: UserStatus.ACTIVE },
  });
  userIds.push(techTarget.id);
  await prisma.userStructureRole.create({
    data: { userId: techTarget.id, structureId: structId, role: RoleType.TECHNICAL_ADMIN, scope: "*", startDate: new Date(Date.now() - 30 * 86400000), endDate: null },
  });

  const res = await api(
    `/api/users/${techTarget.id}`,
    superToken,
    { method: "PUT", body: JSON.stringify({ firstName: "Modified", lastName: "Name" }) }
  );
  assert.equal(res.status, 200);
});

test("SUPER_ADMIN peut réinitialiser le mot de passe d'un TECHNICAL_ADMIN", async () => {
  const superHash = await hashPassword("SuperPass1234!");
  const superUser = await prisma.user.create({
    data: { email: `super2-${RUN}@t.phase1000.test`, firstName: "Super", lastName: "Two", passwordHash: superHash, status: UserStatus.ACTIVE },
  });
  userIds.push(superUser.id);
  await prisma.userStructureRole.create({
    data: { userId: superUser.id, structureId: structId, role: RoleType.SUPER_ADMIN, scope: "*", startDate: new Date(Date.now() - 30 * 86400000), endDate: null },
  });
  const superToken = `tok-${RUN}-super2`;
  await prisma.session.create({ data: { userId: superUser.id, token: superToken, expiresAt: new Date(Date.now() + 3600000) } });

  const techHash = await hashPassword("TechTarget21234!");
  const techTarget = await prisma.user.create({
    data: { email: `tech-target2-${RUN}@t.phase1000.test`, firstName: "Tech", lastName: "Target2", passwordHash: techHash, status: UserStatus.ACTIVE },
  });
  userIds.push(techTarget.id);
  await prisma.userStructureRole.create({
    data: { userId: techTarget.id, structureId: structId, role: RoleType.TECHNICAL_ADMIN, scope: "*", startDate: new Date(Date.now() - 30 * 86400000), endDate: null },
  });

  const res = await api(
    `/api/users/${techTarget.id}/reset-password`,
    superToken,
    { method: "POST", body: JSON.stringify({ password: "TempPass1234!" }) }
  );
  assert.equal(res.status, 200);
});

test("TECHNICAL_ADMIN ne peut pas modifier un SUPER_ADMIN", async () => {
  const superHash = await hashPassword("SuperPass1234!");
  const superUser = await prisma.user.create({
    data: { email: `super3-${RUN}@t.phase1000.test`, firstName: "Super", lastName: "Three", passwordHash: superHash, status: UserStatus.ACTIVE },
  });
  userIds.push(superUser.id);
  await prisma.userStructureRole.create({
    data: { userId: superUser.id, structureId: structId, role: RoleType.SUPER_ADMIN, scope: "*", startDate: new Date(Date.now() - 30 * 86400000), endDate: null },
  });

  const res = await api(
    `/api/users/${superUser.id}`,
    adminTechToken,
    { method: "PUT", body: JSON.stringify({ firstName: "Hacked", lastName: "Name" }) }
  );
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "TECHNICAL_ADMIN_PROTECTED");
});

test("TECHNICAL_ADMIN ne peut pas ajouter le rôle SUPER_ADMIN à un autre compte", async () => {
  const ordinaryHash = await hashPassword("OrdinaryPass1234!");
  const ordinary = await prisma.user.create({
    data: { email: `ordinary-super-${RUN}@t.phase1000.test`, firstName: "Ordinary", lastName: "User", passwordHash: ordinaryHash, status: UserStatus.ACTIVE },
  });
  userIds.push(ordinary.id);
  await prisma.userStructureRole.create({
    data: { userId: ordinary.id, structureId: structId, role: RoleType.EMPLOYEE, scope: "*", startDate: new Date(Date.now() - 30 * 86400000), endDate: null },
  });

  const res = await api(
    `/api/users/${ordinary.id}/roles`,
    adminTechToken,
    { method: "POST", body: JSON.stringify({ role: "SUPER_ADMIN", structureId: structId, scope: "*" }) }
  );
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "SUPER_ADMIN_PROTECTED");
});

test("la protection du dernier super administrateur fonctionne", async () => {
  const superHash = await hashPassword("SuperPass1234!");
  const superUser = await prisma.user.create({
    data: { email: `super-last-${RUN}@t.phase1000.test`, firstName: "Super", lastName: "Last", passwordHash: superHash, status: UserStatus.ACTIVE },
  });
  userIds.push(superUser.id);
  const role = await prisma.userStructureRole.create({
    data: { userId: superUser.id, structureId: structId, role: RoleType.SUPER_ADMIN, scope: "*", startDate: new Date(Date.now() - 30 * 86400000), endDate: null },
  });

  const res = await api(
    `/api/users/${superUser.id}/status`,
    adminTechToken,
    { method: "PUT", body: JSON.stringify({ status: "DISABLED" }) }
  );
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "TECHNICAL_ADMIN_PROTECTED");
});

test("les réponses de rôle exposent l'id réel UserStructureRole et PUT/DELETE l'utilisent", async () => {
  const targetId = await createUserWithPassword(`role-id-${RUN}@t.phase1000.test`, "RoleIdPass1234!");
  const dbRole = await prisma.userStructureRole.create({
    data: { userId: targetId, structureId: structId, role: RoleType.EMPLOYEE, scope: "*", startDate: new Date(Date.now() - 30 * 86400000), endDate: null },
  });

  // 1. GET détail : chaque rôle porte son vrai id Prisma (cuid).
  const getRes = await api(`/api/users/${targetId}`, adminTechToken);
  assert.equal(getRes.status, 200);
  const getBody = (await getRes.json()) as { roles: Array<{ id: string; role: string; structureId: string | null }> };
  assert.equal(getBody.roles.length, 1);
  assert.equal(getBody.roles[0]!.id, dbRole.id, "L'id retourné doit être l'identifiant réel de la ligne UserStructureRole");

  // 2. PUT avec le vrai id → 200.
  const putRes = await api(
    `/api/users/${targetId}/roles/${dbRole.id}`,
    adminTechToken,
    { method: "PUT", body: JSON.stringify({ scope: "extended" }) }
  );
  assert.equal(putRes.status, 200);
  const updated = await prisma.userStructureRole.findUnique({ where: { id: dbRole.id } });
  assert.equal(updated?.scope, "extended");

  // 3. Un id synthétique (index de tableau, comme l'ancien frontend l'envoyait) → 404.
  const fakeRes = await api(
    `/api/users/${targetId}/roles/0`,
    adminTechToken,
    { method: "PUT", body: JSON.stringify({ scope: "nope" }) }
  );
  assert.equal(fakeRes.status, 404);

  // 4. DELETE avec le vrai id → la ligne disparaît.
  const delRes = await api(`/api/users/${targetId}/roles/${dbRole.id}`, adminTechToken, { method: "DELETE" });
  assert.equal(delRes.status, 200);
  const gone = await prisma.userStructureRole.findUnique({ where: { id: dbRole.id } });
  assert.equal(gone, null);
});

test("SUPER_ADMIN peut attribuer SUPER_ADMIN sans structureId (rôle global)", async () => {
  const superHash = await hashPassword("SuperPass1234!");
  const superUser = await prisma.user.create({
    data: { email: `super-assign-${RUN}@t.phase1000.test`, firstName: "Super", lastName: "Assign", passwordHash: superHash, status: UserStatus.ACTIVE },
  });
  userIds.push(superUser.id);
  await prisma.userStructureRole.create({
    data: { userId: superUser.id, structureId: structId, role: RoleType.SUPER_ADMIN, scope: "*", startDate: new Date(Date.now() - 30 * 86400000), endDate: null },
  });
  const superToken = `tok-${RUN}-super-assign`;
  await prisma.session.create({ data: { userId: superUser.id, token: superToken, expiresAt: new Date(Date.now() + 3600000) } });

  const targetId = await createUserWithPassword(`super-target-${RUN}@t.phase1000.test`, "SuperTarget1234!");

  // structureId null accepté pour SUPER_ADMIN (rôle global), contrairement à l'ancien 400.
  const res = await api(
    `/api/users/${targetId}/roles`,
    superToken,
    { method: "POST", body: JSON.stringify({ role: "SUPER_ADMIN", structureId: null, scope: "*" }) }
  );
  assert.equal(res.status, 204);

  const getRes = await api(`/api/users/${targetId}`, superToken);
  assert.equal(getRes.status, 200);
  const getBody = (await getRes.json()) as { roles: Array<{ id: string; role: string; structureId: string | null; scope: string | null }> };
  const assigned = getBody.roles.find((r) => r.role === "SUPER_ADMIN");
  assert.ok(assigned, "Le rôle SUPER_ADMIN doit être présent");
  assert.equal(assigned!.structureId, null, "Un SUPER_ADMIN global n'a pas de structure");
  assert.equal(assigned!.scope, "*");
  assert.ok(assigned!.id, "Le rôle attribué doit aussi exposer son id réel");
});

test("TECHNICAL_ADMIN ne peut pas attribuer SUPER_ADMIN même sans structureId (global)", async () => {
  const targetId = await createUserWithPassword(`tech-null-super-${RUN}@t.phase1000.test`, "TechNullSup1234!");

  const res = await api(
    `/api/users/${targetId}/roles`,
    adminTechToken,
    { method: "POST", body: JSON.stringify({ role: "SUPER_ADMIN", structureId: null, scope: "*" }) }
  );
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "SUPER_ADMIN_PROTECTED");
});
