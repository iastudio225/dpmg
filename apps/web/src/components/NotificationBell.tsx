import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { notificationsApi } from "../services/api";
import type { NotificationResponse } from "@dpmg/shared";

export function NotificationBell() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const refreshCount = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await notificationsApi.unreadCount();
      setUnread(res.count);
    } catch {
      // silencieux pour le compteur
    }
  }, [isAuthenticated]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await notificationsApi.list({ limit: 20 });
      setItems(res.items);
    } catch {
      setError("Impossible de charger les notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    refreshCount();
    const id = window.setInterval(() => {
      refreshCount();
    }, 30000);
    return () => window.clearInterval(id);
  }, [isAuthenticated, refreshCount]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      loadList();
      refreshCount();
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await notificationsApi.markRead(id);
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n)));
      setUnread((c) => Math.max(0, c - 1));
    } catch {
      setError("Impossible de marquer comme lue.");
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllRead();
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() })));
      setUnread(0);
    } catch {
      setError("Impossible de tout marquer comme lu.");
    }
  };

  if (!isAuthenticated) return null;

  const bellStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "40px",
    height: "40px",
    flexShrink: 0,
    background: "transparent",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    color: "var(--color-text-muted)",
    cursor: "pointer",
    position: "relative",
  };

  return (
    <div style={{ position: "relative" }} ref={panelRef}>
      <button type="button" onClick={handleToggle} aria-label="Notifications" aria-expanded={open} style={bellStyle}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span
            style={{
              position: "absolute",
              top: "-4px",
              right: "-4px",
              background: "var(--color-error)",
              color: "#fff",
              fontSize: "0.625rem",
              fontWeight: 700,
              borderRadius: "999px",
              padding: "1px 5px",
              minWidth: "16px",
              textAlign: "center",
            }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "48px",
            right: 0,
            width: "320px",
            maxHeight: "420px",
            overflowY: "auto",
            background: "var(--color-background)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-lg)",
            zIndex: 1001,
            padding: "0.5rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem", borderBottom: "1px solid var(--color-border)", marginBottom: "0.5rem" }}>
            <strong>Notifications</strong>
            <button type="button" onClick={handleMarkAllRead} style={{ background: "transparent", border: "none", color: "var(--color-primary)", cursor: "pointer", fontSize: "0.75rem" }}>
              Tout marquer comme lu
            </button>
          </div>
          {error && (
            <div style={{ color: "var(--color-error)", fontSize: "0.8125rem", padding: "0.5rem" }}>
              {error}{" "}
              <button type="button" onClick={loadList} style={{ background: "transparent", border: "none", color: "var(--color-primary)", cursor: "pointer" }}>
                Réessayer
              </button>
            </div>
          )}
          {loading ? (
            <div style={{ padding: "1rem", textAlign: "center", color: "var(--color-text-muted)" }}>Chargement…</div>
          ) : items.length === 0 ? (
            <div style={{ padding: "1rem", textAlign: "center", color: "var(--color-text-muted)" }}>Aucune notification.</div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {items.map((n) => (
                <li
                  key={n.id}
                  style={{
                    padding: "0.5rem",
                    borderBottom: "1px solid var(--color-border)",
                    background: n.isRead ? "transparent" : "var(--color-primary-light)",
                    fontWeight: n.isRead ? 400 : 600,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!n.isRead) {
                          try {
                            await notificationsApi.markRead(n.id);
                            setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true, readAt: new Date().toISOString() } : x)));
                            setUnread((c) => Math.max(0, c - 1));
                          } catch {
                            // ignore
                          }
                        }
                        setOpen(false);
                        if (n.demandeId) {
                          navigate(`/demandes/${n.demandeId}`);
                        }
                      }}
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        textAlign: "left",
                        cursor: n.demandeId ? "pointer" : "default",
                        flex: 1,
                      }}
                    >
                      <span style={{ fontSize: "0.875rem", color: "var(--color-text)" }}>
                        {n.priority === "HIGH" ? "🔴 " : ""}{n.title}
                      </span>
                      {n.message && (
                        <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.25rem" }}>{n.message}</div>
                      )}
                      <div style={{ fontSize: "0.625rem", color: "var(--color-text-muted)", marginTop: "0.25rem" }}>
                        {new Date(n.createdAt).toLocaleString("fr-FR")}
                      </div>
                    </button>
                    {!n.isRead && (
                      <button
                        type="button"
                        onClick={() => handleMarkRead(n.id)}
                        style={{ background: "transparent", border: "none", color: "var(--color-primary)", cursor: "pointer", fontSize: "0.75rem", alignSelf: "flex-start" }}
                      >
                        Marquer lu
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}