import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { demandesApi } from "../../services/api";
import { STATUS_LABELS, formatDate } from "../demandes/demandeUi";
import type { DemandeResponse, RoleType, DemandeStatsResponse } from "@dpmg/shared/zod";

function css<T extends React.CSSProperties>(styles: T): T {
  return styles;
}

function demandeStatusBadge(status: DemandeResponse["status"]): { background: string; color: string; border?: string } {
  if (status === "BROUILLON") {
    return { background: "var(--color-secondary)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" };
  }
  return { background: "var(--color-primary-light)", color: "var(--color-primary)" };
}

// Note : la vue "Direction" correspond aux rôles HIERARCHICAL_MANAGER et DELEGATED_REPRESENTATIVE.
const DIRECTION_ROLES: readonly RoleType[] = ["HIERARCHICAL_MANAGER", "DELEGATED_REPRESENTATIVE"];
const DPMG_ROLES: readonly RoleType[] = ["DPMG_MANAGER", "DPMG_DELEGATE"];
const DFC_ROLES: readonly RoleType[] = ["DFC_CONTROLLER"];
const DEPARTMENT_ROLES: readonly RoleType[] = ["DEPARTMENT_MANAGER", "DEPARTMENT_DELEGATE"];
const CPMP_ROLES: readonly RoleType[] = ["CPMP_USER"];
const DG_ROLES: readonly RoleType[] = ["DG_USER"];
const EXECUTION_ROLES: readonly RoleType[] = ["EXECUTION_AGENT"];
const ADMIN_ROLES: readonly RoleType[] = ["SUPER_ADMIN", "TECHNICAL_ADMIN"];

