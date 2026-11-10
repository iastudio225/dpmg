import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { demandesApi, ApiError } from "../../services/api";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import type { DemandeResponse, DemandeStatus } from "@dpmg/shared";

function css<T extends React.CSSProperties>(styles: T): T {
  return styles;
}

const STATUS_LABELS: Record<DemandeStatus, string> = {
  BROUILLON: "Brouillon",
  EN_ATTENTE_VALIDATION: "En attente de validation",
  EN_ATTENTE_ANALYSE: "En attente d'analyse",
  EN_ATTENTE_DECISION: "En attente de décision",
  EN_ATTENTE_FINANCEMENT: "En attente de financement",
  EN_ATTENTE_EXECUTION: "En attente d'exécution",
  EN_ATTENTE_CONFIRMATION_SATISFACTION: "En attente de confirmation de satisfaction",
  CLOTUREE: "Clôturée",
  RETOURNEE: "Retournée",
  REFUSEE: "Refusée",
};

const CATEGORY_LABELS: Record<DemandeResponse["category"], string> = {
  INFRASTRUCTURE: "Infrastructures et moyens généraux",
  LOGISTIQUE: "Logistique, gestion sécuritaire et assurances",
  MAGASIN: "Magasin central",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function DemandeListPage() {
  const { refreshUser } = useAuth();
  const isNarrow = useMediaQuery("(max-width: 768px)");

  const [demandes, setDemandes] = useState<DemandeResponse[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<DemandeStatus | "">("");
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await demandesApi.list(statusFilter ? { status: statusFilter } : undefined);
      setDemandes(result);
    } catch (err) {
      setDemandes(null);
      if (err instanceof ApiError && err.status === 401) {
        setError("Session expirée. Veuillez vous reconnecter.");
        refreshUser().catch(() => {
          /* la redirection login est gérée par PrivateRoute */
        });
      } else if (err instanceof ApiError) {
        setError(err.message || "Erreur lors du chargement des demandes");
      } else {
        setError("Erreur de connexion au serveur");
      }
    }
  }, [statusFilter, refreshUser]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const styles = {
    toolbar: css({
      display: "flex",
      alignItems: isNarrow ? "stretch" : "center",
      justifyContent: "space-between",
      flexDirection: isNarrow ? ("column" as const) : ("row" as const),
      gap: "1rem",
      marginBottom: "1.5rem",
    }),
    filters: css({
      display: "flex",
      alignItems: "center",
      gap: "0.75rem",
      flexWrap: "wrap" as const,
    }),
    filterLabel: css({
      fontSize: "0.875rem",
      fontWeight: 500,
      color: "var(--color-text-muted)",
    }),
    select: css({
      padding: "0.5rem 0.75rem",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-md)",
      fontSize: "0.875rem",
      color: "var(--color-text)",
      background: "var(--color-background)",
      minWidth: "160px",
    }),
    createButton: css({
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "0.5rem",
      padding: "0.625rem 1.25rem",
      background: "var(--color-primary)",
      color: "#ffffff",
      border: "none",
      borderRadius: "var(--radius-md)",
      fontSize: "0.9375rem",
      fontWeight: 500,
      textDecoration: "none",
      cursor: "pointer",
      whiteSpace: "nowrap" as const,
      alignSelf: isNarrow ? ("stretch" as const) : undefined,
    }),
    card: css({
      padding: 0,
      overflow: "hidden",
    }),
    table: css({
      width: "100%",
      borderCollapse: "collapse" as const,
    }),
    th: css({
      textAlign: "left" as const,
      padding: "0.875rem 1.25rem",
      fontSize: "0.75rem",
      fontWeight: 600,
      textTransform: "uppercase" as const,
      letterSpacing: "0.05em",
      color: "var(--color-text-muted)",
      background: "var(--color-secondary)",
      borderBottom: "1px solid var(--color-border)",
    }),
    td: css({
      padding: "1rem 1.25rem",
      fontSize: "0.9375rem",
      color: "var(--color-text)",
      borderBottom: "1px solid var(--color-border)",
      verticalAlign: "middle" as const,
    }),
    reference: css({
      fontWeight: 600,
      color: "var(--color-primary)",
      whiteSpace: "nowrap" as const,
    }),
    title: css({
      fontWeight: 500,
      display: "block",
      maxWidth: "360px",
      overflow: "hidden",
      textOverflow: "ellipsis" as const,
      whiteSpace: "nowrap" as const,
    }),
    category: css({
      fontSize: "0.8125rem",
      color: "var(--color-text-muted)",
      display: "block",
      maxWidth: "220px",
    }),
    statusBadge: css({
      display: "inline-block",
      padding: "0.125rem 0.625rem",
      borderRadius: "999px",
      fontSize: "0.75rem",
      fontWeight: 600,
    }),
    statusBrouillon: css({
      background: "var(--color-secondary)",
      color: "var(--color-text-muted)",
      border: "1px solid var(--color-border)",
    }),
    statusSoumise: css({
      background: "var(--color-primary-light)",
      color: "var(--color-primary)",
    }),
    viewLink: css({
      display: "inline-flex",
      alignItems: "center",
      padding: "0.375rem 0.875rem",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-md)",
      color: "var(--color-primary)",
      fontSize: "0.875rem",
      fontWeight: 500,
      textDecoration: "none",
      whiteSpace: "nowrap" as const,
      transition: "background-color var(--transition), border-color var(--transition)",
    }),
    narrowList: css({
      display: "flex",
      flexDirection: "column" as const,
    }),
    narrowItem: css({
      display: "flex",
      flexDirection: "column" as const,
      gap: "0.5rem",
      padding: "1rem 1.25rem",
      borderBottom: "1px solid var(--color-border)",
    }),
    narrowHeader: css({
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "0.75rem",
    }),
    narrowMeta: css({
      display: "flex",
      alignItems: "center",
      gap: "0.75rem",
      flexWrap: "wrap" as const,
      fontSize: "0.8125rem",
      color: "var(--color-text-muted)",
    }),
    stateBox: css({
      display: "flex",
      flexDirection: "column" as const,
      alignItems: "center",
      justifyContent: "center",
      gap: "0.75rem",
      padding: "3rem 1.5rem",
      textAlign: "center" as const,
      color: "var(--color-text-muted)",
    }),
    errorBox: css({
      display: "flex",
      alignItems: "center",
      gap: "0.5rem",
      padding: "0.875rem 1rem",
      background: "var(--color-error-light)",
      border: "1px solid rgba(235, 87, 87, 0.35)",
      borderRadius: "var(--radius-md)",
      color: "var(--color-error)",
      fontSize: "0.875rem",
      marginBottom: "1.5rem",
    }),
    retryButton: css({
      padding: "0.5rem 1.25rem",
      background: "var(--color-primary)",
      color: "#ffffff",
      border: "none",
      borderRadius: "var(--radius-md)",
      fontSize: "0.875rem",
      fontWeight: 500,
      cursor: "pointer",
    }),
    spinner: css({
      width: "24px",
      height: "24px",
      border: "2px solid var(--color-border)",
      borderTopColor: "var(--color-primary)",
      borderRadius: "50%",
      animation: "spin 1s linear infinite",
    }),
  };

