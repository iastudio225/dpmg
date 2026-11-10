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

const fetchLog: string[] = [];
let structuresResponse: { status: number; body: unknown } | null = null;
let meRoles: Array<{ role: string; structureId: string | null; scope: string }> = [];
const editedStructures: Map<string, Record<string, unknown>> = new Map();

function makeStructure(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "s1",
    code: "DIR-01",
    name: "Direction centrale",
    type: "DIRECTION",
    parentId: null,
    parentName: null,
    status: true,
    createdAt: "2026-01-15T00:00:00.000Z",
    updatedAt: "2026-01-15T00:00:00.000Z",
    ...overrides,
  };
}

function mockFetch() {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    fetchLog.push(`${method} ${url}`);

    if (url === "/api/auth/me") {
      return jsonResponse({
        user: {
          id: "u1",
          email: "admin@dpmg.fr",
          firstName: "Alice",
          lastName: "Martin",
          phone: null,
          status: "ACTIVE",
          mustChangePassword: false,
          createdAt: "2026-01-15T00:00:00.000Z",
          updatedAt: "2026-01-15T00:00:00.000Z",
        },
        roles: meRoles,
      });
    }

    if (url.startsWith("/api/structures")) {
      if (method === "GET") {
        const single = url.match(/^\/api\/structures\/([^/?]+)$/);
        if (single) {
          const found = editedStructures.get(single[1]!) ?? makeStructure({ id: single[1]! });
          return jsonResponse(found);
        }
        const next = structuresResponse;
        if (!next) throw new Error("Réponse liste manquante pour " + method + " " + url);
        return jsonResponse(next.body, next.status);
      }
      if (method === "POST") {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        const created = makeStructure({ id: "s-new", ...body });
        editedStructures.set("s-new", created);
        return jsonResponse(created, 201);
      }
      if (method === "PUT") {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        const matchStatus = url.match(/^\/api\/structures\/([^/]+)\/status$/);
        if (matchStatus) {
          const existing = (editedStructures.get(matchStatus[1]!) ?? makeStructure({ id: matchStatus[1]! })) as Record<string, unknown>;
          existing["status"] = body["status"];
          editedStructures.set(matchStatus[1]!, existing);
          return jsonResponse(existing);
        }
        const matchSingle = url.match(/^\/api\/structures\/([^/]+)$/);
        if (matchSingle) {
          const existing = (editedStructures.get(matchSingle[1]!) ?? makeStructure({ id: matchSingle[1]! })) as Record<string, unknown>;
          const merged = { ...existing, ...body };
          editedStructures.set(matchSingle[1]!, merged);
          return jsonResponse(merged);
        }
      }
    }

    throw new Error("Requête inattendue: " + method + " " + url);
  }) as typeof fetch;
}

const { AuthProvider } = await import("../src/context/AuthContext");
const { StructuresPage } = await import("../src/pages/structures/StructuresPage");
const { StructureForm } = await import("../src/pages/structures/StructureForm");
const { MemoryRouter, Routes, Route } = await import("react-router-dom");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react");
const { createElement } = await import("react");

let root: ReturnType<typeof createRoot> | null = null;
let container: HTMLElement | null = null;

async function renderPage(initialEntry: string, element: unknown) {
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
            createElement(Route, { path: "/structures", element }),
            createElement(Route, { path: "/structures/nouvelle", element: createElement(StructureForm) }),
            createElement(Route, { path: "/structures/:id/modifier", element: createElement(StructureForm) })
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
  structuresResponse = null;
  meRoles = [];
  editedStructures.clear();
});

