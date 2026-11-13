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
defineGlobal("HTMLInputElement", dom.window.HTMLInputElement);
defineGlobal("HTMLTextAreaElement", dom.window.HTMLTextAreaElement);
defineGlobal("HTMLSelectElement", dom.window.HTMLSelectElement);
defineGlobal("HTMLFormElement", dom.window.HTMLFormElement);
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

const userAuthor = {
  id: "u1",
  email: "auteur@dpmg.fr",
  firstName: "Alice",
  lastName: "Martin",
  phone: null,
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const userDfc = {
  id: "u2",
  email: "dfc@dpmg.fr",
  firstName: "Diane",
  lastName: "Dfc",
  phone: null,
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const userEmployee = {
  id: "u3",
  email: "employe@dpmg.fr",
  firstName: "Eve",
  lastName: "Employe",
  phone: null,
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const roleDfc = {
  role: "DFC_CONTROLLER",
  structureId: "st1",
  structureName: "Structure DFC",
  structureCode: "DFC",
  structureType: "OTHER",
  scope: "INFRA",
  startDate: "2026-01-01T00:00:00.000Z",
  endDate: null,
  delegationNote: null,
};

const roleEmployee = {
  role: "EMPLOYEE",
  structureId: "st1",
  structureName: "Structure A",
  structureCode: "STA",
  structureType: "OTHER",
  scope: "INFRA",
  startDate: "2026-01-01T00:00:00.000Z",
  endDate: null,
  delegationNote: null,
};

const roleEmployeeScopeStar = { ...roleEmployee, scope: "*" };

const demandeBase = {
  id: "d10",
  reference: "DEM-2026-DFC01",
  title: "Demande à financer",
  description: "Description de la demande",
  category: "INFRASTRUCTURE",
  departmentId: "dep1",
  departmentCode: "INFRA",
  departmentName: "Département INFRA",
  authorId: "u1",
  authorFirstName: "Alice",
  authorLastName: "Martin",
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-02T08:00:00.000Z",
  submittedAt: "2026-10-02T08:00:00.000Z",
};

const demandeFinance = { ...demandeBase, status: "EN_ATTENTE_FINANCEMENT" };
const demandeDecision = { ...demandeBase, status: "EN_ATTENTE_DECISION" };
const demandeExecution = { ...demandeBase, status: "EN_ATTENTE_EXECUTION" };

interface Route {
  method: string;
  url: string | RegExp;
  status: number;
  body: unknown;
}

interface FetchBody {
  method: string;
  url: string;
  body: unknown;
}

let routes: Route[] = [];
const fetchLog: string[] = [];
const fetchBodies: FetchBody[] = [];
let meUser: typeof userDfc = userDfc;
let meRoles: Array<typeof roleDfc> = [roleDfc];

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
      return jsonResponse({ user: meUser, roles: meRoles });
    }

    if (typeof init?.body === "string") {
      fetchBodies.push({ method, url, body: JSON.parse(init.body) });
    } else {
      fetchBodies.push({ method, url, body: undefined });
    }

    const route = routes.find(
      (r) => r.method === method && (typeof r.url === "string" ? r.url === url : r.url.test(url))
    );
    if (!route) {
      throw new Error(`Requête inattendue: ${method} ${url}`);
    }
    return jsonResponse(route.body, route.status);
  }) as typeof fetch;
}

const { AuthProvider } = await import("../src/context/AuthContext");
const { DemandeDetailPage } = await import("../src/pages/demandes/DemandeDetailPage");
const { MemoryRouter, Routes, Route } = await import("react-router-dom");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react");
const { createElement } = await import("react");

let root: ReturnType<typeof createRoot> | null = null;
let container: HTMLElement | null = null;

async function renderPage(initialPath: string) {
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
          { initialEntries: [initialPath] },
          createElement(
            Routes,
            null,
            createElement(Route, { path: "/demandes/:id", element: createElement(DemandeDetailPage) })
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
  routes = [];
  fetchLog.length = 0;
  fetchBodies.length = 0;
  meUser = userDfc;
  meRoles = [roleDfc];
});

