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

const userHabilite = {
  id: "u2",
  email: "responsable.infra@dpmg.fr",
  firstName: "Marie",
  lastName: "Dubois",
  phone: null,
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const roleDepartemental = {
  role: "DEPARTMENT_MANAGER",
  structureId: "st1",
  structureName: "Département INFRA",
  structureCode: "INFRA",
  structureType: "OTHER",
  scope: "INFRA",
  startDate: "2026-01-01T00:00:00.000Z",
  endDate: null,
  delegationNote: null,
};

const roleDpmg = {
  ...roleDepartemental,
  role: "DPMG_MANAGER",
};

const demandeAnalyse = {
  id: "d10",
  reference: "DEM-2026-FFFFF",
  title: "Réfection de la toiture",
  description: "Travaux de toiture à prévoir",
  status: "EN_ATTENTE_ANALYSE",
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

const demandeDecidee = {
  ...demandeAnalyse,
  status: "EN_ATTENTE_DECISION",
  updatedAt: "2026-10-04T11:00:00.000Z",
};

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
let meUser: typeof userHabilite = userHabilite;
let meRoles: Array<typeof roleDepartemental> = [roleDepartemental];

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
  meUser = userHabilite;
  meRoles = [roleDepartemental];
});

function click(element: Element) {
  return act(async () => {
    element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function setNativeValue(el: Element, value: string) {
  const isTextarea = el instanceof dom.window.HTMLTextAreaElement;
  const proto = isTextarea
    ? dom.window.HTMLTextAreaElement.prototype
    : dom.window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  setter.call(el, value);
  return act(async () => {
    el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function submitForm(form: HTMLFormElement) {
  return act(async () => {
    form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function buttonByText(text: string): HTMLButtonElement | undefined {
  return [...container!.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
}

function avisForm(): HTMLFormElement | null {
  const heading = [...container!.querySelectorAll("h2")].find(
    (h) => h.textContent?.trim() === "Avis départemental"
  );
  return heading?.closest("form") ?? null;
}

function avisCalls(): FetchBody[] {
  return fetchBodies.filter((b) => b.url === "/api/demandes/d10/avis");
}

// ---------------------------------------------------------------------------
// 1 à 4 : affichage conditionnel de la section
// ---------------------------------------------------------------------------

test("avis : le formulaire est affiché pour un utilisateur habilité sur une demande en analyse", async () => {
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeAnalyse }];
  await renderPage("/demandes/d10");

  const form = avisForm();
  assert.ok(form, "le formulaire d'avis doit être présent");
  assert.ok(container!.querySelector("#avis-motif"), "le champ Motif de l'avis doit être présent");
  assert.ok(container!.querySelector("#avis-commentaire"), "le champ Commentaire doit être présent");
  assert.ok(buttonByText("Enregistrer l'avis"), "le bouton d'enregistrement doit être présent");
});

test("avis : le formulaire est absent pour l'auteur de la demande", async () => {
  meUser = { ...userHabilite, id: "u1" };
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeAnalyse }];
  await renderPage("/demandes/d10");

  assert.equal(avisForm(), null);
});

test("avis : le formulaire est absent pour les autres statuts", async () => {
  routes = [
    { method: "GET", url: "/api/demandes/d10", status: 200, body: { ...demandeAnalyse, status: "EN_ATTENTE_VALIDATION" } },
  ];
  await renderPage("/demandes/d10");

  assert.equal(avisForm(), null);
});

test("avis : le formulaire est absent pour un rôle DPMG seul", async () => {
  meRoles = [roleDpmg];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeAnalyse }];
  await renderPage("/demandes/d10");

  assert.equal(avisForm(), null);
});

test("avis : le formulaire est absent pour un périmètre global (scope \"*\")", async () => {
  meRoles = [{ ...roleDepartemental, scope: "*" }];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeAnalyse }];
  await renderPage("/demandes/d10");

  assert.equal(avisForm(), null);
});

test("avis : le formulaire est absent pour un périmètre qui ne correspond pas au département", async () => {
  meRoles = [{ ...roleDepartemental, scope: "LOGISTIQUE" }];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeAnalyse }];
  await renderPage("/demandes/d10");

  assert.equal(avisForm(), null);
});

// ---------------------------------------------------------------------------
// 5 et 6 : saisie et validation côté frontend
// ---------------------------------------------------------------------------

test("avis : la saisie du motif et du commentaire est conservée dans le formulaire", async () => {
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeAnalyse }];
  await renderPage("/demandes/d10");

  await setNativeValue(container!.querySelector("#avis-motif")!, "Avis favorable");
  await setNativeValue(container!.querySelector("#avis-commentaire")!, "Budget disponible");

  assert.equal(
    (container!.querySelector("#avis-motif") as HTMLInputElement).value,
    "Avis favorable"
  );
  assert.equal(
    (container!.querySelector("#avis-commentaire") as HTMLTextAreaElement).value,
    "Budget disponible"
  );
});

