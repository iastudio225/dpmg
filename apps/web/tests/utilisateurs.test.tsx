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

function parseBody(init?: RequestInit): Record<string, unknown> {
  if (!init?.body) throw new Error("Corps de requête manquant");
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

type MockRole = { id?: string; [key: string]: unknown };
type MockUserRecord = { id: string; status?: string; [key: string]: unknown };

const fetchLog: string[] = [];
const roleRequests: Array<{ method: string; roleId: string; body: unknown }> = [];
let createdUserBody: unknown = null;
let usersResponse: { status: number; body: unknown } | null = null;
let meResponse: { status: number; body: unknown } | null = null;
let structuresResponse: { status: number; body: unknown } = {
  status: 200,
  body: [
    {
      id: "struct1",
      code: "STR1",
      name: "Structure 1",
      type: "OTHER",
      parentId: null,
      parentName: null,
      status: true,
      createdAt: "2026-01-15T00:00:00.000Z",
      updatedAt: "2026-01-15T00:00:00.000Z",
    },
  ],
};
let departmentsByStructure: Record<string, { status: number; body: unknown }> = {};
let departmentHandler: ((structureId: string) => Promise<Response>) | null = null;
let forceUserUpdateError = false;
let userDetailRoles: MockRole[] = [];
let userDetailUser: MockUserRecord = { id: "u1", email: "admin@dpmg.fr", firstName: "Alice", lastName: "Martin" };

function mockFetch() {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    fetchLog.push(`${method} ${url}`);

    if (url === "/api/auth/me") {
      if (meResponse) {
        return jsonResponse(meResponse.body, meResponse.status);
      }
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
        roles: [],
      });
    }

    // Structures actives demandées par le formulaire utilisateurs.
    if (url.startsWith("/api/structures")) {
      return jsonResponse(structuresResponse.body, structuresResponse.status);
    }

    // Départements filtrés par structure.
    const departmentMatch = url.match(/^\/api\/departments\?structureId=([^&]+)$/);
    if (departmentMatch && method === "GET") {
      const structureId = decodeURIComponent(departmentMatch[1] ?? "");
      if (departmentHandler) return departmentHandler(structureId);
      const next = departmentsByStructure[structureId] ?? { status: 200, body: [] };
      return jsonResponse(next.body, next.status);
    }

    // Création d'utilisateur (avant la route générique GET /api/users).
    if (url === "/api/users" && method === "POST") {
      createdUserBody = parseBody(init);
      return jsonResponse(
        {
          id: "u2",
          email: "new@dpmg.fr",
          firstName: "New",
          lastName: "User",
          phone: null,
          status: "ACTIVE",
          mustChangePassword: true,
          createdAt: "2026-01-15T00:00:00.000Z",
          updatedAt: "2026-01-15T00:00:00.000Z",
        },
        201
      );
    }

    if (url === "/api/users") {
      const next = usersResponse;
      if (!next) throw new Error("Réponse liste manquante pour " + method + " " + url);
      return jsonResponse(next.body, next.status);
    }

    if (url.startsWith("/api/users/audit-logs")) {
      return jsonResponse([
        { id: "log1", actorId: "u2", action: "CREATE_USER", targetType: "User", targetId: "u3", details: { reason: "admin_reset" }, createdAt: "2026-01-15T10:00:00.000Z" },
      ]);
    }
    if (url === "/api/users/u1/reset-password" && method === "POST") {
      return jsonResponse({ temporaryPassword: "TempPass1234!", success: true });
    }
    if (url === "/api/auth/change-password") {
      return jsonResponse({ message: "Mot de passe modifié avec succès", mustChangePassword: false });
    }

    // GET /api/users/:id - détail utilisateur et ses rôles.
    const matchUser = url.match(/^\/api\/users\/([^/]+)$/);
    if (matchUser && method === "GET") {
      return jsonResponse({ user: userDetailUser, roles: userDetailRoles });
    }
    // PUT /api/users/:id - mise à jour des informations personnelles.
    if (matchUser && method === "PUT") {
      if (forceUserUpdateError) return jsonResponse({ message: "Erreur serveur" }, 500);
      const body = parseBody(init);
      userDetailUser = { ...userDetailUser, ...body };
      return jsonResponse(userDetailUser);
    }
    // PUT /api/users/:id/status - changement de statut.
    const matchStatus = url.match(/^\/api\/users\/([^/]+)\/status$/);
    if (matchStatus && method === "PUT") {
      const body = parseBody(init);
      userDetailUser.status = String(body.status);
      return jsonResponse(userDetailUser);
    }
    // POST /api/users/:id/roles - ajout d'un rôle.
    const matchAddRole = url.match(/^\/api\/users\/([^/]+)\/roles$/);
    if (matchAddRole && method === "POST") {
      const body = parseBody(init);
      userDetailRoles = [
        ...userDetailRoles,
        { id: `role-new-${userDetailRoles.length + 1}`, ...body },
      ];
      return jsonResponse({ success: true });
    }
    // PUT /api/users/:id/roles/:roleId - modification d'un rôle.
    const matchUpdateRole = url.match(/^\/api\/users\/([^/]+)\/roles\/([^/]+)$/);
    if (matchUpdateRole && method === "PUT") {
      const roleId = matchUpdateRole[2] ?? "";
      const body = parseBody(init);
      roleRequests.push({ method: "PUT", roleId, body });
      const index = userDetailRoles.findIndex((r) => r.id === roleId);
      if (index >= 0) {
        const current = userDetailRoles[index];
        if (current) userDetailRoles[index] = { ...current, ...body };
      }
      return jsonResponse({ success: true });
    }
    // DELETE /api/users/:id/roles/:roleId - suppression d'un rôle.
    if (matchUpdateRole && method === "DELETE") {
      const roleId = matchUpdateRole[2] ?? "";
      roleRequests.push({ method: "DELETE", roleId, body: null });
      userDetailRoles = userDetailRoles.filter((r) => r.id !== roleId);
      return jsonResponse({ success: true });
    }
    throw new Error("Requête inattendue: " + method + " " + url);
  }) as typeof fetch;
}

