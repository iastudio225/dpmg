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
import { PrismaClient, RoleType, StructureType, DemandeStatus } from "@prisma/client";
import app from "./app";

/**
 * Point A — Structure de référence déterministe.
 *
 * La structure de référence de la hiérarchie de validation est celle du
 * DÉPARTEMENT de la demande (Department.structureId). À défaut, elle est
 * déduite des rôles structurels ACTIFS de l'auteur ; si plusieurs structures
 * restent possibles, aucune n'est choisie arbitrairement.
 */

interface DemandeDto {
  id: string;
  reference: string;
  status: string;
  authorId: string;
}

interface ApiErrorBody {
  code: string;
  message: string;
}

const RUN = randomBytes(3).toString("hex");

let server: Server;
let baseUrl: string;
let prisma: PrismaClient;

const userIds: string[] = [];
const createdDepartmentIds: string[] = [];
const createdStructureCodes: string[] = [];

interface RoleSpec {
  role: RoleType;
  structureId: string;
  scope: string;
  startDate?: Date;
  endDate?: Date | null;
}

const tokens: Record<string, string> = {};
const users: Record<string, string> = {};
const demandes: Record<string, string> = {};

let structRoot = "";
let structRefA = "";
let structRefB = "";
let deptRefA = "";
let deptRefB = "";
let deptSansStructure = "";

async function createStructure(code: string, parentId?: string): Promise<string> {
  const structure = await prisma.structure.create({
    data: { code, name: `Structure ${code}`, type: StructureType.OTHER, parentId },
  });
  createdStructureCodes.push(code);
  return structure.id;
}

async function createDepartment(code: string, structureId: string | null): Promise<string> {
  const dept = await prisma.department.create({
    data: { code, name: `Département ${code}`, description: "point A", structureId },
  });
  createdDepartmentIds.push(dept.id);
  return dept.id;
}

async function createUser(tag: string, roles: RoleSpec[]): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email: `${tag}-${RUN}@t.phase5.test`,
      firstName: tag,
      lastName: RUN,
      passwordHash: "hash-non-utilise-tests",
    },
  });
  userIds.push(user.id);

  for (const r of roles) {
    await prisma.userStructureRole.create({
      data: {
        userId: user.id,
        structureId: r.structureId,
        role: r.role,
        scope: r.scope,
        startDate: r.startDate ?? new Date(),
        endDate: r.endDate ?? null,
      },
    });
  }

  const token = `tok-${RUN}-${tag}`;
  await prisma.session.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 3600 * 1000) },
  });

  tokens[tag] = token;
  users[tag] = user.id;
  return user.id;
}

async function createDemandeRow(
  reference: string,
  authorId: string,
  status: DemandeStatus,
  departmentId: string
): Promise<string> {
  const demande = await prisma.demande.create({
    data: {
      reference,
      title: `Demande ${reference}`,
      description: `Description de la demande ${reference}`,
      category: "INFRASTRUCTURE",
      departmentId,
      authorId,
      status,
      submittedAt: status === DemandeStatus.BROUILLON ? null : new Date(),
    },
  });
  return demande.id;
}

async function api(path: string, token?: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
}

async function apiJson<T>(path: string, token?: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
  const res = await api(path, token, init);
  return { status: res.status, body: (await res.json()) as T };
}

let disposeInterruptionCleanup: (() => void) | null = null;

/** Supprime les fixtures suivies, en tentant chaque étape indépendamment. */
async function deleteFixtures(): Promise<void> {
  if (!prisma) {
    await closeTestServer(server);
    return;
  }
  await runCleanupSteps([
    ["fermeture du serveur HTTP", () => closeTestServer(server)],
    ["sessions", () => prisma.session.deleteMany({ where: { userId: { in: userIds } } })],
    ["demandes", () => prisma.demande.deleteMany({ where: { authorId: { in: userIds } } })],
    ["rôles structurels", () => prisma.userStructureRole.deleteMany({ where: { userId: { in: userIds } } })],
    ["utilisateurs", () => prisma.user.deleteMany({ where: { id: { in: userIds } } })],
    ["structures", () => prisma.structure.deleteMany({ where: { code: { in: createdStructureCodes } } })],
    ["départements", () => prisma.department.deleteMany({ where: { id: { in: createdDepartmentIds } } })],
  ]);
}

