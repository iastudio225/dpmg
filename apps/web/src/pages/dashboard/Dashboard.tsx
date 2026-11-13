import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { demandesApi } from "../../services/api";
import { STATUS_LABELS, formatDate } from "../demandes/demandeUi";
import type { DemandeResponse, RoleType, UserStatus, DemandeStatsResponse } from "@dpmg/shared/zod";
import { roleTypeLabelFr } from "@dpmg/shared/zod";

function css<T extends React.CSSProperties>(styles: T): T {
  return styles;
}

const ROLE_LABELS = roleTypeLabelFr;

const MANAGER_ROLES: readonly RoleType[] = [
  "DEPARTMENT_MANAGER",
  "DEPARTMENT_DELEGATE",
  "DPMG_MANAGER",
  "DPMG_DELEGATE",
];

function userStatusBadge(status: UserStatus): { background: string; color: string } {
  switch (status) {
    case "ACTIVE":
      return { background: "#e8f7ef", color: "var(--color-success)" };
    case "SUSPENDED":
      return { background: "#fef4e8", color: "var(--color-warning)" };
    case "DISABLED":
      return { background: "var(--color-error-light)", color: "var(--color-error)" };
  }
}

function demandeStatusBadge(status: DemandeResponse["status"]): { background: string; color: string; border?: string } {
  if (status === "BROUILLON") {
    return { background: "var(--color-secondary)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" };
  }
  return { background: "var(--color-primary-light)", color: "var(--color-primary)" };
}

