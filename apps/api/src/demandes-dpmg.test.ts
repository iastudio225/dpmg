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
 * Lot 6.1 — Décision DPMG.
 *
 * La décision DPMG est un circuit distinct de la validation hiérarchique et de
 * l'avis départemental :
 *  - elle s'applique à une demande en EN_ATTENTE_DECISION ;
 *  - elle est réservée aux rôles DPMG_MANAGER / DPMG_DELEGATE actifs ;
 *  - l'approbation DPMG place la demande en attente de financement, ce qui ne
 *    signifie PAS que les fonds sont disponibles ;
 *  - refus et retour exigent un motif.
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
const demandes: Record<string, string> = {};

let structDpmg = "";
let structAutre = "";
let deptA = "";
let deptB = "";
let codeA = "";
let codeB = "";

async function createStructure(code: string, parentId?: string): Promise<string> {
  const structure = await prisma.structure.create({
    data: { code, name: `Structure ${code}`, type: StructureType.OTHER, parentId },
  });
  createdStructureCodes.push(code);
  return structure.id;
}

async function createDepartment(code: string, structureId: string | null): Promise<string> {
  const dept = await prisma.department.create({
    data: { code, name: `Département ${code}`, description: "phase 6.1", structureId },
  });
  createdDepartmentIds.push(dept.id);
  return dept.id;
}

async function createUser(tag: string, roles: RoleSpec[]): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email: `${tag}-${RUN}@t.phase6.test`,
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
  return prisma.demandeDecision.findMany({ where: { demandeId }, orderBy: { createdAt: "asc" } });
}

