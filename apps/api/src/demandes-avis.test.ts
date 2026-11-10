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

const userIds: string[] = [];
const createdDepartmentIds: string[] = [];
const createdStructureCodes: string[] = [];

interface RoleSpec {
  role: RoleType;
  structureId: string;
  scope: string;
  startDate?: Date;
  endDate?: Date | null;
  delegatedFromUserId?: string;
}

const tokens: Record<string, string> = {};
const users: Record<string, string> = {};

const DEMANDE_DEPT = "TSTDEPT";

let structDept = "";
let structOther = "";
let deptId = "";
let deptCode = "";

// Demandes de test, indexées par clé
const demandes: Record<string, string> = {};

async function createStructure(code: string, parentId?: string): Promise<string> {
  const structure = await prisma.structure.create({
    data: { code, name: `Structure ${code}`, type: StructureType.OTHER, parentId },
  });
  createdStructureCodes.push(code);
  return structure.id;
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
        delegatedFromUserId: r.delegatedFromUserId ?? null,
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
  departmentId: string,
  status: DemandeStatus,
  category: "INFRASTRUCTURE" | "LOGISTIQUE" | "MAGASIN" = "INFRASTRUCTURE"
): Promise<string> {
  const demande = await prisma.demande.create({
    data: {
      reference,
      title: `Demande ${reference}`,
      description: `Description de la demande ${reference}`,
      category,
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

async function decisionsFor(demandeId: string) {
  return prisma.demandeDecision.findMany({
    where: { demandeId },
    orderBy: { createdAt: "asc" },
  });
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

  // Structure du département de test + structure concurrente
  structDept = await createStructure(`TST-${RUN}-DEPT`);
  structOther = await createStructure(`TST-${RUN}-OTHER`);

  // Département dédié, rattaché structurellement à structDept
  deptCode = `TST-${RUN}-${DEMANDE_DEPT}`;
  const dept = await prisma.department.create({
    data: {
      code: deptCode,
      name: `Département ${DEMANDE_DEPT}-${RUN}`,
      description: "fixtures tests phase 5 lot 4.2",
      structureId: structDept,
    },
  });
  deptId = dept.id;
  createdDepartmentIds.push(dept.id);

  // Auteur (simple employé, pas de rôle départemental)
  await createUser("auteur", [{ role: RoleType.EMPLOYEE, structureId: structDept, scope: deptCode }]);

  // Responsable de département habilité sur le bon département
  await createUser("respDept", [{ role: RoleType.DEPARTMENT_MANAGER, structureId: structDept, scope: deptCode }]);

  // Responsable d'un autre département (scope et structure différents)
  await createUser("respAutreDept", [
    { role: RoleType.DEPARTMENT_MANAGER, structureId: structOther, scope: `AUTRE-${RUN}` },
  ]);

  // Responsable avec scope "*" : ne doit accorder aucun droit
  await createUser("respWildcard", [
    { role: RoleType.DEPARTMENT_MANAGER, structureId: structDept, scope: "*" },
  ]);

  // Habilitation expirée
  await createUser("respExpire", [
    {
      role: RoleType.DEPARTMENT_MANAGER,
      structureId: structDept,
      scope: deptCode,
      startDate: new Date(Date.now() - 90 * 24 * 3600 * 1000),
      endDate: new Date(Date.now() - 24 * 3600 * 1000),
    },
  ]);

  // Délégué de département dont le délégant est un responsable actif
  await createUser("delegueValide", [
    {
      role: RoleType.DEPARTMENT_DELEGATE,
      structureId: structDept,
      scope: deptCode,
      delegatedFromUserId: users["respDept"]!,
    },
  ]);

  // Délégué de département dont le délégant n'est pas responsable de département
  await createUser("delegueOrphelin", [
    {
      role: RoleType.DEPARTMENT_DELEGATE,
      structureId: structDept,
      scope: deptCode,
      delegatedFromUserId: users["auteur"]!,
    },
  ]);

  // DPMG_MANAGER scope "*" : aucun droit sur l'analyse départementale
  await createUser("dpmgWildcard", [
    { role: RoleType.DPMG_MANAGER, structureId: structDept, scope: "*" },
  ]);

  // Demandes
  demandes["analyse"] = await createDemandeRow(`TST-${RUN}-AV1`, users["auteur"]!, deptId, DemandeStatus.EN_ATTENTE_ANALYSE);
  demandes["analyse2"] = await createDemandeRow(`TST-${RUN}-AV2`, users["auteur"]!, deptId, DemandeStatus.EN_ATTENTE_ANALYSE);
  demandes["analyse3"] = await createDemandeRow(`TST-${RUN}-AV3`, users["auteur"]!, deptId, DemandeStatus.EN_ATTENTE_ANALYSE);
  demandes["analyse4"] = await createDemandeRow(`TST-${RUN}-AV4`, users["auteur"]!, deptId, DemandeStatus.EN_ATTENTE_ANALYSE);
  demandes["analyse5"] = await createDemandeRow(`TST-${RUN}-AV5`, users["auteur"]!, deptId, DemandeStatus.EN_ATTENTE_ANALYSE);
  demandes["analyse6"] = await createDemandeRow(`TST-${RUN}-AV6`, users["auteur"]!, deptId, DemandeStatus.EN_ATTENTE_ANALYSE);
  demandes["brouillon"] = await createDemandeRow(`TST-${RUN}-AV7`, users["auteur"]!, deptId, DemandeStatus.BROUILLON);
  demandes["validation"] = await createDemandeRow(`TST-${RUN}-AV8`, users["auteur"]!, deptId, DemandeStatus.EN_ATTENTE_VALIDATION);
  demandes["decision"] = await createDemandeRow(`TST-${RUN}-AV9`, users["auteur"]!, deptId, DemandeStatus.EN_ATTENTE_DECISION);

  // Historique préexistant sur une demande pour vérifier la conservation
  await prisma.demandeDecision.create({
    data: {
      demandeId: demandes["analyse"]!,
      actorId: users["auteur"]!,
      type: "SOUMISSION",
      motif: null,
      commentaire: null,
    },
  });

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

test("avis départemental : le responsable habilité fait passer la demande en EN_ATTENTE_DECISION", async () => {
  const { status, body } = await apiJson<DemandeDto>(`/api/demandes/${demandes["analyse"]}/avis`, tokens["respDept"], {
    method: "POST",
    body: JSON.stringify({ motif: "Avis favorable", commentaire: "Budget disponible" }),
  });

  assert.equal(status, 200);
  assert.equal(body.status, "EN_ATTENTE_DECISION");

  const decisions = await decisionsFor(demandes["analyse"]!);
  const avis = decisions.find((d) => d.type === "AVIS_DEPARTEMENTAL");
  assert.ok(avis, "une décision AVIS_DEPARTEMENTAL doit être créée");
  assert.equal(avis!.actorId, users["respDept"]);
  assert.equal(avis!.motif, "Avis favorable");
  assert.equal(avis!.commentaire, "Budget disponible");
});

test("avis départemental : l'historique des décisions antérieures est conservé", async () => {
  const decisions = await decisionsFor(demandes["analyse"]!);
  assert.equal(decisions.length, 2, "SOUMISSION + AVIS_DEPARTEMENTAL");
  assert.equal(decisions[0]!.type, "SOUMISSION");
  assert.equal(decisions[1]!.type, "AVIS_DEPARTEMENTAL");
});

test("avis départemental : la transition de statut et l'avis sont atomiques", async () => {
  const demande = await prisma.demande.findUnique({ where: { id: demandes["analyse"] } });
  const avis = await prisma.demandeDecision.findFirst({
    where: { demandeId: demandes["analyse"], type: "AVIS_DEPARTEMENTAL" },
  });
  assert.equal(demande?.status, DemandeStatus.EN_ATTENTE_DECISION);
  assert.ok(avis, "l'avis est enregistré dans la même transaction que le statut");
});

test("avis départemental : l'auteur de la demande est refusé", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["analyse2"]}/avis`, tokens["auteur"], {
    method: "POST",
    body: JSON.stringify({ motif: "auto-avis" }),
  });

  assert.equal(status, 403);
  assert.equal(body.code, "FORBIDDEN");

  const demande = await prisma.demande.findUnique({ where: { id: demandes["analyse2"] } });
  assert.equal(demande?.status, DemandeStatus.EN_ATTENTE_ANALYSE, "la demande ne doit pas avoir changé");
  assert.equal((await decisionsFor(demandes["analyse2"]!)).length, 0, "aucun avis ne doit être créé");
});

test("avis départemental : un utilisateur sans rôle départemental est refusé", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["analyse2"]}/avis`, tokens["auteur"], {
    method: "POST",
    body: JSON.stringify({ motif: "tentative" }),
  });
  assert.equal(status, 403);
  assert.equal(body.code, "FORBIDDEN");
});

test("avis départemental : un responsable d'un autre département est refusé", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["analyse2"]}/avis`, tokens["respAutreDept"], {
    method: "POST",
    body: JSON.stringify({ motif: "avis indu" }),
  });

  assert.equal(status, 403);
  assert.equal(body.code, "FORBIDDEN");
  assert.equal((await decisionsFor(demandes["analyse2"]!)).length, 0);
});

test("avis départemental : scope \"*\" ne confère aucun droit", async () => {
  const wildcard = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["analyse2"]}/avis`, tokens["respWildcard"], {
    method: "POST",
    body: JSON.stringify({ motif: "scope star" }),
  });
  assert.equal(wildcard.status, 403);

  const dpmg = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["analyse2"]}/avis`, tokens["dpmgWildcard"], {
    method: "POST",
    body: JSON.stringify({ motif: "dpmg" }),
  });
  assert.equal(dpmg.status, 403);
  assert.equal(dpmg.body.code, "FORBIDDEN");
  assert.equal((await decisionsFor(demandes["analyse2"]!)).length, 0);
});

test("avis départemental : une habilitation inactive est refusée", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["analyse2"]}/avis`, tokens["respExpire"], {
    method: "POST",
    body: JSON.stringify({ motif: "habilitation expirée" }),
  });

  assert.equal(status, 403);
  assert.equal(body.code, "FORBIDDEN");
  assert.equal((await decisionsFor(demandes["analyse2"]!)).length, 0);
});