export function Dashboard() {
  const { user, roles, hasAnyRole } = useAuth();
  const isWide = useMediaQuery("(min-width: 1100px)");

  const [demandes, setDemandes] = useState<DemandeResponse[] | null>(null);
  const [demandesError, setDemandesError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<DemandeStatsResponse | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [isStatsLoading, setIsStatsLoading] = useState(true);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setDemandesError(false);
    setIsStatsLoading(true);
    setStatsError(false);
    demandesApi
      .list()
      .then((result) => {
        if (!cancelled) {
          setDemandes(result);
          setDemandesError(false);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDemandes(null);
          setDemandesError(true);
          setIsLoading(false);
        }
      });
    demandesApi
      .stats()
      .then((result) => {
        if (!cancelled) {
          setStats(result);
          setStatsError(false);
          setIsStatsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStats(null);
          setStatsError(true);
          setIsStatsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [retryToken]);

  const retry = useCallback(() => setRetryToken((token) => token + 1), []);

  const isManager = hasAnyRole(MANAGER_ROLES as string[]);

  const recentDemandes = demandes
    ? [...demandes]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5)
    : [];

  const styles = {
    container: css({
      display: "flex",
      flexDirection: "column",
      gap: "1.25rem",
    }),
    banner: css({
      padding: "1.25rem 1.5rem",
      background: "var(--color-primary-light)",
      borderRadius: "var(--radius-lg)",
      border: "1px solid rgba(47, 128, 237, 0.15)",
    }),
    bannerTitle: css({
      fontSize: "1.25rem",
      fontWeight: 600,
      color: "var(--color-text)",
      marginBottom: "0.25rem",
    }),
    bannerText: css({
      color: "var(--color-text-muted)",
      fontSize: "0.9375rem",
      margin: 0,
    }),
    statsGrid: css({
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))",
      gap: "1rem",
    }),
    statCard: css({
      padding: "1.25rem",
      minHeight: "104px",
      display: "flex",
      flexDirection: "column",
      gap: "0.375rem",
    }),
    statHeader: css({
      display: "flex",
      alignItems: "center",
      gap: "0.5rem",
      color: "var(--color-text-muted)",
      fontSize: "0.8125rem",
      fontWeight: 600,
      textTransform: "uppercase" as const,
      letterSpacing: "0.04em",
    }),
    statValue: css({
      fontSize: "1.75rem",
      fontWeight: 700,
      color: "var(--color-text)",
      lineHeight: 1.2,
      fontVariantNumeric: "tabular-nums" as const,
    }),
    statValueMuted: css({
      fontSize: "1.75rem",
      fontWeight: 700,
      color: "var(--color-text-muted)",
      lineHeight: 1.2,
    }),
    mainGrid: css({
      display: "grid",
      gridTemplateColumns: isWide ? "minmax(0, 1.6fr) minmax(0, 1fr)" : "minmax(0, 1fr)",
      gap: "1.25rem",
      alignItems: "start",
    }),
    sideColumn: css({
      display: "flex",
      flexDirection: "column",
      gap: "1.25rem",
      minWidth: 0,
    }),
    card: css({
      padding: "1.25rem 1.5rem",
      minWidth: 0,
    }),
    cardTitle: css({
      fontSize: "1rem",
      fontWeight: 600,
      color: "var(--color-text)",
      marginBottom: "1rem",
      paddingBottom: "0.75rem",
      borderBottom: "1px solid var(--color-border)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "0.5rem",
    }),
    cardTitleLeft: css({
      display: "flex",
      alignItems: "center",
      gap: "0.5rem",
      minWidth: 0,
    }),
    cardTitleDot: css({
      width: "8px",
      height: "8px",
      borderRadius: "50%",
      background: "var(--color-primary)",
      flexShrink: 0,
    }),
    cardLink: css({
      color: "var(--color-primary)",
      fontSize: "0.8125rem",
      fontWeight: 500,
      whiteSpace: "nowrap" as const,
      textDecoration: "none",
    }),
    mutedText: css({
      color: "var(--color-text-muted)",
      fontStyle: "italic",
      margin: 0,
    }),
    errorBox: css({
      display: "flex",
      flexDirection: "column" as const,
      gap: "0.75rem",
      alignItems: "flex-start",
      padding: "0.875rem 1rem",
      background: "var(--color-error-light)",
      borderRadius: "var(--radius-md)",
      color: "var(--color-error)",
      fontSize: "0.875rem",
    }),
    retryButton: css({
      padding: "0.375rem 0.875rem",
      border: "1px solid currentColor",
      borderRadius: "var(--radius-md)",
      background: "transparent",
      color: "inherit",
      fontSize: "0.8125rem",
      fontWeight: 600,
      cursor: "pointer",
    }),
    recentList: css({
      listStyle: "none",
      margin: 0,
      padding: 0,
      display: "flex",
      flexDirection: "column" as const,
      minHeight: "220px",
    }),
    recentItem: css({
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "1rem",
      padding: "0.75rem 0",
      borderBottom: "1px solid var(--color-border)",
      minHeight: "64px",
    }),
    recentItemLast: css({
      borderBottom: "none",
    }),
    recentMain: css({
      display: "flex",
      flexDirection: "column" as const,
      gap: "0.25rem",
      minWidth: 0,
    }),
    recentTitleRow: css({
      display: "flex",
      alignItems: "center",
      gap: "0.5rem",
      minWidth: 0,
    }),
    recentTitle: css({
      fontSize: "0.9375rem",
      fontWeight: 500,
      color: "var(--color-text)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap" as const,
    }),
    recentReference: css({
      fontSize: "0.75rem",
      fontWeight: 600,
      color: "var(--color-primary)",
      whiteSpace: "nowrap" as const,
      fontVariantNumeric: "tabular-nums" as const,
    }),
    recentMeta: css({
      fontSize: "0.8125rem",
      color: "var(--color-text-muted)",
      display: "flex",
      alignItems: "center",
      gap: "0.5rem",
      flexWrap: "wrap" as const,
    }),
    statusBadge: css({
      display: "inline-block",
      padding: "0.125rem 0.625rem",
      borderRadius: "999px",
      fontSize: "0.75rem",
      fontWeight: 600,
      whiteSpace: "nowrap" as const,
    }),
    recentLink: css({
      color: "var(--color-primary)",
      fontSize: "0.8125rem",
      fontWeight: 600,
      whiteSpace: "nowrap" as const,
      textDecoration: "none",
      flexShrink: 0,
    }),
    roleList: css({
      listStyle: "none",
      margin: 0,
      padding: 0,
      display: "flex",
      flexDirection: "column" as const,
      gap: "0.5rem",
    }),
    roleItem: css({
      display: "flex",
      alignItems: "flex-start",
      gap: "0.75rem",
      padding: "0.625rem 0.75rem",
      background: "var(--color-secondary)",
      borderRadius: "var(--radius-md)",
    }),
    roleBadge: css({
      padding: "0.25rem 0.625rem",
      background: "var(--color-primary-light)",
      color: "var(--color-primary)",
      borderRadius: "999px",
      fontSize: "0.75rem",
      fontWeight: 600,
      whiteSpace: "nowrap" as const,
      flexShrink: 0,
    }),
    roleDetails: css({
      display: "flex",
      flexDirection: "column" as const,
      gap: "0.125rem",
      minWidth: 0,
    }),
    roleStructure: css({
      fontSize: "0.875rem",
      fontWeight: 500,
      color: "var(--color-text)",
      overflowWrap: "break-word" as const,
    }),
    roleScope: css({
      fontSize: "0.75rem",
      color: "var(--color-text-muted)",
      overflowWrap: "break-word" as const,
    }),
    shortcutList: css({
      listStyle: "none",
      margin: 0,
      padding: 0,
      display: "flex",
      flexDirection: "column" as const,
      gap: "0.5rem",
    }),
    shortcutItem: css({
      display: "flex",
      alignItems: "center",
      gap: "0.75rem",
      padding: "0.75rem",
      background: "var(--color-secondary)",
      borderRadius: "var(--radius-md)",
      color: "var(--color-text)",
      textDecoration: "none",
      transition: "background-color var(--transition)",
    }),
    shortcutIcon: css({
      width: "32px",
      height: "32px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--color-primary-light)",
      color: "var(--color-primary)",
      borderRadius: "var(--radius-md)",
      flexShrink: 0,
    }),
    shortcutText: css({
      display: "flex",
      flexDirection: "column" as const,
      gap: "0.125rem",
      minWidth: 0,
    }),
    shortcutLabel: css({
      fontSize: "0.875rem",
      fontWeight: 600,
      color: "var(--color-text)",
    }),
    shortcutHint: css({
      fontSize: "0.75rem",
      color: "var(--color-text-muted)",
    }),
    infoList: css({
      display: "flex",
      flexDirection: "column" as const,
      gap: "0.75rem",
      margin: 0,
    }),
    infoRow: css({
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "1rem",
      margin: 0,
    }),
    infoLabel: css({
      fontSize: "0.8125rem",
      color: "var(--color-text-muted)",
      margin: 0,
    }),
    infoValue: css({
      fontSize: "0.875rem",
      fontWeight: 500,
      color: "var(--color-text)",
      margin: 0,
      textAlign: "right" as const,
    }),
  };

  const statValue = (value: number) =>
    isLoading || demandesError || isStatsLoading || statsError ? (
      <span style={styles.statValueMuted} data-testid="stat-loading">
        —
      </span>
    ) : (
      <span style={styles.statValue}>{value}</span>
    );

  return (
    <div style={styles.container}>
      <section style={styles.banner} aria-labelledby="dashboard-welcome">
        <h2 id="dashboard-welcome" style={styles.bannerTitle}>
          Bienvenue, {user?.firstName}
        </h2>
        <p style={styles.bannerText}>
          {isManager
            ? "Retrouvez ici vos demandes et celles de votre périmètre, ainsi que vos habilitations DPMG."
            : "Retrouvez ici le suivi de vos demandes DPMG et vos habilitations."}
        </p>
      </section>

      <section style={styles.statsGrid} aria-label="Statistiques des demandes">
        <div className="card" style={styles.statCard} data-testid="stat-total">
          <div style={styles.statHeader}>Total visible</div>
          {statValue(stats?.totalVisible ?? 0)}
        </div>
        <div className="card" style={styles.statCard} data-testid="stat-brouillons">
          <div style={styles.statHeader}>Brouillons</div>
          {statValue(stats?.brouillons ?? 0)}
        </div>
        <div className="card" style={styles.statCard} data-testid="stat-en-attente-validation">
          <div style={styles.statHeader}>En attente de validation hiérarchique</div>
          {statValue(stats?.enAttenteValidation ?? 0)}
        </div>
        <div className="card" style={styles.statCard} data-testid="stat-en-attente-analyse">
          <div style={styles.statHeader}>En attente d'analyse</div>
          {statValue(stats?.enAttenteAnalyse ?? 0)}
        </div>
        <div className="card" style={styles.statCard} data-testid="stat-en-attente-decision">
          <div style={styles.statHeader}>En attente de décision DPMG</div>
          {statValue(stats?.enAttenteDecision ?? 0)}
        </div>
        <div className="card" style={styles.statCard} data-testid="stat-en-attente-financement">
          <div style={styles.statHeader}>En attente de financement / contrôle DFC</div>
          {statValue(stats?.enAttenteFinancement ?? 0)}
        </div>
        <div className="card" style={styles.statCard} data-testid="stat-en-attente-execution">
          <div style={styles.statHeader}>En attente d'exécution</div>
          {statValue(stats?.enAttenteExecution ?? 0)}
        </div>
        <div className="card" style={styles.statCard} data-testid="stat-retournees">
          <div style={styles.statHeader}>Retournées</div>
          {statValue(stats?.retournees ?? 0)}
        </div>
        <div className="card" style={styles.statCard} data-testid="stat-refusees">
          <div style={styles.statHeader}>Refusées</div>
          {statValue(stats?.refusees ?? 0)}
        </div>
        <div className="card" style={styles.statCard} data-testid="stat-urgentes">
          <div style={styles.statHeader}>Demandes urgentes</div>
          {statValue(stats?.urgentes ?? 0)}
        </div>
      </section>

      <div style={styles.mainGrid}>
        <section className="card" style={styles.card} aria-labelledby="dashboard-recent" data-testid="recent-demandes">
          <h3 id="dashboard-recent" style={styles.cardTitle}>
            <span style={styles.cardTitleLeft}>
              <span style={styles.cardTitleDot} aria-hidden="true" />
              Demandes récentes
            </span>
            <Link to="/demandes" style={styles.cardLink}>
              Toutes mes demandes →
            </Link>
          </h3>

          {isLoading ? (
            <p style={styles.mutedText} role="status" aria-live="polite">
              Chargement des demandes…
            </p>
          ) : demandesError ? (
            <div style={styles.errorBox} role="alert" data-testid="demandes-error">
              <span>Impossible de charger vos demandes pour le moment.</span>
              <button type="button" style={styles.retryButton} onClick={retry}>
                Réessayer
              </button>
            </div>
          ) : demandes !== null && demandes.length === 0 ? (
            <div style={styles.recentList}>
              <p style={styles.mutedText}>
                Aucune demande pour le moment.{" "}
                <Link to="/demandes/nouvelle" style={styles.cardLink}>
                  Créer une demande
                </Link>
              </p>
            </div>
          ) : (
            <ul style={styles.recentList}>
              {recentDemandes.map((demande, index) => {
                const isOwn = demande.authorId === user?.id;
                const badge = demandeStatusBadge(demande.status);
                return (
                  <li
                    key={demande.id}
                    style={index === recentDemandes.length - 1 ? { ...styles.recentItem, ...styles.recentItemLast } : styles.recentItem}
                  >
                    <div style={styles.recentMain}>
                      <div style={styles.recentTitleRow}>
                        <span style={styles.recentReference}>{demande.reference}</span>
                        <span style={styles.recentTitle}>{demande.title}</span>
                      </div>
                      <div style={styles.recentMeta}>
                        <span
                          style={{
                            ...styles.statusBadge,
                            background: badge.background,
                            color: badge.color,
                            ...(badge.border ? { border: badge.border } : {}),
                          }}
                        >
                          {STATUS_LABELS[demande.status]}
                        </span>
                        <span>Créée le {formatDate(demande.createdAt)}</span>
                        {!isOwn && (
                          <span>
                            Par {demande.authorFirstName} {demande.authorLastName}
                          </span>
                        )}
                      </div>
                    </div>
                    <Link to={`/demandes/${demande.id}`} style={styles.recentLink}>
                      Voir →
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div style={styles.sideColumn}>
          <section className="card" style={styles.card} aria-labelledby="dashboard-shortcuts" data-testid="shortcuts">
            <h3 id="dashboard-shortcuts" style={styles.cardTitle}>
              <span style={styles.cardTitleLeft}>
                <span style={styles.cardTitleDot} aria-hidden="true" />
                Accès rapides
              </span>
            </h3>
            <ul style={styles.shortcutList}>
              <li>
                <Link to="/demandes" style={styles.shortcutItem}>
                  <span style={styles.shortcutIcon} aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                  </span>
                  <span style={styles.shortcutText}>
                    <span style={styles.shortcutLabel}>Mes demandes</span>
                    <span style={styles.shortcutHint}>
                      {isManager ? "Vos demandes et celles de votre périmètre" : "Consulter et suivre vos demandes"}
                    </span>
                  </span>
                </Link>
              </li>
              <li>
                <Link to="/demandes/nouvelle" style={styles.shortcutItem}>
                  <span style={styles.shortcutIcon} aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </span>
                  <span style={styles.shortcutText}>
                    <span style={styles.shortcutLabel}>Nouvelle demande</span>
                    <span style={styles.shortcutHint}>Créer une demande DPMG</span>
                  </span>
                </Link>
              </li>
            </ul>
          </section>

          <section className="card" style={styles.card} aria-labelledby="dashboard-habilitations" data-testid="habilitations">
            <h3 id="dashboard-habilitations" style={styles.cardTitle}>
              <span style={styles.cardTitleLeft}>
                <span style={styles.cardTitleDot} aria-hidden="true" />
                Habilitations
              </span>
            </h3>
            {roles.length === 0 ? (
              <p style={styles.mutedText}>Aucun rôle actif pour le moment.</p>
            ) : (
              <ul style={styles.roleList}>
                {roles.map((role) => (
                  <li key={`${role.role}-${role.structureId}`} style={styles.roleItem}>
                    <span style={styles.roleBadge}>{ROLE_LABELS[role.role] ?? role.role}</span>
                    <div style={styles.roleDetails}>
                      <span style={styles.roleStructure}>{role.structureName}</span>
                      <span style={styles.roleScope}>
                        {role.scope ? `Périmètre : ${role.scope}` : "Périmètre : —"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card" style={styles.card} aria-labelledby="dashboard-session" data-testid="session-info">
            <h3 id="dashboard-session" style={styles.cardTitle}>
              <span style={styles.cardTitleLeft}>
                <span style={styles.cardTitleDot} aria-hidden="true" />
                Session
              </span>
            </h3>
            <dl style={styles.infoList}>
              <div style={styles.infoRow}>
                <dt style={styles.infoLabel}>Statut</dt>
                <dd style={styles.infoValue}>
                  {user && (
                    <span
                      style={{
                        ...styles.statusBadge,
                        background: userStatusBadge(user.status).background,
                        color: userStatusBadge(user.status).color,
                      }}
                    >
                      {user.status}
                    </span>
                  )}
                </dd>
              </div>
              <div style={styles.infoRow}>
                <dt style={styles.infoLabel}>Téléphone</dt>
                <dd style={styles.infoValue}>{user?.phone ?? "Non renseigné"}</dd>
              </div>
              <div style={styles.infoRow}>
                <dt style={styles.infoLabel}>Rôles actifs</dt>
                <dd style={styles.infoValue}>{roles.length}</dd>
              </div>
              <div style={styles.infoRow}>
                <dt style={styles.infoLabel}>Membre depuis</dt>
                <dd style={styles.infoValue}>{user ? formatDate(user.createdAt) : "—"}</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
