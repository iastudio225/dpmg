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

dom.window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent() {
    return false;
  },
})) as unknown as typeof window.matchMedia;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Réponses mock avec compteur d'appels pour /api/auth/me.
 * Premier appel (montage) : mustChangePassword: true.
 * Deuxième appel (refreshUser après succès) : mustChangePassword: false.
 */
let meCallCount = 0;
let currentChangePasswordResponse: { status: number; body: unknown } | null = null;
const fetchLog: string[] = [];

function mockFetch() {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    fetchLog.push(`${method} ${url}`);

    if (url === "/api/auth/me") {
      meCallCount++;
      if (meCallCount === 1) {
        return jsonResponse({
          user: {
            id: "u1",
            email: "konan@dpmg.local",
            firstName: "Konan",
            lastName: "Test",
            phone: null,
            status: "ACTIVE",
            mustChangePassword: true,
            createdAt: "2026-01-15T00:00:00.000Z",
            updatedAt: "2026-01-15T00:00:00.000Z",
          },
          roles: [],
        });
      }
      // Deuxième appel : mustChangePassword passé à false
      return jsonResponse({
        user: {
          id: "u1",
          email: "konan@dpmg.local",
          firstName: "Konan",
          lastName: "Test",
          phone: null,
          status: "ACTIVE",
          mustChangePassword: false,
          createdAt: "2026-01-15T00:00:00.000Z",
          updatedAt: "2026-01-15T00:00:00.000Z",
        },
        roles: [],
      });
    }
    if (url === "/api/auth/change-password" && method === "POST") {
      const next = currentChangePasswordResponse;
      if (!next) throw new Error(`Réponse manquante pour ${method} ${url}`);
      return jsonResponse(next.body, next.status);
    }
    throw new Error(`Requête inattendue: ${method} ${url}`);
  }) as typeof fetch;
}

const { AuthProvider, useAuth } = await import("../src/context/AuthContext");
const { ChangePasswordModal } = await import("../src/components/ChangePasswordModal");
const { MemoryRouter, Routes, Route } = await import("react-router-dom");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react");
const { createElement } = await import("react");

let root: ReturnType<typeof createRoot> | null = null;
let container: HTMLElement | null = null;

/**
 * Composant de test qui reproduit PrivateRoute avec le modal intégré.
 * Utilise path="*" pour matcher n'importe quelle URL (accès direct à une route métier).
 */
function TestGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return createElement("div", { "data-testid": "gate-loading" }, "Chargement...");
  }
  if (!isAuthenticated) {
    return createElement("div", { "data-testid": "gate-not-auth" }, "Non authentifié");
  }
  if (user?.mustChangePassword === true) {
    return createElement(ChangePasswordModal, { isOpen: true });
  }
  return createElement("div", { "data-testid": "gate-content" }, children);
}