export function Dashboard() {
  const { user, hasAnyRole } = useAuth();
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

  const isDirection = hasAnyRole(DIRECTION_ROLES as string[]);
  const isDpmg = hasAnyRole(DPMG_ROLES as string[]);
  const isDfc = hasAnyRole(DFC_ROLES as string[]);
  const isDepartment = hasAnyRole(DEPARTMENT_ROLES as string[]);
  const isCpmp = hasAnyRole(CPMP_ROLES as string[]);
  const isDg = hasAnyRole(DG_ROLES as string[]);
  const isExecution = hasAnyRole(EXECUTION_ROLES as string[]);
  const isAdmin = hasAnyRole(ADMIN_ROLES as string[]);

  const recentDemandes = demandes
    ? [...demandes]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5)
    : [];

  // Stat cards pertinentes selon les rôles actifs (sans doublons).
  const statCards: { key: string; label: string; value: number }[] = [];
  const addCard = (key: string, label: string, value: number) => {
    if (!statCards.some((c) => c.key === key)) statCards.push({ key, label, value });
  };
  const s = stats;
  if (isDirection || isAdmin) {
    addCard("total", "Total visible", s?.totalVisible ?? 0);
    addCard("brouillons", "Brouillons visibles", s?.brouillons ?? 0);
    addCard("en-attente-validation", "Demandes visibles à valider", s?.enAttenteValidation ?? 0);
    addCard("retournees", "Demandes visibles retournées", s?.retournees ?? 0);
    addCard("refusees", "Demandes visibles refusées", s?.refusees ?? 0);
    addCard("urgentes", "Demandes visibles urgentes", s?.urgentes ?? 0);
  }
  if (isDpmg || isAdmin) {
    addCard("en-attente-analyse", "Demandes visibles en attente d'analyse", s?.enAttenteAnalyse ?? 0);
    addCard("en-attente-decision", "Demandes visibles en attente de décision DPMG", s?.enAttenteDecision ?? 0);
    addCard("en-attente-financement", "Demandes visibles en attente de financement", s?.enAttenteFinancement ?? 0);
    addCard("en-attente-execution", "Demandes visibles en attente d'exécution", s?.enAttenteExecution ?? 0);
    addCard("en-attente-confirmation-satisfaction", "Demandes visibles à confirmer", s?.enAttenteConfirmationSatisfaction ?? 0);
    addCard("cloturees", "Demandes visibles clôturées", s?.cloturees ?? 0);
  }
  if (isDfc && !isDpmg) {
    addCard("en-attente-financement", "Demandes visibles en attente de contrôle DFC", s?.enAttenteFinancement ?? 0);
    addCard("en-attente-execution", "Demandes visibles en attente d'exécution", s?.enAttenteExecution ?? 0);
  }
  if (isDepartment && !isDpmg && !isDirection) {
    addCard("en-attente-analyse", "Demandes visibles nécessitant un avis", s?.enAttenteAnalyse ?? 0);
  }
  if (isCpmp || isDg) {
    addCard("en-attente-financement", "Demandes visibles en attente de financement", s?.enAttenteFinancement ?? 0);
    addCard("en-attente-execution", "Demandes visibles en attente d'exécution", s?.enAttenteExecution ?? 0);
    addCard("en-attente-confirmation-satisfaction", "Demandes visibles à confirmer", s?.enAttenteConfirmationSatisfaction ?? 0);
    addCard("cloturees", "Demandes visibles clôturées", s?.cloturees ?? 0);
  }
  if (isExecution && !isDpmg && !isDepartment) {
    addCard("en-attente-execution", "Demandes visibles à exécuter", s?.enAttenteExecution ?? 0);
    addCard("en-attente-confirmation-satisfaction", "Demandes visibles à confirmer", s?.enAttenteConfirmationSatisfaction ?? 0);
    addCard("cloturees", "Demandes visibles clôturées", s?.cloturees ?? 0);
  }
  if (statCards.length === 0) {
    addCard("total", "Total visible", s?.totalVisible ?? 0);
  }

  // Workflow steps adaptés, sans doublons.
  const workflowSteps: { label: string; count: number | undefined }[] = [];
  const addStep = (label: string, count: number | undefined) => {
    if (!workflowSteps.some((w) => w.label === label)) workflowSteps.push({ label, count });
  };
  if (isDirection) addStep("Validation hiérarchique", s?.enAttenteValidation);
  if (isDpmg || isDepartment) addStep("Analyse DPMG / département", s?.enAttenteAnalyse);
  if (isDpmg) addStep("Décision DPMG", s?.enAttenteDecision);
  if (isDpmg || isDfc || isCpmp || isDg) addStep("Contrôle DFC", s?.enAttenteFinancement);
  if (isDpmg || isDfc || isCpmp || isDg || isExecution) addStep("Exécution", s?.enAttenteExecution);
  if (isDpmg || isCpmp || isDg || isExecution) addStep("Confirmation", s?.enAttenteConfirmationSatisfaction);
  if (workflowSteps.length === 0) {
    addStep("Validation hiérarchique", s?.enAttenteValidation);
    addStep("Analyse DPMG", s?.enAttenteAnalyse);
  }

  const subtitle = isDirection
    ? "Retrouvez ici vos demandes, celles de votre structure et les validations hiérarchiques."
    : isDpmg
    ? "Retrouvez ici les demandes reçues, analyses, décisions DPMG, contrôles DFC et consolidations."
    : isDfc
    ? "Retrouvez ici les demandes en attente de contrôle et les contrôles effectués."
    : isDepartment
    ? "Retrouvez ici les demandes nécessitant un avis et celles de votre département."
    : isCpmp
    ? "Retrouvez ici les demandes transmises, observations CPMP, devis et prestataires."
    : isDg
    ? "Retrouvez ici les demandes transmises, observations DG et suivi des statuts autorisés."
    : isExecution
    ? "Retrouvez ici les demandes à exécuter, les confirmations de satisfaction et les exécutions récentes."
    : isAdmin
    ? "Supervision : utilisateurs, structures, habilitations, statistiques et journaux d'administration."
    : "Retrouvez ici le suivi de vos demandes DPMG.";

  const styles = {
    container: css({ display: "flex", flexDirection: "column", gap: "1.25rem" }),
    banner: css({ padding: "1.25rem 1.5rem", background: "var(--color-primary-light)", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)" }),
    bannerTitle: css({ fontSize: "1.25rem", fontWeight: 600, color: "var(--color-text)", marginBottom: "0.25rem" }),
    bannerText: css({ color: "var(--color-text-muted)", fontSize: "0.9375rem", margin: 0 }),
    statsGrid: css({ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))", gap: "1rem" }),
    statCard: css({ padding: "1.25rem", minHeight: "104px", display: "flex", flexDirection: "column", gap: "0.375rem" }),
    statHeader: css({ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--color-text-muted)", fontSize: "0.8125rem", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.04em" }),
    statValue: css({ fontSize: "1.75rem", fontWeight: 700, color: "var(--color-text)", lineHeight: 1.2, fontVariantNumeric: "tabular-nums" as const }),
    statValueMuted: css({ fontSize: "1.75rem", fontWeight: 700, color: "var(--color-text-muted)", lineHeight: 1.2 }),
    mainGrid: css({ display: "grid", gridTemplateColumns: isWide ? "minmax(0, 1.6fr) minmax(0, 1fr)" : "minmax(0, 1fr)", gap: "1.25rem", alignItems: "start" }),
    sideColumn: css({ display: "flex", flexDirection: "column", gap: "1.25rem", minWidth: 0 }),
    card: css({ padding: "1.25rem 1.5rem", minWidth: 0 }),
    cardTitle: css({ fontSize: "1rem", fontWeight: 600, color: "var(--color-text)", marginBottom: "1rem", paddingBottom: "0.75rem", borderBottom: "1px solid var(--color-border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }),
    cardTitleLeft: css({ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }),
    cardTitleDot: css({ width: "8px", height: "8px", borderRadius: "50%", background: "var(--color-primary)", flexShrink: 0 }),
    cardLink: css({ color: "var(--color-primary)", fontSize: "0.8125rem", fontWeight: 500, whiteSpace: "nowrap" as const, textDecoration: "none" }),
    mutedText: css({ color: "var(--color-text-muted)", fontStyle: "italic", margin: 0 }),
    errorBox: css({ display: "flex", flexDirection: "column" as const, gap: "0.75rem", alignItems: "flex-start", padding: "0.875rem 1rem", background: "var(--color-error-light)", borderRadius: "var(--radius-md)", color: "var(--color-error)", fontSize: "0.875rem" }),
    retryButton: css({ padding: "0.375rem 0.875rem", border: "1px solid currentColor", borderRadius: "var(--radius-md)", background: "transparent", color: "inherit", fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer" }),
    recentList: css({ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" as const, minHeight: "220px" }),
    recentItem: css({ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", padding: "0.75rem 0", borderBottom: "1px solid var(--color-border)", minHeight: "64px" }),
    recentItemLast: css({ borderBottom: "none" }),
    recentMain: css({ display: "flex", flexDirection: "column" as const, gap: "0.25rem", minWidth: 0 }),
    recentTitleRow: css({ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }),
    recentTitle: css({ fontSize: "0.9375rem", fontWeight: 500, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }),
    recentReference: css({ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-primary)", whiteSpace: "nowrap" as const, fontVariantNumeric: "tabular-nums" as const }),
    recentMeta: css({ fontSize: "0.8125rem", color: "var(--color-text-muted)", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" as const }),
    statusBadge: css({ display: "inline-block", padding: "0.125rem 0.625rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 600, whiteSpace: "nowrap" as const }),
    recentLink: css({ color: "var(--color-primary)", fontSize: "0.8125rem", fontWeight: 600, whiteSpace: "nowrap" as const, textDecoration: "none", flexShrink: 0 }),
    shortcutList: css({ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }),
    shortcutItem: css({ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem", background: "var(--color-secondary)", borderRadius: "var(--radius-md)", color: "var(--color-text)", textDecoration: "none", transition: "background-color var(--transition)" }),
    shortcutIcon: css({ width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-primary-light)", color: "var(--color-primary)", borderRadius: "var(--radius-md)", flexShrink: 0 }),
    shortcutText: css({ display: "flex", flexDirection: "column", gap: "0.125rem", minWidth: 0 }),
    shortcutLabel: css({ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-text)" }),
    shortcutHint: css({ fontSize: "0.75rem", color: "var(--color-text-muted)" }),
  };

  const statValue = (value: number) =>
    isLoading || demandesError || isStatsLoading || statsError ? (
      <span style={styles.statValueMuted} data-testid="stat-loading">—</span>
    ) : (
      <span style={styles.statValue}>{value}</span>
    );

  // Quick actions adaptés aux rôles.
  const shortcuts: { to: string; label: string; hint: string }[] = [];
  const addShortcut = (to: string, label: string, hint: string) => {
    if (!shortcuts.some((s) => s.to === to && s.label === label)) shortcuts.push({ to, label, hint });
  };
  addShortcut("/demandes", "Mes demandes", isDirection || isDepartment || isDpmg ? "Vos demandes et celles de votre périmètre" : "Consulter et suivre vos demandes");
  addShortcut("/demandes/nouvelle", "Nouvelle demande", "Créer une demande DPMG");
  if (isDpmg || isAdmin) {
    addShortcut("/consolidations", "Consolidations", "Gérer les consolidations");
    addShortcut("/rapports", "Rapports", "Consulter les rapports");
  }
  if (isCpmp) addShortcut("/cpmp", "Espace CPMP", "Observations, devis et prestataires");
  if (isDg) addShortcut("/dg", "Espace DG", "Observations et suivi");
  if (isAdmin) {
    addShortcut("/utilisateurs", "Utilisateurs", "Gérer les utilisateurs et habilitations");
    addShortcut("/structures", "Structures", "Gérer les structures");
    addShortcut("/departements", "Départements", "Gérer les départements");
    addShortcut("/utilisateurs/audit", "Journaux d'administration", "Consulter les audits");
  }

  return (
    <div style={styles.container}>
      <section style={styles.banner} aria-labelledby="dashboard-welcome">
        <h2 id="dashboard-welcome" style={styles.bannerTitle}>
          Bienvenue, {user?.firstName}
        </h2>
        <p style={styles.bannerText}>{subtitle}</p>
      </section>

      <section style={styles.statsGrid} aria-label="Statistiques des demandes">
        {statCards.map((card) => (
          <div className="card" style={styles.statCard} data-testid={`stat-${card.key}`} key={card.key}>
            <div style={styles.statHeader}>{card.label}</div>
            {statValue(card.value)}
          </div>
        ))}
      </section>

      <section className="card dashboard-workflow" aria-label="Avancement du workflow des demandes">
        <div className="dashboard-workflow-heading">
          <h3>Avancement du workflow</h3>
          <Link to="/demandes">Voir les demandes →</Link>
        </div>
        <ol className="dashboard-workflow-steps">
          {workflowSteps.map(({ label, count }, index) => (
            <li key={label} className="dashboard-workflow-step">
              <span className={`dashboard-workflow-marker step-${index}`} aria-hidden="true" />
              <span className="dashboard-workflow-label">{label}</span>
              <span className="dashboard-workflow-count">
                {isLoading || isStatsLoading || statsError ? "—" : count}
              </span>
            </li>
          ))}
        </ol>
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
              {shortcuts.map((sc) => (
                <li key={`${sc.to}-${sc.label}`}>
                  <Link to={sc.to} style={styles.shortcutItem}>
                    <span style={styles.shortcutIcon} aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    </span>
                    <span style={styles.shortcutText}>
                      <span style={styles.shortcutLabel}>{sc.label}</span>
                      <span style={styles.shortcutHint}>{sc.hint}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;