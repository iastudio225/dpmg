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

interface DemandeRow {
  id: string;
  reference: string;
  title: string;
  description: string;
  status: "BROUILLON" | "EN_ATTENTE_VALIDATION";
  category: "INFRASTRUCTURE" | "LOGISTIQUE" | "MAGASIN";
  departmentId: string;
  departmentCode: string;
  departmentName: string;
  authorId: string;
  authorFirstName: string;
  authorLastName: string;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
}

let store: DemandeRow[] = [];
let nextId = 1;
let submitShouldFail = false;
let listMode: "normal" | "unauthorized" | "pending" = "normal";
let pendingResolve: (() => void) | null = null;
const fetchLog: string[] = [];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function toRow(partial: Partial<DemandeRow> & Pick<DemandeRow, "title" | "description" | "category">): DemandeRow {
  const id = partial.id ?? `d${nextId++}`;
  return {
    id,
    reference: partial.reference ?? `DEM-2026-${id.toUpperCase()}`,
    title: partial.title,
    description: partial.description,
    status: partial.status ?? "BROUILLON",
    category: partial.category,
    departmentId: partial.departmentId ?? "dep1",
    departmentCode: partial.departmentCode ?? "INFRA",
    departmentName: partial.departmentName ?? "Département INFRA",
    authorId: partial.authorId ?? "u1",
    authorFirstName: partial.authorFirstName ?? "Alice",
    authorLastName: partial.authorLastName ?? "Martin",
    createdAt: partial.createdAt ?? "2026-10-01T10:00:00.000Z",
    updatedAt: partial.updatedAt ?? "2026-10-01T10:00:00.000Z",
    submittedAt: partial.submittedAt ?? null,
  };
}

function mockFetch() {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    fetchLog.push(`${method} ${url}`);

    if (url === "/api/auth/me") {
      return jsonResponse({ user: userU1, roles: [] });
    }

    if (url === "/api/demandes" && method === "GET") {
      if (listMode === "unauthorized") {
        return jsonResponse({ code: "UNAUTHORIZED", message: "Authentification requise" }, 401);
      }
      if (listMode === "pending") {
        await new Promise<void>((resolve) => {
          pendingResolve = resolve;
        });
      }
      return jsonResponse(store);
    }

    if (url === "/api/demandes" && method === "POST") {
      const payload = JSON.parse(String(init?.body)) as {
        title: string;
        description: string;
        category: DemandeRow["category"];
      };
      const row = toRow(payload);
      store.push(row);
      return jsonResponse(row, 201);
    }

    const submitMatch = url.match(/^\/api\/demandes\/([^/]+)\/submit$/);
    if (submitMatch && method === "PATCH") {
      if (submitShouldFail) {
        return jsonResponse({ code: "INTERNAL_ERROR", message: "Erreur interne du serveur" }, 500);
      }
      const row = store.find((d) => d.id === submitMatch[1]);
      if (!row) return jsonResponse({ code: "NOT_FOUND", message: "Demande non trouvée" }, 404);
      row.status = "EN_ATTENTE_VALIDATION";
      row.submittedAt = "2026-10-05T09:00:00.000Z";
      return jsonResponse(row);
    }

    const idMatch = url.match(/^\/api\/demandes\/([^/]+)$/);
    if (idMatch) {
      const row = store.find((d) => d.id === idMatch[1]);
      if (!row) return jsonResponse({ code: "NOT_FOUND", message: "Demande non trouvée" }, 404);
      if (method === "PATCH") {
        const payload = JSON.parse(String(init?.body)) as Partial<DemandeRow>;
        Object.assign(row, payload, { updatedAt: "2026-10-04T12:00:00.000Z" });
        return jsonResponse(row);
      }
      return jsonResponse(row);
    }

    throw new Error(`Requête inattendue: ${method} ${url}`);
  }) as typeof fetch;
}

const { AuthProvider } = await import("../src/context/AuthContext");
const { DemandeListPage } = await import("../src/pages/demandes/DemandeListPage");
const { DemandeCreatePage } = await import("../src/pages/demandes/DemandeCreatePage");
const { DemandeDetailPage } = await import("../src/pages/demandes/DemandeDetailPage");
const { MemoryRouter, Routes, Route } = await import("react-router-dom");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react");
const { createElement } = await import("react");

let root: ReturnType<typeof createRoot> | null = null;
let container: HTMLElement | null = null;

