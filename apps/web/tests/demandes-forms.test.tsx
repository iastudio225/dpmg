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

const userU1 = {
  id: "u1",
  email: "alice@dpmg.fr",
  firstName: "Alice",
  lastName: "Martin",
  phone: null,
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const userU2 = {
  id: "u2",
  email: "bruno@dpmg.fr",
  firstName: "Bruno",
  lastName: "Durand",
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
  ...demandeBrouillon,
  id: "d2",
  reference: "DEM-2026-BBBBB",
  title: "Livraison de fournitures",
  status: "EN_ATTENTE_VALIDATION",
  submittedAt: "2026-10-03T08:00:00.000Z",
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
const fetchBodies: FetchBody[] = [];
let meUser: typeof userU1 = userU1;

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

    if (url === "/api/auth/me") {
      return jsonResponse({ user: meUser, roles: [] });
    }

    if (typeof init?.body === "string") {
      fetchBodies.push({ method, url, body: JSON.parse(init.body) });
    } else {
      fetchBodies.push({ method, url, body: undefined });
    }

    const index = routes.findIndex(
      (r) => r.method === method && (typeof r.url === "string" ? r.url === url : r.url.test(url))
    );
    if (index === -1) {
      throw new Error(`Requête inattendue: ${method} ${url}`);
    }
    const [route] = routes.splice(index, 1);
    return jsonResponse(route!.body, route!.status);
  }) as typeof fetch;
}

const { AuthProvider } = await import("../src/context/AuthContext");
const { DemandeCreatePage } = await import("../src/pages/demandes/DemandeCreatePage");
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
            createElement(Route, { path: "/demandes/nouvelle", element: createElement(DemandeCreatePage) }),
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
  fetchBodies.length = 0;
  meUser = userU1;
});