test("avis départemental : une délégation DEPARTMENT_DELEGATE valide est acceptée", async () => {
  const { status, body } = await apiJson<DemandeDto>(`/api/demandes/${demandes["analyse3"]}/avis`, tokens["delegueValide"], {
    method: "POST",
    body: JSON.stringify({ commentaire: "Avis transmis par le délégué" }),
  });

  assert.equal(status, 200);
  assert.equal(body.status, "EN_ATTENTE_DECISION");

  const avis = await prisma.demandeDecision.findFirst({
    where: { demandeId: demandes["analyse3"], type: "AVIS_DEPARTEMENTAL" },
  });
  assert.equal(avis?.actorId, users["delegueValide"]);
});

test("avis départemental : une délégation DEPARTMENT_DELEGATE non rattachée à un responsable est refusée", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["analyse4"]}/avis`, tokens["delegueOrphelin"], {
    method: "POST",
    body: JSON.stringify({ motif: "délégation non valide" }),
  });

  assert.equal(status, 403);
  assert.equal(body.code, "FORBIDDEN");
  assert.equal((await decisionsFor(demandes["analyse4"]!)).length, 0);
});

test("avis départemental : une demande en BROUILLON est refusée", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["brouillon"]}/avis`, tokens["respDept"], {
    method: "POST",
    body: JSON.stringify({ motif: "trop tôt" }),
  });

  assert.equal(status, 403);
  assert.equal(body.code, "DEMANDE_NOT_ANALYSE");
  assert.equal((await decisionsFor(demandes["brouillon"]!)).length, 0);
});