test("avis : l'envoi est refusé côté frontend quand les deux champs sont vides", async () => {
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeAnalyse }];
  await renderPage("/demandes/d10");

  await submitForm(avisForm()!);

  assert.equal(avisCalls().length, 0, "aucun appel API ne doit être effectué");
  const error = container!.querySelector("#avis-error");
  assert.ok(error, "un message d'erreur doit être affiché");
  assert.ok((error!.textContent ?? "").includes("au moins un motif ou un commentaire"));
});

test("avis : l'envoi est refusé côté frontend quand les deux champs ne contiennent que des espaces", async () => {
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeAnalyse }];
  await renderPage("/demandes/d10");

  await setNativeValue(container!.querySelector("#avis-motif")!, "   ");
  await setNativeValue(container!.querySelector("#avis-commentaire")!, "  ");
  await submitForm(avisForm()!);

  assert.equal(avisCalls().length, 0, "aucun appel API ne doit être effectué");
  assert.ok(container!.querySelector("#avis-error"));
});

// ---------------------------------------------------------------------------
// 7 et 8 : appel API
// ---------------------------------------------------------------------------

test("avis : l'enregistrement appelle le backend avec le bon identifiant et le bon corps", async () => {
  routes = [
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeAnalyse },
    { method: "POST", url: "/api/demandes/d10/avis", status: 200, body: demandeDecidee },
  ];
  await renderPage("/demandes/d10");

  await setNativeValue(container!.querySelector("#avis-motif")!, "Avis favorable");
  await setNativeValue(container!.querySelector("#avis-commentaire")!, "Budget disponible");
  await submitForm(avisForm()!);

  const calls = avisCalls();
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.method, "POST");
  assert.equal(calls[0]!.url, "/api/demandes/d10/avis");
  assert.deepEqual(calls[0]!.body, { motif: "Avis favorable", commentaire: "Budget disponible" });
});

test("avis : un commentaire seul est envoyé sans propriété motif", async () => {
  routes = [
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeAnalyse },
    { method: "POST", url: "/api/demandes/d10/avis", status: 200, body: demandeDecidee },
  ];
  await renderPage("/demandes/d10");

  await setNativeValue(container!.querySelector("#avis-commentaire")!, "Seulement un commentaire");
  await submitForm(avisForm()!);

  const calls = avisCalls();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]!.body, { commentaire: "Seulement un commentaire" });
});

test("avis : un double clic ne déclenche qu'un seul appel API", async () => {
  routes = [
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeAnalyse },
    { method: "POST", url: "/api/demandes/d10/avis", status: 200, body: demandeDecidee },
  ];
  await renderPage("/demandes/d10");

  await setNativeValue(container!.querySelector("#avis-motif")!, "Avis favorable");
  const form = avisForm()!;
  await act(async () => {
    form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.equal(avisCalls().length, 1, "un seul appel API doit être effectué");
});

// ---------------------------------------------------------------------------
// 9 : succès
// ---------------------------------------------------------------------------

test("avis : le succès met à jour le statut et affiche une confirmation", async () => {
  routes = [
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeAnalyse },
    { method: "POST", url: "/api/demandes/d10/avis", status: 200, body: demandeDecidee },
  ];
  await renderPage("/demandes/d10");

  await setNativeValue(container!.querySelector("#avis-motif")!, "Avis favorable");
  await submitForm(avisForm()!);

  const text = container!.textContent ?? "";
  assert.ok(text.includes("En attente de décision"), "le statut doit être mis à jour");
  assert.equal(avisForm(), null, "le formulaire doit disparaître pour ce statut");

  const confirmation = container!.querySelector("[role='status']");
  assert.ok(confirmation, "une confirmation doit être affichée");
  assert.ok((confirmation!.textContent ?? "").includes("Avis départemental enregistré"));
});

// ---------------------------------------------------------------------------
// 10 à 14 : gestion des erreurs
// ---------------------------------------------------------------------------

test("avis : une erreur 400 affiche les erreurs de champ et conserve les saisies", async () => {
  routes = [
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeAnalyse },
    {
      method: "POST",
      url: "/api/demandes/d10/avis",
      status: 400,
      body: {
        code: "VALIDATION_ERROR",
        message: "Données d'avis invalides",
        details: { motif: ["Motif invalide"] },
      },
    },
  ];
  await renderPage("/demandes/d10");

  await setNativeValue(container!.querySelector("#avis-motif")!, "Avis favorable");
  await setNativeValue(container!.querySelector("#avis-commentaire")!, "Budget disponible");
  await submitForm(avisForm()!);

  const fieldError = container!.querySelector("#avis-motif-error");
  assert.ok(fieldError, "une erreur de champ doit être affichée");
  assert.ok((fieldError!.textContent ?? "").includes("Motif invalide"));
  assert.equal(
    (container!.querySelector("#avis-motif") as HTMLInputElement).value,
    "Avis favorable",
    "les saisies doivent être conservées"
  );
  assert.equal(
    (container!.querySelector("#avis-commentaire") as HTMLTextAreaElement).value,
    "Budget disponible"
  );
});

