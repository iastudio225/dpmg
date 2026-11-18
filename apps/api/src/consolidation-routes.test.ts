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

let managerToken = "";
let employeeToken = "";
let authorId = "";
let demandeId = "";
let consolidationId = "";

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

  const makeUser = async (tag: string, role: RoleType, scope: string) => {
    const u = await prisma.user.create({
      data: {
        email: `${tag}-${RUN}@t.consroutes.test`,
        firstName: tag,
        lastName: RUN,
        passwordHash: await hashPassword("Pass1234!"),
        status: UserStatus.ACTIVE,
      },
    });
    userIds.push(u.id);
    await prisma.userStructureRole.create({
      data: {
        userId: u.id,
        structureId: struct.id,
        role,
        scope,
        startDate: new Date(Date.now() - 86400000),
      },
    });
    const token = `tok-${tag}-${RUN}`;
    await prisma.session.create({
      data: { userId: u.id, token, expiresAt: new Date(Date.now() + 3600000) },
    });
    return { user: u, token };
  };

  const manager = await makeUser("dpmg", RoleType.DPMG_MANAGER, "*");
  managerToken = manager.token;
  const employee = await makeUser("emp", RoleType.EMPLOYEE, `TST-${RUN}-D`);
  employeeToken = employee.token;

  const author = await prisma.user.create({
    data: {
      email: `author-${RUN}@t.consroutes.test`,
      firstName: "Author",
      lastName: RUN,
      passwordHash: await hashPassword("Pass1234!"),
      status: UserStatus.ACTIVE,
    },
  });
  userIds.push(author.id);
  authorId = author.id;

  const demande = await prisma.demande.create({
    data: {
      reference: `TST-${RUN}-DEM`,
      title: "Demande de test",
      description: "Test",
      category: "INFRASTRUCTURE",
      departmentId: dept.id,
      authorId: author.id,
      status: DemandeStatus.EN_ATTENTE_DECISION,
      submittedAt: new Date(),
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
    await runCleanupSteps([
      [
        "decisions",
        () =>
          prisma.demandeDecision.deleteMany({
            where: { demandeId: { in: createdDemandeIds } },
          }),
      ],
      [
        "audits",
        () => prisma.adminAuditLog.deleteMany({ where: { actorId: { in: userIds } } }),
      ],
      [
        "consolidations",
        () => prisma.consolidation.deleteMany({ where: { id: { in: createdConsolidationIds } } }),
      ],
      [
        "demandes",
        () => prisma.demande.deleteMany({ where: { id: { in: createdDemandeIds } } }),
      ],
      [
        "sessions",
        () => prisma.session.deleteMany({ where: { userId: { in: userIds } } }),
      ],
      [
        "roles",
        () => prisma.userStructureRole.deleteMany({ where: { userId: { in: userIds } } }),
      ],
      ["users", () => prisma.user.deleteMany({ where: { id: { in: userIds } } })],
      [
        "departments",
        () => prisma.department.deleteMany({ where: { id: { in: createdDepartmentIds } } }),
      ],
      [
        "structures",
        () => prisma.structure.deleteMany({ where: { id: { in: createdStructureIds } } }),
      ],
    ]);
  } finally {
    await closeTestServer(server).catch(() => {});
    if (prisma) await prisma.$disconnect().catch(() => {});
  }
});

test("création d'une consolidation par le DPMG (POST /api/consolidations)", async () => {
  const res = await api("/api/consolidations", managerToken, {
    method: "POST",
    body: JSON.stringify({
      periodStart: "2026-11-09T00:00:00.000Z",
      periodEnd: "2026-11-15T23:59:59.000Z",
    }),
  });
  assert.equal(res.status, 201);
  const body = (await res.json()) as { id: string; reference: string; status: string };
  assert.equal(body.status, "BROUILLON");
  assert.match(body.reference, /^CONS-\d{4}-W\d{2}/);
  consolidationId = body.id;
  createdConsolidationIds.push(body.id);
});

test("création refusée pour un utilisateur sans rôle DPMG (403)", async () => {
  const res = await api("/api/consolidations", employeeToken, {
    method: "POST",
    body: JSON.stringify({
      periodStart: "2026-11-09T00:00:00.000Z",
      periodEnd: "2026-11-15T23:59:59.000Z",
    }),
  });
  assert.equal(res.status, 403);
});

test("rattachement d'une demande (POST /:id/demandes)", async () => {
  const res = await api(`/api/consolidations/${consolidationId}/demandes`, managerToken, {
    method: "POST",
    body: JSON.stringify({ demandeIds: [demandeId] }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { demandes: Array<{ id: string }> };
  assert.equal(body.demandes.length, 1);
  assert.equal(body.demandes[0]!.id, demandeId);
});

test("la demande rattachée expose consolidationId dans sa réponse", async () => {
  const res = await api(`/api/demandes/${demandeId}`, managerToken);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { consolidationId: string | null };
  assert.equal(body.consolidationId, consolidationId);
});

test("complétude des avis : GET /:id/avis signale l'avis manquant", async () => {
  const res = await api(`/api/consolidations/${consolidationId}/avis`, managerToken);
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    complete: boolean;
    totalDemandes: number;
    demandesSansAvis: number;
  };
  assert.equal(body.complete, false);
  assert.equal(body.totalDemandes, 1);
  assert.equal(body.demandesSansAvis, 1);
});

test("transmission refusée tant que l'avis départemental manque (409)", async () => {
  const res = await api(`/api/consolidations/${consolidationId}/transmettre`, managerToken, {
    method: "POST",
  });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "CONSOLIDATION_AVIS_INCOMPLET");
});

test("transmission réussie après enregistrement de l'avis (POST /:id/transmettre)", async () => {
  await prisma.demandeDecision.create({
    data: {
      demandeId,
      actorId: authorId,
      type: "AVIS_DEPARTEMENTAL",
      motif: "Avis favorable",
      commentaire: null,
    },
  });

  const res = await api(`/api/consolidations/${consolidationId}/transmettre`, managerToken, {
    method: "POST",
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { status: string; transmittedAt: string | null };
  assert.equal(body.status, "TRANSMISE");
  assert.ok(body.transmittedAt);
});

test("l'ancien chemin /transmit n'existe pas : 404 (contrat d'URL figé)", async () => {
  const res = await api(`/api/consolidations/${consolidationId}/transmit`, managerToken, {
    method: "POST",
  });
  assert.equal(res.status, 404);
});

test("double transmission refusée (409)", async () => {
  const res = await api(`/api/consolidations/${consolidationId}/transmettre`, managerToken, {
    method: "POST",
  });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "CONSOLIDATION_NOT_DRAFT");
});

test("suppression refusée sur une consolidation transmise (409)", async () => {
  const res = await api(`/api/consolidations/${consolidationId}`, managerToken, {
    method: "DELETE",
  });
  assert.equal(res.status, 409);
});

test("la liste du manager contient la consolidation transmise", async () => {
  const res = await api("/api/consolidations", managerToken);
  assert.equal(res.status, 200);
  const body = (await res.json()) as Array<{ id: string; status: string }>;
  const found = body.find((c) => c.id === consolidationId);
  assert.ok(found, "consolidation absente de la liste");
  assert.equal(found.status, "TRANSMISE");
});
