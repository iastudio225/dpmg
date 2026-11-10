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

const userDpmg = {
  id: "u2",
  email: "dpmg@dpmg.fr",
  firstName: "Diane",
  lastName: "Dpmg",
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

const roleDpmg = {
  role: "DPMG_MANAGER",
  structureId: "st1",
  structureName: "Structure DPMG",
  structureCode: "DPMG",
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
  reference: "DEM-2026-DPMG01",
  title: "Demande à décider",
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

const demandeDecision = { ...demandeBase, status: "EN_ATTENTE_DECISION" };
const demandeValidation = { ...demandeBase, status: "EN_ATTENTE_VALIDATION" };
const demandeAnalyse = { ...demandeBase, status: "EN_ATTENTE_ANALYSE" };
const demandeFinance = { ...demandeBase, status: "EN_ATTENTE_FINANCEMENT" };

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
let meUser: typeof userDpmg = userDpmg;
let meRoles: Array<typeof roleDpmg> = [roleDpmg];

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
  meUser = userDpmg;
  meRoles = [roleDpmg];
  dom.window.prompt = () => null;
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

function callsFor(suffix: string): FetchBody[] {
  return fetchBodies.filter((b) => b.url === `/api/demandes/d10/dpmg/${suffix}`);
}

// ---------------------------------------------------------------------------
// 1. Utilisateur non DPMG ne voit pas les actions DPMG
// ---------------------------------------------------------------------------
test("DPMG UI : un utilisateur non DPMG ne voit pas les actions DPMG", async () => {
  meUser = userEmployee;
  meRoles = [roleEmployee];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeDecision }];
  await renderPage("/demandes/d10");

  assert.equal(buttonByText("Approuver (DPMG)"), undefined);
  assert.equal(buttonByText("Refuser (DPMG)"), undefined);
  assert.equal(buttonByText("Retourner pour correction (DPMG)"), undefined);
});

// ---------------------------------------------------------------------------
// 2. L'auteur ne voit pas les actions DPMG
// ---------------------------------------------------------------------------
test("DPMG UI : l'auteur ne voit pas les actions DPMG sur sa propre demande", async () => {
  meUser = userAuthor;
  meRoles = [roleDpmg];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeDecision }];
  await renderPage("/demandes/d10");

  assert.equal(buttonByText("Approuver (DPMG)"), undefined);
  assert.equal(buttonByText("Refuser (DPMG)"), undefined);
  assert.equal(buttonByText("Retourner pour correction (DPMG)"), undefined);
});

// ---------------------------------------------------------------------------
// 3. Statut incompatible : aucune action DPMG
// ---------------------------------------------------------------------------
test("DPMG UI : une demande à statut incompatible ne présente aucune action DPMG", async () => {
  meUser = userDpmg;
  meRoles = [roleDpmg];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeAnalyse }];
  await renderPage("/demandes/d10");

  assert.equal(buttonByText("Approuver (DPMG)"), undefined);
  assert.equal(buttonByText("Refuser (DPMG)"), undefined);
  assert.equal(buttonByText("Retourner pour correction (DPMG)"), undefined);
});

// ---------------------------------------------------------------------------
// 4. Utilisateur éligible voit les actions sur EN_ATTENTE_DECISION
// ---------------------------------------------------------------------------
test("DPMG UI : un utilisateur éligible voit les actions sur une demande en attente de décision", async () => {
  meUser = userDpmg;
  meRoles = [roleDpmg];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeDecision }];
  await renderPage("/demandes/d10");

  assert.ok(buttonByText("Approuver (DPMG)"), "le bouton Approuver (DPMG) doit être présent");
  assert.ok(buttonByText("Refuser (DPMG)"), "le bouton Refuser (DPMG) doit être présent");
  assert.ok(
    buttonByText("Retourner pour correction (DPMG)"),
    "le bouton Retourner (DPMG) doit être présent"
  );
});

// ---------------------------------------------------------------------------
// 5. Périmètre "*" seul, sans rôle DPMG : aucune action
// ---------------------------------------------------------------------------
test("DPMG UI : un périmètre \"*\" seul, sans rôle DPMG, ne donne aucune action", async () => {
  meUser = userEmployee;
  meRoles = [roleEmployeeScopeStar];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeDecision }];
  await renderPage("/demandes/d10");

  assert.equal(buttonByText("Approuver (DPMG)"), undefined);
  assert.equal(buttonByText("Refuser (DPMG)"), undefined);
  assert.equal(buttonByText("Retourner pour correction (DPMG)"), undefined);
});