test("avis : une erreur 401 signale l'expiration de session", async () => {
  routes = [
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeAnalyse },
    {
      method: "POST",
      url: "/api/demandes/d10/avis",
      status: 401,
      body: { code: "SESSION_EXPIRED", message: "Session expirée ou invalide" },
    },
  ];
  await renderPage("/demandes/d10");

  await setNativeValue(container!.querySelector("#avis-motif")!, "Avis favorable");
  await submitForm(avisForm()!);

  const alert = container!.querySelector("[role='alert']");
  assert.ok(alert, "un message doit être affiché");
  assert.ok((alert!.textContent ?? "").includes("Session expirée"));
  assert.ok(fetchLog.includes("GET /api/auth/me"), "le rafraîchissement de l'utilisateur doit être déclenché");
});

test("avis : une erreur 403 n'annonce aucun succès et conserve le formulaire", async () => {
  routes = [
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeAnalyse },
    {
      method: "POST",
      url: "/api/demandes/d10/avis",
      status: 403,
      body: {
        code: "FORBIDDEN",
        message: "Vous n'êtes pas habilité pour le département concerné",
      },
    },
  ];
  await renderPage("/demandes/d10");

  await setNativeValue(container!.querySelector("#avis-motif")!, "Avis favorable");
  await submitForm(avisForm()!);

  const alert = container!.querySelector("[role='alert']");
  assert.ok(alert, "un message doit être affiché");
  assert.ok(
    (alert!.textContent ?? "").includes("Vous n'êtes pas habilité pour le département concerné")
  );
  assert.ok(!(container!.textContent ?? "").includes("Avis départemental enregistré"));
  assert.ok(avisForm(), "le formulaire doit rester affiché");
  assert.equal(
    (container!.querySelector("#avis-motif") as HTMLInputElement).value,
    "Avis favorable"
  );
});

test("avis : une erreur 403 DEMANDE_NOT_ANALYSE recharge la demande", async () => {
  routes = [
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeAnalyse },
    {
      method: "POST",
      url: "/api/demandes/d10/avis",
      status: 403,
      body: {
        code: "DEMANDE_NOT_ANALYSE",
        message: "La demande n'est plus en attente d'analyse : aucun avis n'a été enregistré",
      },
    },
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeDecidee },
  ];
  await renderPage("/demandes/d10");

  await setNativeValue(container!.querySelector("#avis-motif")!, "Avis favorable");
  await submitForm(avisForm()!);

  const alert = container!.querySelector("[role='alert']");
  assert.ok(alert, "un message doit être affiché");
  assert.ok((alert!.textContent ?? "").includes("plus en attente d'analyse"));
  assert.equal(
    fetchLog.filter((c) => c === "GET /api/demandes/d10").length,
    2,
    "la demande doit être rechargée"
  );
});

test("avis : une erreur 409 informe et recharge la demande", async () => {
  routes = [
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeAnalyse },
    {
      method: "POST",
      url: "/api/demandes/d10/avis",
      status: 409,
      body: {
        code: "CONCURRENT_MODIFICATION",
        message: "Cette demande a été modifiée ou traitée par un autre utilisateur",
      },
    },
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeDecidee },
  ];
  await renderPage("/demandes/d10");

  await setNativeValue(container!.querySelector("#avis-motif")!, "Avis favorable");
  await submitForm(avisForm()!);

  const alert = container!.querySelector("[role='alert']");
  assert.ok(alert, "un message doit être affiché");
  assert.ok(
    (alert!.textContent ?? "").includes("modifiée ou traitée par un autre utilisateur")
  );
  assert.equal(
    fetchLog.filter((c) => c === "GET /api/demandes/d10").length,
    2,
    "la demande doit être rechargée"
  );
});

test("avis : une erreur réseau conserve le formulaire et les saisies", async () => {
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeAnalyse }];
  await renderPage("/demandes/d10");

  await setNativeValue(container!.querySelector("#avis-motif")!, "Avis favorable");
  // Remplace fetch par une version qui échoue sur l'appel d'avis
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith("/avis")) {
      throw new Error("network down");
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  await submitForm(avisForm()!);

  const alert = container!.querySelector("[role='alert']");
  assert.ok(alert, "un message doit être affiché");
  assert.ok((alert!.textContent ?? "").includes("Erreur de connexion au serveur"));
  assert.ok(avisForm(), "le formulaire doit rester affiché");
  assert.equal(
    (container!.querySelector("#avis-motif") as HTMLInputElement).value,
    "Avis favorable"
  );
});

test("avis : une erreur 404 affiche l'état demande non trouvée", async () => {
  routes = [
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeAnalyse },
    {
      method: "POST",
      url: "/api/demandes/d10/avis",
      status: 404,
      body: { code: "NOT_FOUND", message: "Demande non trouvée" },
    },
  ];
  await renderPage("/demandes/d10");

  await setNativeValue(container!.querySelector("#avis-motif")!, "Avis favorable");
  await submitForm(avisForm()!);

  const text = container!.textContent ?? "";
  assert.ok(text.includes("Demande non trouvée"), "l'état demande non trouvée doit être affiché");
});