async function statutOf(demandeId: string): Promise<string | undefined> {
  const demande = await prisma.demande.findUnique({ where: { id: demandeId } });
  return demande?.status;
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

  structDpmg = await createStructure(`TST-${RUN}-DPMG`);
  structAutre = await createStructure(`TST-${RUN}-AUTRE`, structDpmg);

  codeA = `TST-${RUN}-A`;
  codeB = `TST-${RUN}-B`;
  deptA = await createDepartment(codeA, structDpmg);
  deptB = await createDepartment(codeB, structAutre);

  // Auteur des demandes
  await createUser("auteur", [{ role: RoleType.EMPLOYEE, structureId: structDpmg, scope: codeA }]);

  // DPMG_MANAGER global : compétence DPMG sur l'ensemble des départements
  await createUser("dpmgGlobal", [{ role: RoleType.DPMG_MANAGER, structureId: structDpmg, scope: "*" }]);
  // DPMG_MANAGER limité au département A
  await createUser("dpmgPerimetre", [{ role: RoleType.DPMG_MANAGER, structureId: structDpmg, scope: codeA }]);
  // DPMG_MANAGER d'un autre département
  await createUser("dpmgAutreDept", [{ role: RoleType.DPMG_MANAGER, structureId: structAutre, scope: codeB }]);
  // DPMG_MANAGER dont l'habilitation est expirée
  await createUser("dpmgExpire", [
    {
      role: RoleType.DPMG_MANAGER,
      structureId: structDpmg,
      scope: "*",
      startDate: new Date(Date.now() - 90 * 24 * 3600 * 1000),
      endDate: new Date(Date.now() - 24 * 3600 * 1000),
    },
  ]);
  // DPMG_DELEGATE dont le délégant est un DPMG_MANAGER actif
  await createUser("dpmgDelegue", [
    {
      role: RoleType.DPMG_DELEGATE,
      structureId: structDpmg,
      scope: "*",
      delegatedFromUserId: users["dpmgGlobal"]!,
    },
  ]);
  // DPMG_DELEGATE dont le délégant n'est pas DPMG_MANAGER
  await createUser("dpmgDelegueOrphelin", [
    {
      role: RoleType.DPMG_DELEGATE,
      structureId: structDpmg,
      scope: "*",
      delegatedFromUserId: users["auteur"]!,
    },
  ]);
  // DPMG_DELEGATE dont la délégation est expirée
  await createUser("dpmgDelegueExpire", [
    {
      role: RoleType.DPMG_DELEGATE,
      structureId: structDpmg,
      scope: "*",
      startDate: new Date(Date.now() - 90 * 24 * 3600 * 1000),
      endDate: new Date(Date.now() - 24 * 3600 * 1000),
      delegatedFromUserId: users["dpmgGlobal"]!,
    },
  ]);
  // Rôles sans pouvoir décisionnel DPMG
  await createUser("dfcControleur", [{ role: RoleType.DFC_CONTROLLER, structureId: structDpmg, scope: "*" }]);
  await createUser("dgUser", [{ role: RoleType.DG_USER, structureId: structDpmg, scope: "*" }]);
  await createUser("employeScopeStar", [{ role: RoleType.EMPLOYEE, structureId: structDpmg, scope: "*" }]);

  // Demandes
  demandes["approve"] = await createDemandeRow(`TST-${RUN}-P1`, users["auteur"]!, DemandeStatus.EN_ATTENTE_DECISION, deptA);
  demandes["approveB"] = await createDemandeRow(`TST-${RUN}-P2`, users["auteur"]!, DemandeStatus.EN_ATTENTE_DECISION, deptB);
  demandes["refuse"] = await createDemandeRow(`TST-${RUN}-P3`, users["auteur"]!, DemandeStatus.EN_ATTENTE_DECISION, deptA);
  demandes["return"] = await createDemandeRow(`TST-${RUN}-P4`, users["auteur"]!, DemandeStatus.EN_ATTENTE_DECISION, deptA);
  demandes["nonHabilite"] = await createDemandeRow(`TST-${RUN}-P5`, users["auteur"]!, DemandeStatus.EN_ATTENTE_DECISION, deptA);
  demandes["auteur"] = await createDemandeRow(`TST-${RUN}-P6`, users["auteur"]!, DemandeStatus.EN_ATTENTE_DECISION, deptA);
  demandes["mauvaisStatut"] = await createDemandeRow(`TST-${RUN}-P7`, users["auteur"]!, DemandeStatus.EN_ATTENTE_ANALYSE, deptA);
  demandes["dejaDecidee"] = await createDemandeRow(`TST-${RUN}-P8`, users["auteur"]!, DemandeStatus.EN_ATTENTE_FINANCEMENT, deptA);
  demandes["repetee"] = await createDemandeRow(`TST-${RUN}-P9`, users["auteur"]!, DemandeStatus.EN_ATTENTE_DECISION, deptA);
  demandes["concurrence"] = await createDemandeRow(`TST-${RUN}-PA`, users["auteur"]!, DemandeStatus.EN_ATTENTE_DECISION, deptA);
  demandes["historique"] = await createDemandeRow(`TST-${RUN}-PB`, users["auteur"]!, DemandeStatus.EN_ATTENTE_DECISION, deptA);
  demandes["horsPerimetre"] = await createDemandeRow(`TST-${RUN}-PC`, users["auteur"]!, DemandeStatus.EN_ATTENTE_DECISION, deptA);
  demandes["delegation"] = await createDemandeRow(`TST-${RUN}-PD`, users["auteur"]!, DemandeStatus.EN_ATTENTE_DECISION, deptA);
  demandes["delegationInvalide"] = await createDemandeRow(`TST-${RUN}-PE`, users["auteur"]!, DemandeStatus.EN_ATTENTE_DECISION, deptA);
  demandes["scopeStarSeul"] = await createDemandeRow(`TST-${RUN}-PF`, users["auteur"]!, DemandeStatus.EN_ATTENTE_DECISION, deptA);
  demandes["visible"] = await createDemandeRow(`TST-${RUN}-PG`, users["auteur"]!, DemandeStatus.EN_ATTENTE_DECISION, deptA);
  demandes["listeVisible"] = await createDemandeRow(`TST-${RUN}-PH`, users["auteur"]!, DemandeStatus.EN_ATTENTE_DECISION, deptA);
  demandes["ficheVisible"] = await createDemandeRow(`TST-${RUN}-PI`, users["auteur"]!, DemandeStatus.EN_ATTENTE_DECISION, deptA);
  demandes["perimetreA"] = await createDemandeRow(`TST-${RUN}-PJ`, users["auteur"]!, DemandeStatus.EN_ATTENTE_DECISION, deptA);
  demandes["perimetreB"] = await createDemandeRow(`TST-${RUN}-PK`, users["auteur"]!, DemandeStatus.EN_ATTENTE_DECISION, deptB);

  // Historique préexistant sur une demande à décider
  await prisma.demandeDecision.create({
    data: {
      demandeId: demandes["historique"]!,
      actorId: users["auteur"]!,
      type: "AVIS_DEPARTEMENTAL",
      motif: "Avis préalable",
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

// ---------------------------------------------------------------------------
// Décisions autorisées
// ---------------------------------------------------------------------------

test("décision DPMG : l'approbation place la demande en attente de financement", async () => {
  const { status, body } = await apiJson<DemandeDto>(
    `/api/demandes/${demandes["approve"]}/dpmg/approve`,
    tokens["dpmgGlobal"],
    { method: "POST", body: JSON.stringify({ commentaire: "Dossier complet" }) }
  );

  assert.equal(status, 200);
  assert.equal(body.status, "EN_ATTENTE_FINANCEMENT");

  const decisions = await decisionsFor(demandes["approve"]!);
  const dpmg = decisions.find((d) => d.type === "DECISION_DPMG_APPROBATION");
  assert.ok(dpmg, "une décision DECISION_DPMG_APPROBATION doit être créée");
  assert.equal(dpmg!.actorId, users["dpmgGlobal"]);
  assert.equal(dpmg!.commentaire, "Dossier complet");
});

test("décision DPMG : l'approbation ne vaut pas disponibilité des fonds", async () => {
  // La demande approuvée est en attente de financement : elle n'est ni exécutable
  // ni refusée, et aucun type de décision DFC n'a été produit.
  const decisions = await decisionsFor(demandes["approve"]!);
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0]!.type, "DECISION_DPMG_APPROBATION");
  assert.notEqual(decisions[0]!.type, "APPROBATION", "l'événement doit être distinct de l'approbation hiérarchique");
});

test("décision DPMG : le refus exige un motif et conduit au statut REFUSEE", async () => {
  const { status, body } = await apiJson<DemandeDto>(
    `/api/demandes/${demandes["refuse"]}/dpmg/refuse`,
    tokens["dpmgGlobal"],
    { method: "POST", body: JSON.stringify({ motif: "Hors stratégie" }) }
  );

  assert.equal(status, 200);
  assert.equal(body.status, "REFUSEE");

  const decisions = await decisionsFor(demandes["refuse"]!);
  const dpmg = decisions.find((d) => d.type === "DECISION_DPMG_REFUS");
  assert.ok(dpmg);
  assert.equal(dpmg!.actorId, users["dpmgGlobal"]);
  assert.equal(dpmg!.motif, "Hors stratégie");
});

test("décision DPMG : le retour exige un motif et conduit au statut RETOURNEE", async () => {
  const { status, body } = await apiJson<DemandeDto>(
    `/api/demandes/${demandes["return"]}/dpmg/return`,
    tokens["dpmgGlobal"],
    { method: "POST", body: JSON.stringify({ motif: "Préciser le besoin" }) }
  );

  assert.equal(status, 200);
  assert.equal(body.status, "RETOURNEE");

  const decisions = await decisionsFor(demandes["return"]!);
  const dpmg = decisions.find((d) => d.type === "DECISION_DPMG_RETOUR");
  assert.ok(dpmg);
  assert.equal(dpmg!.motif, "Préciser le besoin");
});

test("décision DPMG : un responsable DPMG à périmètre restreint décide sur son département", async () => {
  const { status, body } = await apiJson<DemandeDto>(
    `/api/demandes/${demandes["perimetreA"]}/dpmg/approve`,
    tokens["dpmgPerimetre"],
    { method: "POST", body: JSON.stringify({}) }
  );

  assert.equal(status, 200);
  assert.equal(body.status, "EN_ATTENTE_FINANCEMENT");
});

test("décision DPMG : un responsable DPMG à périmètre restreint est refusé hors de son département", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(
    `/api/demandes/${demandes["perimetreB"]}/dpmg/approve`,
    tokens["dpmgPerimetre"],
    { method: "POST", body: JSON.stringify({}) }
  );

  assert.equal(status, 403);
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(await statutOf(demandes["perimetreB"]!), "EN_ATTENTE_DECISION");
  assert.equal((await decisionsFor(demandes["perimetreB"]!)).length, 0);
});

// ---------------------------------------------------------------------------
// Autorisations
// ---------------------------------------------------------------------------

test("décision DPMG : un acteur sans rôle DPMG est refusé", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(
    `/api/demandes/${demandes["nonHabilite"]}/dpmg/approve`,
    tokens["employeScopeStar"],
    { method: "POST", body: JSON.stringify({}) }
  );

  assert.equal(status, 403);
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(await statutOf(demandes["nonHabilite"]!), "EN_ATTENTE_DECISION");
  assert.equal((await decisionsFor(demandes["nonHabilite"]!)).length, 0);
});