// ---------------------------------------------------------------------------
// 6. Approbation : bon endpoint + mise à jour après succès
// ---------------------------------------------------------------------------
test("DPMG UI : l'approbation appelle le bon endpoint et met à jour l'interface", async () => {
  meUser = userDpmg;
  meRoles = [roleDpmg];
  routes = [
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeDecision },
    {
      method: "POST",
      url: "/api/demandes/d10/dpmg/approve",
      status: 200,
      body: { ...demandeDecision, status: "EN_ATTENTE_FINANCEMENT" },
    },
  ];
  await renderPage("/demandes/d10");

  await click(buttonByText("Approuver (DPMG)")!);

  const calls = callsFor("approve");
  assert.equal(calls.length, 1, "un appel approve DPMG doit être effectué");
  assert.equal(calls[0]!.method, "POST");
  assert.equal(calls[0]!.url, "/api/demandes/d10/dpmg/approve");
  assert.ok((container!.textContent ?? "").includes("En attente de financement"), "le statut doit être mis à jour");
});

// ---------------------------------------------------------------------------
// 7. Refus exige un motif non vide
// ---------------------------------------------------------------------------
test("DPMG UI : le refus exige un motif non vide", async () => {
  meUser = userDpmg;
  meRoles = [roleDpmg];
  dom.window.prompt = () => "   ";
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeDecision }];
  await renderPage("/demandes/d10");

  await click(buttonByText("Refuser (DPMG)")!);

  assert.equal(callsFor("refuse").length, 0, "aucun appel API ne doit être effectué");
  const alert = container!.querySelector("[role='alert']");
  assert.ok(alert, "un message d'erreur doit être affiché");
  assert.ok((alert!.textContent ?? "").includes("Le motif du refus est requis"));
});

test("DPMG UI : le refus appelle le bon endpoint avec le bon corps", async () => {
  meUser = userDpmg;
  meRoles = [roleDpmg];
  dom.window.prompt = () => "Hors stratégie";
  routes = [
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeDecision },
    {
      method: "POST",
      url: "/api/demandes/d10/dpmg/refuse",
      status: 200,
      body: { ...demandeDecision, status: "REFUSEE" },
    },
  ];
  await renderPage("/demandes/d10");

  await click(buttonByText("Refuser (DPMG)")!);

  const calls = callsFor("refuse");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.method, "POST");
  assert.equal(calls[0]!.url, "/api/demandes/d10/dpmg/refuse");
  assert.deepEqual(calls[0]!.body, { motif: "Hors stratégie" });
  assert.ok((container!.textContent ?? "").includes("Refusée"), "le statut doit être mis à jour");
});

// ---------------------------------------------------------------------------
// 8. Retour exige un motif non vide
// ---------------------------------------------------------------------------
test("DPMG UI : le retour exige un motif non vide", async () => {
  meUser = userDpmg;
  meRoles = [roleDpmg];
  dom.window.prompt = () => null;
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeDecision }];
  await renderPage("/demandes/d10");

  await click(buttonByText("Retourner pour correction (DPMG)")!);

  assert.equal(callsFor("return").length, 0, "aucun appel API ne doit être effectué");
  const alert = container!.querySelector("[role='alert']");
  assert.ok(alert, "un message d'erreur doit être affiché");
  assert.ok((alert!.textContent ?? "").includes("Le motif du retour est requis"));
});

test("DPMG UI : le retour appelle le bon endpoint avec motif et commentaire", async () => {
  meUser = userDpmg;
  meRoles = [roleDpmg];
  const prompts = ["Préciser le besoin", "Commentaire complémentaire"];
  let idx = 0;
  dom.window.prompt = () => prompts[idx++] ?? null;
  routes = [
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeDecision },
    {
      method: "POST",
      url: "/api/demandes/d10/dpmg/return",
      status: 200,
      body: { ...demandeDecision, status: "RETOURNEE" },
    },
  ];
  await renderPage("/demandes/d10");

  await click(buttonByText("Retourner pour correction (DPMG)")!);

  const calls = callsFor("return");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.method, "POST");
  assert.equal(calls[0]!.url, "/api/demandes/d10/dpmg/return");
  assert.deepEqual(calls[0]!.body, {
    motif: "Préciser le besoin",
    commentaire: "Commentaire complémentaire",
  });
  assert.ok((container!.textContent ?? "").includes("Retournée"), "le statut doit être mis à jour");
});

