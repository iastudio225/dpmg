import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { rapportsApi, departmentsApi, structuresApi, ApiError } from "../../services/api";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import {
  STATUS_LABELS,
  CATEGORY_LABELS,
  formatDate,
} from "../demandes/demandeUi";
import type {
  DemandeStatus,
  DepartmentResponse,
  RapportGlobalResponse,
  StructureResponse,
} from "@dpmg/shared";

function css<T extends React.CSSProperties>(styles: T): T {
  return styles;
}

/** Date locale au format AAAA-MM-JJ (pour les champs <input type="date">). */
function toInputDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Lundi de la semaine contenant la date donnée. */
function mondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

const STATUS_OPTIONS: { value: DemandeStatus; label: string }[] = (
  Object.keys(STATUS_LABELS) as DemandeStatus[]
).map((value) => ({ value, label: STATUS_LABELS[value] }));

/** Échappement CSV (séparateur « ; », convention Excel FR). */
function csvCell(value: string): string {
  if (/[";\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function RapportsPage() {
  const { refreshUser } = useAuth();
  const isNarrow = useMediaQuery("(max-width: 768px)");

  const today = toInputDate(new Date());
  const defaultFrom = toInputDate(mondayOf(new Date()));

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(today);
  const [departmentId, setDepartmentId] = useState("");
  const [structureId, setStructureId] = useState("");
  const [status, setStatus] = useState<DemandeStatus | "">("");
  const [urgent, setUrgent] = useState("");

  const [departments, setDepartments] = useState<DepartmentResponse[]>([]);
  const [structures, setStructures] = useState<StructureResponse[]>([]);

  const [report, setReport] = useState<RapportGlobalResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const loadReport = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await rapportsApi.global({
        from: from || undefined,
        to: to || undefined,
        departmentId: departmentId || undefined,
        structureId: structureId || undefined,
        status: status || undefined,
        urgent: urgent === "" ? undefined : urgent === "true",
      });
      setReport(result);
    } catch (err) {
      setReport(null);
      if (err instanceof ApiError && err.status === 401) {
        setError("Session expirée. Veuillez vous reconnecter.");
        refreshUser().catch(() => {
          /* la redirection login est gérée par PrivateRoute */
        });
      } else if (err instanceof ApiError && err.status === 403) {
        setError("Accès réservé aux profils DPMG.");
      } else if (err instanceof ApiError) {
        setError(err.message || "Erreur lors du chargement du rapport");
      } else {
        setError("Erreur de connexion au serveur");
      }
    } finally {
      setIsLoading(false);
    }
  }, [from, to, departmentId, structureId, status, urgent, refreshUser]);

  useEffect(() => {
    loadReport();
  }, [loadReport, reloadKey]);

  // Listes déroulantes (départements / directions).
  useEffect(() => {
    let cancelled = false;
    Promise.all([departmentsApi.list({ limit: 100 }), structuresApi.list({ limit: 100 })])
      .then(([deps, structs]) => {
        if (cancelled) return;
        setDepartments(deps);
        setStructures(structs);
      })
      .catch(() => {
        /* les filtres restent utilisables sans les listes */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function resetFilters() {
    setFrom(defaultFrom);
    setTo(today);
    setDepartmentId("");
    setStructureId("");
    setStatus("");
    setUrgent("");
    setReloadKey((k) => k + 1);
  }

  function exportCsv() {
    if (!report) return;
    const header = [
      "Référence",
      "Titre",
      "Statut",
      "Catégorie",
      "Direction",
      "Département",
      "Auteur",
      "Urgente",
      "Créée le",
      "Soumise le",
      "Clôturée le",
    ];
    const lines = [header.join(";")];
    for (const d of report.demandes) {
      lines.push(
        [
          d.reference,
          d.title,
          STATUS_LABELS[d.status],
          CATEGORY_LABELS[d.category],
          d.structureName ?? "",
          d.departmentName,
          `${d.authorFirstName} ${d.authorLastName}`.trim(),
          d.isUrgent ? "Oui" : "Non",
          formatDate(d.createdAt),
          d.submittedAt ? formatDate(d.submittedAt) : "",
          d.closedAt ? formatDate(d.closedAt) : "",
        ]
          .map(csvCell)
          .join(";")
      );
    }
    // BOM UTF-8 pour ouverture correcte dans Excel.
    const blob = new Blob(["\ufeff" + lines.join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rapport-global-${report.from ?? "tout"}_${report.to ?? "tout"}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const styles = {
    toolbar: css({
      display: "flex",
      alignItems: isNarrow ? "stretch" : "center",
      justifyContent: "space-between",
      flexDirection: isNarrow ? ("column" as const) : ("row" as const),
      gap: "1rem",
      marginBottom: "1.5rem",
      flexWrap: "wrap" as const,
    }),
    filters: css({
      display: "flex",
      alignItems: "center",
      gap: "0.75rem",
      flexWrap: "wrap" as const,
    }),
    filterGroup: css({
      display: "flex",
      flexDirection: "column" as const,
      gap: "0.25rem",
    }),
    filterLabel: css({
      fontSize: "0.75rem",
      fontWeight: 500,
      color: "var(--color-text-muted)",
    }),
    input: css({
      padding: "0.5rem 0.75rem",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-md)",
      fontSize: "0.875rem",
      color: "var(--color-text)",
      background: "var(--color-background)",
    }),
    actions: css({
      display: "flex",
      gap: "0.5rem",
      flexWrap: "wrap" as const,
    }),
    primaryButton: css({
      padding: "0.625rem 1.25rem",
      background: "var(--color-primary)",
      color: "#ffffff",
      border: "none",
      borderRadius: "var(--radius-md)",
      fontSize: "0.9375rem",
      fontWeight: 500,
      cursor: "pointer",
      whiteSpace: "nowrap" as const,
    }),
    secondaryButton: css({
      padding: "0.625rem 1.25rem",
      background: "transparent",
      color: "var(--color-text)",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-md)",
      fontSize: "0.9375rem",
      fontWeight: 500,
      cursor: "pointer",
      whiteSpace: "nowrap" as const,
    }),
    statsGrid: css({
      display: "grid",
      gridTemplateColumns: isNarrow ? "1fr" : "repeat(auto-fit, minmax(160px, 1fr))",
      gap: "1rem",
      marginBottom: "1.5rem",
    }),
    statCard: css({
      padding: "1rem 1.25rem",
    }),
    statHeader: css({
      fontSize: "0.75rem",
      fontWeight: 600,
      textTransform: "uppercase" as const,
      letterSpacing: "0.05em",
      color: "var(--color-text-muted)",
      marginBottom: "0.5rem",
    }),
    statValue: css({
      fontSize: "1.75rem",
      fontWeight: 700,
      color: "var(--color-text)",
    }),
    grid2: css({
      display: "grid",
      gridTemplateColumns: isNarrow ? "1fr" : "repeat(auto-fit, minmax(320px, 1fr))",
      gap: "1rem",
      marginBottom: "1.5rem",
    }),
    card: css({
      padding: "1rem 0",
      overflow: "hidden",
    }),
    cardTitle: css({
      fontSize: "1rem",
      fontWeight: 600,
      padding: "0 1.25rem",
      marginBottom: "0.75rem",
    }),
    table: css({
      width: "100%",
      borderCollapse: "collapse" as const,
    }),
    th: css({
      textAlign: "left" as const,
      padding: "0.625rem 1.25rem",
      fontSize: "0.75rem",
      fontWeight: 600,
      textTransform: "uppercase" as const,
      letterSpacing: "0.05em",
      color: "var(--color-text-muted)",
      background: "var(--color-secondary)",
      borderBottom: "1px solid var(--color-border)",
    }),
    td: css({
      padding: "0.75rem 1.25rem",
      fontSize: "0.875rem",
      color: "var(--color-text)",
      borderBottom: "1px solid var(--color-border)",
      verticalAlign: "middle" as const,
    }),
    reference: css({
      fontWeight: 600,
      color: "var(--color-primary)",
      whiteSpace: "nowrap" as const,
    }),
    urgentTag: css({
      display: "inline-block",
      padding: "0.125rem 0.5rem",
      borderRadius: "999px",
      fontSize: "0.75rem",
      fontWeight: 600,
      background: "#fee2e2",
      color: "#b91c1c",
    }),
    errorBox: css({
      padding: "0.875rem 1.25rem",
      borderRadius: "var(--radius-md)",
      background: "#fee2e2",
      color: "#b91c1c",
      marginBottom: "1.5rem",
      fontSize: "0.9375rem",
    }),
    emptyState: css({
      padding: "2.5rem 1.25rem",
      textAlign: "center" as const,
      color: "var(--color-text-muted)",
      fontSize: "0.9375rem",
    }),
  };

  return (
    <div>
      <div style={styles.toolbar}>
        <div style={styles.filters}>
          <div style={styles.filterGroup}>
            <label style={styles.filterLabel} htmlFor="rapport-from">
              Du
            </label>
            <input
              id="rapport-from"
              type="date"
              style={styles.input}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div style={styles.filterGroup}>
            <label style={styles.filterLabel} htmlFor="rapport-to">
              Au
            </label>
            <input
              id="rapport-to"
              type="date"
              style={styles.input}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div style={styles.filterGroup}>
            <label style={styles.filterLabel} htmlFor="rapport-structure">
              Direction
            </label>
            <select
              id="rapport-structure"
              style={styles.input}
              value={structureId}
              onChange={(e) => setStructureId(e.target.value)}
            >
              <option value="">Toutes</option>
              {structures.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div style={styles.filterGroup}>
            <label style={styles.filterLabel} htmlFor="rapport-department">
              Département
            </label>
            <select
              id="rapport-department"
              style={styles.input}
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
            >
              <option value="">Tous</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div style={styles.filterGroup}>
            <label style={styles.filterLabel} htmlFor="rapport-status">
              Statut
            </label>
            <select
              id="rapport-status"
              style={styles.input}
              value={status}
              onChange={(e) => setStatus(e.target.value as DemandeStatus | "")}
            >
              <option value="">Tous</option>
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div style={styles.filterGroup}>
            <label style={styles.filterLabel} htmlFor="rapport-urgent">
              Urgence
            </label>
            <select
              id="rapport-urgent"
              style={styles.input}
              value={urgent}
              onChange={(e) => setUrgent(e.target.value)}
            >
              <option value="">Toutes</option>
              <option value="true">Urgentes</option>
              <option value="false">Non urgentes</option>
            </select>
          </div>
        </div>
        <div style={styles.actions}>
          <button type="button" style={styles.primaryButton} onClick={() => setReloadKey((k) => k + 1)}>
            {isLoading ? "Chargement..." : "Appliquer"}
          </button>
          <button type="button" style={styles.secondaryButton} onClick={resetFilters}>
            Réinitialiser
          </button>
          <button
            type="button"
            style={styles.secondaryButton}
            onClick={exportCsv}
            disabled={!report || report.demandes.length === 0}
          >
            Exporter CSV
          </button>
          <button
            type="button"
            style={styles.secondaryButton}
            onClick={() => window.print()}
            disabled={!report}
          >
            Imprimer
          </button>
        </div>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      {report && (
        <>
          <div style={styles.statsGrid}>
            <div className="card" style={styles.statCard} data-testid="stat-total">
              <div style={styles.statHeader}>Total demandes</div>
              <div style={styles.statValue}>{report.total}</div>
            </div>
            <div className="card" style={styles.statCard} data-testid="stat-urgentes">
              <div style={styles.statHeader}>Urgentes</div>
              <div style={styles.statValue}>{report.urgentes}</div>
            </div>
            <div className="card" style={styles.statCard} data-testid="stat-cloturees">
              <div style={styles.statHeader}>Clôturées</div>
              <div style={styles.statValue}>{report.cloturees}</div>
            </div>
            <div className="card" style={styles.statCard} data-testid="stat-periode">
              <div style={styles.statHeader}>Période</div>
              <div style={{ ...styles.statValue, fontSize: "1rem", fontWeight: 600 }}>
                {report.from ? formatDate(`${report.from}T00:00:00.000Z`) : "Début"}
                {" → "}
                {report.to ? formatDate(`${report.to}T00:00:00.000Z`) : "Aujourd'hui"}
              </div>
            </div>
          </div>

          <div style={styles.grid2}>
            <div className="card" style={styles.card}>
              <h2 style={styles.cardTitle}>Répartition par statut</h2>
              {report.byStatus.length === 0 ? (
                <div style={styles.emptyState}>Aucune demande sur la période.</div>
              ) : (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Statut</th>
                      <th style={styles.th}>Nombre</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.byStatus.map((item) => (
                      <tr key={item.status}>
                        <td style={styles.td}>{STATUS_LABELS[item.status]}</td>
                        <td style={styles.td}>{item.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="card" style={styles.card}>
              <h2 style={styles.cardTitle}>Répartition par direction</h2>
              {report.byStructure.length === 0 ? (
                <div style={styles.emptyState}>Aucune demande sur la période.</div>
              ) : (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Direction</th>
                      <th style={styles.th}>Nombre</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.byStructure.map((item) => (
                      <tr key={item.structureId ?? "sans-direction"}>
                        <td style={styles.td}>{item.structureName ?? "Sans direction"}</td>
                        <td style={styles.td}>{item.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="card" style={styles.card}>
              <h2 style={styles.cardTitle}>Répartition par département</h2>
              {report.byDepartment.length === 0 ? (
                <div style={styles.emptyState}>Aucune demande sur la période.</div>
              ) : (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Département</th>
                      <th style={styles.th}>Nombre</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.byDepartment.map((item) => (
                      <tr key={item.departmentId}>
                        <td style={styles.td}>{item.departmentName}</td>
                        <td style={styles.td}>{item.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="card" style={styles.card}>
            <h2 style={styles.cardTitle}>Détail des demandes ({report.total})</h2>
            {report.demandes.length === 0 ? (
              <div style={styles.emptyState}>
                Aucune demande ne correspond aux filtres sélectionnés.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Référence</th>
                      <th style={styles.th}>Titre</th>
                      <th style={styles.th}>Statut</th>
                      <th style={styles.th}>Direction</th>
                      <th style={styles.th}>Département</th>
                      <th style={styles.th}>Auteur</th>
                      <th style={styles.th}>Urgente</th>
                      <th style={styles.th}>Créée le</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.demandes.map((d) => (
                      <tr key={d.id}>
                        <td style={{ ...styles.td, ...styles.reference }}>{d.reference}</td>
                        <td style={styles.td}>{d.title}</td>
                        <td style={styles.td}>{STATUS_LABELS[d.status]}</td>
                        <td style={styles.td}>{d.structureName ?? "—"}</td>
                        <td style={styles.td}>{d.departmentName}</td>
                        <td style={styles.td}>
                          {d.authorFirstName} {d.authorLastName}
                        </td>
                        <td style={styles.td}>
                          {d.isUrgent ? <span style={styles.urgentTag}>Oui</span> : "Non"}
                        </td>
                        <td style={styles.td}>{formatDate(d.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
