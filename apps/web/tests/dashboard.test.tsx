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
  createdAt: "2026-01-15T00:00:00.000Z",
  updatedAt: "2026-01-15T00:00:00.000Z",
};

function makeRole(overrides: Record<string, unknown> = {}) {
  return {
    role: "EMPLOYEE",
    structureId: "s1",
    structureName: "Direction Générale",
    structureCode: "DG",
    structureType: "DIRECTION",
    scope: "*",
    startDate: "2026-01-01T00:00:00.000Z",
    endDate: null,
    delegationNote: null,
    ...overrides,
  };
}

function makeDemande(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

const fetchLog: string[] = [];
let listResponses: Array<{ status: number; body: unknown }> = [];
let statsResponses: Array<{ status: number; body: unknown }> = [];
let meRoles: unknown[] = [];
let pendingList: { resolve: (value: unknown) => void } | null = null;

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
      return jsonResponse({ user: userPayload, roles: meRoles });
    }
    if (url === "/api/demandes/stats") {
      const next = statsResponses.shift();
      if (!next) {
        return jsonResponse({ totalVisible: 0, brouillons: 0, enAttenteValidation: 0, enAttenteAnalyse: 0, enAttenteDecision: 0, enAttenteFinancement: 0, enAttenteExecution: 0, retournees: 0, refusees: 0, urgentes: 0 }, 200);
      }
      if (next.status === -1) {
        return new Promise<Response>((resolve) => {
          pendingList = { resolve: (value) => resolve(value as Response) };
        });
      }
      return jsonResponse(next.body, next.status);
    }
    if (url === "/api/demandes" || url.startsWith("/api/demandes?")) {
      const next = listResponses.shift();
      if (!next) throw new Error(`Réponse liste manquante pour ${method} ${url}`);
      if (next.status === -1) {
        return new Promise<Response>((resolve) => {
          pendingList = { resolve: (value) => resolve(value as Response) };
        });
      }
      return jsonResponse(next.body, next.status);
    }
    throw new Error(`Requête inattendue: ${method} ${url}`);
  }) as typeof fetch;
}

const { AuthProvider } = await import("../src/context/AuthContext");
const { Dashboard } = await import("../src/pages/dashboard/Dashboard");
const { MemoryRouter, Routes, Route } = await import("react-router-dom");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react");
const { createElement } = await import("react");

let root: ReturnType<typeof createRoot> | null = null;
let container: HTMLElement | null = null;

async function renderDashboard() {
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
          { initialEntries: ["/"] },
          createElement(
            Routes,
            null,
            createElement(Route, { path: "/", element: createElement(Dashboard) }),
            createElement(Route, { path: "/demandes", element: createElement("div", { "data-testid": "page-list" }) }),
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
  statsResponses = [];
  meRoles = [];
  pendingList = null;
});