test("avis départemental : une demande en EN_ATTENTE_VALIDATION est refusée", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["validation"]}/avis`, tokens["respDept"], {
    method: "POST",
    body: JSON.stringify({ motif: "pas encore validée" }),
  });

  assert.equal(status, 403);
  assert.equal(body.code, "DEMANDE_NOT_ANALYSE");
  assert.equal((await decisionsFor(demandes["validation"]!)).length, 0);
});

test("avis départemental : une demande déjà en EN_ATTENTE_DECISION est refusée sans nouvel historique", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["decision"]}/avis`, tokens["respDept"], {
    method: "POST",
    body: JSON.stringify({ motif: "déjà traitée" }),
  });

  assert.equal(status, 403);
  assert.equal(body.code, "DEMANDE_NOT_ANALYSE");
  assert.equal((await decisionsFor(demandes["decision"]!)).length, 0, "aucun nouvel avis ne doit être créé");
});

test("avis départemental : la requête répétée est refusée sans créer de second avis", async () => {
  const first = await apiJson<DemandeDto>(`/api/demandes/${demandes["analyse5"]}/avis`, tokens["respDept"], {
    method: "POST",
    body: JSON.stringify({ motif: "premier avis" }),
  });
  assert.equal(first.status, 200);

  const second = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["analyse5"]}/avis`, tokens["respDept"], {
    method: "POST",
    body: JSON.stringify({ motif: "second avis" }),
  });
  assert.equal(second.status, 403);
  assert.equal(second.body.code, "DEMANDE_NOT_ANALYSE");

  const decisions = await decisionsFor(demandes["analyse5"]!);
  assert.equal(decisions.length, 1, "un seul avis doit exister");
  assert.equal(decisions[0]!.type, "AVIS_DEPARTEMENTAL");
});

test("avis départemental : deux actions concurrentes ne produisent qu'une seule transition", async () => {
  const target = demandes["analyse6"]!;
  const [a, b] = await Promise.all([
    apiJson<DemandeDto>(`/api/demandes/${target}/avis`, tokens["respDept"], {
      method: "POST",
      body: JSON.stringify({ motif: "concurrence A" }),
    }),
    apiJson<ApiErrorBody>(`/api/demandes/${target}/avis`, tokens["respDept"], {
      method: "POST",
      body: JSON.stringify({ motif: "concurrence B" }),
    }),
  ]);

  const codes = [a.status, b.status].sort();
  assert.deepEqual(codes, [200, 403], "une seule action doit réussir");

  const decisions = await decisionsFor(target);
  assert.equal(decisions.length, 1, "une seule décision doit être créée");
  assert.equal(decisions[0]!.type, "AVIS_DEPARTEMENTAL");

  const demande = await prisma.demande.findUnique({ where: { id: target } });
  assert.equal(demande?.status, DemandeStatus.EN_ATTENTE_DECISION);
});

test("avis départemental : sans session l'action est refusée (401)", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["analyse2"]}/avis`, undefined, {
    method: "POST",
    body: JSON.stringify({ motif: "anonyme" }),
  });

  assert.equal(status, 401);
  assert.ok(body.code);
});

