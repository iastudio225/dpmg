import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:5173/" });

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
  matches: false, media: query, onchange: null,
  addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  dispatchEvent() { return false; },
})) as unknown as typeof window.matchMedia;

const userDept = { id: "u2", email: "dept@dpmg.fr", firstName: "Marie", lastName: "Dept", phone: null, status: "ACTIVE", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
const userDpmg = { id: "u3", email: "dpmg@dpmg.fr", firstName: "Diane", lastName: "Dpmg", phone: null, status: "ACTIVE", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
const userEmployee = { id: "u4", email: "emp@dpmg.fr", firstName: "Eve", lastName: "Emp", phone: null, status: "ACTIVE", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };

const roleDept = { role: "DEPARTMENT_MANAGER", structureId: "st1", structureName: "S", structureCode: "STA", structureType: "OTHER", scope: "INFRA", startDate: "2026-01-01T00:00:00.000Z", endDate: null, delegationNote: null };
const roleExec = { role: "EXECUTION_AGENT", structureId: "st1", structureName: "S", structureCode: "STA", structureType: "OTHER", scope: "INFRA", startDate: "2026-01-01T00:00:00.000Z", endDate: null, delegationNote: null };
const roleDpmg = { role: "DPMG_MANAGER", structureId: "st1", structureName: "S", structureCode: "STA", structureType: "OTHER", scope: "INFRA", startDate: "2026-01-01T00:00:00.000Z", endDate: null, delegationNote: null };
const roleEmployee = { role: "EMPLOYEE", structureId: "st1", structureName: "S", structureCode: "STA", structureType: "OTHER", scope: "INFRA", startDate: "2026-01-01T00:00:00.000Z", endDate: null, delegationNote: null };
const roleCpmp = { role: "CPMP_USER", structureId: "st1", structureName: "S", structureCode: "STA", structureType: "OTHER", scope: "INFRA", startDate: "2026-01-01T00:00:00.000Z", endDate: null, delegationNote: null };

const demandeBase = { id: "d10", reference: "DEM-2026-EX01", title: "Demande exécution", description: "desc", category: "INFRASTRUCTURE", departmentId: "dep1", departmentCode: "INFRA", departmentName: "Département INFRA", authorId: "u1", authorFirstName: "Alice", authorLastName: "Martin", createdAt: "2026-10-01T10:00:00.000Z", updatedAt: "2026-10-02T08:00:00.000Z", submittedAt: "2026-10-02T08:00:00.000Z" };

const demandeExecution = { ...demandeBase, status: "EN_ATTENTE_EXECUTION" };
const demandeExecutionStarted = { ...demandeExecution, executionStartedAt: "2026-10-02T09:00:00.000Z" };
const demandeConfirmation = { ...demandeBase, status: "EN_ATTENTE_CONFIRMATION_SATISFACTION", satisfactionProofUrl: "https://example.com/proof.pdf" };
const demandeCloturee = { ...demandeBase, status: "CLOTUREE" };

let meUser: any = userDept;
let meRoles: any[] = [roleDept];

interface Route { method: string; url: string | RegExp; status: number; body: unknown; }
interface FetchBody { method: string; url: string; body: unknown; }
let routes: Route[] = [];
const fetchLog: string[] = [];
const fetchBodies: FetchBody[] = [];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function mockFetch() {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    fetchLog.push(`${method} ${url}`);
    if (url === "/api/auth/me") return jsonResponse({ user: meUser, roles: meRoles });
    if (typeof init?.body === "string") fetchBodies.push({ method, url, body: JSON.parse(init.body) });
    else fetchBodies.push({ method, url, body: undefined });
    const route = routes.find((r) => r.method === method && (typeof r.url === "string" ? r.url === url : r.url.test(url)));
    if (!route) throw new Error(`Requête inattendue: ${method} ${url}`);
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
    root!.render(createElement(AuthProvider, null, createElement(MemoryRouter, { initialEntries: [initialPath] }, createElement(Routes, null, createElement(Route, { path: "/demandes/:id", element: createElement(DemandeDetailPage) })))));
  });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  container?.remove();
  root = null; container = null;
  routes = []; fetchLog.length = 0; fetchBodies.length = 0;
  meUser = userDept; meRoles = [roleDept];
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
function selectFile(element: HTMLInputElement, file: File) {
  Object.defineProperty(element, "files", { value: [file], configurable: true });
  return act(async () => {
    element.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

// ---------------------------------------------------------------------------
// Visibilité des actions selon le rôle et le statut
// ---------------------------------------------------------------------------
test("exec UI : un rôle départemental voit 'Prendre en charge' et 'Déclarer l'exécution terminée' sur EN_ATTENTE_EXECUTION", async () => {
  meUser = userDept; meRoles = [roleDept];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeExecution }];
  await renderPage("/demandes/d10");
  assert.ok(buttonByText("Prendre en charge"));
  assert.ok(buttonByText("Déclarer l'exécution terminée"));
});

test("exec UI : un agent d'exécution voit les actions sur EN_ATTENTE_EXECUTION", async () => {
  meUser = userDept; meRoles = [roleExec];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeExecution }];
  await renderPage("/demandes/d10");
  assert.ok(buttonByText("Prendre en charge"));
  assert.ok(buttonByText("Déclarer l'exécution terminée"));
});

