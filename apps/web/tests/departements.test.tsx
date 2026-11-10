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
let departmentsResponse: { status: number; body: unknown } | null = null;
let structuresResponse: { status: number; body: unknown } | null = null;
let meRoles: Array<{ role: string; structureId: string | null; scope: string }> = [];
const editedDepartments: Map<string, Record<string, unknown>> = new Map();
let failUpdateWith: { status: number; body: unknown } | null = null;

function makeDepartment(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "d1",
    name: "Département Infrastructure",
    code: "INFRA",
    description: "Gestion des infrastructures",
    status: true,
    structureId: "s1",
    structureName: "Direction centrale",
    structureCode: "DIR-01",
    createdAt: "2026-01-15T00:00:00.000Z",
    updatedAt: "2026-01-15T00:00:00.000Z",
    ...overrides,
  };
}

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
      const next = structuresResponse;
      if (!next) return jsonResponse([]);
      return jsonResponse(next.body, next.status);
    }

    if (url.startsWith("/api/departments")) {
      if (method === "GET") {
        const single = url.match(/^\/api\/departments\/([^/?]+)$/);
        if (single) {
          const found = editedDepartments.get(single[1]!) ?? makeDepartment({ id: single[1]! });
          return jsonResponse(found);
        }
        const next = departmentsResponse;
        if (!next) throw new Error("Reponse liste manquante pour " + method + " " + url);
        return jsonResponse(next.body, next.status);
      }
      if (method === "POST") {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        const created = makeDepartment({ id: "d-new", ...body });
        editedDepartments.set("d-new", created);
        return jsonResponse(created, 201);
      }
      if (method === "PUT") {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        const matchStatus = url.match(/^\/api\/departments\/([^/]+)\/status$/);
        if (matchStatus) {
          const existing = (editedDepartments.get(matchStatus[1]!) ?? makeDepartment({ id: matchStatus[1]! })) as Record<string, unknown>;
          existing["status"] = body["status"];
          editedDepartments.set(matchStatus[1]!, existing);
          return jsonResponse(existing);
        }
        const matchSingle = url.match(/^\/api\/departments\/([^/]+)$/);
        if (matchSingle) {
          if (failUpdateWith) {
            return jsonResponse(failUpdateWith.body, failUpdateWith.status);
          }
          const existing = (editedDepartments.get(matchSingle[1]!) ?? makeDepartment({ id: matchSingle[1]! })) as Record<string, unknown>;
          const merged = { ...existing, ...body };
          editedDepartments.set(matchSingle[1]!, merged);
          return jsonResponse(merged);
        }
      }
    }

    throw new Error("Requête inattendue: " + method + " " + url);
  }) as typeof fetch;
}

const { AuthProvider } = await import("../src/context/AuthContext");
const { DepartementsPage } = await import("../src/pages/departements/DepartementsPage");
const { DepartementForm } = await import("../src/pages/departements/DepartementForm");
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
            createElement(Route, { path: "/departements", element }),
            createElement(Route, { path: "/departements/nouveau", element: createElement(DepartementForm) }),
            createElement(Route, { path: "/departements/:id/modifier", element: createElement(DepartementForm) })
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
  departmentsResponse = null;
  structuresResponse = null;
  meRoles = [];
  editedDepartments.clear();
  failUpdateWith = null;
});