const statusStyle = (status: DemandeStatus) => {
  switch (status) {
    case "BROUILLON":
      return styles.statusBrouillon;
    case "EN_ATTENTE_VALIDATION":
      return styles.statusBrouillon; // reuse brouillon style or could add new
    case "EN_ATTENTE_ANALYSE":
      return styles.statusBrouillon;
    case "EN_ATTENTE_DECISION":
      return styles.statusBrouillon;
    case "EN_ATTENTE_FINANCEMENT":
      return styles.statusBrouillon;
    case "RETOURNEE":
      return styles.statusBrouillon;
    case "REFUSEE":
      return styles.statusBrouillon;
    default:
      return styles.statusBrouillon;
  }
};

  return (
    <div>
      <div style={styles.toolbar}>
        <div style={styles.filters}>
          <label htmlFor="demandes-status-filter" style={styles.filterLabel}>
            Statut
          </label>
<select
              id="demandes-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as DemandeStatus | "")}
              style={styles.select}
            >
              <option value="">Tous les statuts</option>
              <option value="BROUILLON">Brouillon</option>
              <option value="EN_ATTENTE_VALIDATION">En attente de validation</option>
              <option value="EN_ATTENTE_ANALYSE">En attente d'analyse</option>
              <option value="EN_ATTENTE_DECISION">En attente de décision</option>
              <option value="EN_ATTENTE_FINANCEMENT">En attente de financement</option>
              <option value="EN_ATTENTE_EXECUTION">En attente d'exécution</option>
              <option value="EN_ATTENTE_CONFIRMATION_SATISFACTION">En attente de confirmation de satisfaction</option>
              <option value="CLOTUREE">Clôturée</option>
              <option value="RETOURNEE">Retournée</option>
              <option value="REFUSEE">Refusée</option>
            </select>
        </div>
        <Link to="/demandes/nouvelle" style={styles.createButton}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Nouvelle demande
        </Link>
      </div>

      {error && (
        <div style={styles.errorBox} role="alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span style={{ flex: 1 }}>{error}</span>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            style={styles.retryButton}
          >
            Réessayer
          </button>
        </div>
      )}

      {!error && demandes === null && (
        <div className="card" style={styles.stateBox} role="status" aria-live="polite">
          <div style={styles.spinner} aria-hidden="true" />
          <p>Chargement des demandes...</p>
        </div>
      )}

      {!error && demandes !== null && demandes.length === 0 && (
        <div className="card" style={styles.stateBox}>
          <p>Aucune demande pour le moment.</p>
          <p>Créez une demande pour démarrer le suivi.</p>
        </div>
      )}

      {!error && demandes !== null && demandes.length > 0 && (
        <div className="card" style={styles.card}>
          {isNarrow ? (
            <div style={styles.narrowList}>
              {demandes.map((demande) => (
                <div key={demande.id} style={styles.narrowItem}>
                  <div style={styles.narrowHeader}>
                    <span style={styles.reference}>{demande.reference}</span>
                    <span style={statusStyle(demande.status)}>{STATUS_LABELS[demande.status]}</span>
                  </div>
                  <span style={{ fontWeight: 500, fontSize: "0.9375rem" }}>{demande.title}</span>
                  <div style={styles.narrowMeta}>
                    <span>{CATEGORY_LABELS[demande.category]}</span>
                    <span>Créée le {formatDate(demande.createdAt)}</span>
                  </div>
                  <div>
                    <Link to={`/demandes/${demande.id}`} style={styles.viewLink}>
                      Voir le détail
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Référence</th>
                  <th style={styles.th}>Titre</th>
                  <th style={styles.th}>Catégorie</th>
                  <th style={styles.th}>Statut</th>
                  <th style={styles.th}>Créée le</th>
                  <th style={styles.th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {demandes.map((demande) => (
                  <tr key={demande.id}>
                    <td style={styles.td}>
                      <span style={styles.reference}>{demande.reference}</span>
                    </td>
                    <td style={styles.td}>
                      <span style={styles.title} title={demande.title}>
                        {demande.title}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <span style={styles.category}>{CATEGORY_LABELS[demande.category]}</span>
                    </td>
                    <td style={styles.td}>
                      <span style={statusStyle(demande.status)}>{STATUS_LABELS[demande.status]}</span>
                    </td>
                    <td style={styles.td}>{formatDate(demande.createdAt)}</td>
                    <td style={styles.td}>
                      <Link to={`/demandes/${demande.id}`} style={styles.viewLink}>
                        Voir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default DemandeListPage;