function click(element: Element) {
  return act(async () => {
    element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")?.set;
  return act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function setSelectValue(select: HTMLSelectElement, value: string) {
  return act(async () => {
    select.value = value;
    select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

test("l'interface liste les structures retournées par l'API", async () => {
  mockFetch();
  structuresResponse = { status: 200, body: [makeStructure()] };
  await renderPage("/structures", createElement(StructuresPage));

  assert.ok((container!.textContent ?? "").includes("Direction centrale"));
  assert.ok((container!.textContent ?? "").includes("DIR-01"));
  assert.ok(fetchLog.includes("GET /api/structures"));
});

test("l'interface affiche un état vide lorsque aucune structure n'existe", async () => {
  mockFetch();
  structuresResponse = { status: 200, body: [] };
  await renderPage("/structures", createElement(StructuresPage));

  assert.ok((container!.textContent ?? "").includes("Aucune structure trouvée"));
});

test("la recherche déclenche un appel API avec le critère de recherche", async () => {
  mockFetch();
  structuresResponse = { status: 200, body: [] };
  await renderPage("/structures", createElement(StructuresPage));

  const input = container!.querySelector("[data-testid='structures-search']") as HTMLInputElement;
  assert.ok(input);
  await setInputValue(input, "agence");

  assert.ok(fetchLog.includes("GET /api/structures?search=agence"));
});

test("un utilisateur non-admin ne voit pas le bouton de création", async () => {
  mockFetch();
  meRoles = [{ role: "EMPLOYEE", structureId: "s1", scope: "*" }];
  structuresResponse = { status: 200, body: [makeStructure()] };
  await renderPage("/structures", createElement(StructuresPage));

  assert.ok(!(container!.querySelector("[data-testid='btn-new-structure']")));
  const editButton = container!.querySelector("[data-testid='btn-edit-structure-s1']") as HTMLButtonElement;
  assert.ok(editButton);
  assert.strictEqual(editButton.disabled, true, "Les actions d'écriture doivent être désactivées");
});

test("un administrateur voit le bouton de création et les actions actives", async () => {
  mockFetch();
  meRoles = [{ role: "TECHNICAL_ADMIN", structureId: null, scope: "*" }];
  structuresResponse = { status: 200, body: [makeStructure()] };
  await renderPage("/structures", createElement(StructuresPage));

  const newButton = container!.querySelector("[data-testid='btn-new-structure']") as HTMLButtonElement;
  assert.ok(newButton, "Le bouton Nouvelle structure doit exister pour un admin");
  const editButton = container!.querySelector("[data-testid='btn-edit-structure-s1']") as HTMLButtonElement;
  assert.ok(editButton);
  assert.strictEqual(editButton.disabled, false);
});

test("le bouton nouvelle structure navigue vers le formulaire de création", async () => {
  mockFetch();
  meRoles = [{ role: "TECHNICAL_ADMIN", structureId: null, scope: "*" }];
  structuresResponse = { status: 200, body: [] };
  await renderPage("/structures", createElement(StructuresPage));

  const button = [...container!.querySelectorAll("button")].find((b) => b.textContent === "+ Nouvelle structure");
  assert.ok(button);
  await click(button!);
  assert.ok(container!.querySelector("[data-testid='structure-form']"));
});

test("la création de structure appelle l'API POST", async () => {
  mockFetch();
  structuresResponse = { status: 200, body: [] };
  await renderPage("/structures/nouvelle", createElement(StructureForm));

  const codeInput = container!.querySelector("#structure-code") as HTMLInputElement;
  const nameInput = container!.querySelector("#structure-name") as HTMLInputElement;
  assert.ok(codeInput);
  assert.ok(nameInput);

  await setInputValue(codeInput, "AG-NEW");
  await setInputValue(nameInput, "Nouvelle agence");

  const submit = container!.querySelector("[data-testid='structure-form-submit']") as HTMLButtonElement;
  assert.ok(submit);
  await click(submit);

  assert.ok(fetchLog.some((entry) => entry === "POST /api/structures"), "L'API de création doit être appelée");
  const postEntry = fetchLog.find((entry) => entry.startsWith("POST"));
  assert.ok(postEntry);
});

test("le formulaire d'édition est prérempli avec les données de la structure", async () => {
  mockFetch();
  editedStructures.set("s1", makeStructure({ name: "Direction modifiée" }) as Record<string, unknown>);
  await renderPage("/structures/s1/modifier", createElement(StructureForm));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  const codeInput = container!.querySelector("#structure-code") as HTMLInputElement;
  const nameInput = container!.querySelector("#structure-name") as HTMLInputElement;
  const typeSelect = container!.querySelector("#structure-type") as HTMLSelectElement;

  assert.ok(codeInput, "Le champ Code doit exister");
  assert.ok(nameInput, "Le champ Nom doit exister");
  assert.ok(typeSelect, "Le champ Type doit exister");
  assert.strictEqual(codeInput.value, "DIR-01");
  assert.strictEqual(nameInput.value, "Direction modifiée");
  assert.strictEqual(typeSelect.value, "DIRECTION");
});

test("la modification d'une structure appelle l'API PUT", async () => {
  mockFetch();
  editedStructures.set("s1", makeStructure() as Record<string, unknown>);
  await renderPage("/structures/s1/modifier", createElement(StructureForm));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  const nameInput = container!.querySelector("#structure-name") as HTMLInputElement;
  const submit = container!.querySelector("[data-testid='structure-form-submit']") as HTMLButtonElement;
  assert.ok(nameInput);
  assert.ok(submit);

  await setInputValue(nameInput, "Direction renommée");
  await click(submit);

  assert.ok(fetchLog.some((entry) => entry.startsWith("PUT /api/structures/s1")), "L'API de mise à jour doit être appelée");
});

test("la bascule de statut appelle l'API de changement de statut", async () => {
  mockFetch();
  meRoles = [{ role: "SUPER_ADMIN", structureId: null, scope: "*" }];
  structuresResponse = { status: 200, body: [makeStructure()] };
  await renderPage("/structures", createElement(StructuresPage));

  const toggle = container!.querySelector("[data-testid='btn-toggle-structure-s1']") as HTMLButtonElement;
  assert.ok(toggle);
  await click(toggle);

  assert.ok(
    fetchLog.some((entry) => entry.startsWith("PUT /api/structures/s1/status")),
    "L'API de changement de statut doit être appelée"
  );
});
