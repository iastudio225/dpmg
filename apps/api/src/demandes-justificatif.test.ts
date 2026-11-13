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
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { PrismaClient, RoleType, StructureType, DemandeStatus, UserStatus } from "@prisma/client";
import app from "./app";

const RUN = randomBytes(3).toString("hex");
const UPLOADS_ROOT = mkdtempSync(join(tmpdir(), `dpmg-justificatif-${RUN}-`));
process.env["UPLOAD_DIR"] = UPLOADS_ROOT;

let server: Server;
let baseUrl: string;
let prisma: PrismaClient;

const userIds: string[] = [];
const createdDepartmentIds: string[] = [];
const createdStructureCodes: string[] = [];
const createdDemandeIds: string[] = [];

let structId = "";
let deptId = "";
let codeA = "";
let authorId = "";
let deptManagerId = "";
let dpmgId = "";
let intruderId = "";
let tokenDept = "";
let tokenDpmg = "";
let tokenIntruder = "";

const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n", "utf8");
const PDF_BYTES_2 = Buffer.from("%PDF-1.4\n2 0 obj\n<< /Type /Pages >>\nendobj\n%%EOF\n", "utf8");

async function createStructure(code: string): Promise<string> {
  const s = await prisma.structure.create({ data: { code, name: `S ${code}`, type: StructureType.OTHER } });
  createdStructureCodes.push(code);
  return s.id;
}
async function createDepartment(code: string, structureId: string): Promise<string> {
  const d = await prisma.department.create({ data: { code, name: `D ${code}`, structureId } });
  createdDepartmentIds.push(d.id);
  return d.id;
}
async function createUser(tag: string, roles: { role: RoleType; structureId: string; scope: string }[]): Promise<string> {
  const u = await prisma.user.create({ data: { email: `${tag}-${RUN}@t.justif.test`, firstName: tag, lastName: RUN, passwordHash: "h", status: UserStatus.ACTIVE } });
  userIds.push(u.id);
  for (const r of roles) await prisma.userStructureRole.create({ data: { userId: u.id, structureId: r.structureId, role: r.role, scope: r.scope, startDate: new Date() } });
  const token = `tok-${RUN}-${tag}`;
  await prisma.session.create({ data: { userId: u.id, token, expiresAt: new Date(Date.now() + 3600000) } });
  if (tag === "deptManager") tokenDept = token;
  if (tag === "dpmg") tokenDpmg = token;
  if (tag === "intruder") tokenIntruder = token;
  return u.id;
}

function authHeaders(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiJson(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeaders(token), ...init.headers },
  });
}

async function uploadProof(
  demandeId: string,
  token: string,
  body: Buffer,
  fileName = "rapport.pdf",
  mimeType = "application/pdf",
  observations?: string
): Promise<Response> {
  const query = observations ? `?observations=${encodeURIComponent(observations)}` : "";
  return fetch(`${baseUrl}/api/demandes/${demandeId}/satisfaction/file${query}`, {
    method: "POST",
    headers: {
      "Content-Type": mimeType,
      "X-File-Name": encodeURIComponent(fileName),
      "X-File-Type": mimeType,
      ...authHeaders(token),
    },
    body,
  });
}

async function downloadProof(demandeId: string, token: string): Promise<Response> {
  return fetch(`${baseUrl}/api/demandes/${demandeId}/justificatif`, {
    headers: authHeaders(token),
  });
}

let disposeInterruptionCleanup: (() => void) | null = null;
async function deleteFixtures(): Promise<void> {
  await runCleanupSteps([
    ["notifications", () => prisma.notificationOutbox.deleteMany({ where: { demande: { authorId: { in: userIds } } } })],
    ["decisions", () => prisma.demandeDecision.deleteMany({ where: { demande: { authorId: { in: userIds } } } })],
    ["demandes", () => prisma.demande.deleteMany({ where: { authorId: { in: userIds } } })],
    ["sessions", () => prisma.session.deleteMany({ where: { userId: { in: userIds } } })],
    ["roles", () => prisma.userStructureRole.deleteMany({ where: { userId: { in: userIds } } })],
    ["users", () => prisma.user.deleteMany({ where: { id: { in: userIds } } })],
    ["structures", () => prisma.structure.deleteMany({ where: { code: { in: createdStructureCodes } } })],
    ["departments", () => prisma.department.deleteMany({ where: { id: { in: createdDepartmentIds } } })],
  ]);
}

before(async () => {
  prisma = new PrismaClient();
  await sweepTestResidues(prisma);
  disposeInterruptionCleanup = installInterruptionCleanup(deleteFixtures);

  structId = await createStructure(`TST-${RUN}-JS`);
  codeA = `TST-${RUN}-JS-A`;
  deptId = await createDepartment(codeA, structId);

  authorId = await createUser("auteur", [{ role: RoleType.EMPLOYEE, structureId: structId, scope: codeA }]);
  deptManagerId = await createUser("deptManager", [{ role: RoleType.DEPARTMENT_MANAGER, structureId: structId, scope: codeA }]);
  dpmgId = await createUser("dpmg", [{ role: RoleType.DPMG_MANAGER, structureId: structId, scope: "*" }]);
  intruderId = await createUser("intruder", [{ role: RoleType.EMPLOYEE, structureId: structId, scope: `TST-${RUN}-AUTRE` }]);

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
    disposeInterruptionCleanup?.();
    disposeInterruptionCleanup = null;
    rmSync(UPLOADS_ROOT, { recursive: true, force: true });
    await closeTestServer(server).catch(() => {});
    if (prisma) await prisma.$disconnect().catch(() => {});
  }
});

