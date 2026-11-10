import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { departmentsApi, structuresApi, ApiError } from "../../services/api";
import type { DepartmentResponse } from "@dpmg/shared";

function css<T extends React.CSSProperties>(styles: T): T {
  return styles;
}

export function DepartementsPage() {
  const navigate = useNavigate();
  const { roles: currentRoles } = useAuth();
  const [departments, setDepartments] = useState<DepartmentResponse[]>([]);
  const [structures, setStructures] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [structureFilter, setStructureFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [isTogglingId, setIsTogglingId] = useState<string | null>(null);

  // Affichage uniquement : le backend reste autoritaire sur les permissions.
  const canWrite = currentRoles.some((r) => r.role === "TECHNICAL_ADMIN" || r.role === "SUPER_ADMIN");

  const loadDepartments = useCallback(
    async (searchTerm?: string, structureId?: string, status?: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await departmentsApi.list({
          search: searchTerm,
          structureId: structureId || undefined,
          status: status === "" ? undefined : status === "true",
        });
        setDepartments(response);
      } catch (err) {
        if (err instanceof ApiError) setError(err.message);
        else setError("Impossible de charger les départements");
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadDepartments(search || undefined, structureFilter, statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, structureFilter, statusFilter]);

  // Sélecteur de filtre : structures réelles (jamais de données codées en dur).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await structuresApi.list({ limit: 100 });
        if (!cancelled) setStructures(response);
      } catch {
        // Le filtre reste vide ; l'erreur de liste des structures est non bloquante ici.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggleStatus = async (department: DepartmentResponse) => {
    setIsTogglingId(department.id);
    setError(null);
    try {
      const updated = await departmentsApi.changeStatus(department.id, !department.status);
      setDepartments((current) => current.map((d) => (d.id === department.id ? updated : d)));
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
    description: css({ color: "var(--color-text-muted)", fontSize: "0.8125rem", maxWidth: "280px" }),
  };

  return (
    <div style={styles.container} data-testid="departements-page">
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Départements</h2>
          <p style={styles.subtitle}>Gestion des départements DPMG</p>
        </div>
        {canWrite && (
          <div style={styles.actions}>
            <button
              style={styles.buttonPrimary}
              onClick={() => navigate("/departements/nouveau")}
              data-testid="btn-new-department"
            >
              + Nouveau département
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
          <label htmlFor="departments-search" style={styles.label}>
            Recherche
          </label>
          <input
            id="departments-search"
            data-testid="departments-search"
            style={styles.input}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nom ou code"
          />
        </div>
        <div style={styles.field}>
          <label htmlFor="departments-structure-filter" style={styles.label}>
            Structure
          </label>
          <select
            id="departments-structure-filter"
            data-testid="departments-structure-filter"
            style={styles.select}
            value={structureFilter}
            onChange={(e) => setStructureFilter(e.target.value)}
          >
            <option value="">Toutes</option>
            {structures.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>
        </div>
        <div style={styles.field}>
          <label htmlFor="departments-status-filter" style={styles.label}>
            Statut
          </label>
          <select
            id="departments-status-filter"
            data-testid="departments-status-filter"
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
          <div style={styles.loading} data-testid="departments-loading">
            Chargement des départements...
          </div>
        </div>
      ) : departments.length === 0 ? (
        <div style={styles.card}>
          <div style={styles.empty} data-testid="departments-empty">
            Aucun département trouvé
          </div>
        </div>
      ) : (
        <div style={styles.card}>
          <table style={styles.table} data-testid="departments-list">
            <thead>
              <tr>
                <th style={styles.tableHeader}>Nom</th>
                <th style={styles.tableHeader}>Code</th>
                <th style={styles.tableHeader}>Description</th>
                <th style={styles.tableHeader}>Structure</th>
                <th style={styles.tableHeader}>Statut</th>
                <th style={styles.tableHeader}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {departments.map((d) => (
                <tr key={d.id}>
                  <td style={styles.tableCell} data-testid={`department-name-${d.id}`}>
                    {d.name}
                  </td>
                  <td style={styles.tableCell} data-testid={`department-code-${d.id}`}>
                    {d.code}
                  </td>
                  <td style={styles.tableCell}>
                    <span style={styles.description}>{d.description ?? "—"}</span>
                  </td>
                  <td style={styles.tableCell} data-testid={`department-structure-${d.id}`}>
                    {d.structureName ? `${d.structureName} (${d.structureCode})` : "—"}
                  </td>
                  <td style={styles.tableCell}>
                    <span
                      style={{ ...styles.badge, ...(d.status ? styles.badgeActive : styles.badgeInactive) }}
                      data-testid={`department-status-${d.id}`}
                    >
                      {d.status ? "Actif" : "Inactif"}
                    </span>
                  </td>
                  <td style={styles.tableCell}>
                    <div style={styles.actionsCell}>
                      <button
                        style={styles.buttonSecondary}
                        onClick={() => navigate(`/departements/${d.id}/modifier`)}
                        disabled={!canWrite}
                        data-testid={`btn-edit-department-${d.id}`}
                      >
                        Modifier
                      </button>
                      <button
                        style={styles.buttonSecondary}
                        onClick={() => void handleToggleStatus(d)}
                        disabled={!canWrite || isTogglingId === d.id}
                        data-testid={`btn-toggle-department-${d.id}`}
                      >
                        {d.status ? "Désactiver" : "Réactiver"}
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

export default DepartementsPage;
