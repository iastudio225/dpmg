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
import { PrismaClient, UserStatus } from "@prisma/client";
import app from "./app";

const RUN = randomBytes(3).toString("hex");

let server: Server;
let baseUrl: string;
let prisma: PrismaClient;

const userIds: string[] = [];
const createdStructureCodes: string[] = [];
const createdDepartmentIds: string[] = [];

let structureId = "";
let departmentId = "";
let userA = "";
let userB = "";
let tokenA = "";
let tokenB = "";

async function createStructure(code: string): Promise<string> {
  const s = await prisma.structure.create({ data: { code, name: `S ${code}`, type: "OTHER", status: true } });
  createdStructureCodes.push(code);
  return s.id;
}
async function createDepartment(code: string, structureId: string): Promise<string> {
  const d = await prisma.department.create({ data: { code, name: `D ${code}`, structureId } });
  createdDepartmentIds.push(d.id);
  return d.id;
}

let disposeInterruptionCleanup: (() => void) | null = null;
async function deleteFixtures(): Promise<void> {
  await runCleanupSteps([
    ["notifications", () => prisma.notification.deleteMany({ where: { userId: { in: userIds } } })],
    ["outbox", () => prisma.notificationOutbox.deleteMany({ where: { recipientUserId: { in: userIds } } })],
    ["demandes (notifications FK)", () => prisma.demande.deleteMany({ where: { authorId: { in: userIds } } })],
    ["sessions", () => prisma.session.deleteMany({ where: { userId: { in: userIds } } })],
    ["users", () => prisma.user.deleteMany({ where: { id: { in: userIds } } })],
    ["structures", () => prisma.structure.deleteMany({ where: { code: { in: createdStructureCodes } } })],
    ["departments", () => prisma.department.deleteMany({ where: { id: { in: createdDepartmentIds } } })],
  ]);
}

async function api(path: string, token?: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
}

before(async () => {
  prisma = new PrismaClient();
  await sweepTestResidues(prisma);
  disposeInterruptionCleanup = installInterruptionCleanup(deleteFixtures);

  structureId = await createStructure(`TST-${RUN}-N`);
  departmentId = await createDepartment(`TST-${RUN}-ND`, structureId);

  const ua = await prisma.user.create({ data: { email: `ua-${RUN}@t.phase963.test`, firstName: "ua", lastName: RUN, passwordHash: "h", status: UserStatus.ACTIVE } });
  userIds.push(ua.id);
  userA = ua.id;
  tokenA = `tok-${RUN}-ua`;
  await prisma.session.create({ data: { userId: ua.id, token: tokenA, expiresAt: new Date(Date.now() + 3600000) } });

  const ub = await prisma.user.create({ data: { email: `ub-${RUN}@t.phase963.test`, firstName: "ub", lastName: RUN, passwordHash: "h", status: UserStatus.ACTIVE } });
  userIds.push(ub.id);
  userB = ub.id;
  tokenB = `tok-${RUN}-ub`;
  await prisma.session.create({ data: { userId: ub.id, token: tokenB, expiresAt: new Date(Date.now() + 3600000) } });

  for (let i = 0; i < 5; i++) {
    await prisma.notification.create({
      data: { userId: userA, eventKey: `evt-${RUN}-a-${i}`, type: "DEMANDE_SOUMISE", title: `notif ${i}`, isRead: i < 2 },
    });
  }
  await prisma.notification.create({
    data: { userId: userB, eventKey: `evt-${RUN}-b-0`, type: "DEMANDE_SOUMISE", title: "notif B" },
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
  try { await deleteFixtures(); } finally {
    disposeInterruptionCleanup?.();
    disposeInterruptionCleanup = null;
    await closeTestServer(server).catch(() => {});
    if (prisma) await prisma.$disconnect().catch(() => {});
  }
});

test("notif API : non authentifié → 401", async () => {
  const res = await api("/api/notifications");
  assert.equal(res.status, 401);
  const res2 = await api("/api/notifications/unread-count");
  assert.equal(res2.status, 401);
});

test("notif API : liste uniquement les notifications de l'utilisateur", async () => {
  const res = await api("/api/notifications", tokenA);
  assert.equal(res.status, 200);
  const body = await res.json() as any;
  assert.ok(Array.isArray(body.items));
  assert.equal(body.items.length, 5);
});

test("notif API : isolation par utilisateur (B ne voit pas celles de A)", async () => {
  const res = await api("/api/notifications", tokenB);
  assert.equal(res.status, 200);
  const body = await res.json() as any;
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].title, "notif B");
});