before(async () => {
  prisma = new PrismaClient();

  await sweepTestResidues(prisma);
  disposeInterruptionCleanup = installInterruptionCleanup(deleteFixtures);

  structRoot = await createStructure(`TST-${RUN}-ROOT`);
  structRefA = await createStructure(`TST-${RUN}-REFA`, structRoot);
  structRefB = await createStructure(`TST-${RUN}-REFB`, structRoot);

  deptRefA = await createDepartment(`TST-${RUN}-REFA`, structRefA);
  deptRefB = await createDepartment(`TST-${RUN}-REFB`, structRefB);
  // Département volontairement SANS rattachement structurel (repli sur les rôles actifs)
  deptSansStructure = await createDepartment(`TST-${RUN}-NOSTRUCT`, null);

  const scope = `TST-${RUN}-SCOPE`;

  // Responsables hiérarchiques : un par structure
  await createUser("managerRefA", [{ role: RoleType.HIERARCHICAL_MANAGER, structureId: structRefA, scope }]);
  await createUser("managerRefB", [{ role: RoleType.HIERARCHICAL_MANAGER, structureId: structRefB, scope }]);

  // Auteur rattaché à DEUX structures, la plus récente étant REFB
  await createUser("auteurMulti", [
    { role: RoleType.EMPLOYEE, structureId: structRefA, scope, startDate: new Date(Date.now() - 10 * 24 * 3600 * 1000) },
    { role: RoleType.EMPLOYEE, structureId: structRefB, scope, startDate: new Date(Date.now() - 1 * 24 * 3600 * 1000) },
  ]);

  // Auteur dont le rôle le PLUS RÉCENT est EXPIRÉ
  await createUser("auteurExpire", [
    { role: RoleType.EMPLOYEE, structureId: structRefA, scope, startDate: new Date(Date.now() - 10 * 24 * 3600 * 1000) },
    {
      role: RoleType.EMPLOYEE,
      structureId: structRefB,
      scope,
      startDate: new Date(Date.now() - 5 * 24 * 3600 * 1000),
      endDate: new Date(Date.now() - 1 * 24 * 3600 * 1000),
    },
  ]);

  // Auteur avec un seul rôle actif (repli non ambigu)
  await createUser("auteurSimple", [
    { role: RoleType.EMPLOYEE, structureId: structRefA, scope, startDate: new Date(Date.now() - 10 * 24 * 3600 * 1000) },
  ]);

  // Auteur rattaché à DEUX structures ACTIVES (repli ambigu)
  await createUser("auteurAmbigu", [
    { role: RoleType.EMPLOYEE, structureId: structRefA, scope, startDate: new Date(Date.now() - 10 * 24 * 3600 * 1000) },
    { role: RoleType.EMPLOYEE, structureId: structRefB, scope, startDate: new Date(Date.now() - 1 * 24 * 3600 * 1000) },
  ]);

  // Demandes
  demandes["multi"] = await createDemandeRow(`TST-${RUN}-A1`, users["auteurMulti"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptRefA);
  demandes["multiDeptB"] = await createDemandeRow(`TST-${RUN}-A9`, users["auteurMulti"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptRefB);
  demandes["multi2"] = await createDemandeRow(`TST-${RUN}-A6`, users["auteurMulti"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptRefA);
  demandes["expire"] = await createDemandeRow(`TST-${RUN}-A2`, users["auteurExpire"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptRefA);
  demandes["expire2"] = await createDemandeRow(`TST-${RUN}-A7`, users["auteurExpire"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptRefA);
  demandes["repli"] = await createDemandeRow(`TST-${RUN}-A3`, users["auteurSimple"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptSansStructure);
  demandes["repli2"] = await createDemandeRow(`TST-${RUN}-A8`, users["auteurSimple"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptSansStructure);
  demandes["ambigu"] = await createDemandeRow(`TST-${RUN}-A4`, users["auteurAmbigu"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptSansStructure);
  demandes["brouillonMulti"] = await createDemandeRow(`TST-${RUN}-A5`, users["auteurMulti"]!, DemandeStatus.BROUILLON, deptRefA);

  await new Promise<void>((resolveListen, rejectListen) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${address.port}`;
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
    await closeTestServer(server).catch((error: unknown) => {
      console.error("[test-fixtures] fermeture du serveur impossible :", error);
    });
    if (prisma) {
      await prisma.$disconnect().catch((error: unknown) => {
        console.error("[test-fixtures] déconnexion Prisma impossible :", error);
      });
    }
  }
});

test("structure de référence : le département de la demande détermine le circuit malgré plusieurs rattachements", async () => {
  const parA = await apiJson<DemandeDto>(`/api/demandes/${demandes["multi"]}/approve`, tokens["managerRefA"], {
    method: "POST",
  });
  assert.equal(parA.status, 200, "le responsable de la structure du DÉPARTEMENT est le validateur désigné");
  assert.equal(parA.body.status, "EN_ATTENTE_ANALYSE");
});

test("structure de référence : le responsable d'une AUTRE structure est refusé", async () => {
  const parB = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["multi2"]}/approve`, tokens["managerRefB"], {
    method: "POST",
  });
  assert.equal(parB.status, 403);
  assert.equal(parB.body.code, "FORBIDDEN");
});

test("structure de référence : le département de la demande prime sur le rattachement de l'auteur", async () => {
  // Même auteur (rattaché à REFA et REFB) : c'est le département de la demande
  // qui détermine la structure de référence, donc le validateur désigné.
  const parB = await apiJson<DemandeDto>(`/api/demandes/${demandes["multiDeptB"]}/approve`, tokens["managerRefB"], {
    method: "POST",
  });
  assert.equal(parB.status, 200);
  assert.equal(parB.body.status, "EN_ATTENTE_ANALYSE");
});

test("structure de référence : le rôle le plus récent expiré ne détermine pas la structure", async () => {
  const parA = await apiJson<DemandeDto>(`/api/demandes/${demandes["expire"]}/approve`, tokens["managerRefA"], {
    method: "POST",
  });
  assert.equal(parA.status, 200);

  const parB = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["expire2"]}/approve`, tokens["managerRefB"], {
    method: "POST",
  });
  assert.equal(parB.status, 403);
  assert.equal(parB.body.code, "FORBIDDEN");
});

test("structure de référence : sans rattachement de département, le repli utilise le rôle actif unique", async () => {
  const parA = await apiJson<DemandeDto>(`/api/demandes/${demandes["repli"]}/approve`, tokens["managerRefA"], {
    method: "POST",
  });
  assert.equal(parA.status, 200);
  assert.equal(parA.body.status, "EN_ATTENTE_ANALYSE");
});

test("structure de référence : plusieurs structures actives en repli ne sont pas choisies arbitrairement", async () => {
  const parA = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["ambigu"]}/approve`, tokens["managerRefA"], {
    method: "POST",
  });
  assert.equal(parA.status, 403);
  assert.equal(parA.body.code, "STRUCTURE_AMBIGUE");

  const parB = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["ambigu"]}/approve`, tokens["managerRefB"], {
    method: "POST",
  });
  assert.equal(parB.status, 403);
  assert.equal(parB.body.code, "STRUCTURE_AMBIGUE");
});

test("structure de référence : la soumission suit la même structure de référence", async () => {
  const { status, body } = await apiJson<DemandeDto>(`/api/demandes/${demandes["brouillonMulti"]}/submit`, tokens["auteurMulti"], {
    method: "PATCH",
  });
  assert.equal(status, 200);
  assert.equal(body.status, "EN_ATTENTE_VALIDATION");
});

test("structure de référence : l'auteur ne peut toujours pas valider sa propre demande", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["repli2"]}/approve`, tokens["auteurSimple"], {
    method: "POST",
  });
  assert.equal(status, 403);
  assert.equal(body.code, "FORBIDDEN");
});
