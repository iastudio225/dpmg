import "./test-env";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "http";
import type { AddressInfo } from "net";
import express from "express";
import app from "./app";
import { getEnv } from "./config";
import {
  AppError,
  asyncHandler,
  errorHandler,
  notFoundHandler,
} from "./middleware/errorHandler";

let server: Server;
let baseUrl: string;

let errorApp: Server;
let errorBaseUrl: string;

const unhandledRejections: unknown[] = [];
process.on("unhandledRejection", (reason) => {
  unhandledRejections.push(reason);
});

function listen(target: express.Express): Promise<{ server: Server; url: string }> {
  return new Promise((resolve, reject) => {
    const s = target.listen(0, "127.0.0.1", () => {
      const address = s.address() as AddressInfo;
      resolve({ server: s, url: `http://127.0.0.1:${address.port}` });
    });
    s.on("error", reject);
  });
}

before(async () => {
  const main = await listen(app);
  server = main.server;
  baseUrl = main.url;

  const eapp = express();
  eapp.use(express.json());
  eapp.get(
    "/api/boom-500",
    asyncHandler(async () => {
      throw new Error("stack-secret-should-not-leak");
    })
  );
  eapp.get(
    "/api/boom-401",
    asyncHandler(async () => {
      throw new AppError("UNAUTHORIZED", "Authentification requise", 401);
    })
  );
  eapp.use(notFoundHandler);
  eapp.use(errorHandler);

  const e = await listen(eapp);
  errorApp = e.server;
  errorBaseUrl = e.url;
});

after(() => {
  server?.close();
  errorApp?.close();
});

test("GET /api/auth/me sans session renvoie 401 JSON", async () => {
  const res = await fetch(`${baseUrl}/api/auth/me`);
  assert.equal(res.status, 401);
  assert.match(res.headers.get("content-type") ?? "", /application\/json/);
  const body = (await res.json()) as { code: string; message: string };
  assert.equal(body.code, "UNAUTHORIZED");
  assert.equal(body.message, "Authentification requise");
});

test("GET /api/auth/me avec session invalide renvoie 401 SESSION_EXPIRED (non 500)", async () => {
  const res = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Cookie: `dpmg.sid=${"ab".repeat(32)}` },
  });
  assert.equal(res.status, 401);
  const body = (await res.json()) as { code: string; message: string };
  assert.equal(body.code, "SESSION_EXPIRED");
});

test("load-env rend DATABASE_URL disponible au démarrage de l'API", () => {
  assert.ok(
    getEnv().DATABASE_URL,
    "DATABASE_URL doit être chargé depuis le .env racine via load-env (non-régression HTTP 500 sur /api/auth/*)"
  );
});

test("le serveur reste opérationnel après le 401", async () => {
  await fetch(`${baseUrl}/api/auth/me`);
  const res = await fetch(`${baseUrl}/api/health/health`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { status: string };
  assert.equal(body.status, "ok");
});

test("POST /api/auth/login avec body invalide renvoie 400 sans arrêter le processus", async () => {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "not-an-email", password: "" }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string; message: string };
  assert.equal(body.code, "VALIDATION_ERROR");

  const alive = await fetch(`${baseUrl}/api/auth/me`);
  assert.equal(alive.status, 401);
});

test("POST /api/auth/login avec identifiants inconnus renvoie 401 INVALID_CREDENTIALS", async () => {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "inconnu@example.com", password: "MotDePasse!123" }),
  });
  assert.equal(res.status, 401);
  const body = (await res.json()) as { code: string; message: string };
  assert.equal(body.code, "INVALID_CREDENTIALS");

  const alive = await fetch(`${baseUrl}/api/health/health`);
  assert.equal(alive.status, 200);
});

test("une erreur interne asynchrone renvoie 500 JSON sans stack trace ni secret", async () => {
  const res = await fetch(`${errorBaseUrl}/api/boom-500`);
  assert.equal(res.status, 500);
  const raw = await res.text();
  const body = JSON.parse(raw) as Record<string, unknown>;
  assert.equal(body["code"], "INTERNAL_ERROR");
  assert.ok(!raw.includes("stack-secret-should-not-leak"));
  assert.ok(!("stack" in body));
});

test("un AppError asynchrone est transmis au gestionnaire global (401 JSON)", async () => {
  const res = await fetch(`${errorBaseUrl}/api/boom-401`);
  assert.equal(res.status, 401);
  const body = (await res.json()) as { code: string; message: string };
  assert.equal(body.code, "UNAUTHORIZED");
  assert.equal(body.message, "Authentification requise");
});

test("une route inconnue renvoie 404 JSON", async () => {
  const res = await fetch(`${errorBaseUrl}/api/rien`);
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "NOT_FOUND");
});

test("aucun rejet de promesse non géré pendant les tests", async () => {
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(unhandledRejections.length, 0, `Rejets détectés: ${unhandledRejections.join(", ")}`);
});