test("décision DPMG : scope \"*\" seul, sans rôle DPMG, ne confère aucun droit", async () => {
  for (const tag of ["dfcControleur", "dgUser", "employeScopeStar"]) {
    const { status, body } = await apiJson<ApiErrorBody>(
      `/api/demandes/${demandes["scopeStarSeul"]}/dpmg/approve`,
      tokens[tag],
      { method: "POST", body: JSON.stringify({}) }
    );
    assert.equal(status, 403, `${tag} doit être refusé`);
    assert.equal(body.code, "FORBIDDEN");
  }
  assert.equal((await decisionsFor(demandes["scopeStarSeul"]!)).length, 0);
});

test("décision DPMG : un responsable DPMG d'un autre département est refusé", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(
    `/api/demandes/${demandes["horsPerimetre"]}/dpmg/approve`,
    tokens["dpmgAutreDept"],
    { method: "POST", body: JSON.stringify({}) }
  );

  assert.equal(status, 403);
  assert.equal(body.code, "FORBIDDEN");
  assert.equal((await decisionsFor(demandes["horsPerimetre"]!)).length, 0);
});

test("décision DPMG : une habilitation DPMG expirée est refusée", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(
    `/api/demandes/${demandes["nonHabilite"]}/dpmg/approve`,
    tokens["dpmgExpire"],
    { method: "POST", body: JSON.stringify({}) }
  );

  assert.equal(status, 403);
  assert.equal(body.code, "FORBIDDEN");
  assert.equal((await decisionsFor(demandes["nonHabilite"]!)).length, 0);
});