async function makeDemandeStarted(status: DemandeStatus = DemandeStatus.EN_ATTENTE_EXECUTION): Promise<string> {
  const d = await prisma.demande.create({
    data: {
      reference: `TST-${RUN}-JF${Math.random().toString(36).slice(2, 6)}`,
      title: "t",
      description: "d",
      status,
      category: "INFRASTRUCTURE",
      departmentId: deptId,
      authorId,
      submittedAt: new Date(),
    },
  });
  createdDemandeIds.push(d.id);
  if (status === DemandeStatus.EN_ATTENTE_EXECUTION) {
    const res = await apiJson(`/api/demandes/${d.id}/execution/start`, tokenDept, { method: "POST" });
    assert.equal(res.status, 200);
  }
  return d.id;
}

test("justificatif : téléversement d'un PDF puis téléchargement par un utilisateur habilité", async () => {
  const demandeId = await makeDemandeStarted();

  const upload = await uploadProof(demandeId, tokenDept, PDF_BYTES, "rapport.pdf", "application/pdf", "Travaux terminés");
  assert.equal(upload.status, 201);
  const body = await upload.json() as any;
  assert.equal(body.status, "EN_ATTENTE_CONFIRMATION_SATISFACTION");
  assert.equal(body.satisfactionProofUrl, `/api/demandes/${demandeId}/justificatif`);
  assert.equal(body.satisfactionObservations, "Travaux terminés");

  const db = await prisma.demande.findUnique({ where: { id: demandeId } });
  assert.equal(db!.satisfactionProofUrl, `/api/demandes/${demandeId}/justificatif`);
  assert.ok(db!.satisfiedAt);

  const download = await downloadProof(demandeId, tokenDept);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("content-type"), "application/pdf");
  const received = Buffer.from(await download.arrayBuffer());
  assert.deepEqual(received, PDF_BYTES);
});

test("justificatif : téléchargement refusé pour un utilisateur non habilité", async () => {
  const demandeId = await makeDemandeStarted();
  const upload = await uploadProof(demandeId, tokenDept, PDF_BYTES);
  assert.equal(upload.status, 201);

  const forbidden = await downloadProof(demandeId, tokenIntruder);
  assert.equal(forbidden.status, 404);
});

test("justificatif : refusé sans prise en charge préalable", async () => {
  const d = await prisma.demande.create({
    data: {
      reference: `TST-${RUN}-NS${Math.random().toString(36).slice(2, 6)}`,
      title: "t",
      description: "d",
      status: DemandeStatus.EN_ATTENTE_EXECUTION,
      category: "INFRASTRUCTURE",
      departmentId: deptId,
      authorId,
      submittedAt: new Date(),
    },
  });
  createdDemandeIds.push(d.id);

  const upload = await uploadProof(d.id, tokenDept, PDF_BYTES);
  assert.equal(upload.status, 403);
  const body = await upload.json() as any;
  assert.equal(body.code, "DEMANDE_NOT_STARTED");
});

test("justificatif : un nouvel envoi remplace le fichier précédent", async () => {
  const demandeId = await makeDemandeStarted();
  assert.equal((await uploadProof(demandeId, tokenDept, PDF_BYTES)).status, 201);

  // Retour au département puis nouvelle déclaration : le second fichier remplace le premier.
  const back = await apiJson(`/api/demandes/${demandeId}/execution/return`, tokenDpmg, {
    method: "POST",
    body: JSON.stringify({ motif: "reprise" }),
  });
  assert.equal(back.status, 200);
  const restarted = await apiJson(`/api/demandes/${demandeId}/execution/start`, tokenDept, { method: "POST" });
  assert.equal(restarted.status, 200);

  const second = await uploadProof(demandeId, tokenDept, PDF_BYTES_2, "rapport2.pdf");
  assert.equal(second.status, 201);

  const download = await downloadProof(demandeId, tokenDept);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("content-disposition"), `inline; filename*=UTF-8''rapport2.pdf`);
  const received = Buffer.from(await download.arrayBuffer());
  assert.deepEqual(received, PDF_BYTES_2);
});

test("justificatif : format de fichier refusé", async () => {
  const demandeId = await makeDemandeStarted();
  const upload = await uploadProof(demandeId, tokenDept, Buffer.from("MZ..."), "script.exe", "application/octet-stream");
  assert.equal(upload.status, 400);
  const body = await upload.json() as any;
  assert.equal(body.code, "VALIDATION_ERROR");
});

test("justificatif : corps vide refusé", async () => {
  const demandeId = await makeDemandeStarted();
  const upload = await uploadProof(demandeId, tokenDept, Buffer.alloc(0));
  assert.equal(upload.status, 400);
});

test("justificatif : la clôture reste possible après téléversement", async () => {
  const demandeId = await makeDemandeStarted();
  assert.equal((await uploadProof(demandeId, tokenDept, PDF_BYTES)).status, 201);

  const close = await apiJson(`/api/demandes/${demandeId}/close`, tokenDpmg, { method: "POST" });
  assert.equal(close.status, 200);
  const body = await close.json() as any;
  assert.equal(body.status, "CLOTUREE");

  const download = await downloadProof(demandeId, tokenDpmg);
  assert.equal(download.status, 200);
});