test("notif API : filtre isRead=true", async () => {
  const res = await api("/api/notifications?isRead=true", tokenA);
  assert.equal(res.status, 200);
  const body = await res.json() as any;
  assert.equal(body.items.length, 2);
  for (const n of body.items) assert.equal(n.isRead, true);
});

test("notif API : filtre isRead=false", async () => {
  const res = await api("/api/notifications?isRead=false", tokenA);
  assert.equal(res.status, 200);
  const body = await res.json() as any;
  assert.equal(body.items.length, 3);
  for (const n of body.items) assert.equal(n.isRead, false);
});

test("notif API : tri stable du plus récent au plus ancien", async () => {
  const res = await api("/api/notifications", tokenA);
  const body = await res.json() as any;
  for (let i = 1; i < body.items.length; i++) {
    const prev = new Date(body.items[i-1].createdAt).getTime();
    const curr = new Date(body.items[i].createdAt).getTime();
    assert.ok(prev >= curr, "tri décroissant par createdAt");
  }
});

test("notif API : pagination par curseur", async () => {
  const res1 = await api("/api/notifications?limit=2", tokenA);
  assert.equal(res1.status, 200);
  const body1 = await res1.json() as any;
  assert.equal(body1.items.length, 2);
  assert.ok(body1.nextCursor);
  const res2 = await api(`/api/notifications?limit=2&cursor=${encodeURIComponent(body1.nextCursor)}`, tokenA);
  assert.equal(res2.status, 200);
  const body2 = await res2.json() as any;
  assert.equal(body2.items.length, 2);
  const ids1 = body1.items.map((n: any) => n.id);
  const ids2 = body2.items.map((n: any) => n.id);
  for (const id of ids2) assert.ok(!ids1.includes(id), "pas de doublon entre pages");
});

test("notif API : paramètre invalides → 400", async () => {
  const res = await api("/api/notifications?limit=0", tokenA);
  assert.equal(res.status, 400);
  const res2 = await api("/api/notifications?limit=abc", tokenA);
  assert.equal(res2.status, 400);
  const res3 = await api("/api/notifications?cursor=!!!invalid", tokenA);
  assert.equal(res3.status, 400);
});

test("notif API : unread-count exact et isolé", async () => {
  const res = await api("/api/notifications/unread-count", tokenA);
  assert.equal(res.status, 200);
  const body = await res.json() as any;
  assert.equal(body.count, 3);
  const resB = await api("/api/notifications/unread-count", tokenB);
  const bodyB = await resB.json() as any;
  assert.equal(bodyB.count, 1);
});

test("notif API : marquer une notification comme lue", async () => {
  const list = await (await api("/api/notifications?isRead=false", tokenA)).json() as any;
  const id = list.items[0].id;
  const res = await api(`/api/notifications/${id}/read`, tokenA, { method: "PATCH" });
  assert.equal(res.status, 200);
  const body = await res.json() as any;
  assert.equal(body.isRead, true);
  assert.ok(body.readAt);
});

test("notif API : idempotence de read (déjà lue)", async () => {
  const list = await (await api("/api/notifications?isRead=true", tokenA)).json() as any;
  const id = list.items[0].id;
  const res = await api(`/api/notifications/${id}/read`, tokenA, { method: "PATCH" });
  assert.equal(res.status, 200);
  const body = await res.json() as any;
  assert.equal(body.isRead, true);
});

test("notif API : marquer la notification d'un autre utilisateur → 404", async () => {
  const listB = await (await api("/api/notifications", tokenB)).json() as any;
  const idB = listB.items[0].id;
  const res = await api(`/api/notifications/${idB}/read`, tokenA, { method: "PATCH" });
  assert.equal(res.status, 404);
});

test("notif API : notification inexistante → 404", async () => {
  const res = await api("/api/notifications/cuid-inexistant-xxx/read", tokenA, { method: "PATCH" });
  assert.equal(res.status, 404);
});