test("décision DPMG : l'auteur de la demande ne peut pas décider de sa propre demande", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(
    `/api/demandes/${demandes["auteur"]}/dpmg/approve`,
    tokens["auteur"],
    { method: "POST", body: JSON.stringify({}) }
  );

  assert.equal(status, 403);
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(await statutOf(demandes["auteur"]!), "EN_ATTENTE_DECISION");
  assert.equal((await decisionsFor(demandes["auteur"]!)).length, 0);
});

test("décision DPMG : une délégation DPMG_DELEGATE valide est acceptée", async () => {
  const { status, body } = await apiJson<DemandeDto>(
    `/api/demandes/${demandes["delegation"]}/dpmg/approve`,
    tokens["dpmgDelegue"],
    { method: "POST", body: JSON.stringify({}) }
  );

  assert.equal(status, 200);
  assert.equal(body.status, "EN_ATTENTE_FINANCEMENT");

  const dpmg = (await decisionsFor(demandes["delegation"]!)).find(
    (d) => d.type === "DECISION_DPMG_APPROBATION"
  );
  assert.equal(dpmg?.actorId, users["dpmgDelegue"]);
});

test("décision DPMG : une délégation invalide est refusée", async () => {
  for (const tag of ["dpmgDelegueOrphelin", "dpmgDelegueExpire"]) {
    const { status, body } = await apiJson<ApiErrorBody>(
      `/api/demandes/${demandes["delegationInvalide"]}/dpmg/approve`,
      tokens[tag],
      { method: "POST", body: JSON.stringify({}) }
    );
    assert.equal(status, 403, `${tag} doit être refusé`);
    assert.equal(body.code, "FORBIDDEN");
  }
  assert.equal((await decisionsFor(demandes["delegationInvalide"]!)).length, 0);
});

