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

const userValidator = {
  id: "u2",
  email: "validateur@dpmg.fr",
  firstName: "Bob",
  lastName: "Validateur",
  phone: null,
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const roleHierarchical = {
  role: "HIERARCHICAL_MANAGER",
  structureId: "st1",
  structureName: "Structure A",
  structureCode: "STA",
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

const roleEmployeeScopeStar = {
  ...roleEmployee,
  scope: "*",
};

const demandeBase = {
  id: "d10",
  reference: "DEM-2026-VAL01",
  title: "Demande à valider",
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

const demandeValidation = { ...demandeBase, status: "EN_ATTENTE_VALIDATION" };
const demandeBrouillon = { ...demandeBase, status: "BROUILLON" };
const demandeAnalyse = { ...demandeBase, status: "EN_ATTENTE_ANALYSE" };

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
let meUser: typeof userValidator = userValidator;
let meRoles: Array<typeof roleHierarchical> = [roleHierarchical];

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
  meUser = userValidator;
  meRoles = [roleHierarchical];
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
  return fetchBodies.filter((b) => b.url === `/api/demandes/d10/${suffix}`);
}

// ---------------------------------------------------------------------------
// 1. Auteur sur brouillon : modification, pas de validation
// ---------------------------------------------------------------------------
test("validation UI : l'auteur sur un brouillon voit la soumission et la modification, pas la validation", async () => {
  meUser = userAuthor;
  meRoles = [roleEmployee];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeBrouillon }];
  await renderPage("/demandes/d10");

  assert.ok(buttonByText("Soumettre la demande"), "le bouton Soumettre doit être présent");
  assert.ok(buttonByText("Modifier"), "le bouton Modifier doit être présent");
  assert.equal(buttonByText("Approuver"), undefined, "aucun bouton Approuver pour l'auteur");
  assert.equal(buttonByText("Refuser"), undefined, "aucun bouton Refuser pour l'auteur");
  assert.equal(
    buttonByText("Retourner pour correction"),
    undefined,
    "aucun bouton Retourner pour l'auteur"
  );
});

// ---------------------------------------------------------------------------
// 2. Validateur autorisé non auteur : voit les actions hiérarchiques
// ---------------------------------------------------------------------------
test("validation UI : un validateur autorisé non auteur voit les actions hiérarchiques", async () => {
  meUser = userValidator;
  meRoles = [roleHierarchical];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeValidation }];
  await renderPage("/demandes/d10");

  assert.ok(buttonByText("Approuver"), "le bouton Approuver doit être présent");
  assert.ok(buttonByText("Refuser"), "le bouton Refuser doit être présent");
  assert.ok(buttonByText("Retourner pour correction"), "le bouton Retourner doit être présent");
  assert.equal(buttonByText("Soumettre la demande"), undefined, "pas de soumission pour un validateur");
  assert.equal(buttonByText("Modifier"), undefined, "pas de modification pour un validateur");
});

// ---------------------------------------------------------------------------
// 3. Auteur ne voit jamais les actions hiérarchiques sur sa propre demande
// ---------------------------------------------------------------------------
test("validation UI : l'auteur ne voit jamais les actions hiérarchiques sur sa propre demande", async () => {
  meUser = userAuthor;
  meRoles = [roleHierarchical];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeValidation }];
  await renderPage("/demandes/d10");

  assert.equal(buttonByText("Approuver"), undefined);
  assert.equal(buttonByText("Refuser"), undefined);
  assert.equal(buttonByText("Retourner pour correction"), undefined);
});

// ---------------------------------------------------------------------------
// 4. Utilisateur sans rôle hiérarchique : pas d'actions
// ---------------------------------------------------------------------------
test("validation UI : un utilisateur sans rôle hiérarchique ne voit pas les actions", async () => {
  meUser = userValidator;
  meRoles = [roleEmployee];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeValidation }];
  await renderPage("/demandes/d10");

  assert.equal(buttonByText("Approuver"), undefined);
  assert.equal(buttonByText("Refuser"), undefined);
  assert.equal(buttonByText("Retourner pour correction"), undefined);
});

// ---------------------------------------------------------------------------
// 5. Périmètre "*" seul, sans rôle autorisé : pas d'actions
// ---------------------------------------------------------------------------
test("validation UI : un périmètre \"*\" seul, sans rôle autorisé, ne donne aucune action", async () => {
  meUser = userValidator;
  meRoles = [roleEmployeeScopeStar];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeValidation }];
  await renderPage("/demandes/d10");

  assert.equal(buttonByText("Approuver"), undefined);
  assert.equal(buttonByText("Refuser"), undefined);
  assert.equal(buttonByText("Retourner pour correction"), undefined);
});