test("exec UI : un utilisateur non autorisé ne voit pas les actions d'exécution", async () => {
  meUser = userEmployee; meRoles = [roleEmployee];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeExecution }];
  await renderPage("/demandes/d10");
  assert.equal(buttonByText("Prendre en charge"), undefined);
  assert.equal(buttonByText("Déclarer l'exécution terminée"), undefined);
});

test("exec UI : les actions disparaissent hors statut EN_ATTENTE_EXECUTION", async () => {
  meUser = userDept; meRoles = [roleDept];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: { ...demandeExecution, status: "EN_ATTENTE_FINANCEMENT" } }];
  await renderPage("/demandes/d10");
  assert.equal(buttonByText("Prendre en charge"), undefined);
  assert.equal(buttonByText("Déclarer l'exécution terminée"), undefined);
});

// ---------------------------------------------------------------------------
// DPMG : clôture et retour
// ---------------------------------------------------------------------------
test("exec UI : DPMG voit 'Clôturer la demande' et 'Retourner au département' sur EN_ATTENTE_CONFIRMATION_SATISFACTION", async () => {
  meUser = userDpmg; meRoles = [roleDpmg];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeConfirmation }];
  await renderPage("/demandes/d10");
  assert.ok(buttonByText("Clôturer la demande"));
  assert.ok(buttonByText("Retourner au département"));
});

test("exec UI : un non-DPMG ne voit pas les actions de clôture", async () => {
  meUser = userDept; meRoles = [roleDept];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeConfirmation }];
  await renderPage("/demandes/d10");
  assert.equal(buttonByText("Clôturer la demande"), undefined);
  assert.equal(buttonByText("Retourner au département"), undefined);
});

test("exec UI : les actions DPMG disparaissent hors statut EN_ATTENTE_CONFIRMATION_SATISFACTION", async () => {
  meUser = userDpmg; meRoles = [roleDpmg];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeExecution }];
  await renderPage("/demandes/d10");
  assert.equal(buttonByText("Clôturer la demande"), undefined);
  assert.equal(buttonByText("Retourner au département"), undefined);
});

// ---------------------------------------------------------------------------
// Déclaration de satisfaction : justificatif obligatoire
// ---------------------------------------------------------------------------
test("exec UI : la déclaration exige une URL de justificatif non vide", async () => {
  meUser = userDept; meRoles = [roleDept];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeExecutionStarted }];
  await renderPage("/demandes/d10");
  await click(buttonByText("Déclarer l'exécution terminée")!);
  await click(buttonByText("Déclarer l'exécution terminée")!);
  assert.ok(container!.querySelector("[role='alert']"));
  assert.ok((container!.querySelector("[role='alert']")!.textContent ?? "").includes("Le justificatif est requis"));
  assert.equal(fetchBodies.filter((b) => b.url === "/api/demandes/d10/satisfaction").length, 0);
});