function click(element: Element) {
  return act(async () => {
    element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function buttonByText(text: string): HTMLButtonElement | undefined {
  return [...container!.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
}

function inputByLabel(text: string): HTMLInputElement | HTMLTextAreaElement | undefined {
  const labels = [...container!.querySelectorAll("label")];
  const label = labels.find((l) => (l.textContent ?? "").trim() === text);
  const id = label?.getAttribute("for");
  if (!id) return undefined;
  return container!.querySelector(`#${id}`) as HTMLInputElement | HTMLTextAreaElement | undefined;
}

function typeInto(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  return act(async () => {
    const proto =
      element instanceof dom.window.HTMLTextAreaElement
        ? dom.window.HTMLTextAreaElement.prototype
        : dom.window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
    setter.call(element, value);
    element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function callsFor(suffix: string): FetchBody[] {
  return fetchBodies.filter((b) => b.url === `/api/demandes/d10/dfc/${suffix}`);
}

// ---------------------------------------------------------------------------
// Visibilité
// ---------------------------------------------------------------------------
test("DFC UI : un utilisateur non DFC ne voit pas les actions DFC", async () => {
  meUser = userEmployee;
  meRoles = [roleEmployee];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeFinance }];
  await renderPage("/demandes/d10");

  assert.equal(buttonByText("Financement disponible"), undefined);
  assert.equal(buttonByText("Financement indisponible"), undefined);
});

test("DFC UI : l'auteur ne voit pas les actions DFC sur sa propre demande", async () => {
  meUser = userAuthor;
  meRoles = [roleDfc];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeFinance }];
  await renderPage("/demandes/d10");

  assert.equal(buttonByText("Financement disponible"), undefined);
  assert.equal(buttonByText("Financement indisponible"), undefined);
});

test("DFC UI : une demande à statut incompatible ne présente aucune action DFC", async () => {
  meUser = userDfc;
  meRoles = [roleDfc];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeDecision }];
  await renderPage("/demandes/d10");

  assert.equal(buttonByText("Financement disponible"), undefined);
  assert.equal(buttonByText("Financement indisponible"), undefined);
});

test("DFC UI : un utilisateur éligible voit les actions sur une demande en attente de financement", async () => {
  meUser = userDfc;
  meRoles = [roleDfc];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeFinance }];
  await renderPage("/demandes/d10");

  assert.ok(buttonByText("Financement disponible"), "le bouton doit être présent");
  assert.ok(buttonByText("Financement indisponible"), "le bouton doit être présent");
});

test("DFC UI : un périmètre \"*\" seul, sans rôle DFC, ne donne aucune action", async () => {
  meUser = userEmployee;
  meRoles = [roleEmployeeScopeStar];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeFinance }];
  await renderPage("/demandes/d10");

  assert.equal(buttonByText("Financement disponible"), undefined);
  assert.equal(buttonByText("Financement indisponible"), undefined);
});

// ---------------------------------------------------------------------------
// Résultat positif
// ---------------------------------------------------------------------------
test("DFC UI : financement disponible appelle le bon endpoint et met à jour le statut", async () => {
  meUser = userDfc;
  meRoles = [roleDfc];
  routes = [
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeFinance },
    {
      method: "POST",
      url: "/api/demandes/d10/dfc/control",
      status: 200,
      body: { ...demandeFinance, status: "EN_ATTENTE_EXECUTION" },
    },
  ];
  await renderPage("/demandes/d10");

  await click(buttonByText("Financement disponible")!);
  await click(buttonByText("Confirmer le financement disponible")!);

  const calls = callsFor("control");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.method, "POST");
  assert.equal(calls[0]!.url, "/api/demandes/d10/dfc/control");
  assert.deepEqual(calls[0]!.body, { result: "DISPONIBLE" });
  assert.ok((container!.textContent ?? "").includes("En attente d'exécution"), "le statut doit être mis à jour");
});

// ---------------------------------------------------------------------------
// Résultat négatif
// ---------------------------------------------------------------------------
test("DFC UI : financement indisponible appelle le bon endpoint et conserve le statut", async () => {
  meUser = userDfc;
  meRoles = [roleDfc];
  routes = [
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeFinance },
    {
      method: "POST",
      url: "/api/demandes/d10/dfc/control",
      status: 200,
      body: { ...demandeFinance, status: "EN_ATTENTE_FINANCEMENT" },
    },
  ];
  await renderPage("/demandes/d10");

  await click(buttonByText("Financement indisponible")!);
  await click(buttonByText("Confirmer le financement indisponible")!);

  const calls = callsFor("control");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]!.body, { result: "INDISPONIBLE" });
  assert.ok((container!.textContent ?? "").includes("En attente de financement"), "le statut doit être conservé");
});

