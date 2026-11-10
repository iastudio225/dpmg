import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { structuresApi, ApiError } from "../../services/api";
import type { StructureResponse, StructureType } from "@dpmg/shared";

export const STRUCTURE_TYPE_LABELS: Record<StructureType, string> = {
  DIRECTION: "Direction",
  REGIONAL_DIRECTION: "Direction Régionale",
  AGENCY: "Agence",
  POINT_OF_SALE: "Point de vente",
  OTHER: "Autre",
};

function css<T extends React.CSSProperties>(styles: T): T {
  return styles;
}

export function StructuresPage() {
  const navigate = useNavigate();
  const { roles: currentRoles } = useAuth();
  const [structures, setStructures] = useState<StructureResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [isTogglingId, setIsTogglingId] = useState<string | null>(null);

  // Affichage uniquement : le backend reste autoritaire sur les permissions.
  const canWrite = currentRoles.some((r) => r.role === "TECHNICAL_ADMIN" || r.role === "SUPER_ADMIN");

  const loadStructures = useCallback(
    async (searchTerm?: string, type?: string, status?: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await structuresApi.list({
          search: searchTerm,
          type: type ? (type as StructureType) : undefined,
          status: status === "" ? undefined : status === "true",
        });
        setStructures(response);
      } catch (err) {
        if (err instanceof ApiError) setError(err.message);
        else setError("Impossible de charger les structures");
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadStructures(search || undefined, typeFilter, statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, typeFilter, statusFilter]);

  const handleToggleStatus = async (structure: StructureResponse) => {
    setIsTogglingId(structure.id);
    setError(null);
    try {
      const updated = await structuresApi.changeStatus(structure.id, !structure.status);
      setStructures((current) => current.map((s) => (s.id === structure.id ? updated : s)));
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Modification du statut impossible");
    } finally {
      setIsTogglingId(null);
    }
  };

  const styles = {
    container: css({ display: "flex", flexDirection: "column", gap: "1.5rem" }),
    header: css({ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }),
    title: css({ fontSize: "1.5rem", fontWeight: 600, color: "var(--color-text)", margin: 0 }),
    subtitle: css({ color: "var(--color-text-muted)", fontSize: "0.875rem", margin: 0 }),
    actions: css({ display: "flex", gap: "0.5rem" }),
    buttonPrimary: css({
      display: "inline-flex",
      alignItems: "center",
      gap: "0.5rem",
      padding: "0.625rem 1rem",
      background: "var(--color-primary)",
      color: "#fff",
      border: "none",
      borderRadius: "var(--radius-md)",
      fontSize: "0.875rem",
      fontWeight: 500,
      cursor: "pointer",
      textDecoration: "none",
    }),
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
    select: css({
      padding: "0.5rem 0.75rem",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-md)",
      fontSize: "0.875rem",
      background: "var(--color-background)",
      color: "var(--color-text)",
    }),
    card: css({
      background: "var(--color-background)",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-lg)",
      overflow: "hidden",
    }),
    table: css({ width: "100%", borderCollapse: "collapse" }),
    tableHeader: css({
      textAlign: "left",
      fontSize: "0.75rem",
      textTransform: "uppercase",
      letterSpacing: "0.04em",
      color: "var(--color-text-muted)",
      padding: "0.75rem 1rem",
      borderBottom: "1px solid var(--color-border)",
      background: "var(--color-secondary)",
    }),
    tableCell: css({
      padding: "0.75rem 1rem",
      fontSize: "0.875rem",
      borderBottom: "1px solid var(--color-border)",
      color: "var(--color-text)",
    }),
    badge: css({
      display: "inline-block",
      padding: "0.125rem 0.5rem",
      borderRadius: "999px",
      fontSize: "0.75rem",
      fontWeight: 500,
    }),
    badgeActive: css({ background: "rgba(46, 204, 113, 0.15)", color: "#1e8449" }),
    badgeInactive: css({ background: "rgba(231, 76, 60, 0.15)", color: "#c0392b" }),
    badgeNeutral: css({ background: "rgba(52, 73, 94, 0.12)", color: "#34495e" }),
    alert: css({
      padding: "0.875rem 1rem",
      background: "var(--color-error-light)",
      border: "1px solid rgba(235, 87, 87, 0.35)",
      borderRadius: "var(--radius-md)",
      color: "var(--color-error)",
      fontSize: "0.875rem",
    }),
    empty: css({ padding: "3rem 1rem", textAlign: "center", color: "var(--color-text-muted)", fontSize: "0.9375rem" }),
    loading: css({ padding: "3rem 1rem", textAlign: "center", color: "var(--color-text-muted)", fontSize: "0.9375rem" }),
    actionsCell: css({ display: "flex", gap: "0.5rem" }),
  };

  return (
    <div style={styles.container} data-testid="structures-page">
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Structures</h2>
          <p style={styles.subtitle}>Organigramme des directions, agences et points de vente</p>
        </div>
        {canWrite && (
          <div style={styles.actions}>
            <button
              style={styles.buttonPrimary}
              onClick={() => navigate("/structures/nouvelle")}
              data-testid="btn-new-structure"
            >
              + Nouvelle structure
            </button>
          </div>
        )}
      </div>

      {error && (
        <div style={styles.alert} role="alert">
          {error}
        </div>
      )}

      <div style={styles.filters}>
        <div style={styles.field}>
          <label htmlFor="structures-search" style={styles.label}>
            Recherche
          </label>
          <input
            id="structures-search"
            data-testid="structures-search"
            style={styles.input}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Code ou nom"
          />
        </div>
        <div style={styles.field}>
          <label htmlFor="structures-type-filter" style={styles.label}>
            Type
          </label>
          <select
            id="structures-type-filter"
            data-testid="structures-type-filter"
            style={styles.select}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">Tous</option>
            <option value="DIRECTION">Direction</option>
            <option value="AGENCY">Agence</option>
            <option value="POINT_OF_SALE">Point de vente</option>
            <option value="OTHER">Autre</option>
          </select>
        </div>
        <div style={styles.field}>
          <label htmlFor="structures-status-filter" style={styles.label}>
            Statut
          </label>
          <select
            id="structures-status-filter"
            data-testid="structures-status-filter"
            style={styles.select}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Tous</option>
            <option value="true">Actif</option>
            <option value="false">Inactif</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div style={styles.card}>
          <div style={styles.loading} data-testid="structures-loading">
            Chargement des structures...
          </div>
        </div>
      ) : structures.length === 0 ? (
        <div style={styles.card}>
          <div style={styles.empty} data-testid="structures-empty">
            Aucune structure trouvée
          </div>
        </div>
      ) : (
        <div style={styles.card}>
          <table style={styles.table} data-testid="structures-list">
            <thead>
              <tr>
                <th style={styles.tableHeader}>Code</th>
                <th style={styles.tableHeader}>Nom</th>
                <th style={styles.tableHeader}>Type</th>
                <th style={styles.tableHeader}>Parent</th>
                <th style={styles.tableHeader}>Statut</th>
                <th style={styles.tableHeader}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {structures.map((s) => (
                <tr key={s.id}>
                  <td style={styles.tableCell} data-testid={`structure-code-${s.id}`}>
                    {s.code}
                  </td>
                  <td style={styles.tableCell} data-testid={`structure-name-${s.id}`}>
                    {s.name}
                  </td>
                  <td style={styles.tableCell}>
                    <span style={{ ...styles.badge, ...styles.badgeNeutral }}>
                      {STRUCTURE_TYPE_LABELS[s.type] ?? s.type}
                    </span>
                  </td>
                  <td style={styles.tableCell}>{s.parentName ?? "—"}</td>
                  <td style={styles.tableCell}>
                    <span
                      style={{ ...styles.badge, ...(s.status ? styles.badgeActive : styles.badgeInactive) }}
                      data-testid={`structure-status-${s.id}`}
                    >
                      {s.status ? "Actif" : "Inactif"}
                    </span>
                  </td>
                  <td style={styles.tableCell}>
                    <div style={styles.actionsCell}>
                      <button
                        style={styles.buttonSecondary}
                        onClick={() => navigate(`/structures/${s.id}/modifier`)}
                        disabled={!canWrite}
                        data-testid={`btn-edit-structure-${s.id}`}
                      >
                        Modifier
                      </button>
                      <button
                        style={styles.buttonSecondary}
                        onClick={() => void handleToggleStatus(s)}
                        disabled={!canWrite || isTogglingId === s.id}
                        data-testid={`btn-toggle-structure-${s.id}`}
                      >
                        {s.status ? "Désactiver" : "Réactiver"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default StructuresPage;