test("exec UI : URL invalide affiche une erreur", async () => {
  meUser = userDept; meRoles = [roleDept];
  routes = [
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeExecutionStarted },
  ];
  await renderPage("/demandes/d10");
  await click(buttonByText("Déclarer l'exécution terminée")!);
  await typeInto(inputByLabel("URL du justificatif (obligatoire)")! as HTMLInputElement, "pas-une-url");
  await click(buttonByText("Déclarer l'exécution terminée")!);
  assert.ok(container!.querySelector("[role='alert']"));
  assert.ok((container!.querySelector("[role='alert']")!.textContent ?? "").includes("URL de justificatif invalide"));
});

test("exec UI : erreur 400 du backend sur l'URL remonte dans le formulaire", async () => {
  meUser = userDept; meRoles = [roleDept];
  routes = [
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeExecutionStarted },
    { method: "POST", url: "/api/demandes/d10/satisfaction", status: 400, body: { code: "VALIDATION_ERROR", message: "Données de satisfaction invalides", details: { proofUrl: ["URL de justificatif invalide"] } } },
  ];
  await renderPage("/demandes/d10");
  await click(buttonByText("Déclarer l'exécution terminée")!);
  await typeInto(inputByLabel("URL du justificatif (obligatoire)")! as HTMLInputElement, "https://example.com/proof.pdf");
  await click(buttonByText("Déclarer l'exécution terminée")!);
  assert.ok((container!.textContent ?? "").includes("URL de justificatif invalide"));
});

test("exec UI : déclaration avec URL valide appelle le backend et met à jour le statut", async () => {
  meUser = userDept; meRoles = [roleDept];
  routes = [
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeExecutionStarted },
    { method: "POST", url: "/api/demandes/d10/satisfaction", status: 200, body: { ...demandeExecution, status: "EN_ATTENTE_CONFIRMATION_SATISFACTION" } },
  ];
  await renderPage("/demandes/d10");
  await click(buttonByText("Déclarer l'exécution terminée")!);
  await typeInto(inputByLabel("URL du justificatif (obligatoire)")! as HTMLInputElement, "https://example.com/proof.pdf");
  await typeInto(inputByLabel("Observations (optionnel)")! as HTMLTextAreaElement, "Travaux réalisés");
  await click(buttonByText("Déclarer l'exécution terminée")!);
  const calls = fetchBodies.filter((b) => b.url === "/api/demandes/d10/satisfaction");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]!.body, { proofUrl: "https://example.com/proof.pdf", observations: "Travaux réalisés" });
  assert.ok((container!.textContent ?? "").includes("En attente de confirmation de satisfaction"));
});

test("exec UI : déclaration avec fichier téléverse vers l'endpoint dédié", async () => {
  meUser = userDept; meRoles = [roleDept];
  routes = [
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeExecutionStarted },
    { method: "POST", url: "/api/demandes/d10/satisfaction/file", status: 201, body: { ...demandeExecution, status: "EN_ATTENTE_CONFIRMATION_SATISFACTION", satisfactionProofUrl: "/api/demandes/d10/justificatif" } },
  ];
  await renderPage("/demandes/d10");
  await click(buttonByText("Déclarer l'exécution terminée")!);
  const fileRadio = container!.querySelector('input[name="satisfaction-mode"][value="file"]')!;
  await click(fileRadio);
  const fileInput = container!.querySelector("#proof-file") as HTMLInputElement;
  const file = new dom.window.File(["contenu"], "rapport.pdf", { type: "application/pdf" });
  await selectFile(fileInput, file);
  await click(buttonByText("Déclarer l'exécution terminée")!);
  const calls = fetchBodies.filter((b) => b.url === "/api/demandes/d10/satisfaction/file");
  assert.equal(calls.length, 1);
  assert.ok((container!.textContent ?? "").includes("En attente de confirmation de satisfaction"));
});

// ---------------------------------------------------------------------------
// Retour DPMG exige un motif
// ---------------------------------------------------------------------------
test("exec UI : le retour au département exige un motif non vide", async () => {
  meUser = userDpmg; meRoles = [roleDpmg];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeConfirmation }];
  await renderPage("/demandes/d10");
  await click(buttonByText("Retourner au département")!);
  await click(buttonByText("Confirmer le retour")!);
  assert.ok(container!.querySelector("[role='alert']"));
  assert.ok((container!.querySelector("[role='alert']")!.textContent ?? "").includes("Le motif du retour est requis"));
  assert.equal(fetchBodies.filter((b) => b.url === "/api/demandes/d10/execution/return").length, 0);
});

