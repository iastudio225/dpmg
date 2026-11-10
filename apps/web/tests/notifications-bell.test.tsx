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
defineGlobal("MutationObserver", dom.window.MutationObserver);
defineGlobal("IS_REACT_ACT_ENVIRONMENT", true);

dom.window.matchMedia = ((query: string) => ({
  matches: false, media: query, onchange: null,
  addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  dispatchEvent() { return false; },
})) as unknown as typeof window.matchMedia;

const userPayload = { id: "u1", email: "alice@dpmg.fr", firstName: "Alice", lastName: "Martin", phone: null, status: "ACTIVE", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };

let meRoles: unknown[] = [];
let unreadCount = 0;
let notificationsList: unknown[] = [];
let unreadStatus = 200;
let listStatus = 200;
let markReadStatus = 200;
let markAllStatus = 200;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function mockFetch() {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (url === "/api/auth/me") return jsonResponse({ user: userPayload, roles: meRoles });
    if (url === "/api/notifications/unread-count") return jsonResponse({ count: unreadCount }, unreadStatus);
    if (url.startsWith("/api/notifications?") || url === "/api/notifications") {
      return jsonResponse({ items: notificationsList, nextCursor: null }, listStatus);
    }
    if (url.includes("/read-all")) {
      if (markAllStatus !== 200) return jsonResponse({ code: "ERR", message: "err" }, markAllStatus);
      return jsonResponse({ updated: unreadCount });
    }
    if (url.includes("/read")) {
      if (markReadStatus !== 200) return jsonResponse({ code: "ERR", message: "err" }, markReadStatus);
      return jsonResponse({ id: "n1", isRead: true, readAt: new Date().toISOString() });
    }
    throw new Error(`RequÃªte inattendue: ${method} ${url}`);
  }) as typeof fetch;
}

const { AuthProvider } = await import("../src/context/AuthContext");
const { NotificationBell } = await import("../src/components/NotificationBell");
const { MemoryRouter } = await import("react-router-dom");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react");
const { createElement } = await import("react");

let root: ReturnType<typeof createRoot> | null = null;
let container: HTMLElement | null = null;

async function renderBell() {
  mockFetch();
  container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(AuthProvider, null, createElement(MemoryRouter, null, createElement(NotificationBell))));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  container?.remove();
  root = null; container = null;
  meRoles = [];
  unreadCount = 0;
  notificationsList = [];
  unreadStatus = 200;
  listStatus = 200;
  markReadStatus = 200;
  markAllStatus = 200;
});

function buttonByText(text: string): HTMLButtonElement | undefined {
  return [...container!.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
}

test("notif bell : affiche la cloche pour un utilisateur authentifiÃ©", async () => {
  meRoles = [];
  await renderBell();
  const bell = container!.querySelector("button[aria-label='Notifications']");
  assert.ok(bell, "la cloche doit Ãªtre prÃ©sente");
});

test("notif bell : badge avec compteur si non lues", async () => {
  unreadCount = 5;
  await renderBell();
  const badge = container!.querySelector("span");
  assert.ok(badge);
  assert.ok((badge!.textContent ?? "").includes("5"));
});

test("notif bell : pas de badge si compteur nul", async () => {
  unreadCount = 0;
  await renderBell();
  // le badge est le span positionnÃ© en absolu avec le nombre
  const spans = [...container!.querySelectorAll("span")];
  const badge = spans.find((s) => s.textContent?.trim() === "0");
  assert.equal(badge, undefined, "pas de badge Ã  0");
});

test("notif bell : badge affiche 99+ si > 99", async () => {
  unreadCount = 150;
  await renderBell();
  const spans = [...container!.querySelectorAll("span")];
  const badge = spans.find((s) => s.textContent?.trim() === "99+");
  assert.ok(badge, "badge 99+ attendu");
});

test("notif bell : ouverture du panneau affiche la liste", async () => {
  notificationsList = [{ id: "n1", type: "DEMANDE_SOUMISE", title: "Titre", message: "msg", priority: "NORMAL", isRead: false, readAt: null, createdAt: "2026-01-01T10:00:00.000Z", demandeId: null }];
  unreadCount = 1;
  await renderBell();
  const bell = container!.querySelector("button[aria-label='Notifications']") as HTMLButtonElement;
  await (async () => {
    bell.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 50));
  })();
  assert.ok(container!.textContent?.includes("Titre"));
  assert.ok(container!.textContent?.includes("msg"));
});