const { AuthProvider } = await import("../src/context/AuthContext");
const { UtilisateursPage } = await import("../src/pages/utilisateurs/UtilisateursPage");
const { UtilisateurForm } = await import("../src/pages/utilisateurs/UtilisateurForm");
const { AuditLogsPage } = await import("../src/pages/utilisateurs/AuditLogsPage");
const { ChangePasswordPage } = await import("../src/pages/ChangePasswordPage");
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
            createElement(Route, { path: "/utilisateurs", element }),
            createElement(Route, { path: "/utilisateurs/nouvelle", element: createElement(UtilisateurForm) }),
            createElement(Route, { path: "/utilisateurs/:id/modifier", element: createElement(UtilisateurForm) }),
            createElement(Route, { path: "/changer-mot-de-passe", element: createElement(ChangePasswordPage) }),
            createElement(Route, { path: "/audit", element: createElement(AuditLogsPage) })
          )
        )
      )
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function makeStructure(overrides: Record<string, unknown> = {}) {
  return {
    id: "struct1",
    code: "STR1",
    name: "Structure 1",
    type: "OTHER",
    parentId: null,
    parentName: null,
    status: true,
    createdAt: "2026-01-15T00:00:00.000Z",
    updatedAt: "2026-01-15T00:00:00.000Z",
    ...overrides,
  };
}

function makeDepartment(overrides: Record<string, unknown> = {}) {
  return {
    id: "dept1",
    name: "Département Infrastructure",
    code: "INFRA",
    description: null,
    status: true,
    structureId: "struct1",
    structureName: "Structure 1",
    structureCode: "STR1",
    createdAt: "2026-01-15T00:00:00.000Z",
    updatedAt: "2026-01-15T00:00:00.000Z",
    ...overrides,
  };
}

function makeRole(overrides: Record<string, unknown> = {}) {
  return {
    id: "role1",
    role: "EMPLOYEE",
    structureId: "struct1",
    structureName: "Structure 1",
    structureCode: "STR1",
    structureType: "OTHER",
    scope: "*",
    startDate: "2026-01-15T00:00:00.000Z",
    endDate: null,
    delegationNote: null,
    ...overrides,
  };
}

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "u1",
    email: "alice@dpmg.fr",
    firstName: "Alice",
    lastName: "Martin",
    phone: null,
    status: "ACTIVE",
    mustChangePassword: false,
    createdAt: "2026-01-15T00:00:00.000Z",
    updatedAt: "2026-01-15T00:00:00.000Z",
    ...overrides,
  };
}

function makeMe(roleOverrides: Record<string, unknown> = {}) {
  return {
    user: makeUser({ id: "admin1", email: "admin@dpmg.local", firstName: "Admin", lastName: "DPMG" }),
    roles: [
      makeRole({
        id: "me-role",
        role: "SUPER_ADMIN",
        structureId: null,
        structureName: null,
        structureCode: null,
        structureType: null,
        scope: "*",
        ...roleOverrides,
      }),
    ],
  };
}

function defaultDetailRoles(): MockRole[] {
  return [
    makeRole({
      id: "role-default",
      role: "TECHNICAL_ADMIN",
      structureId: null,
      structureName: null,
      structureCode: null,
      structureType: null,
    }),
  ];
}

function resetMockState() {
  fetchLog.length = 0;
  roleRequests.length = 0;
  createdUserBody = null;
  usersResponse = null;
  meResponse = null;
  structuresResponse = { status: 200, body: [makeStructure()] };
  departmentsByStructure = {};
  departmentHandler = null;
  forceUserUpdateError = false;
  userDetailRoles = defaultDetailRoles();
  userDetailUser = makeUser({ id: "u1", email: "admin@dpmg.fr", firstName: "Alice", lastName: "Martin" });
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
  resetMockState();
});