test("exec UI : le retour appelle le backend avec le motif", async () => {
  meUser = userDpmg; meRoles = [roleDpmg];
  routes = [
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeConfirmation },
    { method: "POST", url: "/api/demandes/d10/execution/return", status: 200, body: { ...demandeConfirmation, status: "EN_ATTENTE_EXECUTION" } },
  ];
  await renderPage("/demandes/d10");
  await click(buttonByText("Retourner au département")!);
  await typeInto(inputByLabel("Motif du retour (obligatoire)")! as HTMLTextAreaElement, "motif de retour");
  await click(buttonByText("Confirmer le retour")!);
  const calls = fetchBodies.filter((b) => b.url === "/api/demandes/d10/execution/return");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]!.body, { motif: "motif de retour" });
});

// ---------------------------------------------------------------------------
// Clôture
// ---------------------------------------------------------------------------
test("exec UI : la clôture appelle le backend et met à jour le statut", async () => {
  meUser = userDpmg; meRoles = [roleDpmg];
  routes = [
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeConfirmation },
    { method: "POST", url: "/api/demandes/d10/close", status: 200, body: { ...demandeConfirmation, status: "CLOTUREE" } },
  ];
  await renderPage("/demandes/d10");
  await click(buttonByText("Clôturer la demande")!);
  const calls = fetchBodies.filter((b) => b.url === "/api/demandes/d10/close");
  assert.equal(calls.length, 1);
  assert.ok((container!.textContent ?? "").includes("Clôturée"));
});

test("exec UI : erreur API affichée sans fausse confirmation (clôture)", async () => {
  meUser = userDpmg; meRoles = [roleDpmg];
  routes = [
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeConfirmation },
    { method: "POST", url: "/api/demandes/d10/close", status: 403, body: { code: "FORBIDDEN", message: "Non autorisé" } },
  ];
  await renderPage("/demandes/d10");
  await click(buttonByText("Clôturer la demande")!);
  assert.ok(container!.querySelector("[role='alert']"));
  assert.ok((container!.textContent ?? "").includes("En attente de confirmation de satisfaction"));
});

// ---------------------------------------------------------------------------
// Prise en charge
// ---------------------------------------------------------------------------
test("exec UI : la prise en charge appelle le backend", async () => {
  meUser = userDept; meRoles = [roleDept];
  routes = [
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeExecution },
    { method: "POST", url: "/api/demandes/d10/execution/start", status: 200, body: demandeExecution },
  ];
  await renderPage("/demandes/d10");
  await click(buttonByText("Prendre en charge")!);
  const calls = fetchBodies.filter((b) => b.url === "/api/demandes/d10/execution/start");
  assert.equal(calls.length, 1);
});

// ---------------------------------------------------------------------------
// Justificatif de satisfaction
// ---------------------------------------------------------------------------
test("exec UI : le justificatif est affiché comme lien lorsque renseigné", async () => {
  meUser = userDept; meRoles = [roleDept];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeConfirmation }];
  await renderPage("/demandes/d10");
  const link = container!.querySelector('a[href="https://example.com/proof.pdf"]');
  assert.ok(link, "un lien vers le justificatif doit être présent");
  assert.equal(link!.getAttribute("target"), "_blank");
  assert.equal(link!.getAttribute("rel"), "noopener noreferrer");
  assert.ok((container!.textContent ?? "").includes("Justificatif de satisfaction"));
});

test("exec UI : état neutre affiché lorsque le justificatif est absent", async () => {
  meUser = userDept; meRoles = [roleDept];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeExecution }];
  await renderPage("/demandes/d10");
  assert.ok((container!.textContent ?? "").includes("Aucun justificatif renseigné"));
  assert.equal(container!.querySelector('a[href="https://example.com/proof.pdf"]'), null);
});

