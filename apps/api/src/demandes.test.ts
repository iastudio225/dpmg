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

interface DemandeDto {
  id: string;
  reference: string;
  title: string;
  description: string;
  status: string;
  category: string;
  departmentId: string;
  departmentCode: string;
  departmentName: string;
  authorId: string;
  authorFirstName: string;
  authorLastName: string;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
}

interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

const RUN = randomBytes(3).toString("hex");

let server: Server;
let baseUrl: string;
let prisma: PrismaClient;

const createdDepartmentIds: string[] = [];
const createdStructureCodes: string[] = [];
const userIds: string[] = [];

const tokens = {
  empInfra: "",
  empLog: "",
  mgrInfra: "",
  mgrDpmg: "",
};
const users = {
  empInfra: "",
  empLog: "",
  mgrInfra: "",
  mgrDpmg: "",
};

let deptInfraId = "";
let deptLogistiqueId = "";

let demandeInfraSoumise = "";
let demandeLogSoumise = "";
let demandeInfraDraft = "";
let demandeLogDraft = "";

const unhandledRejections: unknown[] = [];
process.on("unhandledRejection", (reason) => {
  unhandledRejections.push(reason);
});

async function ensureDepartment(code: string): Promise<string> {
  const existing = await prisma.department.findUnique({ where: { code } });
  if (existing) return existing.id;
  const created = await prisma.department.create({
    data: { code, name: `Département ${code}-${RUN}`, description: "fixtures tests phase 4" },
  });
  createdDepartmentIds.push(created.id);
  return created.id;
}

async function createStructure(code: string): Promise<string> {
  const structure = await prisma.structure.create({
    data: { code, name: `Structure ${code}`, type: StructureType.OTHER },
  });
  createdStructureCodes.push(code);
  return structure.id;
}

async function createUser(
  tag: string,
  roles: Array<{ role: RoleType; structureId: string; scope: string }>
): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email: `${tag}-${RUN}@t.phase4.test`,
      firstName: tag,
      lastName: RUN,
      passwordHash: "hash-non-utilise-tests",
    },
  });
  userIds.push(user.id);

  for (const r of roles) {
    await prisma.userStructureRole.create({
      data: { userId: user.id, structureId: r.structureId, role: r.role, scope: r.scope },
    });
  }

  const token = `tok-${RUN}-${tag}`;
  await prisma.session.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 3600 * 1000) },
  });

  tokens[tag as keyof typeof tokens] = token;
  users[tag as keyof typeof users] = user.id;
  return user.id;
}

