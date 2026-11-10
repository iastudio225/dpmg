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
import { PrismaClient, RoleType, StructureType, UserStatus, DemandeStatus, DemandeDecisionType } from "@prisma/client";
import app from "./app";

/**
 * Tests de sécurité du circuit de validation hiérarchique.
 *
 * Règle vérifiée : l'action hiérarchique (approve / refuse / return) n'est
 * autorisée que pour le VALIDATEUR DÉSIGNÉ de la demande, déterminé à partir de
 * la hiérarchie de l'auteur et des délégations actives.
 *
 * Règle de délégation : pendant une délégation active et valide, le délégué
 * REMPLACE le responsable délégant ; le délégant ne peut plus exercer le pouvoir
 * qu'il a délégué, et la substitution ne produit pas d'ambiguïté.
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
/** departmentId par structure de rattachement (une demande est rattachée au département de sa structure) */
const deptByStructure: Record<string, string> = {};

let structDept = "";
let structRoot = "";
let structHier = "";
let structDeleg = "";
let structDelegWildcard = "";
let structDelegWildcardTropLarge = "";
let structDelegWildcardPartiel = "";
let structDelegExpire = "";
let structDelegFutur = "";
let structDelegPerimetre = "";
let structDelegInactif = "";
let structDelegSansDelegant = "";
let structExpire = "";
let structIsole = "";
let structAmbigu = "";
let deptCode = "";

async function createStructure(code: string, parentId?: string): Promise<string> {
  const structure = await prisma.structure.create({
    data: { code, name: `Structure ${code}`, type: StructureType.OTHER, parentId },
  });
  createdStructureCodes.push(code);
  return structure.id;
}

async function createUser(
  tag: string,
  roles: RoleSpec[],
  status: UserStatus = UserStatus.ACTIVE
): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email: `${tag}-${RUN}@t.phase5.test`,
      firstName: tag,
      lastName: RUN,
      passwordHash: "hash-non-utilise-tests",
      status,
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