function click(element: Element) {
  return act(async () => {
    element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    input.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
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

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

test("l'interface liste les departements retournes par l'API", async () => {
  mockFetch();
  departmentsResponse = { status: 200, body: [makeDepartment()] };
  await renderPage("/departements", createElement(DepartementsPage));

  assert.ok((container!.textContent ?? "").includes("Département Infrastructure"));
  assert.ok((container!.textContent ?? "").includes("INFRA"));
  assert.ok(fetchLog.includes("GET /api/departments"));
});

test("l'interface affiche un etat vide quand aucun departement n'existe", async () => {
  mockFetch();
  departmentsResponse = { status: 200, body: [] };
  await renderPage("/departements", createElement(DepartementsPage));

  assert.ok((container!.textContent ?? "").includes("Aucun département trouvé"));
});

test("la recherche declenche un appel API avec le critere", async () => {
  mockFetch();
  departmentsResponse = { status: 200, body: [] };
  await renderPage("/departements", createElement(DepartementsPage));

  const input = container!.querySelector("[data-testid='departments-search']") as HTMLInputElement;
  assert.ok(input);
  await setInputValue(input, "logistique");

  assert.ok(fetchLog.includes("GET /api/departments?search=logistique"));
});

test("le filtre par structure declenche un appel API avec la structure", async () => {
  mockFetch();
  structuresResponse = { status: 200, body: [makeStructure({ id: "s9", code: "AG-09", name: "Agence 09" })] };
  departmentsResponse = { status: 200, body: [] };
  await renderPage("/departements", createElement(DepartementsPage));
  await flush();

  const select = container!.querySelector("[data-testid='departments-structure-filter']") as HTMLSelectElement;
  assert.ok(select);
  await setSelectValue(select, "s9");

  assert.ok(fetchLog.includes("GET /api/departments?structureId=s9"));
});

test("le filtre par statut declenche un appel API avec le statut", async () => {
  mockFetch();
  departmentsResponse = { status: 200, body: [] };
  await renderPage("/departements", createElement(DepartementsPage));

  const select = container!.querySelector("[data-testid='departments-status-filter']") as HTMLSelectElement;
  assert.ok(select);
  await setSelectValue(select, "false");

  assert.ok(fetchLog.includes("GET /api/departments?status=false"));
});

test("un utilisateur non-admin ne voit pas le bouton de creation", async () => {
  mockFetch();
  meRoles = [{ role: "EMPLOYEE", structureId: "s1", scope: "*" }];
  departmentsResponse = { status: 200, body: [makeDepartment()] };
  await renderPage("/departements", createElement(DepartementsPage));

  assert.ok(!container!.querySelector("[data-testid='btn-new-department']"));
  const editButton = container!.querySelector("[data-testid='btn-edit-department-d1']") as HTMLButtonElement;
  assert.ok(editButton);
  assert.strictEqual(editButton.disabled, true, "Les actions d'ecriture doivent etre desactivees");
});

test("un administrateur voit le bouton de creation et les actions actives", async () => {
  mockFetch();
  meRoles = [{ role: "TECHNICAL_ADMIN", structureId: null, scope: "*" }];
  departmentsResponse = { status: 200, body: [makeDepartment()] };
  await renderPage("/departements", createElement(DepartementsPage));

  const newButton = container!.querySelector("[data-testid='btn-new-department']") as HTMLButtonElement;
  assert.ok(newButton, "Le bouton Nouveau departement doit exister pour un admin");
  const editButton = container!.querySelector("[data-testid='btn-edit-department-d1']") as HTMLButtonElement;
  assert.ok(editButton);
  assert.strictEqual(editButton.disabled, false);
});

test("le bouton nouveau departement navigue vers le formulaire", async () => {
  mockFetch();
  meRoles = [{ role: "TECHNICAL_ADMIN", structureId: null, scope: "*" }];
  departmentsResponse = { status: 200, body: [] };
  await renderPage("/departements", createElement(DepartementsPage));

  const button = [...container!.querySelectorAll("button")].find((b) => b.textContent === "+ Nouveau département");
  assert.ok(button);
  await click(button!);
  assert.ok(container!.querySelector("[data-testid='departement-form']"));
});

test("la creation d'un departement appelle l'API POST avec la structure choisie", async () => {
  mockFetch();
  structuresResponse = {
    status: 200,
    body: [makeStructure({ id: "s1" }), makeStructure({ id: "s2", code: "AG-02", name: "Agence 02" })],
  };
  departmentsResponse = { status: 200, body: [] };
  await renderPage("/departements/nouveau", createElement(DepartementForm));
  await flush();

  const nameInput = container!.querySelector("#department-name") as HTMLInputElement;
  const codeInput = container!.querySelector("#department-code") as HTMLInputElement;
  const structureSelect = container!.querySelector("#department-structure") as HTMLSelectElement;
  assert.ok(nameInput);
  assert.ok(codeInput);
  assert.ok(structureSelect, "Le selecteur de structure doit exister");

  await setInputValue(nameInput, "Departement Logistique");
  await setInputValue(codeInput, "LOGIST");
  await setSelectValue(structureSelect, "s2");

  const submit = container!.querySelector("[data-testid='departement-form-submit']") as HTMLButtonElement;
  assert.ok(submit);
  assert.strictEqual(submit.disabled, false);
  await click(submit);

  assert.ok(fetchLog.includes("POST /api/departments"), "L'API de creation doit etre appelee");
  const postIndex = fetchLog.indexOf("POST /api/departments");
  assert.ok(postIndex >= 0);
});

test("le formulaire d'edition est pre-rempli avec les donnees du departement", async () => {
  mockFetch();
  structuresResponse = { status: 200, body: [makeStructure({ id: "s1" })] };
  editedDepartments.set("d1", makeDepartment({ description: "Desc originale" }) as Record<string, unknown>);
  await renderPage("/departements/d1/modifier", createElement(DepartementForm));
  await flush();

  const nameInput = container!.querySelector("#department-name") as HTMLInputElement;
  const codeInput = container!.querySelector("#department-code") as HTMLInputElement;
  const descriptionInput = container!.querySelector("#department-description") as HTMLTextAreaElement;
  const structureSelect = container!.querySelector("#department-structure") as HTMLSelectElement;

  assert.ok(nameInput);
  assert.ok(codeInput);
  assert.ok(descriptionInput);
  assert.ok(structureSelect);
  assert.strictEqual(nameInput.value, "Département Infrastructure");
  assert.strictEqual(codeInput.value, "INFRA");
  assert.strictEqual(descriptionInput.value, "Desc originale");
  assert.strictEqual(structureSelect.value, "s1", "La structure actuelle est conservee");
});

test("la modification d'un departement appelle l'API PUT", async () => {
  mockFetch();
  structuresResponse = { status: 200, body: [makeStructure({ id: "s1" })] };
  editedDepartments.set("d1", makeDepartment() as Record<string, unknown>);
  await renderPage("/departements/d1/modifier", createElement(DepartementForm));
  await flush();

  const nameInput = container!.querySelector("#department-name") as HTMLInputElement;
  const submit = container!.querySelector("[data-testid='departement-form-submit']") as HTMLButtonElement;
  assert.ok(nameInput);
  assert.ok(submit);

  await setInputValue(nameInput, "Departement renomme");
  await click(submit);

  assert.ok(
    fetchLog.some((entry) => entry.startsWith("PUT /api/departments/d1")),
    "L'API de mise a jour doit etre appelee"
  );
});

test("le selecteur de structure exclut les structures deja rattachees a un autre departement", async () => {
  mockFetch();
  structuresResponse = {
    status: 200,
    body: [
      makeStructure({ id: "s1", code: "DIR-01", name: "Direction centrale" }),
      makeStructure({ id: "s2", code: "AG-02", name: "Agence 02" }),
      makeStructure({ id: "s3", code: "AG-03", name: "Agence 03" }),
    ],
  };
  // s2 est deja rattachee a un AUTRE departement (d2).
  departmentsResponse = {
    status: 200,
    body: [
      makeDepartment({ id: "d2", structureId: "s2", structureName: "Agence 02", code: "AUTRE" }),
    ],
  };
  await renderPage("/departements/nouveau", createElement(DepartementForm));
  await flush();

  const structureSelect = container!.querySelector("#department-structure") as HTMLSelectElement;
  assert.ok(structureSelect);

  const values = [...structureSelect.querySelectorAll("option")].map((o) => o.value);
  assert.ok(values.includes("s1"), "Structure libre disponible");
  assert.ok(values.includes("s3"), "Structure libre disponible");
  assert.ok(!values.includes("s2"), "Structure deja utilisee par un autre departement doit etre exclue");
});

test("en edition, la structure actuelle du departement reste proposee", async () => {
  mockFetch();
  structuresResponse = { status: 200, body: [makeStructure({ id: "s1" })] };
  // d1 est rattache a s1 ; s1 est donc filtree pour les AUTRES departements,
  // mais doit rester selectionnable pour d1 lui-meme.
  departmentsResponse = { status: 200, body: [makeDepartment({ id: "d1", structureId: "s1" })] };
  editedDepartments.set("d1", makeDepartment({ id: "d1", structureId: "s1" }) as Record<string, unknown>);
  await renderPage("/departements/d1/modifier", createElement(DepartementForm));
  await flush();

  const structureSelect = container!.querySelector("#department-structure") as HTMLSelectElement;
  assert.ok(structureSelect);
  assert.strictEqual(structureSelect.value, "s1", "La structure actuelle est conservee");

  const values = [...structureSelect.querySelectorAll("option")].map((o) => o.value);
  assert.ok(values.includes("s1"), "La structure actuelle reste proposee en edition");
});

test("la bascule de statut appelle l'API de changement de statut", async () => {
  mockFetch();
  meRoles = [{ role: "SUPER_ADMIN", structureId: null, scope: "*" }];
  departmentsResponse = { status: 200, body: [makeDepartment()] };
  await renderPage("/departements", createElement(DepartementsPage));

  const toggle = container!.querySelector("[data-testid='btn-toggle-department-d1']") as HTMLButtonElement;
  assert.ok(toggle);
  await click(toggle);

  assert.ok(
    fetchLog.some((entry) => entry.startsWith("PUT /api/departments/d1/status")),
    "L'API de changement de statut doit etre appelee"
  );
});

test("une erreur API est affichee sans masquer le formulaire", async () => {
  mockFetch();
  structuresResponse = { status: 200, body: [makeStructure({ id: "s1" })] };
  editedDepartments.set("d1", makeDepartment() as Record<string, unknown>);
  failUpdateWith = { status: 409, body: { code: "STRUCTURE_ALREADY_ASSIGNED", message: "Structure deja utilisee" } };
  await renderPage("/departements/d1/modifier", createElement(DepartementForm));
  await flush();

  const submit = container!.querySelector("[data-testid='departement-form-submit']") as HTMLButtonElement;
  assert.ok(submit);
  await click(submit);

  assert.ok(container!.querySelector("[role='alert']"), "Une erreur doit etre affichee");
  assert.ok(container!.querySelector("[data-testid='departement-form-submit']"), "Le formulaire doit rester ouvert");
  const alert = container!.querySelector("[role='alert']");
  assert.ok((alert!.textContent ?? "").includes("Structure deja utilisee"));
});

test("l'annulation du formulaire ne sauvegarde pas les modifications", async () => {
  mockFetch();
  structuresResponse = { status: 200, body: [makeStructure({ id: "s1" })] };
  editedDepartments.set("d1", makeDepartment() as Record<string, unknown>);
  await renderPage("/departements/d1/modifier", createElement(DepartementForm));
  await flush();

  const nameInput = container!.querySelector("#department-name") as HTMLInputElement;
  const cancelButton = container!.querySelector("[data-testid='cancel-form-btn']") as HTMLButtonElement;
  assert.ok(nameInput);
  assert.ok(cancelButton);

  await setInputValue(nameInput, "Nom non sauvegarde");
  await click(cancelButton);

  assert.ok(
    !fetchLog.some((entry) => entry.startsWith("PUT /api/departments/d1")),
    "Aucune mise a jour ne doit etre envoyee apres annulation"
  );
});