test("avis départemental : un corps de requête invalide renvoie 400 sans mutation", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["analyse2"]}/avis`, tokens["respDept"], {
    method: "POST",
    body: JSON.stringify({ motif: 42 }),
  });

  assert.equal(status, 400);
  assert.equal(body.code, "VALIDATION_ERROR");

  const demande = await prisma.demande.findUnique({ where: { id: demandes["analyse2"] } });
  assert.equal(demande?.status, DemandeStatus.EN_ATTENTE_ANALYSE);
  assert.equal((await decisionsFor(demandes["analyse2"]!)).length, 0);
});

test("avis départemental : les espaces superflus sont supprimés aux extrémités", async () => {
  const { status } = await apiJson<DemandeDto>(`/api/demandes/${demandes["analyse4"]}/avis`, tokens["respDept"], {
    method: "POST",
    body: JSON.stringify({ motif: "   motif nettoyé   ", commentaire: "\tcommentaire nettoyé\n" }),
  });

  assert.equal(status, 200);
  const avis = await prisma.demandeDecision.findFirst({
    where: { demandeId: demandes["analyse4"], type: "AVIS_DEPARTEMENTAL" },
  });
  assert.equal(avis?.motif, "motif nettoyé");
  assert.equal(avis?.commentaire, "commentaire nettoyé");
});

test("avis départemental : une demande inexistante renvoie 404", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(`/api/demandes/inexistant-avis/avis`, tokens["respDept"], {
    method: "POST",
    body: JSON.stringify({ motif: "fantome" }),
  });

  assert.equal(status, 404);
  assert.equal(body.code, "NOT_FOUND");
});