// ---------------------------------------------------------------------------
// Validation des entrées, statuts et idempotence
// ---------------------------------------------------------------------------

test("décision DPMG : un refus sans motif est refusé en 400 sans mutation", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(
    `/api/demandes/${demandes["repetee"]}/dpmg/refuse`,
    tokens["dpmgGlobal"],
    { method: "POST", body: JSON.stringify({ motif: "   " }) }
  );

  assert.equal(status, 400);
  assert.equal(body.code, "VALIDATION_ERROR");
  assert.equal(await statutOf(demandes["repetee"]!), "EN_ATTENTE_DECISION");
  assert.equal((await decisionsFor(demandes["repetee"]!)).length, 0);
});

test("décision DPMG : un retour sans motif est refusé en 400 sans mutation", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(
    `/api/demandes/${demandes["repetee"]}/dpmg/return`,
    tokens["dpmgGlobal"],
    { method: "POST", body: JSON.stringify({}) }
  );

  assert.equal(status, 400);
  assert.equal(body.code, "VALIDATION_ERROR");
  assert.equal((await decisionsFor(demandes["repetee"]!)).length, 0);
});

test("décision DPMG : un statut source incompatible est refusé", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(
    `/api/demandes/${demandes["mauvaisStatut"]}/dpmg/approve`,
    tokens["dpmgGlobal"],
    { method: "POST", body: JSON.stringify({}) }
  );

  assert.equal(status, 403);
  assert.equal(body.code, "DEMANDE_NOT_DECISION");
  assert.equal((await decisionsFor(demandes["mauvaisStatut"]!)).length, 0);
});

test("décision DPMG : une demande déjà traitée ne peut pas être décidée une seconde fois", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(
    `/api/demandes/${demandes["dejaDecidee"]}/dpmg/approve`,
    tokens["dpmgGlobal"],
    { method: "POST", body: JSON.stringify({}) }
  );

  assert.equal(status, 403);
  assert.equal(body.code, "DEMANDE_NOT_DECISION");
  assert.equal((await decisionsFor(demandes["dejaDecidee"]!)).length, 0);
});

test("décision DPMG : la requête répétée est refusée sans créer de seconde décision", async () => {
  const first = await apiJson<DemandeDto>(
    `/api/demandes/${demandes["repetee"]}/dpmg/approve`,
    tokens["dpmgGlobal"],
    { method: "POST", body: JSON.stringify({}) }
  );
  assert.equal(first.status, 200);

  const second = await apiJson<ApiErrorBody>(
    `/api/demandes/${demandes["repetee"]}/dpmg/approve`,
    tokens["dpmgGlobal"],
    { method: "POST", body: JSON.stringify({}) }
  );
  assert.equal(second.status, 403);
  assert.equal(second.body.code, "DEMANDE_NOT_DECISION");

  const decisions = await decisionsFor(demandes["repetee"]!);
  assert.equal(decisions.length, 1, "une seule décision doit être enregistrée");
  assert.equal(decisions[0]!.type, "DECISION_DPMG_APPROBATION");
});