// ---------------------------------------------------------------------------
// 6. Les actions disparaissent si le statut ne permet plus la validation
// ---------------------------------------------------------------------------
test("validation UI : les actions disparaissent hors statut EN_ATTENTE_VALIDATION", async () => {
  meUser = userValidator;
  meRoles = [roleHierarchical];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeAnalyse }];
  await renderPage("/demandes/d10");

  assert.equal(buttonByText("Approuver"), undefined);
  assert.equal(buttonByText("Refuser"), undefined);
  assert.equal(buttonByText("Retourner pour correction"), undefined);
});

// ---------------------------------------------------------------------------
// 7. Le mécanisme de motif pour le refus reste fonctionnel
// ---------------------------------------------------------------------------
test("validation UI : le refus demande un motif et appelle le backend", async () => {
  meUser = userValidator;
  meRoles = [roleHierarchical];
  routes = [
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeValidation },
    { method: "POST", url: "/api/demandes/d10/refuse", status: 200, body: { ...demandeValidation, status: "REFUSEE" } },
  ];
  await renderPage("/demandes/d10");

  await click(buttonByText("Refuser")!);
  await typeInto(inputByLabel("Motif du refus (obligatoire)")! as HTMLTextAreaElement, "Motif de refus");
  await click(buttonByText("Confirmer le refus")!);

  const calls = callsFor("refuse");
  assert.equal(calls.length, 1, "un appel refuse doit être effectué");
  assert.deepEqual(calls[0]!.body, { motif: "Motif de refus" });
});

test("validation UI : le retour demande un motif ou un commentaire et appelle le backend", async () => {
  meUser = userValidator;
  meRoles = [roleHierarchical];
  routes = [
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeValidation },
    { method: "POST", url: "/api/demandes/d10/return", status: 200, body: { ...demandeValidation, status: "RETOURNEE" } },
  ];
  await renderPage("/demandes/d10");

  await click(buttonByText("Retourner pour correction")!);
  await typeInto(inputByLabel("Motif du retour (optionnel)")! as HTMLTextAreaElement, "Motif de retour");
  await typeInto(inputByLabel("Commentaire de retour (optionnel)")! as HTMLTextAreaElement, "Commentaire de retour");
  await click(buttonByText("Confirmer le retour")!);

  const calls = callsFor("return");
  assert.equal(calls.length, 1, "un appel return doit être effectué");
  assert.deepEqual(calls[0]!.body, { motif: "Motif de retour", commentaire: "Commentaire de retour" });
});

test("validation UI : le refus est annulé si le motif est vide", async () => {
  meUser = userValidator;
  meRoles = [roleHierarchical];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeValidation }];
  await renderPage("/demandes/d10");

  await click(buttonByText("Refuser")!);
  await click(buttonByText("Confirmer le refus")!);

  assert.equal(callsFor("refuse").length, 0, "aucun appel API ne doit être effectué");
  const alert = container!.querySelector("[role='alert']");
  assert.ok(alert, "un message d'erreur doit être affiché");
  assert.ok((alert!.textContent ?? "").includes("Le motif du refus est requis"));
});

test("validation UI : le refus est annulé et le dialogue se ferme", async () => {
  meUser = userValidator;
  meRoles = [roleHierarchical];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeValidation }];
  await renderPage("/demandes/d10");

  await click(buttonByText("Refuser")!);
  assert.ok(container!.querySelector("[role='dialog']"), "le dialogue doit être ouvert");
  await click(buttonByText("Annuler")!);

  assert.equal(container!.querySelector("[role='dialog']"), null, "le dialogue doit être fermé");
  assert.equal(callsFor("refuse").length, 0, "aucun appel API ne doit être effectué");
});

test("validation UI : l'approbation appelle le backend et met à jour le statut", async () => {
  meUser = userValidator;
  meRoles = [roleHierarchical];
  routes = [
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeValidation },
    { method: "POST", url: "/api/demandes/d10/approve", status: 200, body: { ...demandeValidation, status: "EN_ATTENTE_ANALYSE" } },
  ];
  await renderPage("/demandes/d10");

  await click(buttonByText("Approuver")!);

  const calls = callsFor("approve");
  assert.equal(calls.length, 1, "un appel approve doit être effectué");
  assert.ok((container!.textContent ?? "").includes("En attente d'analyse"), "le statut doit être mis à jour");
});