async function renderApp(initialPath: string) {
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
            createElement(Route, { path: "/demandes", element: createElement(DemandeListPage) }),
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
  if (pendingResolve) {
    pendingResolve();
    pendingResolve = null;
  }
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  container?.remove();
  root = null;
  container = null;
  store = [];
  nextId = 1;
  submitShouldFail = false;
  listMode = "normal";
  fetchLog.length = 0;
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

function linkByText(text: string): HTMLAnchorElement | undefined {
  return [...container!.querySelectorAll("a")].find((a) => a.textContent?.includes(text));
}

test("parcours complet : liste → création brouillon → détail → modification → soumission → retour liste", async () => {
  await renderApp("/demandes");

  // État initial : liste vide
  assert.ok((container!.textContent ?? "").includes("Aucune demande pour le moment."));

  // Navigation vers la création
  await click(linkByText("Nouvelle demande")!);
  assert.ok(container!.querySelector("#create-title"));

  // Remplissage et enregistrement en brouillon
  await setNativeValue(container!.querySelector("#create-title")!, "Achat de casques");
  await setNativeValue(container!.querySelector("#create-description")!, "Casques de sécurité");
  await setNativeValue(container!.querySelector("#create-category")!, "INFRASTRUCTURE");
  await click(buttonByText("Enregistrer")!);

  // Redirection vers le détail du brouillon créé
  const created = store[0]!;
  assert.ok((container!.textContent ?? "").includes(created.reference));
  assert.ok((container!.textContent ?? "").includes("Brouillon"));
  assert.ok(buttonByText("Soumettre la demande"));
  assert.ok(buttonByText("Modifier"));

  // Modification du brouillon
  await click(buttonByText("Modifier")!);
  await setNativeValue(container!.querySelector("#edit-title")!, "Achat de 20 casques");
  await submitForm(container!.querySelector("form")!);
  assert.ok((container!.textContent ?? "").includes("Achat de 20 casques"));

  // Soumission
  await click(buttonByText("Soumettre la demande")!);
  assert.ok((container!.textContent ?? "").includes("En attente de validation"));
  assert.equal(buttonByText("Soumettre la demande"), undefined);
  assert.equal(store[0]!.status, "EN_ATTENTE_VALIDATION");

  // Retour à la liste : la demande soumise y figure
  await click(linkByText("Retour à la liste")!);
  const text = container!.textContent ?? "";
  assert.ok(text.includes(created.reference));
  assert.ok(text.includes("Achat de 20 casques"));
  assert.ok(text.includes("En attente de validation"));
});

test("« Enregistrer et soumettre » : si la soumission échoue après création, message précis et verrou anti-doublon", async () => {
  submitShouldFail = true;
  await renderApp("/demandes/nouvelle");

  await setNativeValue(container!.querySelector("#create-title")!, "Demande sensible");
  await setNativeValue(container!.querySelector("#create-description")!, "Description");
  await setNativeValue(container!.querySelector("#create-category")!, "INFRASTRUCTURE");
  await click(buttonByText("Enregistrer et soumettre")!);

  // Message précis : la demande existe, seule la soumission a échoué
  const alert = container!.querySelector("[role='alert']");
  assert.ok(alert);
  const alertText = alert!.textContent ?? "";
  assert.ok(alertText.includes("a été créée comme brouillon"));
  assert.ok(alertText.includes("sa soumission a échoué"));

  // Verrou : plus de bouton d'enregistrement, proposition d'aller au détail
  assert.equal(buttonByText("Enregistrer"), undefined);
  assert.equal(buttonByText("Enregistrer et soumettre"), undefined);
  const voirButton = buttonByText(`Voir la demande ${store[0]!.reference}`);
  assert.ok(voirButton, "un bouton vers le détail doit être proposé");

  // Aucune resoumission possible : un seul POST create, zéro second POST
  const posts = fetchLog.filter((c) => c === "POST /api/demandes");
  assert.equal(posts.length, 1);

  // Le brouillon existe bien côté « serveur » et reste en BROUILLON
  assert.equal(store.length, 1);
  assert.equal(store[0]!.status, "BROUILLON");

  // Navigation vers le détail
  await click(voirButton!);
  assert.ok((container!.textContent ?? "").includes(store[0]!.reference));
  assert.ok((container!.textContent ?? "").includes("Brouillon"));
});

test("liste : un 401 affiche la session expirée", async () => {
  listMode = "unauthorized";
  await renderApp("/demandes");

  const alert = container!.querySelector("[role='alert']");
  assert.ok(alert);
  assert.ok((alert!.textContent ?? "").includes("Session expirée"));
});

test("liste : état de chargement visible pendant la récupération", async () => {
  listMode = "pending";
  await renderApp("/demandes");

  const status = container!.querySelector("[role='status']");
  assert.ok(status);
  assert.ok((status!.textContent ?? "").includes("Chargement des demandes"));

  // Libération de la promesse pour finir proprement
  await act(async () => {
    pendingResolve?.();
    pendingResolve = null;
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