// ---------------------------------------------------------------------------
// 9. Erreur 403 affichée sans modification artificielle du statut
// ---------------------------------------------------------------------------
test("DPMG UI : une erreur 403 est affichée sans modifier le statut", async () => {
  meUser = userDpmg;
  meRoles = [roleDpmg];
  dom.window.prompt = () => "Motif";
  routes = [
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeDecision },
    {
      method: "POST",
      url: "/api/demandes/d10/dpmg/refuse",
      status: 403,
      body: { code: "FORBIDDEN", message: "Vous n'êtes pas habilité pour ce département" },
    },
  ];
  await renderPage("/demandes/d10");

  await click(buttonByText("Refuser (DPMG)")!);

  const alert = container!.querySelector("[role='alert']");
  assert.ok(alert, "un message d'erreur doit être affiché");
  assert.ok((alert!.textContent ?? "").includes("Vous n'êtes pas habilité pour ce département"));
  assert.ok((container!.textContent ?? "").includes("En attente de décision"), "le statut ne doit pas changer");
  assert.ok(!(container!.textContent ?? "").includes("Refusée"), "aucune fausse confirmation");
});

// ---------------------------------------------------------------------------
// 10. Erreur serveur : pas de fausse confirmation
// ---------------------------------------------------------------------------
test("DPMG UI : une erreur serveur ne provoque pas de fausse confirmation", async () => {
  meUser = userDpmg;
  meRoles = [roleDpmg];
  routes = [
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeDecision },
    {
      method: "POST",
      url: "/api/demandes/d10/dpmg/approve",
      status: 500,
      body: { code: "INTERNAL_ERROR", message: "Erreur interne du serveur" },
    },
  ];
  await renderPage("/demandes/d10");

  await click(buttonByText("Approuver (DPMG)")!);

  const alert = container!.querySelector("[role='alert']");
  assert.ok(alert, "un message d'erreur doit être affiché");
  assert.ok((container!.textContent ?? "").includes("En attente de décision"), "le statut ne doit pas changer");
  assert.ok(!(container!.textContent ?? "").includes("En attente de financement"));
});

// ---------------------------------------------------------------------------
// 11. Double soumission évitée (bouton désactivé pendant l'envoi)
// ---------------------------------------------------------------------------
test("DPMG UI : un double clic ne déclenche qu'un seul appel API", async () => {
  meUser = userDpmg;
  meRoles = [roleDpmg];
  routes = [
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeDecision },
    {
      method: "POST",
      url: "/api/demandes/d10/dpmg/approve",
      status: 200,
      body: { ...demandeDecision, status: "EN_ATTENTE_FINANCEMENT" },
    },
  ];
  await renderPage("/demandes/d10");

  const btn = buttonByText("Approuver (DPMG)")!;
  await act(async () => {
    btn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    btn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.equal(callsFor("approve").length, 1, "un seul appel API doit être effectué");
});

// ---------------------------------------------------------------------------
// 12. Les actions hiérarchiques restent fonctionnelles
// ---------------------------------------------------------------------------
test("DPMG UI : les actions hiérarchiques restent fonctionnelles sur une demande en validation", async () => {
  meUser = {
    id: "u4",
    email: "hierarchique@dpmg.fr",
    firstName: "Hugo",
    lastName: "Hier",
    phone: null,
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  meRoles = [
    {
      role: "HIERARCHICAL_MANAGER",
      structureId: "st1",
      structureName: "Structure A",
      structureCode: "STA",
      structureType: "OTHER",
      scope: "INFRA",
      startDate: "2026-01-01T00:00:00.000Z",
      endDate: null,
      delegationNote: null,
    },
  ];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeValidation }];
  await renderPage("/demandes/d10");

  assert.ok(buttonByText("Approuver"), "le bouton Approuver hiérarchique doit être présent");
  assert.ok(buttonByText("Refuser"), "le bouton Refuser hiérarchique doit être présent");
  assert.ok(buttonByText("Retourner pour correction"), "le bouton Retourner hiérarchique doit être présent");
  // Pas d'actions DPMG sur un statut incompatible
  assert.equal(buttonByText("Approuver (DPMG)"), undefined);
});