// ---------------------------------------------------------------------------
// Motif facultatif
// ---------------------------------------------------------------------------
test("DFC UI : le motif est envoyé lorsqu'il est renseigné", async () => {
  meUser = userDfc;
  meRoles = [roleDfc];
  routes = [
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeFinance },
    {
      method: "POST",
      url: "/api/demandes/d10/dfc/control",
      status: 200,
      body: { ...demandeFinance, status: "EN_ATTENTE_FINANCEMENT" },
    },
  ];
  await renderPage("/demandes/d10");

  await click(buttonByText("Financement indisponible")!);
  await typeInto(inputByLabel("Motif / commentaire (optionnel)")! as HTMLTextAreaElement, "Fonds insuffisants");
  await click(buttonByText("Confirmer le financement indisponible")!);

  const calls = callsFor("control");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]!.body, { result: "INDISPONIBLE", motif: "Fonds insuffisants" });
});

test("DFC UI : aucun motif n'est envoyé lorsqu'il est vide", async () => {
  meUser = userDfc;
  meRoles = [roleDfc];
  routes = [
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeFinance },
    {
      method: "POST",
      url: "/api/demandes/d10/dfc/control",
      status: 200,
      body: { ...demandeFinance, status: "EN_ATTENTE_FINANCEMENT" },
    },
  ];
  await renderPage("/demandes/d10");

  await click(buttonByText("Financement indisponible")!);
  await typeInto(inputByLabel("Motif / commentaire (optionnel)")! as HTMLTextAreaElement, "   ");
  await click(buttonByText("Confirmer le financement indisponible")!);

  const calls = callsFor("control");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]!.body, { result: "INDISPONIBLE" });
});

// ---------------------------------------------------------------------------
// Erreurs
// ---------------------------------------------------------------------------
test("DFC UI : une erreur 403 est affichée sans modifier le statut", async () => {
  meUser = userDfc;
  meRoles = [roleDfc];
  routes = [
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeFinance },
    {
      method: "POST",
      url: "/api/demandes/d10/dfc/control",
      status: 403,
      body: { code: "FORBIDDEN", message: "Vous n'êtes pas habilité pour ce département" },
    },
  ];
  await renderPage("/demandes/d10");

  await click(buttonByText("Financement disponible")!);
  await click(buttonByText("Confirmer le financement disponible")!);

  const alert = container!.querySelector("[role='alert']");
  assert.ok(alert, "un message d'erreur doit être affiché");
  assert.ok((alert!.textContent ?? "").includes("Vous n'êtes pas habilité pour ce département"));
  assert.ok((container!.textContent ?? "").includes("En attente de financement"), "le statut ne doit pas changer");
  assert.ok(!(container!.textContent ?? "").includes("En attente d'exécution"));
});

test("DFC UI : une erreur serveur ne provoque pas de fausse confirmation", async () => {
  meUser = userDfc;
  meRoles = [roleDfc];
  routes = [
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeFinance },
    {
      method: "POST",
      url: "/api/demandes/d10/dfc/control",
      status: 500,
      body: { code: "INTERNAL_ERROR", message: "Erreur interne du serveur" },
    },
  ];
  await renderPage("/demandes/d10");

  await click(buttonByText("Financement disponible")!);
  await click(buttonByText("Confirmer le financement disponible")!);

  const alert = container!.querySelector("[role='alert']");
  assert.ok(alert, "un message d'erreur doit être affiché");
  assert.ok((container!.textContent ?? "").includes("En attente de financement"), "le statut ne doit pas changer");
  assert.ok(!(container!.textContent ?? "").includes("En attente d'exécution"));
});

// ---------------------------------------------------------------------------
// Double soumission
// ---------------------------------------------------------------------------
test("DFC UI : un double clic ne déclenche qu'un seul appel API", async () => {
  meUser = userDfc;
  meRoles = [roleDfc];
  routes = [
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeFinance },
    {
      method: "POST",
      url: "/api/demandes/d10/dfc/control",
      status: 200,
      body: { ...demandeFinance, status: "EN_ATTENTE_EXECUTION" },
    },
  ];
  await renderPage("/demandes/d10");

  await click(buttonByText("Financement disponible")!);
  const confirm = buttonByText("Confirmer le financement disponible")!;
  await act(async () => {
    confirm.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    confirm.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  const calls = callsFor("control");
  assert.equal(calls.length, 1, "un seul appel API doit être effectué");
});

// ---------------------------------------------------------------------------
// Non-régression
// ---------------------------------------------------------------------------
test("DFC UI : les actions hiérarchiques et DPMG restent absentes sur une demande en financement", async () => {
  meUser = userDfc;
  meRoles = [roleDfc];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeFinance }];
  await renderPage("/demandes/d10");

  assert.equal(buttonByText("Approuver"), undefined);
  assert.equal(buttonByText("Refuser"), undefined);
  assert.equal(buttonByText("Approuver (DPMG)"), undefined);
  assert.equal(buttonByText("Refuser (DPMG)"), undefined);
  assert.ok(buttonByText("Financement disponible"));
});