test("décision DPMG : deux décisions concurrentes ne produisent qu'une seule transition", async () => {
  const target = demandes["concurrence"]!;
  const [a, b] = await Promise.all([
    apiJson<DemandeDto>(`/api/demandes/${target}/dpmg/approve`, tokens["dpmgGlobal"], {
      method: "POST",
      body: JSON.stringify({}),
    }),
    apiJson<ApiErrorBody>(`/api/demandes/${target}/dpmg/approve`, tokens["dpmgDelegue"], {
      method: "POST",
      body: JSON.stringify({}),
    }),
  ]);

  // Le vainqueur de la course n'est pas déterministe : une seule action doit aboutir.
  const codes = [a.status, b.status].sort();
  assert.deepEqual(codes, [200, 403], "une seule décision doit aboutir");
  assert.equal((await decisionsFor(target)).length, 1, "une seule décision doit être enregistrée");
  assert.equal(await statutOf(target), "EN_ATTENTE_FINANCEMENT");
});

// ---------------------------------------------------------------------------
// Traçabilité
// ---------------------------------------------------------------------------

test("décision DPMG : l'historique antérieur est conservé", async () => {
  const { status } = await apiJson<DemandeDto>(
    `/api/demandes/${demandes["historique"]}/dpmg/approve`,
    tokens["dpmgGlobal"],
    { method: "POST", body: JSON.stringify({ commentaire: "Après avis" }) }
  );
  assert.equal(status, 200);

  const decisions = await decisionsFor(demandes["historique"]!);
  assert.equal(decisions.length, 2, "l'avis départemental doit être conservé");
  assert.equal(decisions[0]!.type, "AVIS_DEPARTEMENTAL");
  assert.equal(decisions[0]!.motif, "Avis préalable");
  assert.equal(decisions[1]!.type, "DECISION_DPMG_APPROBATION");
  assert.equal(decisions[1]!.actorId, users["dpmgGlobal"]);
});

test("décision DPMG : le changement de statut et la décision sont atomiques", async () => {
  const demandeId = demandes["visible"]!;
  const before = await decisionsFor(demandeId);
  assert.equal(before.length, 0);

  const { status } = await apiJson<DemandeDto>(
    `/api/demandes/${demandeId}/dpmg/approve`,
    tokens["dpmgGlobal"],
    { method: "POST", body: JSON.stringify({}) }
  );
  assert.equal(status, 200);

  const after = await decisionsFor(demandeId);
  assert.equal(after.length, 1, "la décision est créée avec le changement de statut");
  assert.equal(await statutOf(demandeId), "EN_ATTENTE_FINANCEMENT");
});

// ---------------------------------------------------------------------------
// Visibilité
// ---------------------------------------------------------------------------

test("décision DPMG : le décideur habilité voit les demandes à décider dans la liste", async () => {
  const { status, body } = await apiJson<DemandeDto[]>("/api/demandes", tokens["dpmgGlobal"]);
  assert.equal(status, 200);

  const ids = body.map((d) => d.id);
  assert.ok(ids.includes(demandes["listeVisible"]!), "la demande à décider doit être visible");
});

test("décision DPMG : un utilisateur non habilité ne voit pas les demandes à décider", async () => {
  const { status, body } = await apiJson<DemandeDto[]>("/api/demandes", tokens["employeScopeStar"]);
  assert.equal(status, 200);
  assert.ok(!body.map((d) => d.id).includes(demandes["listeVisible"]!));
});

test("décision DPMG : le décideur habilité accède à la fiche d'une demande à décider", async () => {
  const { status, body } = await apiJson<DemandeDto>(
    `/api/demandes/${demandes["ficheVisible"]}`,
    tokens["dpmgGlobal"]
  );
  assert.equal(status, 200);
  assert.equal(body.id, demandes["ficheVisible"]);
});