function click(element: Element) {
  return act(async () => {
    element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function setNativeValue(el: Element, value: string) {
  let proto: object;
  let eventName: string;
  if (el instanceof dom.window.HTMLTextAreaElement) {
    proto = dom.window.HTMLTextAreaElement.prototype;
    eventName = "input";
  } else if (el instanceof dom.window.HTMLSelectElement) {
    proto = dom.window.HTMLSelectElement.prototype;
    eventName = "change";
  } else {
    proto = dom.window.HTMLInputElement.prototype;
    eventName = "input";
  }
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  setter.call(el, value);
  return act(async () => {
    el.dispatchEvent(new dom.window.Event(eventName, { bubbles: true }));
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

async function fillCreateForm() {
  await setNativeValue(container!.querySelector("#create-title")!, "Achat de casques");
  await setNativeValue(container!.querySelector("#create-description")!, "Casques de sécurité pour le chantier");
  await setNativeValue(container!.querySelector("#create-category")!, "INFRASTRUCTURE");
}

// ---------------------------------------------------------------------------
// Page création
// ---------------------------------------------------------------------------

test("création : le formulaire s'affiche avec les champs et actions attendus", async () => {
  await renderPage("/demandes/nouvelle");

  assert.ok(container!.querySelector("#create-title"));
  assert.ok(container!.querySelector("#create-description"));
  assert.ok(container!.querySelector("#create-category"));
  assert.ok(buttonByText("Enregistrer"));
  assert.ok(buttonByText("Enregistrer et soumettre"));
  assert.ok(buttonByText("Annuler"));

  const options = [...container!.querySelectorAll("#create-category option")];
  assert.equal(options.length, 4);
  assert.ok(options.some((o) => o.textContent === "Infrastructures et moyens généraux"));
  assert.ok(options.some((o) => o.textContent === "Logistique, gestion sécuritaire et assurances"));
  assert.ok(options.some((o) => o.textContent === "Magasin central"));
});

test("création : la validation zod bloque l'envoi réseau sur formulaire vide", async () => {
  await renderPage("/demandes/nouvelle");

  await submitForm(container!.querySelector("form")!);

  const text = container!.textContent ?? "";
  assert.ok(text.includes("Titre trop court (3 caractères minimum)"));
  assert.ok(text.includes("Description requise"));
  assert.ok(text.includes("Catégorie requise"));

  assert.equal(fetchBodies.filter((b) => b.method === "POST" && b.url === "/api/demandes").length, 0);
});

test("création : enregistrer un brouillon envoie le bon payload puis navigue vers le détail", async () => {
  const created = { ...demandeBrouillon, id: "d9", reference: "DEM-2026-CCCCC" };
  routes = [
    { method: "POST", url: "/api/demandes", status: 201, body: created },
    { method: "GET", url: "/api/demandes/d9", status: 200, body: created },
  ];
  await renderPage("/demandes/nouvelle");

  await fillCreateForm();
  await submitForm(container!.querySelector("form")!);

  const post = fetchBodies.find((b) => b.method === "POST" && b.url === "/api/demandes");
  assert.ok(post);
  assert.deepEqual(post!.body, {
    title: "Achat de casques",
    description: "Casques de sécurité pour le chantier",
    category: "INFRASTRUCTURE",
  });

  const text = container!.textContent ?? "";
  assert.ok(text.includes("DEM-2026-CCCCC"));
  assert.ok(text.includes("Brouillon"));
});

test("création : enregistrer et soumettre enchaîne POST puis PATCH submit", async () => {
  const created = { ...demandeBrouillon, id: "d9", reference: "DEM-2026-CCCCC" };
  const submitted = {
    ...created,
    status: "EN_ATTENTE_VALIDATION",
    submittedAt: "2026-10-05T09:00:00.000Z",
  };
  routes = [
    { method: "POST", url: "/api/demandes", status: 201, body: created },
    { method: "PATCH", url: "/api/demandes/d9/submit", status: 200, body: submitted },
    { method: "GET", url: "/api/demandes/d9", status: 200, body: submitted },
  ];
  await renderPage("/demandes/nouvelle");

  await fillCreateForm();
  await click(buttonByText("Enregistrer et soumettre")!);

  assert.ok(fetchBodies.some((b) => b.method === "POST" && b.url === "/api/demandes"));
  assert.ok(fetchBodies.some((b) => b.method === "PATCH" && b.url === "/api/demandes/d9/submit"));

  const text = container!.textContent ?? "";
  assert.ok(text.includes("DEM-2026-CCCCC"));
  assert.ok(text.includes("En attente de validation"));
});

test("création : un 400 VALIDATION_ERROR serveur affiche les erreurs de champ", async () => {
  routes = [
    {
      method: "POST",
      url: "/api/demandes",
      status: 400,
      body: {
        code: "VALIDATION_ERROR",
        message: "Données de demande invalides",
        details: { title: ["Titre trop court (3 caractères minimum)"] },
      },
    },
  ];
  await renderPage("/demandes/nouvelle");

  await fillCreateForm();
  await submitForm(container!.querySelector("form")!);

  const alert = container!.querySelector("[role='alert']");
  assert.ok(alert);
  assert.ok((alert!.textContent ?? "").includes("Données de demande invalides"));

  const titleError = container!.querySelector("#create-title-error");
  assert.ok(titleError);
  assert.ok((titleError!.textContent ?? "").includes("Titre trop court"));
  assert.ok(container!.querySelector("#create-title")!.getAttribute("aria-invalid") === "true");
});

test("création : un 401 affiche la session expirée", async () => {
  routes = [
    { method: "POST", url: "/api/demandes", status: 401, body: { code: "UNAUTHORIZED", message: "Authentification requise" } },
  ];
  await renderPage("/demandes/nouvelle");

  await fillCreateForm();
  await submitForm(container!.querySelector("form")!);

  const alert = container!.querySelector("[role='alert']");
  assert.ok(alert);
  assert.ok((alert!.textContent ?? "").includes("Session expirée"));
});

// ---------------------------------------------------------------------------
// Page détail
// ---------------------------------------------------------------------------

test("détail : affiche la demande complète pour l'auteur d'un brouillon", async () => {
  routes = [{ method: "GET", url: "/api/demandes/d1", status: 200, body: demandeBrouillon }];
  await renderPage("/demandes/d1");

  const text = container!.textContent ?? "";
  assert.ok(text.includes("DEM-2026-AAAAA"));
  assert.ok(text.includes("Achat de matériel informatique"));
  assert.ok(text.includes("Brouillon"));
  assert.ok(text.includes("Infrastructures et moyens généraux"));
  assert.ok(text.includes("Département INFRA"));
  assert.ok(text.includes("Alice Martin"));
  assert.ok(text.includes("01/10/2026"));
  assert.ok(text.includes("Besoin de postes de travail"));

  assert.ok(buttonByText("Soumettre la demande"));
  assert.ok(buttonByText("Modifier"));
});

test("détail : une demande soumise n'affiche pas les actions de gestion", async () => {
  routes = [{ method: "GET", url: "/api/demandes/d2", status: 200, body: demandeEnAttente }];
  await renderPage("/demandes/d2");

  const text = container!.textContent ?? "";
  assert.ok(text.includes("En attente de validation"));
  assert.ok(text.includes("03/10/2026"));
  assert.equal(buttonByText("Soumettre la demande"), undefined);
  assert.equal(buttonByText("Modifier"), undefined);
});

test("détail : un manager non-auteur ne voit pas les actions de gestion", async () => {
  meUser = userU2;
  routes = [{ method: "GET", url: "/api/demandes/d1", status: 200, body: demandeBrouillon }];
  await renderPage("/demandes/d1");

  const text = container!.textContent ?? "";
  assert.ok(text.includes("DEM-2026-AAAAA"));
  assert.equal(buttonByText("Soumettre la demande"), undefined);
  assert.equal(buttonByText("Modifier"), undefined);
});

test("détail : la soumission met à jour le statut et masque les actions", async () => {
  const submitted = {
    ...demandeBrouillon,
    status: "EN_ATTENTE_VALIDATION",
    submittedAt: "2026-10-05T09:00:00.000Z",
  };
  routes = [
    { method: "GET", url: "/api/demandes/d1", status: 200, body: demandeBrouillon },
    { method: "PATCH", url: "/api/demandes/d1/submit", status: 200, body: submitted },
  ];
  await renderPage("/demandes/d1");

  await click(buttonByText("Soumettre la demande")!);

  assert.ok(fetchBodies.some((b) => b.method === "PATCH" && b.url === "/api/demandes/d1/submit"));
  const text = container!.textContent ?? "";
  assert.ok(text.includes("En attente de validation"));
  assert.equal(buttonByText("Soumettre la demande"), undefined);
  assert.equal(buttonByText("Modifier"), undefined);
});

test("détail : modifier un brouillon ouvre le formulaire pré-rempli et enregistre via PATCH", async () => {
  const updated = { ...demandeBrouillon, title: "Achat de 20 casques" };
  routes = [
    { method: "GET", url: "/api/demandes/d1", status: 200, body: demandeBrouillon },
    { method: "PATCH", url: "/api/demandes/d1", status: 200, body: updated },
  ];
  await renderPage("/demandes/d1");

  await click(buttonByText("Modifier")!);

  const titleInput = container!.querySelector<HTMLInputElement>("#edit-title");
  assert.ok(titleInput);
  assert.equal(titleInput!.value, "Achat de matériel informatique");
  assert.equal((container!.querySelector("#edit-description") as HTMLTextAreaElement).value, "Besoin de postes de travail");
  assert.equal(container!.querySelector("#edit-category")!.getAttribute("value") ?? (container!.querySelector("#edit-category") as HTMLSelectElement).value, "INFRASTRUCTURE");

  await setNativeValue(container!.querySelector("#edit-title")!, "Achat de 20 casques");
  await submitForm(container!.querySelector("form")!);

  const patch = fetchBodies.find((b) => b.method === "PATCH" && b.url === "/api/demandes/d1");
  assert.ok(patch);
  assert.deepEqual(patch!.body, {
    title: "Achat de 20 casques",
    description: "Besoin de postes de travail",
    category: "INFRASTRUCTURE",
  });

  const text = container!.textContent ?? "";
  assert.ok(text.includes("Achat de 20 casques"));
  assert.equal(container!.querySelector("#edit-title"), null);
  assert.ok(buttonByText("Soumettre la demande"));
});

test("détail : un titre trop court en édition bloque l'envoi", async () => {
  routes = [{ method: "GET", url: "/api/demandes/d1", status: 200, body: demandeBrouillon }];
  await renderPage("/demandes/d1");

  await click(buttonByText("Modifier")!);
  await setNativeValue(container!.querySelector("#edit-title")!, "ab");
  await submitForm(container!.querySelector("form")!);

  const titleError = container!.querySelector("#edit-title-error");
  assert.ok(titleError);
  assert.ok((titleError!.textContent ?? "").includes("Titre trop court"));
  assert.equal(fetchBodies.filter((b) => b.method === "PATCH" && b.url === "/api/demandes/d1").length, 0);
});

test("détail : un 404 affiche l'état demande non trouvée", async () => {
  routes = [
    { method: "GET", url: "/api/demandes/d404", status: 404, body: { code: "NOT_FOUND", message: "Demande non trouvée" } },
  ];
  await renderPage("/demandes/d404");

  const text = container!.textContent ?? "";
  assert.ok(text.includes("Demande non trouvée"));
  const back = [...container!.querySelectorAll("a")].find((a) => a.getAttribute("href") === "/demandes");
  assert.ok(back);
});
