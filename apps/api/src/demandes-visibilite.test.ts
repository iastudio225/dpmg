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
 * Point C — Visibilité des demandes à analyser.
 *
 * Les demandes EN_ATTENTE_ANALYSE sont visibles dans la liste pour les seuls
 * rôles DÉPARTEMENTAUX (DEPARTMENT_MANAGER, DEPARTMENT_DELEGATE) et dans le
 * périmètre de leur département. Les rôles DPMG n'élargissent pas cette
 * visibilité.
 */

interface DemandeDto {
  id: string;
  reference: string;
  status: string;
  departmentCode: string;
  authorId: string;
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
const demandes: Record<string, string> = {};

let structVisA = "";
let structVisB = "";
let deptVisA = "";
let deptVisB = "";

async function createStructure(code: string, parentId?: string): Promise<string> {
  const structure = await prisma.structure.create({
    data: { code, name: `Structure ${code}`, type: StructureType.OTHER, parentId },
  });
  createdStructureCodes.push(code);
  return structure.id;
}

async function createDepartment(code: string, structureId: string | null): Promise<string> {
  const dept = await prisma.department.create({
    data: { code, name: `Département ${code}`, description: "point C", structureId },
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

async function apiJson<T>(
  path: string,
  token?: string,
  init: RequestInit = {}
): Promise<{ status: number; body: T }> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
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

  structVisA = await createStructure(`TST-${RUN}-VISA`);
  structVisB = await createStructure(`TST-${RUN}-VISB`);

  deptVisA = await createDepartment(`TST-${RUN}-VISA`, structVisA);
  deptVisB = await createDepartment(`TST-${RUN}-VISB`, structVisB);

  const codeA = `TST-${RUN}-VISA`;
  const codeB = `TST-${RUN}-VISB`;

  // Responsable de département A
  await createUser("respA", [{ role: RoleType.DEPARTMENT_MANAGER, structureId: structVisA, scope: codeA }]);
  // Responsable de département B
  await createUser("respB", [{ role: RoleType.DEPARTMENT_MANAGER, structureId: structVisB, scope: codeB }]);
  // Délégué départemental habilité sur le département A
  await createUser("delegueA", [
    {
      role: RoleType.DEPARTMENT_DELEGATE,
      structureId: structVisA,
      scope: codeA,
      delegatedFromUserId: users["respA"]!,
    },
  ]);
  // Rôle DPMG avec un périmètre départemental : ne doit PAS élargir la visibilité d'analyse
  await createUser("dpmgPerimetre", [{ role: RoleType.DPMG_MANAGER, structureId: structVisA, scope: codeA }]);
  // Rôle DPMG global
  await createUser("dpmgGlobal", [{ role: RoleType.DPMG_MANAGER, structureId: structVisA, scope: "*" }]);
  // Responsable habilité par RATTACHEMENT STRUCTUREL : son scope ne correspond pas
  // au code du département, mais sa structure est bien celle du département.
  await createUser("respStructure", [
    { role: RoleType.DEPARTMENT_MANAGER, structureId: structVisA, scope: `AUTRE-${RUN}` },
  ]);
  // Délégué dont la DÉLÉGATION est expirée
  await createUser("delegueExpire", [
    {
      role: RoleType.DEPARTMENT_DELEGATE,
      structureId: structVisA,
      scope: codeA,
      startDate: new Date(Date.now() - 90 * 24 * 3600 * 1000),
      endDate: new Date(Date.now() - 24 * 3600 * 1000),
      delegatedFromUserId: users["respA"]!,
    },
  ]);
  // Délégué dont le DÉLÉGANT n'a plus de rôle DEPARTMENT_MANAGER actif
  await createUser("respExpire", [
    {
      role: RoleType.DEPARTMENT_MANAGER,
      structureId: structVisB,
      scope: codeB,
      startDate: new Date(Date.now() - 90 * 24 * 3600 * 1000),
      endDate: new Date(Date.now() - 24 * 3600 * 1000),
    },
  ]);
  await createUser("delegueDelegantExpire", [
    {
      role: RoleType.DEPARTMENT_DELEGATE,
      structureId: structVisB,
      scope: codeB,
      delegatedFromUserId: users["respExpire"]!,
    },
  ]);
  // Délégué SANS délégant
  await createUser("delegueSansDelegant", [
    { role: RoleType.DEPARTMENT_DELEGATE, structureId: structVisA, scope: codeA },
  ]);
  // Employé simple, auteur de demandes
  await createUser("employeA", [{ role: RoleType.EMPLOYEE, structureId: structVisA, scope: codeA }]);
  await createUser("employeB", [{ role: RoleType.EMPLOYEE, structureId: structVisB, scope: codeB }]);

  demandes["analyseA"] = await createDemandeRow(`TST-${RUN}-C1`, users["employeA"]!, DemandeStatus.EN_ATTENTE_ANALYSE, deptVisA);
  demandes["analyseB"] = await createDemandeRow(`TST-${RUN}-C2`, users["employeB"]!, DemandeStatus.EN_ATTENTE_ANALYSE, deptVisB);
  demandes["brouillonA"] = await createDemandeRow(`TST-${RUN}-C3`, users["employeA"]!, DemandeStatus.BROUILLON, deptVisA);
  demandes["validationA"] = await createDemandeRow(`TST-${RUN}-C4`, users["employeA"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptVisA);
  demandes["analyseA2"] = await createDemandeRow(`TST-${RUN}-C5`, users["employeA"]!, DemandeStatus.EN_ATTENTE_ANALYSE, deptVisA);
  demandes["analyseB2"] = await createDemandeRow(`TST-${RUN}-C6`, users["employeB"]!, DemandeStatus.EN_ATTENTE_ANALYSE, deptVisB);
  demandes["analyseB3"] = await createDemandeRow(`TST-${RUN}-C7`, users["employeB"]!, DemandeStatus.EN_ATTENTE_ANALYSE, deptVisB);
  demandes["analyseA3"] = await createDemandeRow(`TST-${RUN}-C8`, users["employeA"]!, DemandeStatus.EN_ATTENTE_ANALYSE, deptVisA);
  demandes["analyseA4"] = await createDemandeRow(`TST-${RUN}-C9`, users["employeA"]!, DemandeStatus.EN_ATTENTE_ANALYSE, deptVisA);
  demandes["analyseA5"] = await createDemandeRow(`TST-${RUN}-CA`, users["employeA"]!, DemandeStatus.EN_ATTENTE_ANALYSE, deptVisA);
  demandes["analyseA6"] = await createDemandeRow(`TST-${RUN}-CB`, users["employeA"]!, DemandeStatus.EN_ATTENTE_ANALYSE, deptVisA);

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

test("visibilité : le responsable de département voit les demandes à analyser de SON département", async () => {
  const { status, body } = await apiJson<DemandeDto[]>("/api/demandes", tokens["respA"]);
  assert.equal(status, 200);

  const refs = body.map((d) => d.reference);
  assert.ok(refs.includes(`TST-${RUN}-C1`), "la demande à analyser de son département doit être visible");
});

test("visibilité : le responsable de département ne voit PAS les demandes à analyser d'un autre département", async () => {
  const { status, body } = await apiJson<DemandeDto[]>("/api/demandes", tokens["respA"]);
  assert.equal(status, 200);

  const refs = body.map((d) => d.reference);
  assert.ok(!refs.includes(`TST-${RUN}-C2`), "la demande à analyser d'un autre département doit rester cachée");
});

test("visibilité : le délégué départemental habilité bénéficie de la visibilité prévue par ses droits", async () => {
  const { status, body } = await apiJson<DemandeDto[]>("/api/demandes", tokens["delegueA"]);
  assert.equal(status, 200);

  const refs = body.map((d) => d.reference);
  assert.ok(refs.includes(`TST-${RUN}-C1`));
  assert.ok(!refs.includes(`TST-${RUN}-C2`));
});

test("visibilité : un rôle DPMG avec périmètre départemental voit les demandes en attente d'analyse de son périmètre", async () => {
  const { status, body } = await apiJson<DemandeDto[]>("/api/demandes", tokens["dpmgPerimetre"]);
  assert.equal(status, 200);

  const refs = body.map((d) => d.reference);
  assert.ok(
    refs.includes(`TST-${RUN}-C1`),
    "un rôle DPMG habilité voit les demandes en attente d'analyse de son périmètre"
  );
  assert.ok(
    refs.includes(`TST-${RUN}-C4`),
    "le rôle DPMG conserve la visibilité des demandes à valider"
  );
});

test("visibilité : un rôle DPMG global reçoit la visibilité des demandes de son périmètre", async () => {
  const { status, body } = await apiJson<DemandeDto[]>("/api/demandes", tokens["dpmgGlobal"]);
  assert.equal(status, 200);

  const refs = body.map((d) => d.reference);
  assert.ok(refs.includes(`TST-${RUN}-C1`), "un DPMG global voit les demandes en attente d'analyse");
});

test("visibilité : les brouillons des autres utilisateurs restent protégés", async () => {
  const { status, body } = await apiJson<DemandeDto[]>("/api/demandes", tokens["respA"]);
  assert.equal(status, 200);

  const refs = body.map((d) => d.reference);
  assert.ok(!refs.includes(`TST-${RUN}-C3`), "un brouillon d'autrui ne doit jamais être visible");
});

test("visibilité : le filtre de statut reste valide sur les demandes à analyser", async () => {
  const { status, body } = await apiJson<DemandeDto[]>(
    "/api/demandes?status=EN_ATTENTE_ANALYSE",
    tokens["respA"]
  );
  assert.equal(status, 200);
  assert.ok(body.length > 0);
  assert.ok(body.every((d) => d.status === "EN_ATTENTE_ANALYSE"));
  assert.ok(body.every((d) => d.departmentCode === `TST-${RUN}-VISA`));
});

test("visibilité : l'auteur continue de voir ses propres demandes", async () => {
  const { status, body } = await apiJson<DemandeDto[]>("/api/demandes", tokens["employeA"]);
  assert.equal(status, 200);

  const refs = body.map((d) => d.reference);
  assert.ok(refs.includes(`TST-${RUN}-C3`));
  assert.ok(refs.includes(`TST-${RUN}-C1`));
});

test("visibilité : le responsable de département B voit ses propres demandes à analyser", async () => {
  const { status, body } = await apiJson<DemandeDto[]>("/api/demandes", tokens["respB"]);
  assert.equal(status, 200);

  const refs = body.map((d) => d.reference);
  assert.ok(refs.includes(`TST-${RUN}-C2`));
  assert.ok(!refs.includes(`TST-${RUN}-C1`));
});

// ---------------------------------------------------------------------------
// Alignement visibilité / autorisation
// ---------------------------------------------------------------------------

test("alignement : un responsable habilité par rattachement structurel voit la demande à analyser", async () => {
  const { status, body } = await apiJson<DemandeDto[]>("/api/demandes", tokens["respStructure"]);
  assert.equal(status, 200);

  const refs = body.map((d) => d.reference);
  assert.ok(
    refs.includes(`TST-${RUN}-C5`),
    "le rattachement structurel doit donner la visibilité, comme pour l'autorisation d'avis"
  );
  assert.ok(!refs.includes(`TST-${RUN}-C6`), "aucune fuite vers le département de l'autre structure");
});

test("alignement : le responsable habilité par structure peut aussi enregistrer l'avis", async () => {
  const { status, body } = await apiJson<DemandeDto>(`/api/demandes/${demandes["analyseA2"]}/avis`, tokens["respStructure"], {
    method: "POST",
    body: JSON.stringify({ motif: "Avis sur avis structurel" }),
  });

  assert.equal(status, 200);
  assert.equal(body.status, "EN_ATTENTE_DECISION");
});

test("alignement : un utilisateur d'une autre structure ne voit ni ne peut traiter la demande", async () => {
  const { status, body } = await apiJson<DemandeDto[]>("/api/demandes", tokens["employeB"]);
  assert.equal(status, 200);
  assert.ok(!body.map((d) => d.reference).includes(`TST-${RUN}-C5`));

  const avis = await apiJson<{ code: string }>(`/api/demandes/${demandes["analyseA3"]}/avis`, tokens["employeB"], {
    method: "POST",
    body: JSON.stringify({ motif: "Tentative" }),
  });
  assert.equal(avis.status, 403);
  assert.equal(avis.body.code, "FORBIDDEN");
});

test("alignement : un délégué dont la délégation est expirée ne voit pas la demande et ne peut pas aviser", async () => {
  const { status, body } = await apiJson<DemandeDto[]>("/api/demandes", tokens["delegueExpire"]);
  assert.equal(status, 200);
  assert.ok(!body.map((d) => d.reference).includes(`TST-${RUN}-C1`));

  const avis = await apiJson<{ code: string }>(`/api/demandes/${demandes["analyseA4"]}/avis`, tokens["delegueExpire"], {
    method: "POST",
    body: JSON.stringify({ motif: "Délégation expirée" }),
  });
  assert.equal(avis.status, 403);
  assert.equal(avis.body.code, "FORBIDDEN");
});

test("alignement : un délégué dont le délégant n'a plus d'habilitation active est refusé", async () => {
  const { status, body } = await apiJson<DemandeDto[]>("/api/demandes", tokens["delegueDelegantExpire"]);
  assert.equal(status, 200);
  assert.ok(!body.map((d) => d.reference).includes(`TST-${RUN}-C2`));

  const avis = await apiJson<{ code: string }>(`/api/demandes/${demandes["analyseB2"]}/avis`, tokens["delegueDelegantExpire"], {
    method: "POST",
    body: JSON.stringify({ motif: "Délégant expiré" }),
  });
  assert.equal(avis.status, 403);
  assert.equal(avis.body.code, "FORBIDDEN");
});

test("alignement : un délégué sans délégant est refusé", async () => {
  const { status, body } = await apiJson<DemandeDto[]>("/api/demandes", tokens["delegueSansDelegant"]);
  assert.equal(status, 200);
  assert.ok(!body.map((d) => d.reference).includes(`TST-${RUN}-C1`));

  const avis = await apiJson<{ code: string }>(`/api/demandes/${demandes["analyseB3"]}/avis`, tokens["delegueSansDelegant"], {
    method: "POST",
    body: JSON.stringify({ motif: "Sans délégant" }),
  });
  assert.equal(avis.status, 403);
  assert.equal(avis.body.code, "FORBIDDEN");
});

test("alignement : la visibilité d'analyse et l'autorisation d avis concordent (même ensemble de départements)", async () => {
  // Le responsable A voit la demande de A (par code) et peut l'avis er.
  const listeA = await apiJson<DemandeDto[]>("/api/demandes", tokens["respA"]);
  assert.equal(listeA.status, 200);
  assert.ok(listeA.body.map((d) => d.reference).includes(`TST-${RUN}-C1`));

  const avisA = await apiJson<DemandeDto>(`/api/demandes/${demandes["analyseA5"]}/avis`, tokens["respA"], {
    method: "POST",
    body: JSON.stringify({ motif: "Avis concordant" }),
  });
  assert.equal(avisA.status, 200);

  // Le responsable B ne voit pas celle de A et ne peut pas l'avis er.
  const listeB = await apiJson<DemandeDto[]>("/api/demandes", tokens["respB"]);
  assert.ok(!listeB.body.map((d) => d.reference).includes(`TST-${RUN}-CA`));

  const avisB = await apiJson<{ code: string }>(`/api/demandes/${demandes["analyseA6"]}/avis`, tokens["respB"], {
    method: "POST",
    body: JSON.stringify({ motif: "Fuite entre départements" }),
  });
  assert.equal(avisB.status, 403);
  assert.equal(avisB.body.code, "FORBIDDEN");
});