function click(element: Element) {
  return act(async () => {
    element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function settle(times = 2) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function setField(testId: string, value: string) {
  const element = container!.querySelector(`[data-testid='${testId}']`) as HTMLInputElement | HTMLSelectElement | null;
  assert.ok(element, `Le champ ${testId} doit exister`);
  const isSelect = element.tagName === "SELECT";
  const prototype = isSelect ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new dom.window.Event(isSelect ? "change" : "input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function submitForm() {
  const form = container!.querySelector("form");
  assert.ok(form, "Le formulaire doit exister");
  await act(async () => {
    form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function clickTestId(testId: string) {
  const element = container!.querySelector(`[data-testid='${testId}']`) as HTMLElement | null;
  assert.ok(element, `L'élément ${testId} doit exister`);
  await click(element);
}

function createdRoles(): Array<Record<string, unknown>> {
  const created = createdUserBody as { roles?: Array<Record<string, unknown>> } | null;
  return created?.roles ?? [];
}

function lastRoleRequest(method: string) {
  const matching = roleRequests.filter((r) => r.method === method);
  return matching.length > 0 ? matching[matching.length - 1] : undefined;
}

async function fillCreateForm() {
  await setField("user-last-name", "Martin");
  await setField("user-first-name", "Alice");
  await setField("user-email", "alice@dpmg.local");
  await setField("user-password", "TempPass1234!");
}

// ---------------------------------------------------------------------------
// Tests existants (régression)
// ---------------------------------------------------------------------------

test("l'interface liste les utilisateurs retournés par l'API", async () => {
  mockFetch();
  usersResponse = { status: 200, body: [makeUser()] };
  await renderPage("/utilisateurs", createElement(UtilisateursPage));

  assert.ok((container!.textContent ?? "").includes("alice@dpmg.fr"));
  assert.ok((container!.textContent ?? "").includes("Alice Martin"));
  assert.ok(fetchLog.includes("GET /api/users"));
});

test("l'interface affiche un état vide lorsque aucun utilisateur n'existe", async () => {
  mockFetch();
  usersResponse = { status: 200, body: [] };
  await renderPage("/utilisateurs", createElement(UtilisateursPage));

  assert.ok((container!.textContent ?? "").includes("Aucun utilisateur trouvé"));
});

test("la recherche déclenche un appel API avec le critère de recherche", async () => {
  mockFetch();
  usersResponse = { status: 200, body: [] };
  await renderPage("/utilisateurs", createElement(UtilisateursPage));

  const input = container!.querySelector("[data-testid='users-search']") as HTMLInputElement;
  assert.ok(input);
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(input, "ali");
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.ok(fetchLog.some((entry) => entry === "GET /api/users?search=ali"));
});

test("le bouton nouvel utilisateur navigue vers le formulaire de création", async () => {
  mockFetch();
  usersResponse = { status: 200, body: [] };
  await renderPage("/utilisateurs", createElement(UtilisateursPage));

  const button = [...container!.querySelectorAll("button")].find((b) => b.textContent === "+ Nouvel utilisateur");
  assert.ok(button);
  await click(button!);
  await settle();
  assert.ok(container!.querySelector("[data-testid='utilisateur-form']"));
});

test("la réinitialisation de mot de passe affiche le mot de passe temporaire puis le consolide", async () => {
  mockFetch();
  usersResponse = { status: 200, body: [makeUser({ id: "u1" })] };
  await renderPage("/utilisateurs", createElement(UtilisateursPage));

  const button = container!.querySelector("[data-testid='btn-reset-password-u1']") as HTMLButtonElement;
  assert.ok(button);
  await click(button);

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.ok((container!.textContent ?? "").includes("TempPass1234!"));
  const clearButton = [...container!.querySelectorAll("button")].find((b) => b.textContent === "Fermer");
  assert.ok(clearButton);
  await click(clearButton!);
  assert.ok(!(container!.textContent ?? "").includes("TempPass1234!"));
});

test("le formulaire de changement de mot de passe appelle l'API de changement", async () => {
  mockFetch();
  await renderPage("/changer-mot-de-passe", createElement(ChangePasswordPage));

  const form = container!.querySelector("form");
  assert.ok(form);
  await act(async () => {
    form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.ok(fetchLog.some((entry) => entry.startsWith("POST /api/auth/change-password")));
});

test("la page audit affiche les événements retournés par l'API", async () => {
  mockFetch();
  await renderPage("/audit", createElement(AuditLogsPage));

  assert.ok((container!.textContent ?? "").includes("CREATE_USER"));
  assert.ok((container!.textContent ?? "").includes("User"));
});

test("SUPER_ADMIN peut modifier un TECHNICAL_ADMIN", async () => {
  mockFetch();
  meResponse = { status: 200, body: makeMe() };
  usersResponse = {
    status: 200,
    body: [
      makeUser({
        id: "tech1",
        email: "tech@dpmg.local",
        roles: [makeRole({ id: "role-tech1", role: "TECHNICAL_ADMIN", structureId: null })],
      }),
    ],
  };

  await renderPage("/utilisateurs", createElement(UtilisateursPage));

  const editButton = container!.querySelector("[data-testid='btn-edit-user-tech1']") as HTMLButtonElement;
  assert.ok(editButton, "Le bouton Modifier doit exister pour le TECHNICAL_ADMIN");
  assert.strictEqual(editButton.disabled, false, "Le bouton Modifier doit être activé pour SUPER_ADMIN → TECHNICAL_ADMIN");
});

test("SUPER_ADMIN ne peut pas modifier un autre SUPER_ADMIN", async () => {
  mockFetch();
  meResponse = { status: 200, body: makeMe() };
  usersResponse = {
    status: 200,
    body: [
      makeUser({
        id: "super2",
        email: "super2@dpmg.local",
        roles: [makeRole({ id: "role-super2", role: "SUPER_ADMIN", structureId: null })],
      }),
    ],
  };

  await renderPage("/utilisateurs", createElement(UtilisateursPage));

  const editButton = container!.querySelector("[data-testid='btn-edit-user-super2']") as HTMLButtonElement;
  assert.ok(editButton, "Le bouton Modifier doit exister pour le SUPER_ADMIN cible");
  assert.strictEqual(editButton.disabled, true, "Le bouton Modifier doit être désactivé pour SUPER_ADMIN → SUPER_ADMIN");
});

test("TECHNICAL_ADMIN ne peut pas modifier un autre TECHNICAL_ADMIN", async () => {
  mockFetch();
  meResponse = { status: 200, body: makeMe({ role: "TECHNICAL_ADMIN" }) };
  usersResponse = {
    status: 200,
    body: [
      makeUser({
        id: "tech2",
        email: "tech2@dpmg.local",
        roles: [makeRole({ id: "role-tech2", role: "TECHNICAL_ADMIN", structureId: null })],
      }),
    ],
  };

  await renderPage("/utilisateurs", createElement(UtilisateursPage));

  const editButton = container!.querySelector("[data-testid='btn-edit-user-tech2']") as HTMLButtonElement;
  assert.ok(editButton, "Le bouton Modifier doit exister pour le TECHNICAL_ADMIN cible");
  assert.strictEqual(editButton.disabled, true, "Le bouton Modifier doit être désactivé pour TECHNICAL_ADMIN → TECHNICAL_ADMIN");
});

test("TECHNICAL_ADMIN ne peut pas modifier un SUPER_ADMIN", async () => {
  mockFetch();
  meResponse = { status: 200, body: makeMe({ role: "TECHNICAL_ADMIN" }) };
  usersResponse = {
    status: 200,
    body: [
      makeUser({
        id: "super2",
        email: "super2@dpmg.local",
        roles: [makeRole({ id: "role-super2", role: "SUPER_ADMIN", structureId: null })],
      }),
    ],
  };

  await renderPage("/utilisateurs", createElement(UtilisateursPage));

  const editButton = container!.querySelector("[data-testid='btn-edit-user-super2']") as HTMLButtonElement;
  assert.ok(editButton, "Le bouton Modifier doit exister pour le SUPER_ADMIN cible");
  assert.strictEqual(editButton.disabled, true, "Le bouton Modifier doit être désactivé pour TECHNICAL_ADMIN → SUPER_ADMIN");
});

test("le formulaire d'édition est prérempli avec les données de l'utilisateur", async () => {
  mockFetch();
  meResponse = { status: 200, body: makeMe() };
  userDetailRoles = [makeRole({ id: "role-u1", role: "EMPLOYEE" })];
  await renderPage("/utilisateurs/u1/modifier", createElement(UtilisateurForm));
  await settle();

  const lastNameInput = container!.querySelector("#user-last-name") as HTMLInputElement;
  const firstNameInput = container!.querySelector("#user-first-name") as HTMLInputElement;
  const emailInput = container!.querySelector("#user-email") as HTMLInputElement;
  const phoneInput = container!.querySelector("#user-phone") as HTMLInputElement;
  const statusSelect = container!.querySelector("#user-status-edit") as HTMLSelectElement;

  assert.ok(lastNameInput, "Le champ Nom doit exister");
  assert.ok(firstNameInput, "Le champ Prénom doit exister");
  assert.ok(emailInput, "Le champ E-mail doit exister");
  assert.ok(phoneInput, "Le champ Téléphone doit exister");
  assert.ok(statusSelect, "Le champ Statut doit exister");

  assert.strictEqual(lastNameInput.value, "Martin");
  assert.strictEqual(firstNameInput.value, "Alice");
  assert.strictEqual(emailInput.value, "admin@dpmg.fr");
  assert.strictEqual(phoneInput.value, "");
  assert.strictEqual(statusSelect.value, "ACTIVE");
});

test("la modification des informations personnelles appelle l'API de mise à jour", async () => {
  mockFetch();
  meResponse = { status: 200, body: makeMe() };
  await renderPage("/utilisateurs/u1/modifier", createElement(UtilisateurForm));
  await settle();

  assert.ok(container!.querySelector("[data-testid='user-form-submit']"), "Le bouton Enregistrer doit exister");
  await setField("user-last-name", "Dupont");
  await setField("user-email", "alice.dupont@dpmg.local");
  await submitForm();

  assert.ok(fetchLog.includes("PUT /api/users/u1"), "L'API de mise à jour doit être appelée");
});

test("l'annulation du formulaire ne sauvegarde pas les modifications", async () => {
  mockFetch();
  meResponse = { status: 200, body: makeMe() };
  await renderPage("/utilisateurs/u1/modifier", createElement(UtilisateurForm));
  await settle();

  const cancelButton = container!.querySelector("[data-testid='cancel-form-btn']") as HTMLButtonElement;
  assert.ok(cancelButton, "Le bouton Annuler doit exister");
  await click(cancelButton);

  assert.ok(!fetchLog.some((entry) => entry.startsWith("PUT /api/users/u1")), "Aucune mise à jour ne doit être envoyée après annulation");
});

test("l'ajout d'un rôle appelle l'API d'attribution de rôle", async () => {
  mockFetch();
  meResponse = { status: 200, body: makeMe() };
  await renderPage("/utilisateurs/u1/modifier", createElement(UtilisateurForm));
  await settle();

  await setField("add-user-role", "TECHNICAL_ADMIN");
  await clickTestId("add-user-role-btn");

  assert.ok(fetchLog.includes("POST /api/users/u1/roles"), "L'API d'attribution de rôle doit être appelée");
});

test("la suppression d'un rôle transmet exactement role.id", async () => {
  mockFetch();
  meResponse = { status: 200, body: makeMe() };
  userDetailRoles = [makeRole({ id: "role-a1", role: "EMPLOYEE" })];
  await renderPage("/utilisateurs/u1/modifier", createElement(UtilisateurForm));
  await settle();

  await clickTestId("remove-role-role-a1");

  assert.ok(fetchLog.includes("DELETE /api/users/u1/roles/role-a1"), "L'identifiant exact du rôle doit être transmis");
  const request = lastRoleRequest("DELETE");
  assert.ok(request, "Une requête DELETE doit avoir été enregistrée");
  assert.strictEqual(request.roleId, "role-a1");
  assert.ok(
    !fetchLog.some((entry) => entry.startsWith("DELETE /api/users/u1/roles/") && entry !== "DELETE /api/users/u1/roles/role-a1"),
    "Aucun autre identifiant ne doit être envoyé"
  );
});

test("la modification du statut appelle l'API de changement de statut", async () => {
  mockFetch();
  meResponse = { status: 200, body: makeMe() };
  await renderPage("/utilisateurs/u1/modifier", createElement(UtilisateurForm));
  await settle();

  await setField("user-status-edit", "DISABLED");
  assert.ok(container!.querySelector("[data-testid='user-form-submit']"), "Le bouton Enregistrer doit exister");
  await submitForm();

  assert.ok(fetchLog.includes("PUT /api/users/u1/status"), "L'API de changement de statut doit être appelée");
});

test("une erreur API est affichée sans masquer le formulaire", async () => {
  mockFetch();
  meResponse = { status: 200, body: makeMe() };
  forceUserUpdateError = true;
  await renderPage("/utilisateurs/u1/modifier", createElement(UtilisateurForm));
  await settle();

  await submitForm();

  assert.ok(container!.querySelector("[role='alert']"), "Une erreur doit être affichée");
  assert.ok(container!.querySelector("[data-testid='user-form-submit']"), "Le formulaire doit rester ouvert");
});

// ---------------------------------------------------------------------------
// A. Structures
// ---------------------------------------------------------------------------

test("le formulaire charge les structures actives avec les paramètres attendus", async () => {
  mockFetch();
  await renderPage("/utilisateurs/nouvelle", createElement(UtilisateurForm));
  await settle();

  assert.ok(
    fetchLog.includes("GET /api/structures?status=true&limit=100"),
    "Les structures actives doivent être chargées une seule fois via status=true&limit=100"
  );
  assert.strictEqual(
    fetchLog.filter((entry) => entry.startsWith("GET /api/structures")).length,
    1,
    "Un seul appel de liste des structures doit être effectué"
  );
});

test("les structures inactives sont exclues et les options affichent nom et code", async () => {
  mockFetch();
  structuresResponse = {
    status: 200,
    body: [
      makeStructure({ id: "struct-active", code: "ACT", name: "Structure active", status: true }),
      makeStructure({ id: "struct-inactive", code: "INA", name: "Structure inactive", status: false }),
    ],
  };
  await renderPage("/utilisateurs/nouvelle", createElement(UtilisateurForm));
  await settle();

  const select = container!.querySelector("[data-testid='user-structure-id']") as HTMLSelectElement;
  assert.ok(select, "Le sélecteur de structures doit exister");
  const values = [...select.options].map((option) => option.value);
  const labels = [...select.options].map((option) => option.textContent);

  assert.ok(values.includes("struct-active"));
  assert.ok(!values.includes("struct-inactive"), "Une structure inactive ne doit pas être proposée");
  assert.ok(labels.includes("Structure active (ACT)"), "Le nom et le code doivent être affichés");
  assert.ok(!labels.includes("Structure inactive (INA)"));
});

test("la sélection d'une structure transmet son véritable identifiant à la création", async () => {
  mockFetch();
  structuresResponse = {
    status: 200,
    body: [makeStructure({ id: "struct-active", code: "ACT", name: "Structure active" })],
  };
  await renderPage("/utilisateurs/nouvelle", createElement(UtilisateurForm));
  await settle();

  await fillCreateForm();
  await setField("user-structure-id", "struct-active");
  await submitForm();

  assert.ok(fetchLog.includes("POST /api/users"), "La création doit être envoyée");
  assert.strictEqual(createdRoles()[0]?.structureId, "struct-active", "Le véritable structure.id doit être transmis");
  assert.strictEqual(createdRoles()[0]?.role, "EMPLOYEE");
});

test("une erreur de chargement des structures est signalée sans bloquer le formulaire", async () => {
  mockFetch();
  structuresResponse = { status: 500, body: { message: "Erreur" } };
  await renderPage("/utilisateurs/nouvelle", createElement(UtilisateurForm));
  await settle();

  assert.ok(
    (container!.querySelector("[data-testid='user-structures-error']")?.textContent ?? "").includes("Impossible de charger les structures")
  );
  await fillCreateForm();
  await submitForm();
  assert.ok(fetchLog.includes("POST /api/users"), "L'enregistrement doit rester possible");
});

// ---------------------------------------------------------------------------
// B. Départements
// ---------------------------------------------------------------------------

test("le département associé s'affiche automatiquement après sélection d'une structure", async () => {
  mockFetch();
  departmentsByStructure["struct1"] = { status: 200, body: [makeDepartment()] };
  await renderPage("/utilisateurs/nouvelle", createElement(UtilisateurForm));
  await settle();

  await setField("user-structure-id", "struct1");
  await settle();

  assert.ok(fetchLog.includes("GET /api/departments?structureId=struct1"));
  assert.strictEqual(
    container!.querySelector("[data-testid='user-department-value']")?.textContent?.trim(),
    "Département Infrastructure"
  );
  assert.ok(!container!.querySelector("input[data-testid='user-department']"), "Le département doit être en lecture seule");
});

test("le département associé s'affiche dans le bloc d'ajout de rôle en édition", async () => {
  mockFetch();
  meResponse = { status: 200, body: makeMe() };
  departmentsByStructure["struct1"] = { status: 200, body: [makeDepartment()] };
  await renderPage("/utilisateurs/u1/modifier", createElement(UtilisateurForm));
  await settle();

  await setField("add-user-structure-id", "struct1");
  await settle();

  assert.ok(fetchLog.includes("GET /api/departments?structureId=struct1"));
  assert.strictEqual(
    container!.querySelector("[data-testid='add-user-department-value']")?.textContent?.trim(),
    "Département Infrastructure"
  );
});

test("l'absence de département affiche le message dédié sans être une erreur", async () => {
  mockFetch();
  departmentsByStructure["struct1"] = { status: 200, body: [] };
  await renderPage("/utilisateurs/nouvelle", createElement(UtilisateurForm));
  await settle();

  await setField("user-structure-id", "struct1");
  await settle();

  assert.strictEqual(
    container!.querySelector("[data-testid='user-department-empty']")?.textContent?.trim(),
    "Aucun département associé"
  );
  assert.ok(!container!.querySelector("[data-testid='user-department-error']"), "L'absence de département n'est pas une erreur réseau");
  assert.ok(!container!.querySelector("[role='alert']"), "Aucune erreur bloquante ne doit être affichée");
});

test("une erreur de récupération du département est signalée sans bloquer l'enregistrement", async () => {
  mockFetch();
  departmentsByStructure["struct1"] = { status: 500, body: { message: "Erreur" } };
  await renderPage("/utilisateurs/nouvelle", createElement(UtilisateurForm));
  await settle();

  await setField("user-structure-id", "struct1");
  await settle();

  assert.strictEqual(
    container!.querySelector("[data-testid='user-department-error']")?.textContent?.trim(),
    "Impossible de récupérer le département associé"
  );
  assert.ok(!container!.querySelector("[role='alert']"), "L'erreur de département ne doit pas être une erreur bloquante");

  await fillCreateForm();
  await submitForm();
  assert.ok(fetchLog.includes("POST /api/users"), "L'enregistrement du formulaire doit rester possible");
});

test("un département inactif est signalé sans règle métier supplémentaire", async () => {
  mockFetch();
  departmentsByStructure["struct1"] = {
    status: 200,
    body: [makeDepartment({ status: false })],
  };
  await renderPage("/utilisateurs/nouvelle", createElement(UtilisateurForm));
  await settle();

  await setField("user-structure-id", "struct1");
  await settle();

  assert.ok(
    (container!.querySelector("[data-testid='user-department-value']")?.textContent ?? "").includes("Département Infrastructure")
  );
  assert.ok(
    container!.querySelector("[data-testid='user-department-inactive']"),
    "L'état inactif doit être signalé"
  );
});

test("un changement rapide de structure n'affiche pas une réponse obsolète", async () => {
  let resolveFirst: ((response: Response) => void) | null = null;
  const firstRequest = new Promise<Response>((resolve) => {
    resolveFirst = resolve;
  });
  departmentHandler = async (structureId) => {
    if (structureId === "struct1") return firstRequest;
    return jsonResponse([makeDepartment({ name: "Département B", structureId: "struct2" })]);
  };

  mockFetch();
  structuresResponse = {
    status: 200,
    body: [
      makeStructure({ id: "struct1", code: "S1", name: "Structure 1" }),
      makeStructure({ id: "struct2", code: "S2", name: "Structure 2" }),
    ],
  };
  await renderPage("/utilisateurs/nouvelle", createElement(UtilisateurForm));
  await settle();

  await setField("user-structure-id", "struct1");
  await settle();
  assert.ok(container!.querySelector("[data-testid='user-department-loading']"), "Un indicateur discret doit être affiché pendant le chargement");

  await setField("user-structure-id", "struct2");
  await settle();
  assert.ok((container!.textContent ?? "").includes("Département B"), "La département de la nouvelle structure doit être affiché");
  assert.ok(!(container!.textContent ?? "").includes("Département A"), "Aucune ancienne réponse ne doit être affichée");

  await act(async () => {
    resolveFirst!(jsonResponse([makeDepartment({ name: "Département A", structureId: "struct1" })]));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await settle();
  assert.ok(!(container!.textContent ?? "").includes("Département A"), "La réponse obsolète doit être ignorée");
  assert.ok((container!.textContent ?? "").includes("Département B"), "La réponse courante doit rester affichée");
});

// ---------------------------------------------------------------------------
// C. Affectations — identifiant réel UserStructureRole
// ---------------------------------------------------------------------------

test("la modification d'un rôle transmet exactement role.id et conserve scope et dates", async () => {
  mockFetch();
  meResponse = { status: 200, body: makeMe() };
  userDetailRoles = [
    makeRole({ id: "role-42", role: "EMPLOYEE", scope: "initial" }),
  ];
  await renderPage("/utilisateurs/u1/modifier", createElement(UtilisateurForm));
  await settle();

  await clickTestId("edit-role-role-42");
  assert.ok(container!.querySelector("[data-testid='edit-role-scope-input']"), "Le panneau d'édition doit s'ouvrir");
  await setField("edit-role-scope-input", "etendu");
  await setField("edit-role-start-date", "2026-02-01");
  await setField("edit-role-end-date", "2026-03-01");
  await clickTestId("save-role-btn");

  assert.ok(fetchLog.includes("PUT /api/users/u1/roles/role-42"), "L'identifiant exact du rôle doit être transmis");
  const request = lastRoleRequest("PUT");
  assert.ok(request, "Une requête PUT doit avoir été enregistrée");
  assert.strictEqual(request.roleId, "role-42");
  const body = request.body as Record<string, unknown>;
  assert.strictEqual(body.scope, "etendu");
  assert.strictEqual(body.startDate, "2026-02-01T00:00:00.000Z");
  assert.strictEqual(body.endDate, "2026-03-01T00:00:00.000Z");
  assert.ok(
    !fetchLog.some((entry) => entry.startsWith("PUT /api/users/u1/roles/") && entry !== "PUT /api/users/u1/roles/role-42"),
    "Aucun index ou identifiant synthétique ne doit être envoyé"
  );
});

test("l'édition retrouve le rôle par son identifiant et non par son index", async () => {
  mockFetch();
  meResponse = { status: 200, body: makeMe() };
  userDetailRoles = [
    makeRole({ id: "role-first", role: "EMPLOYEE" }),
    makeRole({ id: "role-second", role: "HIERARCHICAL_MANAGER" }),
  ];
  await renderPage("/utilisateurs/u1/modifier", createElement(UtilisateurForm));
  await settle();

  assert.ok(container!.querySelector("[data-testid='role-row-role-first']"), "Les clés React doivent être stables");
  assert.ok(container!.querySelector("[data-testid='role-row-role-second']"));
  assert.ok(!container!.querySelector("[data-testid='role-row-0']"), "Aucun index de tableau ne doit servir d'identifiant de test");

  await clickTestId("edit-role-role-second");
  const label = container!.querySelector("label[for='edit-role-scope']")?.textContent ?? "";
  assert.ok(label.includes("Directeur régional"), "Le rôle édité doit être retrouvé par son id, pas par son index");
});

test("un rôle sans identifiant empêche la modification et la suppression", async () => {
  mockFetch();
  meResponse = { status: 200, body: makeMe() };
  userDetailRoles = [
    { role: "EMPLOYEE", structureId: "struct1", structureName: "Structure 1", structureCode: "STR1", structureType: "OTHER", scope: "*", startDate: "2026-01-15T00:00:00.000Z", endDate: null, delegationNote: null },
  ];
  await renderPage("/utilisateurs/u1/modifier", createElement(UtilisateurForm));
  await settle();

  await clickTestId("edit-role-sans-identifiant");
  assert.ok(
    (container!.querySelector("[role='alert']")?.textContent ?? "").includes("Identifiant du rôle introuvable"),
    "Une erreur explicite doit être affichée"
  );
  assert.ok(!container!.querySelector("[data-testid='edit-role-scope-input']"), "Le panneau d'édition ne doit pas s'ouvrir");

  await clickTestId("remove-role-sans-identifiant");
  assert.ok(!fetchLog.some((entry) => entry.startsWith("DELETE /api/users/u1/roles/")), "Aucune requête invalide ne doit être envoyée");
  assert.ok(!roleRequests.some((r) => r.method === "DELETE"));
});

// ---------------------------------------------------------------------------
// D. Rôles globaux
// ---------------------------------------------------------------------------

test("la création d'un SUPER_ADMIN préserve structureId null et le scope global", async () => {
  mockFetch();
  await renderPage("/utilisateurs/nouvelle", createElement(UtilisateurForm));
  await settle();

  await fillCreateForm();
  await setField("user-role", "SUPER_ADMIN");
  await settle();

  assert.ok(!container!.querySelector("[data-testid='user-structure-id']"), "Le sélecteur de structure doit rester masqué");
  assert.ok(!fetchLog.some((entry) => entry.startsWith("GET /api/departments")), "Aucun appel de département pour un rôle global");
  await submitForm();

  const created = createdRoles()[0];
  assert.ok(created, "La création doit être envoyée");
  assert.strictEqual(created.role, "SUPER_ADMIN");
  assert.strictEqual(created.structureId, null);
  assert.strictEqual(created.scope, "*");
});

test("la création d'un TECHNICAL_ADMIN préserve structureId null et le scope global", async () => {
  mockFetch();
  await renderPage("/utilisateurs/nouvelle", createElement(UtilisateurForm));
  await settle();

  await fillCreateForm();
  await setField("user-role", "TECHNICAL_ADMIN");
  await settle();

  assert.ok(!container!.querySelector("[data-testid='user-structure-id']"), "Le sélecteur de structure doit rester masqué");
  assert.ok(!fetchLog.some((entry) => entry.startsWith("GET /api/departments")), "Aucun appel de département pour un rôle global");
  await submitForm();

  const created = createdRoles()[0];
  assert.ok(created, "La création doit être envoyée");
  assert.strictEqual(created.role, "TECHNICAL_ADMIN");
  assert.strictEqual(created.structureId, null);
  assert.strictEqual(created.scope, "*");
});

test("le passage à un rôle global masque la structure sans nouvel appel de département", async () => {
  mockFetch();
  departmentsByStructure["struct1"] = { status: 200, body: [makeDepartment()] };
  await renderPage("/utilisateurs/nouvelle", createElement(UtilisateurForm));
  await settle();

  await setField("user-structure-id", "struct1");
  await settle();
  const departmentCallsBefore = fetchLog.filter((entry) => entry.startsWith("GET /api/departments")).length;
  assert.ok(departmentCallsBefore >= 1);
  assert.ok(container!.querySelector("[data-testid='user-department-value']"));

  await setField("user-role", "SUPER_ADMIN");
  await settle();

  assert.ok(!container!.querySelector("[data-testid='user-structure-id']"), "Les champs de structure doivent être masqués");
  assert.ok(!container!.querySelector("[data-testid='user-department']"), "Aucun ancien département ne doit rester affiché");
  assert.strictEqual(
    fetchLog.filter((entry) => entry.startsWith("GET /api/departments")).length,
    departmentCallsBefore,
    "Aucun nouvel appel de département ne doit être déclenché pour un rôle global"
  );
  await submitForm();
  assert.strictEqual(createdRoles()[0]?.structureId, null);
  assert.strictEqual(createdRoles()[0]?.scope, "*");
});