async function createDemandeRow(
  reference: string,
  authorId: string,
  departmentId: string,
  status: DemandeStatus
): Promise<string> {
  const demande = await prisma.demande.create({
    data: {
      reference,
      title: `Demande ${reference}`,
      description: `Description de la demande ${reference}`,
      category: departmentId === deptInfraId ? "INFRASTRUCTURE" : "LOGISTIQUE",
      departmentId,
      authorId,
      status,
      submittedAt: status === DemandeStatus.EN_ATTENTE_VALIDATION ? new Date() : null,
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

  deptInfraId = await ensureDepartment("INFRA");
  deptLogistiqueId = await ensureDepartment("LOGISTIQUE");
  await ensureDepartment("MAGASIN");

  const structInfra = await createStructure(`TST-${RUN}-INFRA`);
  const structLog = await createStructure(`TST-${RUN}-LOG`);
  const structDpmg = await createStructure(`TST-${RUN}-DPMG`);

  await createUser("empInfra", [{ role: RoleType.HIERARCHICAL_MANAGER, structureId: structInfra, scope: "INFRA" }, { role: RoleType.EMPLOYEE, structureId: structInfra, scope: "INFRA" }]);
  await createUser("empLog", [{ role: RoleType.EMPLOYEE, structureId: structLog, scope: "LOGISTIQUE" }]);
  await createUser("mgrInfra", [{ role: RoleType.DEPARTMENT_MANAGER, structureId: structInfra, scope: "INFRA" }]);
  await createUser("mgrDpmg", [{ role: RoleType.DPMG_MANAGER, structureId: structDpmg, scope: "*" }]);

  demandeInfraSoumise = await createDemandeRow(`TST-${RUN}-D1`, users.empInfra, deptInfraId, DemandeStatus.EN_ATTENTE_VALIDATION);
  demandeLogSoumise = await createDemandeRow(`TST-${RUN}-D2`, users.empLog, deptLogistiqueId, DemandeStatus.EN_ATTENTE_VALIDATION);
  demandeInfraDraft = await createDemandeRow(`TST-${RUN}-D3`, users.empInfra, deptInfraId, DemandeStatus.BROUILLON);
  demandeLogDraft = await createDemandeRow(`TST-${RUN}-D4`, users.empLog, deptLogistiqueId, DemandeStatus.BROUILLON);

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

test("GET /api/demandes sans session renvoie 401", async () => {
  const { status, body } = await apiJson<ApiErrorBody>("/api/demandes");
  assert.equal(status, 401);
  assert.ok(body.code);
});

test("POST /api/demandes et PATCH sans session renvoient 401", async () => {
  const post = await apiJson<ApiErrorBody>("/api/demandes", undefined, {
    method: "POST",
    body: JSON.stringify({ title: "Titre valide", description: "ok", category: "INFRASTRUCTURE" }),
  });
  assert.equal(post.status, 401);

  const patch = await apiJson<ApiErrorBody>(`/api/demandes/${demandeInfraSoumise}`, undefined, {
    method: "PATCH",
    body: JSON.stringify({ title: "Titre valide" }),
  });
  assert.equal(patch.status, 401);

  const submit = await apiJson<ApiErrorBody>(`/api/demandes/${demandeInfraSoumise}/submit`, undefined, {
    method: "PATCH",
  });
  assert.equal(submit.status, 401);

  const get = await apiJson<ApiErrorBody>(`/api/demandes/${demandeInfraSoumise}`, undefined);
  assert.equal(get.status, 401);
});

test("création d'un brouillon : auteur imposé côté serveur, référence générée, statut BROUILLON", async () => {
  const { status, body } = await apiJson<DemandeDto>("/api/demandes", tokens.empInfra, {
    method: "POST",
    body: JSON.stringify({
      title: "Demande de matériel informatique",
      description: "Besoin de 5 postes de travail pour le service.",
      category: "INFRASTRUCTURE",
      authorId: "fake-user-client",
      status: "EN_ATTENTE_VALIDATION",
    }),
  });

  assert.equal(status, 201);
  assert.equal(body.status, "BROUILLON");
  assert.equal(body.authorId, users.empInfra);
  assert.match(body.reference, /^DEM-\d{4}-[A-Z0-9]{5}$/);
  assert.equal(body.departmentCode, "INFRA");
  assert.equal(body.submittedAt, null);
});

test("entrées invalides refusées (titre, catégorie, département non conforme)", async () => {
  const shortTitle = await apiJson<ApiErrorBody>("/api/demandes", tokens.empInfra, {
    method: "POST",
    body: JSON.stringify({ title: "ab", description: "ok", category: "INFRASTRUCTURE" }),
  });
  assert.equal(shortTitle.status, 400);
  assert.equal(shortTitle.body.code, "VALIDATION_ERROR");

  const badCategory = await apiJson<ApiErrorBody>("/api/demandes", tokens.empInfra, {
    method: "POST",
    body: JSON.stringify({ title: "Titre valide", description: "ok", category: "INCONNUE" }),
  });
  assert.equal(badCategory.status, 400);

  const mismatch = await apiJson<ApiErrorBody>("/api/demandes", tokens.empInfra, {
    method: "POST",
    body: JSON.stringify({
      title: "Titre valide",
      description: "ok",
      category: "INFRASTRUCTURE",
      departmentId: deptLogistiqueId,
    }),
  });
  assert.equal(mismatch.status, 400);
  assert.equal(mismatch.body.code, "DEPARTMENT_CATEGORY_MISMATCH");
});

test("liste limitée au périmètre : employé voit ses demandes, manager INFRA voit les soumises INFRA uniquement", async () => {
  const empInfraList = await apiJson<DemandeDto[]>("/api/demandes", tokens.empInfra);
  assert.equal(empInfraList.status, 200);
  const empInfraIds = empInfraList.body.map((d) => d.id);
  assert.ok(empInfraIds.includes(demandeInfraSoumise));
  assert.ok(empInfraIds.includes(demandeInfraDraft));
  assert.ok(!empInfraIds.includes(demandeLogSoumise));
  assert.ok(!empInfraIds.includes(demandeLogDraft));

  const mgrList = await apiJson<DemandeDto[]>("/api/demandes", tokens.mgrInfra);
  assert.equal(mgrList.status, 200);
  const mgrIds = mgrList.body.map((d) => d.id);
  assert.ok(mgrIds.includes(demandeInfraSoumise));
  assert.ok(!mgrIds.includes(demandeInfraDraft), "le brouillon d'autrui ne doit pas être visible");
  assert.ok(!mgrIds.includes(demandeLogSoumise));
});

test("DPMG_MANAGER avec scope '*' n'a pas d'accès automatique à toutes les demandes", async () => {
  const { status, body } = await apiJson<DemandeDto[]>("/api/demandes", tokens.mgrDpmg);
  assert.equal(status, 200);
  assert.equal(body.length, 0);
});

test("filtres de liste validés (statut invalide → 400)", async () => {
  const filtered = await apiJson<DemandeDto[]>("/api/demandes?status=EN_ATTENTE_VALIDATION", tokens.mgrInfra);
  assert.equal(filtered.status, 200);
  assert.ok(filtered.body.every((d) => d.status === "EN_ATTENTE_VALIDATION"));

  const invalid = await apiJson<ApiErrorBody>("/api/demandes?status=BIDULE", tokens.mgrInfra);
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.code, "VALIDATION_ERROR");
});

test("isolation INFRA/LOGISTIQUE : un utilisateur LOGISTIQUE ne voit pas une demande INFRA par URL directe", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(`/api/demandes/${demandeInfraSoumise}`, tokens.empLog);
  assert.equal(status, 404);
  assert.equal(body.code, "NOT_FOUND");

  const draft = await apiJson<ApiErrorBody>(`/api/demandes/${demandeInfraDraft}`, tokens.empLog);
  assert.equal(draft.status, 404);

  const draftMgr = await apiJson<ApiErrorBody>(`/api/demandes/${demandeInfraDraft}`, tokens.mgrInfra);
  assert.equal(draftMgr.status, 404, "même un manager ne voit pas les brouillons d'autrui");

  const managerView = await apiJson<DemandeDto>(`/api/demandes/${demandeInfraSoumise}`, tokens.mgrInfra);
  assert.equal(managerView.status, 200);
});

test("l'auteur consulte le détail de sa demande soumise (200, statut et submittedAt)", async () => {
  const { status, body } = await apiJson<DemandeDto>(`/api/demandes/${demandeInfraSoumise}`, tokens.empInfra);
  assert.equal(status, 200);
  assert.equal(body.id, demandeInfraSoumise);
  assert.equal(body.status, "EN_ATTENTE_VALIDATION");
  assert.ok(body.submittedAt !== null);
  assert.equal(body.authorId, users.empInfra);
});

test("modification d'un brouillon par son auteur", async () => {
  const { status, body } = await apiJson<DemandeDto>(`/api/demandes/${demandeInfraDraft}`, tokens.empInfra, {
    method: "PATCH",
    body: JSON.stringify({ title: "Titre modifié par l'auteur" }),
  });
  assert.equal(status, 200);
  assert.equal(body.title, "Titre modifié par l'auteur");
  assert.equal(body.status, "BROUILLON");
});

test("modification interdite après soumission", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(`/api/demandes/${demandeInfraSoumise}`, tokens.empInfra, {
    method: "PATCH",
    body: JSON.stringify({ title: "Tentative de modification" }),
  });
  assert.equal(status, 403);
  assert.equal(body.code, "DEMANDE_NOT_DRAFT");
});

test("modification par un non-auteur interdite", async () => {
  const { status } = await apiJson<ApiErrorBody>(`/api/demandes/${demandeInfraSoumise}`, tokens.empLog, {
    method: "PATCH",
    body: JSON.stringify({ title: "Héritage non autorisé" }),
  });
  assert.equal(status, 403);
});

test("soumission d'un brouillon par son auteur (BROUILLON → EN_ATTENTE_VALIDATION, submittedAt renseigné)", async () => {
  const { status, body } = await apiJson<DemandeDto>(`/api/demandes/${demandeInfraDraft}/submit`, tokens.empInfra, {
    method: "PATCH",
  });
  assert.equal(status, 200);
  assert.equal(body.status, "EN_ATTENTE_VALIDATION");
  assert.ok(body.submittedAt !== null);
});

test("soumission par un non-auteur interdite", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(`/api/demandes/${demandeLogDraft}/submit`, tokens.empInfra, {
    method: "PATCH",
  });
  assert.equal(status, 403);
  assert.equal(body.code, "FORBIDDEN");
});

test("soumission répétée interdite", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(`/api/demandes/${demandeInfraDraft}/submit`, tokens.empInfra, {
    method: "PATCH",
  });
  assert.equal(status, 403);
  assert.equal(body.code, "ALREADY_SUBMITTED");
});

test("aucun rejet de promesse non géré pendant la suite demandes", async () => {
  await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  assert.equal(unhandledRejections.length, 0);
});