async function createDepartmentForStructure(structureId: string, suffix: string): Promise<string> {
  const dept = await prisma.department.create({
    data: {
      code: `TST-${RUN}-${suffix}`,
      name: `Département ${suffix}-${RUN}`,
      description: "phase 5 lot 4.5",
      structureId,
    },
  });
  createdDepartmentIds.push(dept.id);
  deptByStructure[suffix] = dept.id;
  return dept.id;
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

async function decisionsOfType(demandeId: string, type: DemandeDecisionType) {
  return prisma.demandeDecision.findMany({ where: { demandeId, type } });
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

  structDept = await createStructure(`TST-${RUN}-DEPT`);
  structRoot = await createStructure(`TST-${RUN}-ROOT`);
  structHier = await createStructure(`TST-${RUN}-HIER`, structRoot);
  structDeleg = await createStructure(`TST-${RUN}-DELE`, structRoot);
  structDelegWildcard = await createStructure(`TST-${RUN}-DWIL`, structRoot);
  structDelegWildcardTropLarge = await createStructure(`TST-${RUN}-DWTL`, structRoot);
  structDelegWildcardPartiel = await createStructure(`TST-${RUN}-DWPA`, structRoot);
  structDelegExpire = await createStructure(`TST-${RUN}-DEXP`, structRoot);
  structDelegFutur = await createStructure(`TST-${RUN}-DFUT`, structRoot);
  structDelegPerimetre = await createStructure(`TST-${RUN}-DPER`, structRoot);
  structDelegInactif = await createStructure(`TST-${RUN}-DINA`, structRoot);
  structDelegSansDelegant = await createStructure(`TST-${RUN}-DSAN`, structRoot);
  structExpire = await createStructure(`TST-${RUN}-EXPI`, structRoot);
  structIsole = await createStructure(`TST-${RUN}-ISO`);
  structAmbigu = await createStructure(`TST-${RUN}-AMB`, structRoot);

  deptCode = `TST-${RUN}-DEPT`;
  const dept = await prisma.department.create({
    data: { code: deptCode, name: `Département test-${RUN}`, description: "phase 5", structureId: structDept },
  });
  createdDepartmentIds.push(dept.id);

  // Chaque structure qui héberge des demandes dispose de son propre département :
  // la structure de référence de la validation est celle du DÉPARTEMENT de la demande.
  await createDepartmentForStructure(structHier, "HIER");
  await createDepartmentForStructure(structDeleg, "DELE");
  await createDepartmentForStructure(structDelegWildcard, "DWIL");
  await createDepartmentForStructure(structDelegWildcardTropLarge, "DWTL");
  await createDepartmentForStructure(structDelegWildcardPartiel, "DWPA");
  await createDepartmentForStructure(structDelegExpire, "DEXP");
  await createDepartmentForStructure(structDelegFutur, "DFUT");
  await createDepartmentForStructure(structDelegPerimetre, "DPER");
  await createDepartmentForStructure(structDelegInactif, "DINA");
  await createDepartmentForStructure(structDelegSansDelegant, "DSAN");
  await createDepartmentForStructure(structExpire, "EXPI");
  await createDepartmentForStructure(structIsole, "ISO");
  await createDepartmentForStructure(structAmbigu, "AMB");

  // --- Validateur de repli au niveau racine (structure parente)
  await createUser("managerRoot", [
    { role: RoleType.HIERARCHICAL_MANAGER, structureId: structRoot, scope: deptCode },
  ]);

  // --- Hiérarchie principale : auteur employé, validateur manager hiérarchique
  await createUser("auteur", [{ role: RoleType.EMPLOYEE, structureId: structHier, scope: deptCode }]);
  await createUser("validateur", [
    { role: RoleType.HIERARCHICAL_MANAGER, structureId: structHier, scope: deptCode },
  ]);
  await createUser("collegue", [{ role: RoleType.EMPLOYEE, structureId: structHier, scope: deptCode }]);
  await createUser("etranger", [{ role: RoleType.EMPLOYEE, structureId: structDept, scope: deptCode }]);

  // --- Délégation ACTIVE : le délégué remplace le délégant
  await createUser("auteurDeleg", [{ role: RoleType.EMPLOYEE, structureId: structDeleg, scope: deptCode }]);
  await createUser("managerDeleg", [
    { role: RoleType.HIERARCHICAL_MANAGER, structureId: structDeleg, scope: deptCode },
  ]);
  await createUser("delegueActif", [
    {
      role: RoleType.DELEGATED_REPRESENTATIVE,
      structureId: structDeleg,
      scope: deptCode,
      delegatedFromUserId: users["managerDeleg"]!,
    },
  ]);

  // --- Délégation à périmètre "*" : le délégant global délègue à périmètre global
  await createUser("auteurDelegWildcard", [
    { role: RoleType.EMPLOYEE, structureId: structDelegWildcard, scope: deptCode },
  ]);
  await createUser("managerDelegWildcard", [
    { role: RoleType.HIERARCHICAL_MANAGER, structureId: structDelegWildcard, scope: "*" },
  ]);
  await createUser("delegueWildcard", [
    {
      role: RoleType.DELEGATED_REPRESENTATIVE,
      structureId: structDelegWildcard,
      scope: "*",
      delegatedFromUserId: users["managerDelegWildcard"]!,
    },
  ]);

  // --- Délégué au périmètre "*" mais dont le délégant a un périmètre départemental :
  //     refus (le délégué obtiendrait un périmètre plus large).
  await createUser("auteurDelegWildcardTropLarge", [
    { role: RoleType.EMPLOYEE, structureId: structDelegWildcardTropLarge, scope: deptCode },
  ]);
  await createUser("managerRestreint", [
    { role: RoleType.HIERARCHICAL_MANAGER, structureId: structDelegWildcardTropLarge, scope: deptCode },
  ]);
  await createUser("delegueWildcardTropLarge", [
    {
      role: RoleType.DELEGATED_REPRESENTATIVE,
      structureId: structDelegWildcardTropLarge,
      scope: "*",
      delegatedFromUserId: users["managerRestreint"]!,
    },
  ]);

  // --- Délégué au périmètre départemental alors que le délégant est global :
  //     refus (substitution partielle non prise en charge).
  await createUser("auteurDelegWildcardPartiel", [
    { role: RoleType.EMPLOYEE, structureId: structDelegWildcardPartiel, scope: deptCode },
  ]);
  await createUser("managerGlobalPartiel", [
    { role: RoleType.HIERARCHICAL_MANAGER, structureId: structDelegWildcardPartiel, scope: "*" },
  ]);
  await createUser("delegueRestreintTropLarge", [
    {
      role: RoleType.DELEGATED_REPRESENTATIVE,
      structureId: structDelegWildcardPartiel,
      scope: deptCode,
      delegatedFromUserId: users["managerGlobalPartiel"]!,
    },
  ]);

  // --- Délégation EXPIRÉE : le responsable conserve son pouvoir
  await createUser("auteurDelegExp", [{ role: RoleType.EMPLOYEE, structureId: structDelegExpire, scope: deptCode }]);  await createUser("managerDelegExp", [
    { role: RoleType.HIERARCHICAL_MANAGER, structureId: structDelegExpire, scope: deptCode },
  ]);
  await createUser("delegueExpire", [
    {
      role: RoleType.DELEGATED_REPRESENTATIVE,
      structureId: structDelegExpire,
      scope: deptCode,
      startDate: new Date(Date.now() - 90 * 24 * 3600 * 1000),
      endDate: new Date(Date.now() - 24 * 3600 * 1000),
      delegatedFromUserId: users["managerDelegExp"]!,
    },
  ]);

  // --- Délégation pas encore active
  await createUser("auteurDelegFutur", [{ role: RoleType.EMPLOYEE, structureId: structDelegFutur, scope: deptCode }]);
  await createUser("managerDelegFutur", [
    { role: RoleType.HIERARCHICAL_MANAGER, structureId: structDelegFutur, scope: deptCode },
  ]);
  await createUser("delegueFutur", [
    {
      role: RoleType.DELEGATED_REPRESENTATIVE,
      structureId: structDelegFutur,
      scope: deptCode,
      startDate: new Date(Date.now() + 24 * 3600 * 1000),
      delegatedFromUserId: users["managerDelegFutur"]!,
    },
  ]);

  // --- Délégation hors périmètre (périmètre du délégué != périmètre du délégant)
  await createUser("auteurDelegPerim", [{ role: RoleType.EMPLOYEE, structureId: structDelegPerimetre, scope: deptCode }]);
  await createUser("managerDelegPerim", [
    { role: RoleType.HIERARCHICAL_MANAGER, structureId: structDelegPerimetre, scope: deptCode },
  ]);
  await createUser("delegueHorsPerimetre", [
    {
      role: RoleType.DELEGATED_REPRESENTATIVE,
      structureId: structDelegPerimetre,
      scope: `AUTRE-${RUN}`,
      delegatedFromUserId: users["managerDelegPerim"]!,
    },
  ]);

  // --- Délégation dont le représentant a un compte inactif
  await createUser("auteurDelegInactif", [{ role: RoleType.EMPLOYEE, structureId: structDelegInactif, scope: deptCode }]);
  await createUser("managerDelegInactif", [
    { role: RoleType.HIERARCHICAL_MANAGER, structureId: structDelegInactif, scope: deptCode },
  ]);
  await createUser("delegueInactif", [
    {
      role: RoleType.DELEGATED_REPRESENTATIVE,
      structureId: structDelegInactif,
      scope: deptCode,
      delegatedFromUserId: users["managerDelegInactif"]!,
    },
  ], UserStatus.SUSPENDED);

  // --- Délégation rattachée à un délégant qui n'est pas manager hiérarchique
  await createUser("auteurDelegSans", [{ role: RoleType.EMPLOYEE, structureId: structDelegSansDelegant, scope: deptCode }]);
  await createUser("managerDelegSans", [
    { role: RoleType.HIERARCHICAL_MANAGER, structureId: structDelegSansDelegant, scope: deptCode },
  ]);
  await createUser("delegueSansDelegant", [
    {
      role: RoleType.DELEGATED_REPRESENTATIVE,
      structureId: structDelegSansDelegant,
      scope: deptCode,
      delegatedFromUserId: users["auteurDelegSans"]!,
    },
  ]);

  // --- Manager hiérarchique dont l'habilitation est expirée
  await createUser("auteurExpire", [{ role: RoleType.EMPLOYEE, structureId: structExpire, scope: deptCode }]);
  await createUser("validateurExpire", [
    {
      role: RoleType.HIERARCHICAL_MANAGER,
      structureId: structExpire,
      scope: deptCode,
      startDate: new Date(Date.now() - 90 * 24 * 3600 * 1000),
      endDate: new Date(Date.now() - 24 * 3600 * 1000),
    },
  ]);

  // --- Structure isolée : aucun manager hiérarchique, aucune parenté
  await createUser("auteurIsole", [{ role: RoleType.EMPLOYEE, structureId: structIsole, scope: deptCode }]);

  // --- Structure ambiguë : deux managers hiérarchiques réellement concurrents
  await createUser("auteurAmbigu", [{ role: RoleType.EMPLOYEE, structureId: structAmbigu, scope: deptCode }]);
  await createUser("managerA", [{ role: RoleType.HIERARCHICAL_MANAGER, structureId: structAmbigu, scope: deptCode }]);
  await createUser("managerB", [{ role: RoleType.HIERARCHICAL_MANAGER, structureId: structAmbigu, scope: deptCode }]);

  // --- Demandes : hiérarchie simple (structure HIER)
  demandes["approve"] = await createDemandeRow(`TST-${RUN}-V1`, users["auteur"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptByStructure["HIER"]!);
  demandes["refuse"] = await createDemandeRow(`TST-${RUN}-V2`, users["auteur"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptByStructure["HIER"]!);
  demandes["return"] = await createDemandeRow(`TST-${RUN}-V3`, users["auteur"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptByStructure["HIER"]!);
  demandes["collegueApprove"] = await createDemandeRow(`TST-${RUN}-V4`, users["auteur"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptByStructure["HIER"]!);
  demandes["collegueRefuse"] = await createDemandeRow(`TST-${RUN}-V5`, users["auteur"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptByStructure["HIER"]!);
  demandes["collegueReturn"] = await createDemandeRow(`TST-${RUN}-V6`, users["auteur"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptByStructure["HIER"]!);
  demandes["auteurApprove"] = await createDemandeRow(`TST-${RUN}-V7`, users["auteur"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptByStructure["HIER"]!);
  demandes["etrangerApprove"] = await createDemandeRow(`TST-${RUN}-V8`, users["auteur"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptByStructure["HIER"]!);
  demandes["delegueAutreStructure"] = await createDemandeRow(`TST-${RUN}-V9`, users["auteur"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptByStructure["HIER"]!);
  demandes["sansValidateur"] = await createDemandeRow(`TST-${RUN}-VA`, users["auteurIsole"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptByStructure["ISO"]!);
  demandes["ambigu"] = await createDemandeRow(`TST-${RUN}-VB`, users["auteurAmbigu"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptByStructure["AMB"]!);
  demandes["dejaTraitee"] = await createDemandeRow(`TST-${RUN}-VC`, users["auteur"]!, DemandeStatus.EN_ATTENTE_ANALYSE, deptByStructure["HIER"]!);
  demandes["repetee"] = await createDemandeRow(`TST-${RUN}-VD`, users["auteur"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptByStructure["HIER"]!);
  demandes["concurrence"] = await createDemandeRow(`TST-${RUN}-VE`, users["auteur"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptByStructure["HIER"]!);
  demandes["validateurExpire"] = await createDemandeRow(`TST-${RUN}-VF`, users["auteurExpire"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptByStructure["EXPI"]!);

  // --- Demandes : délégation active (le délégué remplace le délégant)
  demandes["delegApprove"] = await createDemandeRow(`TST-${RUN}-D1`, users["auteurDeleg"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptByStructure["DELE"]!);
  demandes["delegRefuse"] = await createDemandeRow(`TST-${RUN}-D2`, users["auteurDeleg"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptByStructure["DELE"]!);
  demandes["delegReturn"] = await createDemandeRow(`TST-${RUN}-D3`, users["auteurDeleg"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptByStructure["DELE"]!);
  demandes["delegManager"] = await createDemandeRow(`TST-${RUN}-D4`, users["auteurDeleg"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptByStructure["DELE"]!);
  demandes["delegVoisin"] = await createDemandeRow(`TST-${RUN}-D5`, users["auteurDeleg"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptByStructure["DELE"]!);
  demandes["delegAuteur"] = await createDemandeRow(`TST-${RUN}-D6`, users["managerDeleg"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptByStructure["DELE"]!);
  demandes["delegPasAmbigu"] = await createDemandeRow(`TST-${RUN}-D7`, users["auteurDeleg"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptByStructure["DELE"]!);
  demandes["delegAuteurRefus"] = await createDemandeRow(`TST-${RUN}-D8`, users["auteurDeleg"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptByStructure["DELE"]!);

  // --- Demandes : délégations invalides (le responsable conserve son pouvoir)
  demandes["delegWildcard"] = await createDemandeRow(`TST-${RUN}-W1`, users["auteurDelegWildcard"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptByStructure["DWIL"]!);
  demandes["delegWildcardManager"] = await createDemandeRow(`TST-${RUN}-W2`, users["auteurDelegWildcard"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptByStructure["DWIL"]!);
  demandes["delegWildcardTropLarge"] = await createDemandeRow(`TST-${RUN}-W3`, users["auteurDelegWildcardTropLarge"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptByStructure["DWTL"]!);
  demandes["delegWildcardPartiel"] = await createDemandeRow(`TST-${RUN}-W4`, users["auteurDelegWildcardPartiel"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptByStructure["DWPA"]!);
  demandes["delegWildcardAutreStructure"] = await createDemandeRow(`TST-${RUN}-W5`, users["auteur"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptByStructure["HIER"]!);
  demandes["delegExpire"] = await createDemandeRow(`TST-${RUN}-E1`, users["auteurDelegExp"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptByStructure["DEXP"]!);
  demandes["delegExpireManager"] = await createDemandeRow(`TST-${RUN}-E2`, users["auteurDelegExp"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptByStructure["DEXP"]!);
  demandes["delegFutur"] = await createDemandeRow(`TST-${RUN}-E3`, users["auteurDelegFutur"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptByStructure["DFUT"]!);
  demandes["delegFuturManager"] = await createDemandeRow(`TST-${RUN}-E4`, users["auteurDelegFutur"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptByStructure["DFUT"]!);
  demandes["delegPerimetre"] = await createDemandeRow(`TST-${RUN}-E5`, users["auteurDelegPerim"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptByStructure["DPER"]!);
  demandes["delegPerimetreManager"] = await createDemandeRow(`TST-${RUN}-E6`, users["auteurDelegPerim"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptByStructure["DPER"]!);
  demandes["delegInactif"] = await createDemandeRow(`TST-${RUN}-E7`, users["auteurDelegInactif"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptByStructure["DINA"]!);
  demandes["delegInactifManager"] = await createDemandeRow(`TST-${RUN}-E8`, users["auteurDelegInactif"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptByStructure["DINA"]!);
  demandes["delegSansDelegant"] = await createDemandeRow(`TST-${RUN}-E9`, users["auteurDelegSans"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptByStructure["DSAN"]!);
  demandes["delegSansDelegantManager"] = await createDemandeRow(`TST-${RUN}-EA`, users["auteurDelegSans"]!, DemandeStatus.EN_ATTENTE_VALIDATION, deptByStructure["DSAN"]!);

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
// 1. Délégation valide : le délégué agit, le délégant ne peut plus agir
// ---------------------------------------------------------------------------

test("délégation : le représentant délégué actif approuve une demande couverte", async () => {
  const { status, body } = await apiJson<DemandeDto>(`/api/demandes/${demandes["delegApprove"]}/approve`, tokens["delegueActif"], {
    method: "POST",
  });

  assert.equal(status, 200);
  assert.equal(body.status, "EN_ATTENTE_ANALYSE");

  const approbations = await decisionsOfType(demandes["delegApprove"]!, "APPROBATION");
  assert.equal(approbations.length, 1);
  assert.equal(approbations[0]!.actorId, users["delegueActif"]);
});

test("délégation : le représentant délégué actif refuse avec motif", async () => {
  const { status, body } = await apiJson<DemandeDto>(`/api/demandes/${demandes["delegRefuse"]}/refuse`, tokens["delegueActif"], {
    method: "POST",
    body: JSON.stringify({ motif: "Hors budget" }),
  });

  assert.equal(status, 200);
  assert.equal(body.status, "REFUSEE");

  const refus = await decisionsOfType(demandes["delegRefuse"]!, "REFUS");
  assert.equal(refus.length, 1);
  assert.equal(refus[0]!.actorId, users["delegueActif"]);
  assert.equal(refus[0]!.motif, "Hors budget");
});

test("délégation : le représentant délégué actif retourne pour correction", async () => {
  const { status, body } = await apiJson<DemandeDto>(`/api/demandes/${demandes["delegReturn"]}/return`, tokens["delegueActif"], {
    method: "POST",
    body: JSON.stringify({ commentaire: "Précisez le besoin" }),
  });

  assert.equal(status, 200);
  assert.equal(body.status, "RETOURNEE");

  const retours = await decisionsOfType(demandes["delegReturn"]!, "RETOUR");
  assert.equal(retours.length, 1);
  assert.equal(retours[0]!.actorId, users["delegueActif"]);
  assert.equal(retours[0]!.commentaire, "Précisez le besoin");
});

test("délégation : une délégation valide ne produit pas VALIDATEUR_AMBIGU", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["delegPasAmbigu"]}/approve`, tokens["delegueActif"], {
    method: "POST",
  });

  assert.equal(status, 200);
  assert.notEqual(body.code, "VALIDATEUR_AMBIGU");
});

test("délégation : le délégant ne peut pas exercer le pouvoir délégué pendant la délégation", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["delegManager"]}/approve`, tokens["managerDeleg"], {
    method: "POST",
  });

  assert.equal(status, 403);
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(await statutOf(demandes["delegManager"]!), "EN_ATTENTE_VALIDATION");
  assert.equal((await decisionsFor(demandes["delegManager"]!)).length, 0);
});

test("délégation : le délégant ne peut ni refuser ni retourner pendant la délégation", async () => {
  const refus = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["delegManager"]}/refuse`, tokens["managerDeleg"], {
    method: "POST",
    body: JSON.stringify({ motif: "Auto-décision" }),
  });
  assert.equal(refus.status, 403);
  assert.equal(refus.body.code, "FORBIDDEN");

  const retour = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["delegManager"]}/return`, tokens["managerDeleg"], {
    method: "POST",
    body: JSON.stringify({ motif: "Auto-décision" }),
  });
  assert.equal(retour.status, 403);
  assert.equal(retour.body.code, "FORBIDDEN");

  assert.equal((await decisionsFor(demandes["delegManager"]!)).length, 0);
});

test("délégation : une délégation sur une structure ne confère aucun pouvoir sur une autre structure", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(
    `/api/demandes/${demandes["delegueAutreStructure"]}/approve`,
    tokens["delegueActif"],
    { method: "POST" }
  );

  assert.equal(status, 403);
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(await statutOf(demandes["delegueAutreStructure"]!), "EN_ATTENTE_VALIDATION");
});

test("délégation : un utilisateur non désigné d'une structure voisine reste refusé", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["delegVoisin"]}/approve`, tokens["collegue"], {
    method: "POST",
  });

  assert.equal(status, 403);
  assert.equal(body.code, "FORBIDDEN");
});

test("délégation : l'auteur de la demande ne peut pas agir comme validateur", async () => {
  const auteur = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["delegAuteurRefus"]}/approve`, tokens["auteurDeleg"], {
    method: "POST",
  });
  assert.equal(auteur.status, 403);
  assert.equal(auteur.body.code, "FORBIDDEN");
  assert.equal((await decisionsFor(demandes["delegAuteurRefus"]!)).length, 0);

  // Cas où le délégant est lui-même l'auteur : c'est son représentant qui est désigné
  const delegantAuteur = await apiJson<DemandeDto>(`/api/demandes/${demandes["delegAuteur"]}/approve`, tokens["delegueActif"], {
    method: "POST",
  });
  assert.equal(delegantAuteur.status, 200);
  assert.equal(delegantAuteur.body.status, "EN_ATTENTE_ANALYSE");
});

// ---------------------------------------------------------------------------
// 2. Délégations invalides
// ---------------------------------------------------------------------------

test("délégation : une délégation expirée est refusée", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["delegExpire"]}/approve`, tokens["delegueExpire"], {
    method: "POST",
  });

  assert.equal(status, 403);
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(await statutOf(demandes["delegExpire"]!), "EN_ATTENTE_VALIDATION");
  assert.equal((await decisionsFor(demandes["delegExpire"]!)).length, 0);
});

test("délégation : une délégation pas encore active est refusée", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["delegFutur"]}/approve`, tokens["delegueFutur"], {
    method: "POST",
  });

  assert.equal(status, 403);
  assert.equal(body.code, "FORBIDDEN");
  assert.equal((await decisionsFor(demandes["delegFutur"]!)).length, 0);
});

test("délégation : un représentant au compte inactif est refusé", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["delegInactif"]}/approve`, tokens["delegueInactif"], {
    method: "POST",
  });

  assert.equal(status, 403);
  assert.ok(body.code);
  assert.equal((await decisionsFor(demandes["delegInactif"]!)).length, 0);
});

test("délégation : une délégation rattachée à un délégant non habilité est refusée", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["delegSansDelegant"]}/approve`, tokens["delegueSansDelegant"], {
    method: "POST",
  });

  assert.equal(status, 403);
  assert.equal(body.code, "FORBIDDEN");
  assert.equal((await decisionsFor(demandes["delegSansDelegant"]!)).length, 0);
});

test("délégation : une délégation hors périmètre est refusée", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["delegPerimetre"]}/approve`, tokens["delegueHorsPerimetre"], {
    method: "POST",
  });

  assert.equal(status, 403);
  assert.equal(body.code, "FORBIDDEN");
  assert.equal((await decisionsFor(demandes["delegPerimetre"]!)).length, 0);
});

test("délégation : un manager dont l'habilitation est expirée est refusé", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["validateurExpire"]}/approve`, tokens["validateurExpire"], {
    method: "POST",
  });

  assert.equal(status, 403);
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(await statutOf(demandes["validateurExpire"]!), "EN_ATTENTE_VALIDATION");
  assert.equal((await decisionsFor(demandes["validateurExpire"]!)).length, 0);
});

// ---------------------------------------------------------------------------
// 3. Absence de délégation et ambiguïté
// ---------------------------------------------------------------------------

test("sans délégation : le validateur hiérarchique normal peut agir", async () => {
  const { status, body } = await apiJson<DemandeDto>(`/api/demandes/${demandes["approve"]}/approve`, tokens["validateur"], {
    method: "POST",
  });

  assert.equal(status, 200);
  assert.equal(body.status, "EN_ATTENTE_ANALYSE");

  const approbations = await decisionsOfType(demandes["approve"]!, "APPROBATION");
  assert.equal(approbations.length, 1);
  assert.equal(approbations[0]!.actorId, users["validateur"]);
});

test("sans délégation : le validateur hiérarchique normal peut refuser avec motif", async () => {
  const { status, body } = await apiJson<DemandeDto>(`/api/demandes/${demandes["refuse"]}/refuse`, tokens["validateur"], {
    method: "POST",
    body: JSON.stringify({ motif: "Hors budget" }),
  });

  assert.equal(status, 200);
  assert.equal(body.status, "REFUSEE");

  const refus = await decisionsOfType(demandes["refuse"]!, "REFUS");
  assert.equal(refus.length, 1);
  assert.equal(refus[0]!.actorId, users["validateur"]);
});

test("sans délégation : le validateur hiérarchique normal peut retourner pour correction", async () => {
  const { status, body } = await apiJson<DemandeDto>(`/api/demandes/${demandes["return"]}/return`, tokens["validateur"], {
    method: "POST",
    body: JSON.stringify({ motif: "Précisez le besoin" }),
  });

  assert.equal(status, 200);
  assert.equal(body.status, "RETOURNEE");

  const retours = await decisionsOfType(demandes["return"]!, "RETOUR");
  assert.equal(retours.length, 1);
  assert.equal(retours[0]!.actorId, users["validateur"]);
});

test("après expiration de la délégation, le responsable habilité retrouve son pouvoir", async () => {
  const { status, body } = await apiJson<DemandeDto>(`/api/demandes/${demandes["delegExpireManager"]}/approve`, tokens["managerDelegExp"], {
    method: "POST",
  });

  assert.equal(status, 200);
  assert.equal(body.status, "EN_ATTENTE_ANALYSE");

  const approbations = await decisionsOfType(demandes["delegExpireManager"]!, "APPROBATION");
  assert.equal(approbations.length, 1);
  assert.equal(approbations[0]!.actorId, users["managerDelegExp"]);
});

test("après expiration de la délégation, le responsable retrouve son pouvoir sur les trois actions", async () => {
  const futur = await apiJson<DemandeDto>(`/api/demandes/${demandes["delegFuturManager"]}/approve`, tokens["managerDelegFutur"], {
    method: "POST",
  });
  assert.equal(futur.status, 200);

  const perimetre = await apiJson<DemandeDto>(`/api/demandes/${demandes["delegPerimetreManager"]}/approve`, tokens["managerDelegPerim"], {
    method: "POST",
  });
  assert.equal(perimetre.status, 200);

  const inactif = await apiJson<DemandeDto>(`/api/demandes/${demandes["delegInactifManager"]}/approve`, tokens["managerDelegInactif"], {
    method: "POST",
  });
  assert.equal(inactif.status, 200);

  const sansDelegant = await apiJson<DemandeDto>(`/api/demandes/${demandes["delegSansDelegantManager"]}/approve`, tokens["managerDelegSans"], {
    method: "POST",
  });
  assert.equal(sansDelegant.status, 200);
});

test("ambiguïté : deux validateurs réellement concurrents produisent VALIDATEUR_AMBIGU", { timeout: 15000 }, async () => {
  const parA = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["ambigu"]}/approve`, tokens["managerA"], {
    method: "POST",
  });
  assert.equal(parA.status, 403);
  assert.equal(parA.body.code, "VALIDATEUR_AMBIGU");

  const parB = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["ambigu"]}/approve`, tokens["managerB"], {
    method: "POST",
  });
  assert.equal(parB.status, 403);
  assert.equal(parB.body.code, "VALIDATEUR_AMBIGU");

  assert.equal(await statutOf(demandes["ambigu"]!), "EN_ATTENTE_VALIDATION");
  assert.equal((await decisionsFor(demandes["ambigu"]!)).length, 0);
});

test("ambiguïté : aucun validateur disponible produit AUCUN_VALIDATEUR sans blocage", { timeout: 15000 }, async () => {
  const { status, body } = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["sansValidateur"]}/approve`, tokens["validateur"], {
    method: "POST",
  });

  assert.equal(status, 403);
  assert.equal(body.code, "AUCUN_VALIDATEUR");
  assert.equal(await statutOf(demandes["sansValidateur"]!), "EN_ATTENTE_VALIDATION");
  assert.equal((await decisionsFor(demandes["sansValidateur"]!)).length, 0);
});

// ---------------------------------------------------------------------------
// 4. Autres utilisateurs non autorisés
// ---------------------------------------------------------------------------

test("sécurité : un collègue non validateur ne peut pas approuver", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["collegueApprove"]}/approve`, tokens["collegue"], {
    method: "POST",
  });

  assert.equal(status, 403);
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(await statutOf(demandes["collegueApprove"]!), "EN_ATTENTE_VALIDATION");
  assert.equal((await decisionsFor(demandes["collegueApprove"]!)).length, 0);
});

test("sécurité : un collègue non validateur ne peut pas refuser", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["collegueRefuse"]}/refuse`, tokens["collegue"], {
    method: "POST",
    body: JSON.stringify({ motif: "Je invalide" }),
  });

  assert.equal(status, 403);
  assert.equal(body.code, "FORBIDDEN");
  assert.equal((await decisionsFor(demandes["collegueRefuse"]!)).length, 0);
});

test("sécurité : un collègue non validateur ne peut pas retourner", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["collegueReturn"]}/return`, tokens["collegue"], {
    method: "POST",
    body: JSON.stringify({ motif: "Je renvoie" }),
  });

  assert.equal(status, 403);
  assert.equal(body.code, "FORBIDDEN");
  assert.equal((await decisionsFor(demandes["collegueReturn"]!)).length, 0);
});

test("sécurité : un utilisateur d'une autre branche est refusé", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["etrangerApprove"]}/approve`, tokens["etranger"], {
    method: "POST",
  });

  assert.equal(status, 403);
  assert.equal(body.code, "FORBIDDEN");
});

test("sécurité : l'auteur ne peut pas agir sur sa propre demande", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["auteurApprove"]}/approve`, tokens["auteur"], {
    method: "POST",
  });

  assert.equal(status, 403);
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(await statutOf(demandes["auteurApprove"]!), "EN_ATTENTE_VALIDATION");
  assert.equal((await decisionsFor(demandes["auteurApprove"]!)).length, 0);
});

// ---------------------------------------------------------------------------
// 5. Non-régression : idempotence et concurrence
// ---------------------------------------------------------------------------

test("non-régression : une demande déjà traitée ne peut pas être traitée une seconde fois", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["dejaTraitee"]}/approve`, tokens["validateur"], {
    method: "POST",
  });

  assert.equal(status, 403);
  assert.equal(body.code, "DEMANDE_NOT_DRAFT");
  assert.equal((await decisionsFor(demandes["dejaTraitee"]!)).length, 0);
});

test("non-régression : la requête répétée est refusée sans seconde décision", async () => {
  const first = await apiJson<DemandeDto>(`/api/demandes/${demandes["repetee"]}/approve`, tokens["validateur"], {
    method: "POST",
  });
  assert.equal(first.status, 200);

  const second = await apiJson<ApiErrorBody>(`/api/demandes/${demandes["repetee"]}/approve`, tokens["validateur"], {
    method: "POST",
  });
  assert.equal(second.status, 403);
  assert.equal(second.body.code, "DEMANDE_NOT_DRAFT");
  assert.equal((await decisionsOfType(demandes["repetee"]!, "APPROBATION")).length, 1);
});

test("non-régression : deux actions concurrentes ne produisent qu'une seule transition", async () => {
  const target = demandes["concurrence"]!;
  const [a, b] = await Promise.all([
    apiJson<DemandeDto>(`/api/demandes/${target}/approve`, tokens["validateur"], { method: "POST" }),
    apiJson<ApiErrorBody>(`/api/demandes/${target}/approve`, tokens["collegue"], { method: "POST" }),
  ]);

  assert.equal(a.status, 200);
  assert.equal(b.status, 403);
  assert.equal((await decisionsOfType(target, "APPROBATION")).length, 1);
  assert.equal(await statutOf(target), "EN_ATTENTE_ANALYSE");
});

test("non-régression : deux décisions concurrentes du délégué et du délégant n'en produisent qu'une", async () => {
  const target = demandes["delegManager"]!;
  const [parDelegue, parDelegant] = await Promise.all([
    apiJson<DemandeDto>(`/api/demandes/${target}/approve`, tokens["delegueActif"], { method: "POST" }),
    apiJson<ApiErrorBody>(`/api/demandes/${target}/approve`, tokens["managerDeleg"], { method: "POST" }),
  ]);

  assert.equal(parDelegue.status, 200);
  assert.equal(parDelegant.status, 403);
  assert.equal((await decisionsOfType(target, "APPROBATION")).length, 1);
  assert.equal(await statutOf(target), "EN_ATTENTE_ANALYSE");
});

// ---------------------------------------------------------------------------
// Point B — Délégation à périmètre "*"
// ---------------------------------------------------------------------------

test("délégation \"*\" : un délégué au périmètre global remplace le responsable global", async () => {
  const { status, body } = await apiJson<DemandeDto>(
    `/api/demandes/${demandes["delegWildcard"]}/approve`,
    tokens["delegueWildcard"],
    { method: "POST" }
  );

  assert.equal(status, 200);
  assert.equal(body.status, "EN_ATTENTE_ANALYSE");

  const approbations = await decisionsOfType(demandes["delegWildcard"]!, "APPROBATION");
  assert.equal(approbations.length, 1);
  assert.equal(approbations[0]!.actorId, users["delegueWildcard"]);
});

test("délégation \"*\" : le responsable global ne peut pas exercer le pouvoir délégué", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(
    `/api/demandes/${demandes["delegWildcardManager"]}/approve`,
    tokens["managerDelegWildcard"],
    { method: "POST" }
  );

  assert.equal(status, 403);
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(await statutOf(demandes["delegWildcardManager"]!), "EN_ATTENTE_VALIDATION");
  assert.equal((await decisionsFor(demandes["delegWildcardManager"]!)).length, 0);
});

test("délégation \"*\" : un délégué au périmètre global rattaché à un responsable départemental est refusé", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(
    `/api/demandes/${demandes["delegWildcardTropLarge"]}/approve`,
    tokens["delegueWildcardTropLarge"],
    { method: "POST" }
  );

  assert.equal(status, 403);
  assert.equal(body.code, "FORBIDDEN");
  assert.equal((await decisionsFor(demandes["delegWildcardTropLarge"]!)).length, 0);
});

test("délégation \"*\" : un délégué à périmètre départemental rattaché à un responsable global est refusé", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(
    `/api/demandes/${demandes["delegWildcardPartiel"]}/approve`,
    tokens["delegueRestreintTropLarge"],
    { method: "POST" }
  );

  assert.equal(status, 403);
  assert.equal(body.code, "FORBIDDEN");
  assert.equal((await decisionsFor(demandes["delegWildcardPartiel"]!)).length, 0);
});

test("délégation \"*\" : le délégué global n'a aucun pouvoir sur une autre structure", async () => {
  const { status, body } = await apiJson<ApiErrorBody>(
    `/api/demandes/${demandes["delegWildcardAutreStructure"]}/approve`,
    tokens["delegueWildcard"],
    { method: "POST" }
  );

  assert.equal(status, 403);
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(await statutOf(demandes["delegWildcardAutreStructure"]!), "EN_ATTENTE_VALIDATION");
});
