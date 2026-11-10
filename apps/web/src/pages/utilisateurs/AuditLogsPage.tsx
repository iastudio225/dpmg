import { useCallback, useEffect, useState } from "react";
import { usersApi, ApiError } from "../../services/api";
import type { AuditLogResponse } from "@dpmg/shared";

function css<T extends React.CSSProperties>(styles: T): T {
  return styles;
}

export function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");

  const loadLogs = useCallback(async (action?: string, actor?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await usersApi.auditLogs({
        action: action || undefined,
        actorId: actor || undefined,
        page: 1,
        limit: 50,
      });
      setLogs(response);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Chargement du journal impossible");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLogs(actionFilter || undefined, actorFilter || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionFilter, actorFilter]);

  const styles = {
    container: css({ display: "flex", flexDirection: "column", gap: "1.5rem" }),
    header: css({ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }),
    title: css({ fontSize: "1.5rem", fontWeight: 600, color: "var(--color-text)", margin: 0 }),
    subtitle: css({ color: "var(--color-text-muted)", fontSize: "0.875rem", margin: 0 }),
    actions: css({ display: "flex", gap: "0.5rem" }),
    buttonSecondary: css({
      padding: "0.625rem 1rem",
      background: "var(--color-background)",
      color: "var(--color-text)",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-md)",
      fontSize: "0.875rem",
      fontWeight: 500,
      cursor: "pointer",
    }),
    buttonPrimary: css({
      padding: "0.625rem 1rem",
      background: "var(--color-primary)",
      color: "#fff",
      border: "none",
      borderRadius: "var(--radius-md)",
      fontSize: "0.875rem",
      fontWeight: 500,
      cursor: "pointer",
    }),
    filters: css({ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }),
    field: css({ display: "flex", flexDirection: "column", gap: "0.25rem" }),
    label: css({ fontSize: "0.75rem", fontWeight: 500, color: "var(--color-text)" }),
    input: css({
      padding: "0.5rem 0.75rem",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-md)",
      fontSize: "0.875rem",
      background: "var(--color-background)",
      color: "var(--color-text)",
    }),
    card: css({ background: "var(--color-background)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }),
    table: css({ width: "100%", borderCollapse: "collapse" }),
    tableHeader: css({ textAlign: "left", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)", padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border)", background: "var(--color-secondary)" }),
    tableCell: css({ padding: "0.75rem 1rem", fontSize: "0.875rem", borderBottom: "1px solid var(--color-border)", color: "var(--color-text)" }),
    badge: css({ display: "inline-block", padding: "0.125rem 0.5rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 500, background: "var(--color-primary-light)", color: "var(--color-primary)" }),
    alert: css({ padding: "0.875rem 1rem", background: "var(--color-error-light)", border: "1px solid rgba(235, 87, 87, 0.35)", borderRadius: "var(--radius-md)", color: "var(--color-error)", fontSize: "0.875rem" }),
    empty: css({ padding: "3rem 1rem", textAlign: "center", color: "var(--color-text-muted)", fontSize: "0.9375rem" }),
    loading: css({ padding: "3rem 1rem", textAlign: "center", color: "var(--color-text-muted)", fontSize: "0.9375rem" }),
  };

  return (
    <div style={styles.container} data-testid="audit-logs-page">
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Journal d'audit</h2>
          <p style={styles.subtitle}>Événements d'administration persistés</p>
        </div>
        <div style={styles.actions}>
          <button style={styles.buttonSecondary} onClick={() => void loadLogs()} data-testid="btn-refresh-audit">
            Rafraîchir
          </button>
        </div>
      </div>

      {error && (
        <div style={styles.alert} role="alert">
          {error}
        </div>
      )}

      <div style={styles.filters}>
        <div style={styles.field}>
          <label htmlFor="audit-action" style={styles.label}>
            Action
          </label>
          <input id="audit-action" style={styles.input} value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} placeholder="CREATE_USER" data-testid="audit-action" />
        </div>
        <div style={styles.field}>
          <label htmlFor="audit-actor" style={styles.label}>
            Acteur
          </label>
          <input id="audit-actor" style={styles.input} value={actorFilter} onChange={(e) => setActorFilter(e.target.value)} placeholder="Identifiant utilisateur" data-testid="audit-actor" />
        </div>
      </div>

      {isLoading ? (
        <div style={styles.card}>
          <div style={styles.loading} data-testid="audit-loading">
            Chargement du journal...
          </div>
        </div>
      ) : logs.length === 0 ? (
        <div style={styles.card}>
          <div style={styles.empty} data-testid="audit-empty">
            Aucun événement d'audit trouvé
          </div>
        </div>
      ) : (
        <div style={styles.card}>
          <table style={styles.table} data-testid="audit-list">
            <thead>
              <tr>
                <th style={styles.tableHeader}>Date</th>
                <th style={styles.tableHeader}>Acteur</th>
                <th style={styles.tableHeader}>Action</th>
                <th style={styles.tableHeader}>Cible</th>
                <th style={styles.tableHeader}>Détails</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td style={styles.tableCell}>{new Date(log.createdAt).toLocaleString("fr-FR")}</td>
                  <td style={styles.tableCell} data-testid={`audit-actor-${log.id}`}>
                    {log.actorId}
                  </td>
                  <td style={styles.tableCell} data-testid={`audit-action-${log.id}`}>
                    {log.action}
                  </td>
                  <td style={styles.tableCell}>
                    {log.targetType} {log.targetId}
                  </td>
                  <td style={styles.tableCell}>{JSON.stringify(log.details)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