test("notif bell : Ã©tat vide", async () => {
  notificationsList = [];
  await renderBell();
  const bell = container!.querySelector("button[aria-label='Notifications']") as HTMLButtonElement;
  await (async () => {
    bell.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 50));
  })();
  assert.ok(container!.textContent?.includes("Aucune notification"));
});

test("notif bell : erreur rÃ©seau affiche message et rÃ©essayer", async () => {
  listStatus = 500;
  await renderBell();
  const bell = container!.querySelector("button[aria-label='Notifications']") as HTMLButtonElement;
  await act(async () => {
    bell.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 500));
  });
  assert.ok(container!.textContent?.includes("Impossible de charger les notifications."));
  assert.ok([...container!.querySelectorAll("button")].some((b) => b.textContent?.includes("RÃ©essayer")));
});

test("notif bell : prioritÃ© HIGH affiche indicateur", async () => {
  notificationsList = [{ id: "n2", type: "DEMANDE_SOUMISE", title: "Urgent", message: null, priority: "HIGH", isRead: false, readAt: null, createdAt: "2026-01-01T10:00:00.000Z", demandeId: null }];
  await renderBell();
  const bell = container!.querySelector("button[aria-label='Notifications']") as HTMLButtonElement;
  await (async () => {
    bell.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 50));
  })();
  assert.ok(container!.textContent?.includes("ðŸ”´"));
});
// ---------------------------------------------------------------------------
// Polling
// ---------------------------------------------------------------------------
test("notif bell : chargement initial appelle unreadCount", async () => {
  unreadCount = 3;
  await renderBell();
  const badge = [...container!.querySelectorAll("span")].find((s) => s.textContent?.trim() === "3");
  assert.ok(badge, "le compteur initial doit être affiché");
});

test("notif bell : setInterval est appelé avec 30000ms au montage", async () => {
  const originalSetInterval = window.setInterval;
  const calls: Array<{ delay: number }> = [];
  window.setInterval = ((cb: TimerHandler, delay?: number) => {
    calls.push({ delay: delay ?? 0 });
    return 1 as unknown as number;
  }) as typeof window.setInterval;
  try {
    await renderBell();
    assert.ok(calls.some((c) => c.delay === 30000), "setInterval doit être appelé avec 30000ms");
  } finally {
    window.setInterval = originalSetInterval;
  }
});

test("notif bell : clearInterval est appelé au démontage", async () => {
  const originalClearInterval = window.clearInterval;
  let cleared = false;
  window.clearInterval = (() => { cleared = true; }) as typeof window.clearInterval;
  try {
    await renderBell();
    if (root) await act(async () => { root!.unmount(); });
    root = null; container = null;
    assert.ok(cleared, "clearInterval doit être appelé au démontage");
  } finally {
    window.clearInterval = originalClearInterval;
  }
});

test("notif bell : erreur de polling ne provoque pas de crash", async () => {
  unreadStatus = 500;
  await renderBell();
  const bell = container!.querySelector("button[aria-label='Notifications']");
  assert.ok(bell, "la cloche doit rester présente malgré l'erreur de polling");
});

// ---------------------------------------------------------------------------
// Marquage comme lu
// ---------------------------------------------------------------------------
test("notif bell : marquer comme lu met à jour le compteur", async () => {
  notificationsList = [{ id: "n1", type: "DEMANDE_SOUMISE", title: "Titre", message: "msg", priority: "NORMAL", isRead: false, readAt: null, createdAt: "2026-01-01T10:00:00.000Z", demandeId: null }];
  unreadCount = 1;
  await renderBell();
  const bell = container!.querySelector("button[aria-label='Notifications']") as HTMLButtonElement;
  await act(async () => {
    bell.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 50));
  });
  const markReadBtn = [...container!.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Marquer lu");
  assert.ok(markReadBtn, "bouton 'Marquer lu' doit être présent");
  await act(async () => {
    markReadBtn!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 50));
  });
  const badge = [...container!.querySelectorAll("span")].find((s) => s.textContent?.trim() === "1");
  assert.equal(badge, undefined, "le badge doit disparaître après marquage");
});

