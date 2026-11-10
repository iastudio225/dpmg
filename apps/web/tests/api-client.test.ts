import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { ApiError, authApi } from "../src/services/api";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(status: number, body: string, contentType = "application/json") {
  globalThis.fetch = async () =>
    new Response(body, { status, headers: { "Content-Type": contentType } });
}

test("réponse 401 vide : ApiError utile, pas de crash JSON.parse", async () => {
  mockFetch(401, "");
  await assert.rejects(
    () => authApi.me(),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 401);
      assert.equal(err.code, "UNAUTHORIZED");
      assert.equal(err.message, "Authentification requise");
      assert.notEqual(err.message, "Unexpected end of JSON input");
      return true;
    }
  );
});

test("réponse erreur avec body non JSON (HTML) : message utile", async () => {
  mockFetch(500, "<html><body>Bad Gateway</body></html>", "text/html");
  await assert.rejects(
    () => authApi.me(),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 500);
      assert.equal(err.code, "INTERNAL_ERROR");
      assert.ok(!err.message.includes("<html>"));
      return true;
    }
  );
});

test("réponse erreur JSON : code et message du serveur préservés", async () => {
  mockFetch(401, JSON.stringify({ code: "SESSION_EXPIRED", message: "Session expirée ou invalide" }));
  await assert.rejects(
    () => authApi.me(),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.code, "SESSION_EXPIRED");
      assert.equal(err.message, "Session expirée ou invalide");
      return true;
    }
  );
});

test("réponse 200 vide : ne lève pas d'erreur secondaire", async () => {
  mockFetch(200, "");
  const result = await authApi.me();
  assert.equal(result, undefined);
});

test("réponse 200 JSON valide : donnée retournée", async () => {
  const payload = { user: { email: "a@b.fr" }, roles: [] };
  mockFetch(200, JSON.stringify(payload));
  const result = await authApi.me();
  assert.deepEqual(result, payload);
});
