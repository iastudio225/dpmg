import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:5173/",
});

function defineGlobal(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

defineGlobal("window", dom.window);
defineGlobal("document", dom.window.document);
defineGlobal("Node", dom.window.Node);
defineGlobal("Element", dom.window.Element);
defineGlobal("HTMLElement", dom.window.HTMLElement);
defineGlobal("MutationObserver", dom.window.MutationObserver);
defineGlobal("IS_REACT_ACT_ENVIRONMENT", true);

type FetchHandler = (init?: RequestInit) => Response;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetch(routes: Record<string, FetchHandler>) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${(init?.method ?? "GET").toUpperCase()} ${String(input)}`;
    const handler = routes[key];
    if (!handler) throw new Error(`Requête inattendue: ${key}`);
    return handler(init);
  }) as typeof fetch;
}

const unhandledRejections: unknown[] = [];
process.on("unhandledRejection", (reason) => {
  unhandledRejections.push(reason);
});

const { AuthProvider, useAuth } = await import("../src/context/AuthContext");
const { ApiError } = await import("../src/services/api");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react");
const { createElement } = await import("react");

interface AuthProbe {
  user: { email: string } | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
}

let captured: AuthProbe | null = null;
let root: ReturnType<typeof createRoot> | null = null;
let container: HTMLElement | null = null;

function Probe() {
  captured = useAuth() as unknown as AuthProbe;
  return null;
}

async function renderProvider() {
  container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(AuthProvider, null, createElement(Probe)));
  });
}

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  container?.remove();
  root = null;
  container = null;
  captured = null;
});

const userPayload = {
  id: "u1",
  email: "agent@dpmg.fr",
  firstName: "Alice",
  lastName: "Martin",
  phone: null,
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

test("session expirée : /me 401 → état non authentifié et chargement terminé (redirection login possible)", async () => {
  mockFetch({
    "GET /api/auth/me": () =>
      jsonResponse({ code: "SESSION_EXPIRED", message: "Session expirée ou invalide" }, 401),
  });

  await renderProvider();

  assert.equal(captured!.isLoading, false);
  assert.equal(captured!.isAuthenticated, false);
  assert.equal(captured!.user, null);
});

test("connexion réussie : isLoading repasse à false et l'utilisateur est authentifié (PrivateRoute rend le tableau de bord, sans F5)", async () => {
  mockFetch({
    "GET /api/auth/me": () =>
      jsonResponse({ code: "UNAUTHORIZED", message: "Authentification requise" }, 401),
    "POST /api/auth/login": () =>
      jsonResponse({ user: userPayload, roles: [] }),
  });

  await renderProvider();
  assert.equal(captured!.isAuthenticated, false);

  await act(async () => {
    await captured!.login("agent@dpmg.fr", "MotDePasse!123");
  });

  assert.equal(captured!.isLoading, false);
  assert.equal(captured!.isAuthenticated, true);
  assert.equal(captured!.user?.email, "agent@dpmg.fr");
});

test("erreur de connexion : l'exception est propagée et le chargement s'arrête", async () => {
  mockFetch({
    "GET /api/auth/me": () =>
      jsonResponse({ code: "UNAUTHORIZED", message: "Authentification requise" }, 401),
    "POST /api/auth/login": () =>
      jsonResponse({ code: "INVALID_CREDENTIALS", message: "Identifiants invalides" }, 401),
  });

  await renderProvider();

  let thrown: unknown = null;
  await act(async () => {
    try {
      await captured!.login("agent@dpmg.fr", "mauvais-mdp");
    } catch (error) {
      thrown = error;
    }
  });

  assert.ok(thrown instanceof ApiError);
  assert.equal((thrown as InstanceType<typeof ApiError>).code, "INVALID_CREDENTIALS");
  assert.equal(captured!.isLoading, false);
  assert.equal(captured!.isAuthenticated, false);
  assert.equal(captured!.user, null);
});

test("aucun rejet de promesse non géré pendant les tests d'authentification", async () => {
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(unhandledRejections.length, 0);
});
