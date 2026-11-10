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

const userPayload = {
  id: "u1",
  email: "alice@dpmg.fr",
  firstName: "Alice",
  lastName: "Martin",
  phone: null,
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const demandeBrouillon = {
  id: "d1",
  reference: "DEM-2026-AAAAA",
  title: "Achat de matériel informatique",
  description: "Besoin de postes de travail",
  status: "BROUILLON",
  category: "INFRASTRUCTURE",
  departmentId: "dep1",
  departmentCode: "INFRA",
  departmentName: "Département INFRA",
  authorId: "u1",
  authorFirstName: "Alice",
  authorLastName: "Martin",
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-01T10:00:00.000Z",
  submittedAt: null,
};

const demandeEnAttente = {
  id: "d2",
  reference: "DEM-2026-BBBBB",
  title: "Livraison de fournitures",
  description: "Fournitures de bureau",
  status: "EN_ATTENTE_VALIDATION",
  category: "LOGISTIQUE",
  departmentId: "dep2",
  departmentCode: "LOGISTIQUE",
  departmentName: "Département LOGISTIQUE",
  authorId: "u1",
  authorFirstName: "Alice",
  authorLastName: "Martin",
  createdAt: "2026-10-02T09:30:00.000Z",
  updatedAt: "2026-10-03T08:00:00.000Z",
  submittedAt: "2026-10-03T08:00:00.000Z",
};

const fetchLog: string[] = [];
let listResponses: Array<{ status: number; body: unknown }> = [];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetch() {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    fetchLog.push(`${method} ${url}`);

    if (url === "/api/auth/me") {
      return jsonResponse({ user: userPayload, roles: [] });
    }
    if (url.startsWith("/api/demandes")) {
      const next = listResponses.shift();
      if (!next) throw new Error(`Réponse liste manquante pour ${method} ${url}`);
      return jsonResponse(next.body, next.status);
    }
    throw new Error(`Requête inattendue: ${method} ${url}`);
  }) as typeof fetch;
}

const { AuthProvider } = await import("../src/context/AuthContext");
const { DemandeListPage } = await import("../src/pages/demandes/DemandeListPage");
const { MemoryRouter, Routes, Route } = await import("react-router-dom");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react");
const { createElement } = await import("react");

let root: ReturnType<typeof createRoot> | null = null;
let container: HTMLElement | null = null;

async function renderPage() {
  mockFetch();
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
          { initialEntries: ["/demandes"] },
          createElement(
            Routes,
            null,
            createElement(Route, { path: "/demandes", element: createElement(DemandeListPage) }),
            createElement(Route, { path: "/demandes/nouvelle", element: createElement("div", { "data-testid": "page-creation" }) }),
            createElement(Route, { path: "/demandes/:id", element: createElement("div", { "data-testid": "page-detail" }) })
          )
        )
      )
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
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
  fetchLog.length = 0;
  listResponses = [];
});

function click(element: Element) {
  return act(async () => {
    element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function setStatusFilter(value: string) {
  const select = container!.querySelector("select")!;
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, "value")!.set!;
  setter.call(select, value);
  return act(async () => {
    select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

test("affiche les demandes récupérées depuis l'API", async () => {
  listResponses = [{ status: 200, body: [demandeBrouillon, demandeEnAttente] }];
  await renderPage();

  const text = container!.textContent ?? "";
  assert.ok(text.includes("DEM-2026-AAAAA"));
  assert.ok(text.includes("Achat de matériel informatique"));
  assert.ok(text.includes("Brouillon"));
  assert.ok(text.includes("En attente de validation"));
  assert.ok(text.includes("Infrastructures et moyens généraux"));
  assert.ok(text.includes("01/10/2026"));

  const links = [...container!.querySelectorAll("a")].filter((a) => {
    const href = a.getAttribute("href") ?? "";
    return href.startsWith("/demandes/") && href !== "/demandes/nouvelle";
  });
  assert.equal(links.length, 2);
  assert.equal(links[0]!.getAttribute("href"), "/demandes/d1");
});

test("affiche l'état de liste vide", async () => {
  listResponses = [{ status: 200, body: [] }];
  await renderPage();

  const text = container!.textContent ?? "";
  assert.ok(text.includes("Aucune demande pour le moment."));
});

test("affiche une erreur API puis réessaie avec succès", async () => {
  listResponses = [
    { status: 500, body: { code: "INTERNAL_ERROR", message: "Erreur interne du serveur" } },
    { status: 200, body: [demandeBrouillon] },
  ];
  await renderPage();

  const alert = container!.querySelector("[role='alert']");
  assert.ok(alert);
  assert.ok((alert!.textContent ?? "").includes("Erreur interne du serveur"));

  const retry = [...container!.querySelectorAll("button")].find((b) => b.textContent === "Réessayer");
  assert.ok(retry);
  await click(retry!);

  assert.ok((container!.textContent ?? "").includes("DEM-2026-AAAAA"));
  assert.ok(fetchLog.includes("GET /api/demandes"));
  assert.equal(fetchLog.filter((c) => c === "GET /api/demandes").length, 2);
});

test("applique le filtre par statut", async () => {
  listResponses = [
    { status: 200, body: [demandeBrouillon, demandeEnAttente] },
    { status: 200, body: [demandeEnAttente] },
  ];
  await renderPage();

  await setStatusFilter("EN_ATTENTE_VALIDATION");

  assert.ok(fetchLog.includes("GET /api/demandes?status=EN_ATTENTE_VALIDATION"));
  const text = container!.textContent ?? "";
  assert.ok(text.includes("Livraison de fournitures"));
  assert.ok(!text.includes("Achat de matériel informatique"));
});

test("ouvre le détail d'une demande", async () => {
  listResponses = [{ status: 200, body: [demandeBrouillon] }];
  await renderPage();

  const link = [...container!.querySelectorAll("a")].find((a) => a.getAttribute("href") === "/demandes/d1");
  assert.ok(link);
  await click(link!);

  assert.ok(container!.querySelector("[data-testid='page-detail']"));
});

test("navigue vers la création d'une demande", async () => {
  listResponses = [{ status: 200, body: [] }];
  await renderPage();

  const create = [...container!.querySelectorAll("a")].find((a) => a.textContent?.includes("Nouvelle demande"));
  assert.ok(create);
  await click(create!);

  assert.ok(container!.querySelector("[data-testid='page-creation']"));
});