test("notif API : read-all ne modifie que les non lues de l'utilisateur", async () => {
  const res = await api("/api/notifications/read-all", tokenA, { method: "PATCH" });
  assert.equal(res.status, 200);
  const body = await res.json() as any;
  assert.ok(typeof body.updated === "number");
  const resB = await api("/api/notifications/unread-count", tokenB);
  const bodyB = await resB.json() as any;
  assert.equal(bodyB.count, 1);
});

test("notif API : read-all idempotent (seconde exécution sans effet)", async () => {
  const res = await api("/api/notifications/read-all", tokenA, { method: "PATCH" });
  assert.equal(res.status, 200);
  const body = await res.json() as any;
  assert.equal(body.updated, 0);
});

// --- Lot 9.6.6 : navigation et lecture automatique ---
test("notif API 9.6.6 : markReadByDemande marque les non lues d'une demande", async () => {
  const dd = await prisma.demande.create({ data: { reference: `TST-966-${RUN}`, title: "t", description: "d", status: "BROUILLON", category: "INFRASTRUCTURE", departmentId, authorId: userA, submittedAt: null } });
  await prisma.notification.create({ data: { userId: userA, demandeId: dd.id, eventKey: `evt-966a-${RUN}`, type: "DEMANDE_SOUMISE", title: "a", isRead: false } });
  await prisma.notification.create({ data: { userId: userA, demandeId: dd.id, eventKey: `evt-966b-${RUN}`, type: "DEMANDE_SOUMISE", title: "b", isRead: false } });

  const res = await api(`/api/notifications/by-demande/${dd.id}/read`, tokenA, { method: "PATCH" });
  assert.equal(res.status, 200);
  const body = await res.json() as any;
  assert.equal(body.updated, 2);

  const res2 = await api(`/api/notifications/by-demande/${dd.id}/read`, tokenA, { method: "PATCH" });
  const body2 = await res2.json() as any;
  assert.equal(body2.updated, 0);
});

test("notif API 9.6.6 : markReadByDemande n'affecte pas les notifications d'un autre utilisateur", async () => {
  const dd = await prisma.demande.create({ data: { reference: `TST-966B-${RUN}`, title: "t", description: "d", status: "BROUILLON", category: "INFRASTRUCTURE", departmentId, authorId: userB, submittedAt: null } });
  await prisma.notification.create({ data: { userId: userB, demandeId: dd.id, eventKey: `evt-966c-${RUN}`, type: "DEMANDE_SOUMISE", title: "c", isRead: false } });

  const res = await api(`/api/notifications/by-demande/${dd.id}/read`, tokenA, { method: "PATCH" });
  assert.equal(res.status, 200);
  const body = await res.json() as any;
  assert.equal(body.updated, 0);

  const cnt = await prisma.notification.count({ where: { userId: userB, demandeId: dd.id, isRead: false } });
  assert.equal(cnt, 1);
});

test("notif API 9.6.6 : markReadByDemande ne marque que les non lues de la demande concernée", async () => {
  const dd1 = await prisma.demande.create({ data: { reference: `TST-966D1-${RUN}`, title: "t", description: "d", status: "BROUILLON", category: "INFRASTRUCTURE", departmentId, authorId: userA, submittedAt: null } });
  const dd2 = await prisma.demande.create({ data: { reference: `TST-966D2-${RUN}`, title: "t", description: "d", status: "BROUILLON", category: "INFRASTRUCTURE", departmentId, authorId: userA, submittedAt: null } });
  await prisma.notification.create({ data: { userId: userA, demandeId: dd1.id, eventKey: `evt-966d1-${RUN}`, type: "DEMANDE_SOUMISE", title: "d1", isRead: false } });
  await prisma.notification.create({ data: { userId: userA, demandeId: dd2.id, eventKey: `evt-966d2-${RUN}`, type: "DEMANDE_SOUMISE", title: "d2", isRead: false } });

  const res = await api(`/api/notifications/by-demande/${dd1.id}/read`, tokenA, { method: "PATCH" });
  assert.equal(res.status, 200);
  const body = await res.json() as any;
  assert.equal(body.updated, 1);

  const cnt = await prisma.notification.count({ where: { userId: userA, demandeId: dd2.id, isRead: false } });
  assert.equal(cnt, 1);
});