test("exec UI : le justificatif reste visible après clôture", async () => {
  meUser = userDpmg; meRoles = [roleDpmg];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: { ...demandeConfirmation, status: "CLOTUREE" } }];
  await renderPage("/demandes/d10");
  const link = container!.querySelector('a[href="https://example.com/proof.pdf"]');
  assert.ok(link, "le justificatif doit rester visible après clôture");
});

// ---------------------------------------------------------------------------
test("exec UI : un justificatif stocké affiche un libellé de téléchargement", async () => {
  meUser = userDpmg; meRoles = [roleDpmg];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: { ...demandeConfirmation, satisfactionProofUrl: "/api/demandes/d10/justificatif" } }];
  await renderPage("/demandes/d10");
  const link = container!.querySelector('a[href="/api/demandes/d10/justificatif"]');
  assert.ok(link, "un lien de téléchargement doit être présent");
  assert.ok((link!.textContent ?? "").includes("Télécharger le justificatif"));
});

test("exec UI : les actions DPMG restent présentes sur EN_ATTENTE_CONFIRMATION_SATISFACTION", async () => {
  meUser = userDpmg; meRoles = [roleDpmg];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: demandeConfirmation }];
  await renderPage("/demandes/d10");
  assert.ok(buttonByText("Clôturer la demande"));
  assert.ok(buttonByText("Retourner au département"));
});
test("exec UI : le justificatif reste visible après retour à EN_ATTENTE_EXECUTION", async () => {
  meUser = userDept; meRoles = [roleDept];
  routes = [{ method: "GET", url: "/api/demandes/d10", status: 200, body: { ...demandeConfirmation, status: "EN_ATTENTE_EXECUTION" } }];
  await renderPage("/demandes/d10");
  const link = container!.querySelector('a[href="https://example.com/proof.pdf"]');
  assert.ok(link, "le justificatif doit rester visible après un retour");
});

// ---------------------------------------------------------------------------
// Observations DG / CPMP : formulaire intégré (plus de window.prompt)
// ---------------------------------------------------------------------------
test("exec UI : l'observation DG/CPMP exige un commentaire", async () => {
  meUser = userDpmg; meRoles = [roleCpmp];
  routes = [
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeExecution },
    { method: "GET", url: "/api/demandes/d10/observations", status: 200, body: [] },
  ];
  await renderPage("/demandes/d10");

  await click(buttonByText("Ajouter une observation (DG/CPMP)")!);
  await click(buttonByText("Ajouter l'observation")!);

  const alert = container!.querySelector("[role='alert']");
  assert.ok(alert, "un message d'erreur doit être affiché");
  assert.ok((alert!.textContent ?? "").includes("L'observation est requise"));
  assert.equal(fetchBodies.filter((b) => b.method === "POST").length, 0, "aucun appel API ne doit être effectué");
});

test("exec UI : l'observation DG/CPMP est envoyée puis affichée", async () => {
  meUser = userDpmg; meRoles = [roleCpmp];
  routes = [
    { method: "GET", url: "/api/demandes/d10", status: 200, body: demandeExecution },
    { method: "GET", url: "/api/demandes/d10/observations", status: 200, body: [] },
    {
      method: "POST",
      url: "/api/demandes/d10/observations",
      status: 201,
      body: {
        id: "o1",
        demandeId: "d10",
        authorId: "u3",
        type: "OBSERVATION_CPMP",
        commentaire: "Préciser le besoin",
        createdAt: "2026-10-03T10:00:00.000Z",
      },
    },
  ];
  await renderPage("/demandes/d10");

  await click(buttonByText("Ajouter une observation (DG/CPMP)")!);
  await typeInto(inputByLabel("Observation (obligatoire)")! as HTMLTextAreaElement, "Préciser le besoin");
  await click(buttonByText("Ajouter l'observation")!);

  const calls = fetchBodies.filter((b) => b.method === "POST" && b.url === "/api/demandes/d10/observations");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]!.body, { commentaire: "Préciser le besoin" });
  assert.ok((container!.textContent ?? "").includes("Préciser le besoin"));
  assert.equal(container!.querySelector("[role='dialog']"), null, "le dialogue doit être refermé");
});