async function renderGate(initialEntry: string, element: React.ReactElement) {
  container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      createElement(
        AuthProvider,
        null,
        createElement(
          MemoryRouter,
          { initialEntries: [initialEntry] },
          createElement(
            Routes,
            null,
            createElement(Route, { path: "*", element: element })
          )
        )
      )
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function unmountGate() {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  container?.remove();
  root = null;
  container = null;
  fetchLog.length = 0;
  meCallCount = 0;
  currentChangePasswordResponse = null;
}

afterEach(async () => {
  await unmountGate();
});

function typeInput(testId: string, value: string) {
  const input = container!.querySelector(`[data-testid='${testId}']`) as HTMLInputElement;
  assert.ok(input, `Input ${testId} introuvable`);
  return act(async () => {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function clickSubmit() {
  return act(async () => {
    const button = container!.querySelector("[data-testid='modal-change-password-submit']") as HTMLButtonElement;
    assert.ok(button, "Bouton de soumission introuvable");
    button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function waitForStateChange() {
  // Attendre que React traite les mises à jour d'état asynchrones (refreshUser).
  for (let i = 0; i < 30; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  }
}

test("un utilisateur avec mustChangePassword: true voit le modal après connexion", async () => {
  mockFetch();
  meCallCount = 0;

  await renderGate("/", createElement(TestGate, null, createElement("div", { "data-testid": "metier-content" }, "Contenu métier")));

  // Le modal est affiché
  assert.ok(container!.querySelector("[role='dialog']"), "Le modal doit être affiché");
  assert.ok((container!.textContent ?? "").includes("Changement de mot de passe obligatoire"));
  // Le contenu métier n'est pas rendu
  assert.ok(!container!.querySelector("[data-testid='metier-content']"), "Le contenu métier ne doit pas être rendu tant que le modal est ouvert");
});

test("un utilisateur avec mustChangePassword: false ne voit pas le modal", async () => {
  mockFetch();
  meCallCount = 0;

  // Forcer le premier appel /api/auth/me à retourner mustChangePassword: false
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/auth/me") {
      return jsonResponse({
        user: {
          id: "u1",
          email: "konan@dpmg.local",
          firstName: "Konan",
          lastName: "Test",
          phone: null,
          status: "ACTIVE",
          mustChangePassword: false,
          createdAt: "2026-01-15T00:00:00.000Z",
          updatedAt: "2026-01-15T00:00:00.000Z",
        },
        roles: [],
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  await renderGate("/", createElement(TestGate, null, createElement("div", { "data-testid": "metier-content" }, "Contenu métier")));

  assert.ok(!container!.querySelector("[role='dialog']"), "Le modal ne doit pas être affiché");
  assert.ok(container!.querySelector("[data-testid='metier-content']"), "Le contenu métier doit être accessible");

  globalThis.fetch = originalFetch;
});

test("le modal reste bloquant : pas de bouton de contournement", async () => {
  mockFetch();
  meCallCount = 0;

  await renderGate("/", createElement(TestGate, null, createElement("div", { "data-testid": "metier-content" }, "Contenu métier")));

  // Pas de bouton "Plus tard" ni "Ignorer"
  const laterButton = [...container!.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Plus tard") || b.textContent?.includes("Ignorer")
  );
  assert.ok(!laterButton, "Aucun bouton de contournement ne doit être présent");

  // Le modal est toujours présent
  assert.ok(container!.querySelector("[role='dialog']"), "Le modal doit rester ouvert");
  assert.ok(!container!.querySelector("[data-testid='metier-content']"), "Le contenu métier reste bloqué");
});

test("une confirmation différente est rejetée côté interface, modal reste ouvert", async () => {
  mockFetch();
  meCallCount = 0;
  currentChangePasswordResponse = { status: 200, body: { message: "Mot de passe modifié avec succès", mustChangePassword: false } };

  await renderGate("/", createElement(TestGate, null, createElement("div", { "data-testid": "metier-content" }, "Contenu métier")));

  await typeInput("modal-temporary-password", "TempPass1234!");
  await typeInput("modal-new-password", "NewPass1234!");
  await typeInput("modal-confirm-password", "Différent1234!");

  await clickSubmit();

  // L'erreur de confirmation est affichée
  assert.ok((container!.textContent ?? "").includes("ne correspond pas"), "L'erreur de confirmation doit être affichée");
  // Le modal reste ouvert
  assert.ok(container!.querySelector("[role='dialog']"), "Le modal doit rester ouvert après erreur de confirmation");
  // Aucun appel API n'a été fait (rejet côté UI)
  assert.ok(!fetchLog.some((e) => e.startsWith("POST /api/auth/change-password")), "Aucun appel API ne doit être fait en cas de confirmation différente");
});

test("un mauvais mot de passe temporaire affiche une erreur et garde le modal ouvert", async () => {
  mockFetch();
  meCallCount = 0;
  currentChangePasswordResponse = { status: 401, body: { code: "INVALID_CREDENTIALS", message: "Mot de passe temporaire incorrect" } };

  await renderGate("/", createElement(TestGate, null, createElement("div", { "data-testid": "metier-content" }, "Contenu métier")));

  await typeInput("modal-temporary-password", "MauvaisPass1234!");
  await typeInput("modal-new-password", "NewPass1234!");
  await typeInput("modal-confirm-password", "NewPass1234!");

  await clickSubmit();

  // L'erreur API est affichée
  assert.ok((container!.textContent ?? "").includes("Mot de passe temporaire incorrect"), "L'erreur API doit être affichée");
  // Le modal reste ouvert
  assert.ok(container!.querySelector("[role='dialog']"), "Le modal doit rester ouvert après erreur API");
});

test("une réussite met à jour l'état utilisateur et donne accès à l'application", async () => {
  mockFetch();
  meCallCount = 0;
  currentChangePasswordResponse = { status: 200, body: { message: "Mot de passe modifié avec succès", mustChangePassword: false } };

  await renderGate("/", createElement(TestGate, null, createElement("div", { "data-testid": "metier-content" }, "Contenu métier")));

  // Le modal est présent initialement
  assert.ok(container!.querySelector("[role='dialog']"), "Le modal doit être présent initialement");

  await typeInput("modal-temporary-password", "TempPass1234!");
  await typeInput("modal-new-password", "NewPass1234!");
  await typeInput("modal-confirm-password", "NewPass1234!");

  await clickSubmit();

  // L'appel /api/auth/change-password a été fait
  assert.ok(fetchLog.some((e) => e.startsWith("POST /api/auth/change-password")), "L'API de changement doit être appelée");

  // Attendre que refreshUser traite la réponse (2ème appel à /api/auth/me retourne mustChangePassword: false)
  await waitForStateChange();

  // Le modal se ferme car mustChangePassword est passé à false
  assert.ok(!container!.querySelector("[role='dialog']"), "Le modal doit se fermer après succès");
  // Le contenu métier devient accessible
  assert.ok(container!.querySelector("[data-testid='metier-content']"), "Le contenu métier doit être accessible après succès");
});

test("le modal réapparaît après rechargement quand mustChangePassword est toujours true", async () => {
  mockFetch();
  meCallCount = 0;

  await renderGate("/", createElement(TestGate, null, createElement("div", { "data-testid": "metier-content" }, "Contenu métier")));

  // Premier rendu : modal présent
  assert.ok(container!.querySelector("[role='dialog']"), "Le modal doit être présent au premier rendu");

  // Simulation de rechargement : unmount puis re-render avec le même état mustChangePassword: true
  await unmountGate();
  meCallCount = 0; // Reset pour le nouveau montage
  await renderGate("/", createElement(TestGate, null, createElement("div", { "data-testid": "metier-content" }, "Contenu métier")));

  // Le modal réapparaît après rechargement
  assert.ok(container!.querySelector("[role='dialog']"), "Le modal doit réapparaître après rechargement");
  assert.ok(!container!.querySelector("[data-testid='metier-content']"), "Le contenu métier reste bloqué après rechargement");
});

test("un accès direct à une route métier affiche le modal et bloque le contenu", async () => {
  mockFetch();
  meCallCount = 0;

  // Accès direct à une route métier (/demandes) avec mustChangePassword: true
  await renderGate("/demandes", createElement(TestGate, null, createElement("div", { "data-testid": "metier-content" }, "Contenu métier")));

  // Le modal est affiché même pour un accès direct à une route métier
  assert.ok(container!.querySelector("[role='dialog']"), "Le modal doit s'afficher pour un accès direct à une route métier");
  assert.ok(!container!.querySelector("[data-testid='metier-content']"), "Le contenu métier doit être bloqué");
});