function click(element: Element) {
  return act(async () => {
    element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

test("affiche le prénom de l'utilisateur dans le bandeau d'accueil", async () => {
  statsResponses = [{ status: 200, body: { totalVisible: 0, brouillons: 0, enAttenteValidation: 0, enAttenteAnalyse: 0, enAttenteDecision: 0, enAttenteFinancement: 0, enAttenteExecution: 0, retournees: 0, refusees: 0, urgentes: 0 } }];
  listResponses = [{ status: 200, body: [] }];
  await renderDashboard();

  const text = container!.textContent ?? "";
  assert.ok(text.includes("Bienvenue, Alice"));
});

test("affiche les compteurs réels à partir des statistiques du serveur", async () => {
  meRoles = [makeRole({ role: "SUPER_ADMIN", structureId: null, structureName: null, scope: "*" })];
  statsResponses = [
    {
      status: 200,
      body: {
        totalVisible: 3,
        brouillons: 1,
        enAttenteValidation: 2,
        enAttenteAnalyse: 0,
        enAttenteDecision: 0,
        enAttenteFinancement: 0,
        enAttenteExecution: 0,
        retournees: 0,
        refusees: 0,
        urgentes: 1,
      },
    },
  ];
  listResponses = [{ status: 200, body: [] }];

  await renderDashboard();

  const total = container!.querySelector("[data-testid='stat-total']");
  const brouillons = container!.querySelector("[data-testid='stat-brouillons']");
  const validation = container!.querySelector("[data-testid='stat-en-attente-validation']");
  const urgentes = container!.querySelector("[data-testid='stat-urgentes']");
  assert.ok(total);
  assert.ok(brouillons);
  assert.ok(validation);
  assert.ok(urgentes);
  assert.ok((total!.textContent ?? "").includes("3"));
  assert.ok((brouillons!.textContent ?? "").includes("1"));
  assert.ok((validation!.textContent ?? "").includes("2"));
  assert.ok((urgentes!.textContent ?? "").includes("1"));
  assert.ok(fetchLog.includes("GET /api/demandes/stats"));
});

test("affiche un état de chargement sans compteurs factices", async () => {
  statsResponses = [{ status: 200, body: { totalVisible: 0, brouillons: 0, enAttenteValidation: 0, enAttenteAnalyse: 0, enAttenteDecision: 0, enAttenteFinancement: 0, enAttenteExecution: 0, retournees: 0, refusees: 0, urgentes: 0 } }];
  listResponses = [{ status: -1, body: null }];
  await renderDashboard();

  const total = container!.querySelector("[data-testid='stat-total']");
  assert.ok(total);
  assert.ok((total!.textContent ?? "").includes("—") || (total!.textContent ?? "").includes("0"));
  const status = container!.querySelector("[role='status']");
  assert.ok(status);
  assert.ok((status!.textContent ?? "").includes("Chargement"));
  assert.ok(fetchLog.includes("GET /api/demandes"));
  assert.ok(pendingList);

  await act(async () => {
    pendingList!.resolve(jsonResponse([]));
    pendingList = null;
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.ok((container!.querySelector("[data-testid='stat-total']")!.textContent ?? "").includes("0"));
});

test("affiche un état d'erreur sans compteurs factices et permet de réessayer", async () => {
  statsResponses = [
    { status: 500, body: { code: "INTERNAL_ERROR", message: "Erreur interne du serveur" } },
    { status: 200, body: { totalVisible: 0, brouillons: 0, enAttenteValidation: 0, enAttenteAnalyse: 0, enAttenteDecision: 0, enAttenteFinancement: 0, enAttenteExecution: 0, retournees: 0, refusees: 0, urgentes: 0 } },
  ];
  listResponses = [
    { status: 500, body: { code: "INTERNAL_ERROR", message: "Erreur interne du serveur" } },
    { status: 200, body: [makeDemande()] },
  ];
  await renderDashboard();

  const alert = container!.querySelector("[role='alert']");
  assert.ok(alert);
  assert.ok((alert!.textContent ?? "").includes("Impossible de charger vos demandes"));
  const total = container!.querySelector("[data-testid='stat-total']");
  assert.ok((total!.textContent ?? "").includes("—"));

  const retry = [...container!.querySelectorAll("button")].find((b) => b.textContent === "Réessayer");
  assert.ok(retry);
  await click(retry!);

  assert.ok((container!.textContent ?? "").includes("DEM-2026-AAAAA"));
  assert.equal(fetchLog.filter((c) => c === "GET /api/demandes").length, 2);
});

test("affiche les demandes récentes avec référence, titre, statut, date et lien", async () => {
  listResponses = [
    {
      status: 200,
      body: [
        makeDemande({ id: "d1", createdAt: "2026-10-01T10:00:00.000Z" }),
        makeDemande({
          id: "d2",
          reference: "DEM-2026-BBBBB",
          title: "Livraison de fournitures",
          status: "EN_ATTENTE_VALIDATION",
          createdAt: "2026-10-05T09:00:00.000Z",
          submittedAt: "2026-10-05T09:00:00.000Z",
        }),
      ],
    },
  ];
  await renderDashboard();

  const text = container!.textContent ?? "";
  assert.ok(text.includes("Demandes récentes"));
  assert.ok(text.includes("DEM-2026-BBBBB"));
  assert.ok(text.includes("Livraison de fournitures"));
  assert.ok(text.includes("En attente de validation"));
  assert.ok(text.includes("Brouillon"));
  assert.ok(text.includes("05/10/2026"));

  const detailLinks = [...container!.querySelectorAll("a")].filter((a) => {
    const href = a.getAttribute("href") ?? "";
    return href.startsWith("/demandes/") && href !== "/demandes/nouvelle";
  });
  assert.equal(detailLinks.length, 2);
  const hrefs = detailLinks.map((a) => a.getAttribute("href"));
  assert.ok(hrefs.includes("/demandes/d1"));
  assert.ok(hrefs.includes("/demandes/d2"));
});

test("trie les demandes par date de création décroissante et plafonne à 5", async () => {
  const demandes = Array.from({ length: 7 }, (_, i) =>
    makeDemande({
      id: `d${i}`,
      reference: `DEM-2026-REF${i}`,
      title: `Demande ${i}`,
      createdAt: `2026-10-0${i + 1}T10:00:00.000Z`,
    })
  );
  listResponses = [{ status: 200, body: demandes }];
  await renderDashboard();

  const detailLinks = [...container!.querySelectorAll("a")].filter((a) => {
    const href = a.getAttribute("href") ?? "";
    return href.startsWith("/demandes/") && href !== "/demandes/nouvelle";
  });
  assert.equal(detailLinks.length, 5);
  assert.equal(detailLinks[0]!.getAttribute("href"), "/demandes/d6");
  assert.equal(detailLinks[4]!.getAttribute("href"), "/demandes/d2");
  const text = container!.textContent ?? "";
  assert.ok(text.includes("DEM-2026-REF6"));
  assert.ok(!text.includes("DEM-2026-REF0"));
});

test("affiche le nom de l'auteur pour les demandes d'autres utilisateurs", async () => {
  listResponses = [
    {
      status: 200,
      body: [
        makeDemande({
          id: "d9",
          reference: "DEM-2026-ZZZZZ",
          authorId: "u2",
          authorFirstName: "Bruno",
          authorLastName: "Durand",
        }),
      ],
    },
  ];
  await renderDashboard();

  const text = container!.textContent ?? "";
  assert.ok(text.includes("Par Bruno Durand"));
});

test("affiche un état vide avec lien de création quand aucune demande n'existe", async () => {
  listResponses = [{ status: 200, body: [] }];
  await renderDashboard();

  const text = container!.textContent ?? "";
  assert.ok(text.includes("Aucune demande pour le moment"));
  const createLink = [...container!.querySelectorAll("a")].find(
    (a) => a.getAttribute("href") === "/demandes/nouvelle"
  );
  assert.ok(createLink);

  const total = container!.querySelector("[data-testid='stat-total']");
  assert.ok((total!.textContent ?? "").includes("0"));
});

test("n'affiche pas les blocs Session et Habilitations détaillés dans le dashboard opérationnel", async () => {
  listResponses = [{ status: 200, body: [] }];
  await renderDashboard();

  assert.equal(container!.querySelector("[data-testid='session-info']"), null);
  assert.equal(container!.querySelector("[data-testid='habilitations']"), null);
});

test("adapte le message d'accueil et les raccourcis pour un responsable de périmètre", async () => {
  meRoles = [
    makeRole({
      role: "DEPARTMENT_MANAGER",
      structureName: "Département INFRA",
      scope: "INFRA",
    }),
  ];
  listResponses = [{ status: 200, body: [] }];
  await renderDashboard();

  const text = container!.textContent ?? "";
  assert.ok(text.includes("celles de votre périmètre"));
  const shortcuts = container!.querySelector("[data-testid='shortcuts']");
  assert.ok((shortcuts!.textContent ?? "").includes("Vos demandes et celles de votre périmètre"));
});

test("n'affiche pas la mention périmètre pour un simple employé", async () => {
  meRoles = [makeRole({ role: "EMPLOYEE" })];
  listResponses = [{ status: 200, body: [] }];
  await renderDashboard();

  const shortcuts = container!.querySelector("[data-testid='shortcuts']");
  const text = shortcuts!.textContent ?? "";
  assert.ok(!text.includes("périmètre"));
  assert.ok(text.includes("Consulter et suivre vos demandes"));
});

test("n'expose que les demandes renvoyées par l'API (périmètre serveur)", async () => {
  listResponses = [{ status: 200, body: [makeDemande({ id: "d1" })] }];
  await renderDashboard();

  const detailLinks = [...container!.querySelectorAll("a")].filter((a) => {
    const href = a.getAttribute("href") ?? "";
    return href.startsWith("/demandes/") && href !== "/demandes/nouvelle";
  });
  assert.equal(detailLinks.length, 1);
  assert.equal(detailLinks[0]!.getAttribute("href"), "/demandes/d1");
  assert.ok(fetchLog.includes("GET /api/demandes"));
});

test("navigue vers la liste des demandes et vers la création", async () => {
  listResponses = [{ status: 200, body: [] }];
  await renderDashboard();

  const listLink = [...container!.querySelectorAll("a")].find(
    (a) => a.getAttribute("href") === "/demandes"
  );
  assert.ok(listLink);
  await click(listLink!);
  assert.ok(container!.querySelector("[data-testid='page-list']"));
});

test("navigue vers la création d'une demande depuis l'état vide", async () => {
  listResponses = [{ status: 200, body: [] }];
  await renderDashboard();

  const createLink = [...container!.querySelectorAll("a")].find(
    (a) => a.getAttribute("href") === "/demandes/nouvelle"
  );
  assert.ok(createLink);
  await click(createLink!);
  assert.ok(container!.querySelector("[data-testid='page-creation']"));
});

test("effectue un seul appel à l'API des demandes par montage", async () => {
  listResponses = [{ status: 200, body: [] }];
  await renderDashboard();

  assert.equal(fetchLog.filter((c) => c === "GET /api/demandes").length, 1);
});

// Bloc session détaillé retiré du dashboard opérationnel.

const FULL_STATS = {
  totalVisible: 1,
  brouillons: 1,
  enAttenteValidation: 1,
  enAttenteAnalyse: 1,
  enAttenteDecision: 1,
  enAttenteFinancement: 1,
  enAttenteExecution: 1,
  enAttenteConfirmationSatisfaction: 1,
  cloturees: 1,
  retournees: 1,
  refusees: 1,
  urgentes: 1,
};

function renderRole(role: string, extra: Record<string, unknown> = {}) {
  meRoles = [makeRole({ role, ...extra })];
  statsResponses = [{ status: 200, body: FULL_STATS }];
  listResponses = [{ status: 200, body: [] }];
}

test("vue Direction pour HIERARCHICAL_MANAGER", async () => {
  renderRole("HIERARCHICAL_MANAGER", { scope: "INFRA" });
  await renderDashboard();
  assert.ok(container!.querySelector("[data-testid='stat-total']"));
  assert.ok(container!.querySelector("[data-testid='stat-en-attente-validation']"));
  assert.ok(container!.textContent!.includes("validations hiérarchiques"));
});

test("vue Direction pour DELEGATED_REPRESENTATIVE", async () => {
  renderRole("DELEGATED_REPRESENTATIVE", { scope: "INFRA" });
  await renderDashboard();
  assert.ok(container!.querySelector("[data-testid='stat-total']"));
  assert.ok(container!.querySelector("[data-testid='stat-en-attente-validation']"));
});

test("vue DPMG pour DPMG_MANAGER", async () => {
  renderRole("DPMG_MANAGER", { scope: "*" });
  await renderDashboard();
  assert.ok(container!.querySelector("[data-testid='stat-en-attente-analyse']"));
  assert.ok(container!.querySelector("[data-testid='stat-en-attente-decision']"));
  const shortcuts = container!.querySelector("[data-testid='shortcuts']")!.textContent ?? "";
  assert.ok(shortcuts.includes("Consolidations"));
});

test("vue DPMG pour DPMG_DELEGATE", async () => {
  renderRole("DPMG_DELEGATE", { scope: "INFRA" });
  await renderDashboard();
  assert.ok(container!.querySelector("[data-testid='stat-en-attente-analyse']"));
  assert.ok(container!.querySelector("[data-testid='stat-en-attente-decision']"));
});

test("vue DFC pour DFC_CONTROLLER", async () => {
  renderRole("DFC_CONTROLLER", { scope: "INFRA" });
  await renderDashboard();
  assert.ok(container!.querySelector("[data-testid='stat-en-attente-financement']"));
  assert.ok(container!.querySelector("[data-testid='stat-en-attente-execution']"));
});

test("vue Département pour DEPARTMENT_MANAGER", async () => {
  renderRole("DEPARTMENT_MANAGER", { scope: "INFRA" });
  await renderDashboard();
  assert.ok(container!.querySelector("[data-testid='stat-en-attente-analyse']"));
});

test("vue Département pour DEPARTMENT_DELEGATE", async () => {
  renderRole("DEPARTMENT_DELEGATE", { scope: "INFRA" });
  await renderDashboard();
  assert.ok(container!.querySelector("[data-testid='stat-en-attente-analyse']"));
});

test("vue CPMP pour CPMP_USER", async () => {
  renderRole("CPMP_USER", { scope: "*" });
  await renderDashboard();
  assert.ok(container!.querySelector("[data-testid='stat-en-attente-financement']"));
  assert.ok(container!.querySelector("[data-testid='stat-cloturees']"));
  const shortcuts = container!.querySelector("[data-testid='shortcuts']")!.textContent ?? "";
  assert.ok(shortcuts.includes("Espace CPMP"));
});

test("vue DG pour DG_USER", async () => {
  renderRole("DG_USER", { scope: "*" });
  await renderDashboard();
  assert.ok(container!.querySelector("[data-testid='stat-en-attente-financement']"));
  assert.ok(container!.querySelector("[data-testid='stat-cloturees']"));
  const shortcuts = container!.querySelector("[data-testid='shortcuts']")!.textContent ?? "";
  assert.ok(shortcuts.includes("Espace DG"));
});

test("vue Exécution pour EXECUTION_AGENT", async () => {
  renderRole("EXECUTION_AGENT", { scope: "INFRA" });
  await renderDashboard();
  assert.ok(container!.querySelector("[data-testid='stat-en-attente-execution']"));
  assert.ok(container!.querySelector("[data-testid='stat-en-attente-confirmation-satisfaction']"));
});

test("vue Administration pour TECHNICAL_ADMIN", async () => {
  renderRole("TECHNICAL_ADMIN", { structureId: null, structureName: null, scope: "*" });
  await renderDashboard();
  assert.ok(container!.querySelector("[data-testid='stat-total']"));
  const shortcuts = container!.querySelector("[data-testid='shortcuts']")!.textContent ?? "";
  assert.ok(shortcuts.includes("Utilisateurs"));
  assert.ok(shortcuts.includes("Journaux d'administration"));
});

test("vue Administration pour SUPER_ADMIN", async () => {
  renderRole("SUPER_ADMIN", { structureId: null, structureName: null, scope: "*" });
  await renderDashboard();
  assert.ok(container!.querySelector("[data-testid='stat-total']"));
});

test("scénario multi-rôles DPMG + DFC", async () => {
  meRoles = [
    makeRole({ role: "DPMG_MANAGER", scope: "INFRA" }),
    makeRole({ role: "DFC_CONTROLLER", scope: "INFRA" }),
  ];
  statsResponses = [{ status: 200, body: FULL_STATS }];
  listResponses = [{ status: 200, body: [] }];
  await renderDashboard();
  assert.ok(container!.querySelector("[data-testid='stat-en-attente-analyse']"));
  assert.ok(container!.querySelector("[data-testid='stat-en-attente-financement']"));
  const shortcuts = container!.querySelector("[data-testid='shortcuts']")!.textContent ?? "";
  assert.ok(shortcuts.includes("Consolidations"));
});