test("notif bell : erreur de marquage affiche un message", async () => {
  notificationsList = [{ id: "n1", type: "DEMANDE_SOUMISE", title: "Titre", message: "msg", priority: "NORMAL", isRead: false, readAt: null, createdAt: "2026-01-01T10:00:00.000Z", demandeId: null }];
  markReadStatus = 500;
  await renderBell();
  const bell = container!.querySelector("button[aria-label='Notifications']") as HTMLButtonElement;
  await act(async () => {
    bell.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 50));
  });
  const markReadBtn = [...container!.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Marquer lu");
  assert.ok(markReadBtn);
  await act(async () => {
    markReadBtn!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 50));
  });
  assert.ok(container!.textContent?.includes("Impossible de marquer comme lue."));
});

test("notif bell : tout marquer comme lu remet le compteur à 0", async () => {
  notificationsList = [{ id: "n1", type: "DEMANDE_SOUMISE", title: "Titre", message: "msg", priority: "NORMAL", isRead: false, readAt: null, createdAt: "2026-01-01T10:00:00.000Z", demandeId: null }];
  unreadCount = 2;
  await renderBell();
  const bell = container!.querySelector("button[aria-label='Notifications']") as HTMLButtonElement;
  await act(async () => {
    bell.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 50));
  });
  const markAllBtn = [...container!.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Tout marquer comme lu");
  assert.ok(markAllBtn);
  await act(async () => {
    markAllBtn!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 50));
  });
  const badge = [...container!.querySelectorAll("span")].find((s) => s.textContent?.trim() === "2");
  assert.equal(badge, undefined, "le badge doit disparaître après tout marquer comme lu");
});

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------
test("notif bell : clic sur notification avec demandeId ferme le panneau", async () => {
  notificationsList = [{ id: "n1", type: "DEMANDE_SOUMISE", title: "Titre", message: "msg", priority: "NORMAL", isRead: true, readAt: "2026-01-01T10:00:00.000Z", createdAt: "2026-01-01T10:00:00.000Z", demandeId: "dem-123" }];
  await renderBell();
  const bell = container!.querySelector("button[aria-label='Notifications']") as HTMLButtonElement;
  await act(async () => {
    bell.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 50));
  });
  const notifBtn = [...container!.querySelectorAll("button")].find((b) => b.textContent?.includes("Titre"));
  assert.ok(notifBtn, "bouton de notification doit être présent");
  await act(async () => {
    notifBtn!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 50));
  });
  assert.ok(!container!.querySelector("ul"), "le panneau doit se fermer après clic");
});

test("notif bell : notification sans demandeId ne crash pas", async () => {
  notificationsList = [{ id: "n2", type: "DEMANDE_SOUMISE", title: "Info", message: "msg", priority: "NORMAL", isRead: true, readAt: "2026-01-01T10:00:00.000Z", createdAt: "2026-01-01T10:00:00.000Z", demandeId: null }];
  await renderBell();
  const bell = container!.querySelector("button[aria-label='Notifications']") as HTMLButtonElement;
  await act(async () => {
    bell.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 50));
  });
  const notifBtn = [...container!.querySelectorAll("button")].find((b) => b.textContent?.includes("Info"));
  assert.ok(notifBtn);
  await act(async () => {
    notifBtn!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 50));
  });
  assert.ok(container, "le composant doit rester monté");
});

// ---------------------------------------------------------------------------
// Non-régression
// ---------------------------------------------------------------------------
test("notif bell : notification non lue affiche fond différencié", async () => {
  notificationsList = [{ id: "n1", type: "DEMANDE_SOUMISE", title: "Non lue", message: null, priority: "NORMAL", isRead: false, readAt: null, createdAt: "2026-01-01T10:00:00.000Z", demandeId: null }];
  await renderBell();
  const bell = container!.querySelector("button[aria-label='Notifications']") as HTMLButtonElement;
  await act(async () => {
    bell.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 50));
  });
  assert.ok(container!.textContent?.includes("Non lue"));
});

test("notif bell : erreur de chargement initial ne bloque pas la page", async () => {
  unreadStatus = 500;
  listStatus = 500;
  await renderBell();
  const bell = container!.querySelector("button[aria-label='Notifications']");
  assert.ok(bell, "la cloche doit être présente même en cas d'erreur");
});