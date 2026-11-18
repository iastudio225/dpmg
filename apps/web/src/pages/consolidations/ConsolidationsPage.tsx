import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { consolidationsApi, demandesApi, ApiError } from "../../services/api";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { STATUS_LABELS, formatDate } from "../demandes/demandeUi";
import type {
  ConsolidationAvisCompletenessResponse,
  ConsolidationObservationResponse,
  ConsolidationResponse,
  ConsolidationStatus,
  DemandeResponse,
} from "@dpmg/shared";

function css<T extends React.CSSProperties>(styles: T): T {
  return styles;
}

const CONSOLIDATION_STATUS_LABELS: Record<ConsolidationStatus, string> = {
  BROUILLON: "Brouillon",
  TRANSMISE: "Transmise",
};

function errMsg(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return "Session expirée. Veuillez vous reconnecter.";
    return err.message || "Une erreur est survenue";
  }
  return "Erreur de connexion au serveur";
}

function hasAvis(d: DemandeResponse): boolean {
  return Boolean(d.departmentAvisMotif || d.departmentAvisCommentaire);
}

export function ConsolidationsPage() {
  const { refreshUser } = useAuth();
  const isNarrow = useMediaQuery("(max-width: 768px)");

  // Liste
  const [items, setItems] = useState<ConsolidationResponse[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [statusFilter, setStatusFilter] = useState<ConsolidationStatus | "">("");
  const [search, setSearch] = useState("");

  // Détail
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConsolidationResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [avis, setAvis] = useState<ConsolidationAvisCompletenessResponse | null>(null);
  const [observations, setObservations] = useState<ConsolidationObservationResponse[] | null>(null);
  const [obsInput, setObsInput] = useState("");
  const [obsError, setObsError] = useState<string | null>(null);
  const [obsLoading, setObsLoading] = useState(false);

  // Sélecteur de demandes (création / ajout)
  const [demandes, setDemandes] = useState<DemandeResponse[]>([]);
  const [demandesLoading, setDemandesLoading] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  // Formulaire de création
  const [showNew, setShowNew] = useState(false);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  // Ajout de demandes au brouillon courant
  const [showAdd, setShowAdd] = useState(false);
  const [addSelected, setAddSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  // Confirmations
  const [confirmTransmit, setConfirmTransmit] = useState(false);
  const [transmitting, setTransmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await consolidationsApi.list());
    } catch (err) {
      setItems(null);
      setError(errMsg(err));
      if (err instanceof ApiError && err.status === 401) {
        refreshUser().catch(() => {
          /* la redirection login est gérée par PrivateRoute */
        });
      }
    } finally {
      setLoading(false);
    }
  }, [refreshUser]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const refreshAvis = useCallback(async (consolidationId: string) => {
    try {
      setAvis(await consolidationsApi.getAvisCompleteness(consolidationId));
    } catch {
      setAvis(null);
    }
  }, []);

  const openDetail = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setDetail(null);
      setAvis(null);
      setObservations(null);
      setActionError(null);
      setConfirmTransmit(false);
      setConfirmDelete(false);
      setShowAdd(false);
      setDetailLoading(true);
      try {
        const consolidation = await consolidationsApi.get(id);
        setDetail(consolidation);
        void refreshAvis(id);
        // Les observations n'existent que pour une consolidation transmise
        // (404 sinon) et sont réservées aux habilitations DG/CPMP (403 sinon).
        if (consolidation.status === "TRANSMISE") {
          try {
            setObservations(await consolidationsApi.listObservations(id));
          } catch {
            setObservations(null);
          }
        }
      } catch (err) {
        setError(errMsg(err));
        setSelectedId(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [refreshAvis]
  );

  const closeDetail = () => {
    setSelectedId(null);
    setDetail(null);
    setAvis(null);
    setObservations(null);
    setActionError(null);
    setConfirmTransmit(false);
    setConfirmDelete(false);
    setShowAdd(false);
  };

  const openPicker = async (mode: "new" | "add") => {
    setActionError(null);
    setPickerSearch("");
    if (mode === "new") {
      setShowNew(true);
      setShowAdd(false);
      setSelected(new Set());
    } else {
      setShowAdd(true);
      setShowNew(false);
      setAddSelected(new Set());
    }
    setDemandesLoading(true);
    try {
      setDemandes(await demandesApi.list());
    } catch {
      setDemandes([]);
    } finally {
      setDemandesLoading(false);
    }
  };

  const toggle = (
    id: string,
    setter: React.Dispatch<React.SetStateAction<Set<string>>>
  ) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const periodValid = Boolean(periodStart && periodEnd && periodStart <= periodEnd);

  const create = async () => {
    if (selected.size === 0 || !periodValid) return;
    setCreating(true);
    setActionError(null);
    try {
      const consolidation = await consolidationsApi.create({
        periodStart: new Date(periodStart).toISOString(),
        periodEnd: new Date(periodEnd).toISOString(),
      });
      await consolidationsApi.addDemandes(consolidation.id, {
        demandeIds: Array.from(selected),
      });
      setShowNew(false);
      setSelected(new Set());
      setPeriodStart("");
      setPeriodEnd("");
      await load();
      await openDetail(consolidation.id);
    } catch (err) {
      setActionError(errMsg(err));
    } finally {
      setCreating(false);
    }
  };

  const addDemandes = async () => {
    if (!detail || addSelected.size === 0) return;
    setAdding(true);
    setActionError(null);
    try {
      const updated = await consolidationsApi.addDemandes(detail.id, {
        demandeIds: Array.from(addSelected),
      });
      setDetail(updated);
      setAddSelected(new Set());
      setShowAdd(false);
      void refreshAvis(updated.id);
      await load();
    } catch (err) {
      setActionError(errMsg(err));
    } finally {
      setAdding(false);
    }
  };

  const removeDemande = async (demandeId: string) => {
    if (!detail) return;
    setActionError(null);
    try {
      const updated = await consolidationsApi.removeDemande(detail.id, demandeId);
      setDetail(updated);
      void refreshAvis(updated.id);
      await load();
    } catch (err) {
      setActionError(errMsg(err));
    }
  };

  const transmit = async () => {
    if (!detail) return;
    setTransmitting(true);
    setActionError(null);
    try {
      const updated = await consolidationsApi.transmit(detail.id);
      setDetail(updated);
      setConfirmTransmit(false);
      await load();
      try {
        setObservations(await consolidationsApi.listObservations(updated.id));
      } catch {
        setObservations(null);
      }
    } catch (err) {
      setActionError(errMsg(err));
    } finally {
      setTransmitting(false);
    }
  };

  const removeConsolidation = async () => {
    if (!detail) return;
    setDeleting(true);
    setActionError(null);
    try {
      await consolidationsApi.delete(detail.id);
      closeDetail();
      await load();
    } catch (err) {
      setActionError(errMsg(err));
    } finally {
      setDeleting(false);
    }
  };

  const submitObservation = async () => {
    if (!detail || obsInput.trim() === "") return;
    setObsLoading(true);
    setObsError(null);
    try {
      const created = await consolidationsApi.addObservation(detail.id, obsInput.trim());
      setObservations((prev) => [...(prev ?? []), created]);
      setObsInput("");
    } catch (err) {
      setObsError(errMsg(err));
    } finally {
      setObsLoading(false);
    }
  };

  const filteredItems = (items ?? []).filter((c) => {
    if (statusFilter && c.status !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    if (q && !c.reference.toLowerCase().includes(q)) return false;
    return true;
  });

  const brouillons = (items ?? []).filter((c) => c.status === "BROUILLON").length;
  const transmises = (items ?? []).filter((c) => c.status === "TRANSMISE").length;

  /** Demandes éligibles à une sélection (brouillons non soumis exclus). */
  const eligibleDemandes = demandes.filter((d) => d.status !== "BROUILLON");
  const pickerFiltered = eligibleDemandes.filter((d) => {
    const q = pickerSearch.trim().toLowerCase();
    if (q && !d.reference.toLowerCase().includes(q) && !d.title.toLowerCase().includes(q)) {
      return false;
    }
    return true;
  });

  /** Une demande déjà rattachée à une AUTRE consolidation est indisponible. */
  const isTaken = (d: DemandeResponse): boolean =>
    d.consolidationId !== null && d.consolidationId !== detail?.id;

  const isBrouillon = detail?.status === "BROUILLON";
  const isTransmise = detail?.status === "TRANSMISE";
  const avisIncomplete = avis !== null && !avis.complete;

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
    searchInput: css({
      padding: "0.5rem 0.75rem",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-md)",
      fontSize: "0.875rem",
      color: "var(--color-text)",
      background: "var(--color-background)",
      minWidth: "200px",
    }),
    primaryButton: css({
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
      cursor: "pointer",
      whiteSpace: "nowrap" as const,
      alignSelf: isNarrow ? ("stretch" as const) : undefined,
    }),
    secondaryButton: css({
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "0.5rem",
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
    dangerButton: css({
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "0.5rem",
      padding: "0.625rem 1.25rem",
      background: "transparent",
      color: "var(--color-error, #b91c1c)",
      border: "1px solid rgba(235, 87, 87, 0.45)",
      borderRadius: "var(--radius-md)",
      fontSize: "0.9375rem",
      fontWeight: 500,
      cursor: "pointer",
      whiteSpace: "nowrap" as const,
    }),
    smallButton: css({
      padding: "0.375rem 0.875rem",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-md)",
      background: "transparent",
      color: "var(--color-primary)",
      fontSize: "0.875rem",
      fontWeight: 500,
      cursor: "pointer",
      whiteSpace: "nowrap" as const,
    }),
    smallDangerButton: css({
      padding: "0.375rem 0.875rem",
      border: "1px solid rgba(235, 87, 87, 0.45)",
      borderRadius: "var(--radius-md)",
      background: "transparent",
      color: "var(--color-error, #b91c1c)",
      fontSize: "0.875rem",
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
    card: css({
      padding: 0,
      overflow: "hidden",
      marginBottom: "1.5rem",
    }),
    paddedCard: css({
      padding: "1.25rem",
      marginBottom: "1.5rem",
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
      whiteSpace: "nowrap" as const,
    }),
    td: css({
      padding: "0.875rem 1.25rem",
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
      maxWidth: "320px",
      overflow: "hidden",
      textOverflow: "ellipsis" as const,
      whiteSpace: "nowrap" as const,
    }),
    statusBadge: css({
      display: "inline-block",
      padding: "0.125rem 0.625rem",
      borderRadius: "999px",
      fontSize: "0.75rem",
      fontWeight: 600,
      whiteSpace: "nowrap" as const,
    }),
    statusBrouillon: css({
      background: "var(--color-secondary)",
      color: "var(--color-text-muted)",
      border: "1px solid var(--color-border)",
    }),
    statusTransmise: css({
      background: "#e8f7ef",
      color: "var(--color-success, #16a34a)",
      border: "1px solid rgba(22, 163, 74, 0.3)",
    }),
    avisYes: css({
      display: "inline-block",
      padding: "0.125rem 0.5rem",
      borderRadius: "999px",
      fontSize: "0.75rem",
      fontWeight: 600,
      background: "#e8f7ef",
      color: "var(--color-success, #16a34a)",
    }),
    avisNo: css({
      display: "inline-block",
      padding: "0.125rem 0.5rem",
      borderRadius: "999px",
      fontSize: "0.75rem",
      fontWeight: 600,
      background: "#fff7ed",
      color: "#c2410c",
      border: "1px solid rgba(194, 65, 12, 0.3)",
    }),
    takenTag: css({
      display: "inline-block",
      padding: "0.125rem 0.5rem",
      borderRadius: "999px",
      fontSize: "0.75rem",
      fontWeight: 600,
      background: "var(--color-secondary)",
      color: "var(--color-text-muted)",
      border: "1px solid var(--color-border)",
      whiteSpace: "nowrap" as const,
    }),
    errorBox: css({
      display: "flex",
      alignItems: "center",
      gap: "0.5rem",
      padding: "0.875rem 1rem",
      background: "var(--color-error-light, #fee2e2)",
      border: "1px solid rgba(235, 87, 87, 0.35)",
      borderRadius: "var(--radius-md)",
      color: "var(--color-error, #b91c1c)",
      fontSize: "0.875rem",
      marginBottom: "1.5rem",
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
    spinner: css({
      width: "24px",
      height: "24px",
      border: "2px solid var(--color-border)",
      borderTopColor: "var(--color-primary)",
      borderRadius: "50%",
      animation: "spin 1s linear infinite",
    }),
    detailHeader: css({
      display: "flex",
      alignItems: isNarrow ? ("stretch" as const) : ("center" as const),
      justifyContent: "space-between",
      flexDirection: isNarrow ? ("column" as const) : ("row" as const),
      gap: "1rem",
      padding: "1.25rem",
      borderBottom: "1px solid var(--color-border)",
      background: "var(--color-secondary)",
    }),
    detailTitle: css({
      display: "flex",
      alignItems: "center",
      gap: "0.75rem",
      flexWrap: "wrap" as const,
      fontSize: "1.125rem",
      fontWeight: 700,
    }),
    detailActions: css({
      display: "flex",
      gap: "0.5rem",
      flexWrap: "wrap" as const,
    }),
    metaRow: css({
      display: "flex",
      gap: "1.5rem",
      flexWrap: "wrap" as const,
      padding: "1rem 1.25rem",
      fontSize: "0.875rem",
      color: "var(--color-text-muted)",
      borderBottom: "1px solid var(--color-border)",
    }),
    metaLabel: css({
      fontWeight: 600,
      color: "var(--color-text)",
      marginRight: "0.375rem",
    }),
    section: css({
      padding: "1.25rem",
      borderBottom: "1px solid var(--color-border)",
    }),
    sectionTitle: css({
      fontSize: "1rem",
      fontWeight: 600,
      marginBottom: "0.75rem",
    }),
    avisOk: css({
      padding: "0.75rem 1rem",
      borderRadius: "var(--radius-md)",
      background: "#e8f7ef",
      color: "var(--color-success, #16a34a)",
      fontSize: "0.875rem",
      fontWeight: 500,
      marginBottom: "1rem",
    }),
    avisWarn: css({
      padding: "0.75rem 1rem",
      borderRadius: "var(--radius-md)",
      background: "#fff7ed",
      color: "#c2410c",
      border: "1px solid rgba(194, 65, 12, 0.3)",
      fontSize: "0.875rem",
      marginBottom: "1rem",
    }),
    confirmBox: css({
      padding: "1rem 1.25rem",
      marginBottom: "1.5rem",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-md)",
      background: "var(--color-secondary)",
    }),
    confirmText: css({
      fontSize: "0.9375rem",
      marginBottom: "0.75rem",
    }),
    confirmActions: css({
      display: "flex",
      gap: "0.5rem",
      flexWrap: "wrap" as const,
    }),
    formRow: css({
      display: "flex",
      gap: "0.75rem",
      flexWrap: "wrap" as const,
      alignItems: "flex-end",
      marginBottom: "1rem",
    }),
    formGroup: css({
      display: "flex",
      flexDirection: "column" as const,
      gap: "0.25rem",
    }),
    formLabel: css({
      fontSize: "0.75rem",
      fontWeight: 500,
      color: "var(--color-text-muted)",
    }),
    counter: css({
      fontSize: "0.875rem",
      color: "var(--color-text-muted)",
      marginBottom: "0.5rem",
    }),
    observationItem: css({
      padding: "0.75rem 0",
      borderBottom: "1px solid var(--color-border)",
      fontSize: "0.9375rem",
    }),
    observationMeta: css({
      fontSize: "0.75rem",
      color: "var(--color-text-muted)",
      marginTop: "0.25rem",
    }),
    obsTextarea: css({
      width: "100%",
      minHeight: "80px",
      padding: "0.625rem 0.75rem",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-md)",
      fontSize: "0.9375rem",
      color: "var(--color-text)",
      background: "var(--color-background)",
      resize: "vertical" as const,
      marginBottom: "0.75rem",
      fontFamily: "inherit",
    }),
    emptyPicker: css({
      padding: "2rem 1rem",
      textAlign: "center" as const,
      color: "var(--color-text-muted)",
      fontSize: "0.9375rem",
    }),
    scrollX: css({
      overflowX: "auto" as const,
    }),
    backLink: css({
      display: "inline-flex",
      alignItems: "center",
      gap: "0.375rem",
      padding: "0.375rem 0.875rem",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-md)",
      color: "var(--color-primary)",
      fontSize: "0.875rem",
      fontWeight: 500,
      background: "transparent",
      cursor: "pointer",
      marginBottom: "1rem",
    }),
  };

  const statusBadgeStyle = (status: ConsolidationStatus) =>
    status === "TRANSMISE" ? styles.statusTransmise : styles.statusBrouillon;

  const renderPicker = (mode: "new" | "add") => {
    const chosen = mode === "new" ? selected : addSelected;
    const setChosen = mode === "new" ? setSelected : setAddSelected;
    return (
      <div style={styles.paddedCard} className="card">
        <h2 style={styles.sectionTitle}>
          {mode === "new" ? "Nouvelle consolidation" : "Ajouter des demandes"}
        </h2>

        {mode === "new" && (
          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.formLabel} htmlFor="cons-period-start">
                Période — du
              </label>
              <input
                id="cons-period-start"
                type="date"
                style={styles.select}
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.formLabel} htmlFor="cons-period-end">
                au
              </label>
              <input
                id="cons-period-end"
                type="date"
                style={styles.select}
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
            {periodStart && periodEnd && !periodValid && (
              <span style={{ color: "var(--color-error, #b91c1c)", fontSize: "0.8125rem" }}>
                La date de fin doit être postérieure ou égale à la date de début.
              </span>
            )}
          </div>
        )}

        <div style={styles.formRow}>
          <div style={styles.formGroup}>
            <label style={styles.formLabel} htmlFor="cons-picker-search">
              Rechercher (référence ou titre)
            </label>
            <input
              id="cons-picker-search"
              type="search"
              style={styles.searchInput}
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              placeholder="Ex. : DEM-2026…"
            />
          </div>
        </div>

        <p style={styles.counter}>
          {chosen.size} demande(s) sélectionnée(s) — les demandes déjà rattachées à une autre
          consolidation sont indisponibles.
        </p>

        {demandesLoading ? (
          <div style={styles.stateBox} role="status">
            <div style={styles.spinner} aria-hidden="true" />
            <p>Chargement des demandes…</p>
          </div>
        ) : pickerFiltered.length === 0 ? (
          <div style={styles.emptyPicker}>
            Aucune demande éligible (les brouillons non soumis sont exclus).
          </div>
        ) : (
          <div style={styles.scrollX}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Sélection</th>
                  <th style={styles.th}>Référence</th>
                  <th style={styles.th}>Titre</th>
                  <th style={styles.th}>Département</th>
                  <th style={styles.th}>Statut</th>
                  <th style={styles.th}>Avis dept.</th>
                </tr>
              </thead>
              <tbody>
                {pickerFiltered.map((d) => {
                  const taken = isTaken(d);
                  return (
                    <tr key={d.id} style={taken ? { opacity: 0.55 } : undefined}>
                      <td style={styles.td}>
                        <input
                          type="checkbox"
                          aria-label={`Sélectionner ${d.reference}`}
                          checked={chosen.has(d.id)}
                          disabled={taken}
                          onChange={() => toggle(d.id, setChosen)}
                        />
                      </td>
                      <td style={styles.td}>
                        <span style={styles.reference}>{d.reference}</span>
                      </td>
                      <td style={styles.td}>
                        <span style={styles.title} title={d.title}>
                          {d.title}
                        </span>
                      </td>
                      <td style={styles.td}>{d.departmentName}</td>
                      <td style={styles.td}>{STATUS_LABELS[d.status]}</td>
                      <td style={styles.td}>
                        {taken ? (
                          <span style={styles.takenTag}>Déjà consolidée</span>
                        ) : hasAvis(d) ? (
                          <span style={styles.avisYes}>Enregistré</span>
                        ) : (
                          <span style={styles.avisNo}>Manquant</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {actionError && (
          <div style={{ ...styles.errorBox, marginTop: "1rem", marginBottom: 0 }} role="alert">
            {actionError}
          </div>
        )}

        <div style={{ ...styles.confirmActions, marginTop: "1rem" }}>
          <button
            type="button"
            style={styles.primaryButton}
            disabled={
              mode === "new"
                ? creating || chosen.size === 0 || !periodValid
                : adding || chosen.size === 0
            }
            onClick={mode === "new" ? create : addDemandes}
          >
            {mode === "new"
              ? creating
                ? "Création…"
                : "Créer le brouillon"
              : adding
                ? "Ajout…"
                : `Ajouter (${chosen.size})`}
          </button>
          <button
            type="button"
            style={styles.secondaryButton}
            onClick={() => {
              setShowNew(false);
              setShowAdd(false);
              setActionError(null);
            }}
          >
            Annuler
          </button>
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* ---------- Détail ---------- */}
      {selectedId && (
        <div>
          <button type="button" style={styles.backLink} onClick={closeDetail}>
            ← Retour aux consolidations
          </button>

          {detailLoading && !detail && (
            <div className="card" style={styles.stateBox} role="status">
              <div style={styles.spinner} aria-hidden="true" />
              <p>Chargement de la consolidation…</p>
            </div>
          )}

          {detail && (
            <div className="card" style={{ ...styles.card, marginBottom: "1rem" }}>
              <div style={styles.detailHeader}>
                <div style={styles.detailTitle}>
                  <span>{detail.reference}</span>
                  <span style={statusBadgeStyle(detail.status)}>
                    {CONSOLIDATION_STATUS_LABELS[detail.status]}
                  </span>
                </div>
                <div style={styles.detailActions}>
                  {isBrouillon && (
                    <button
                      type="button"
                      style={styles.secondaryButton}
                      onClick={() => openPicker("add")}
                    >
                      Ajouter des demandes
                    </button>
                  )}
                  {isBrouillon && (
                    <button
                      type="button"
                      style={styles.primaryButton}
                      onClick={() => setConfirmTransmit(true)}
                    >
                      Transmettre
                    </button>
                  )}
                  {isBrouillon && (
                    <button
                      type="button"
                      style={styles.dangerButton}
                      onClick={() => setConfirmDelete(true)}
                    >
                      Supprimer
                    </button>
                  )}
                </div>
              </div>

              <div style={styles.metaRow}>
                <span>
                  <span style={styles.metaLabel}>Période</span>
                  {formatDate(detail.periodStart)} → {formatDate(detail.periodEnd)}
                </span>
                <span>
                  <span style={styles.metaLabel}>Créée le</span>
                  {formatDate(detail.createdAt)}
                </span>
                {detail.transmittedAt && (
                  <span>
                    <span style={styles.metaLabel}>Transmise le</span>
                    {formatDate(detail.transmittedAt)}
                  </span>
                )}
                <span>
                  <span style={styles.metaLabel}>Demandes</span>
                  {detail.demandes.length}
                </span>
              </div>

              {actionError && (
                <div style={{ ...styles.errorBox, margin: "1.25rem 1.25rem 0" }} role="alert">
                  {actionError}
                </div>
              )}

              {/* Confirmation transmission */}
              {confirmTransmit && (
                <div style={{ ...styles.confirmBox, margin: "1.25rem" }}>
                  <p style={styles.confirmText}>
                    Vous êtes sur le point de transmettre la consolidation{" "}
                    <strong>{detail.reference}</strong> ({detail.demandes.length} demande(s)).
                    Après transmission, son contenu ne pourra plus être modifié.
                  </p>
                  {avis && avisIncomplete && (
                    <p style={{ ...styles.confirmText, color: "#c2410c" }}>
                      Transmission impossible pour l'instant : {avis.demandesSansAvis} demande(s)
                      sans avis départemental
                      {avis.avisManquants.length > 0 && (
                        <> ({avis.avisManquants.map((a) => a.departmentCode).join(", ")})</>
                      )}
                      . Les avis doivent être enregistrés avant transmission.
                    </p>
                  )}
                  <div style={styles.confirmActions}>
                    <button
                      type="button"
                      style={styles.primaryButton}
                      disabled={transmitting || (avis !== null && avisIncomplete)}
                      onClick={transmit}
                    >
                      {transmitting ? "Transmission…" : "Confirmer la transmission"}
                    </button>
                    <button
                      type="button"
                      style={styles.secondaryButton}
                      onClick={() => setConfirmTransmit(false)}
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}

              {/* Confirmation suppression */}
              {confirmDelete && (
                <div style={{ ...styles.confirmBox, margin: "1.25rem" }}>
                  <p style={styles.confirmText}>
                    Supprimer la brouillon <strong>{detail.reference}</strong> ? Les demandes
                    rattachées seront détachées. Cette action est définitive.
                  </p>
                  <div style={styles.confirmActions}>
                    <button
                      type="button"
                      style={styles.dangerButton}
                      disabled={deleting}
                      onClick={removeConsolidation}
                    >
                      {deleting ? "Suppression…" : "Confirmer la suppression"}
                    </button>
                    <button
                      type="button"
                      style={styles.secondaryButton}
                      onClick={() => setConfirmDelete(false)}
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}

              {/* Complétude des avis */}
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>Avis départementaux</h3>
                {avis === null ? (
                  <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
                    Information de complétude indisponible.
                  </p>
                ) : avis.complete ? (
                  <div style={styles.avisOk} data-testid="avis-complete">
                    Tous les avis sont enregistrés : {avis.demandesAvecAvis}/
                    {avis.totalDemandes}.
                  </div>
                ) : (
                  <div style={styles.avisWarn} data-testid="avis-incomplete">
                    {avis.demandesAvecAvis}/{avis.totalDemandes} avis enregistrés —{" "}
                    {avis.demandesSansAvis} demande(s) en attente d'avis :
                    <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
                      {avis.avisManquants.map((a) => (
                        <li key={a.demandeId}>
                          {a.departmentCode} — {a.departmentName}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Demandes rattachées */}
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>
                  Demandes consolidées ({detail.demandes.length})
                </h3>
                {detail.demandes.length === 0 ? (
                  <p style={{ fontSize: "0.9375rem", color: "var(--color-text-muted)" }}>
                    Aucune demande rattachée. Utilisez « Ajouter des demandes ».
                  </p>
                ) : (
                  <div style={styles.scrollX}>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th style={styles.th}>Référence</th>
                          <th style={styles.th}>Titre</th>
                          <th style={styles.th}>Département</th>
                          <th style={styles.th}>Statut</th>
                          <th style={styles.th}>Avis dept.</th>
                          <th style={styles.th}>Auteur</th>
                          {isBrouillon && <th style={styles.th}>Action</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {detail.demandes.map((d) => (
                          <tr key={d.id}>
                            <td style={styles.td}>
                              <span style={styles.reference}>{d.reference}</span>
                            </td>
                            <td style={styles.td}>
                              <span style={styles.title} title={d.title}>
                                {d.title}
                              </span>
                            </td>
                            <td style={styles.td}>{d.departmentName}</td>
                            <td style={styles.td}>{STATUS_LABELS[d.status]}</td>
                            <td style={styles.td}>
                              {hasAvis(d) ? (
                                <span style={styles.avisYes}>Enregistré</span>
                              ) : (
                                <span style={styles.avisNo}>Manquant</span>
                              )}
                            </td>
                            <td style={styles.td}>
                              {d.authorFirstName} {d.authorLastName}
                            </td>
                            {isBrouillon && (
                              <td style={styles.td}>
                                <button
                                  type="button"
                                  style={styles.smallDangerButton}
                                  onClick={() => removeDemande(d.id)}
                                >
                                  Retirer
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Observations DG / CPMP (uniquement après transmission) */}
              {isTransmise && observations !== null && (
                <div style={{ ...styles.section, borderBottom: "none" }}>
                  <h3 style={styles.sectionTitle}>Observations DG / CPMP</h3>
                  {observations.length === 0 ? (
                    <p style={{ fontSize: "0.9375rem", color: "var(--color-text-muted)" }}>
                      Aucune observation pour l'instant.
                    </p>
                  ) : (
                    <div>
                      {observations.map((o) => (
                        <div key={o.id} style={styles.observationItem}>
                          <div>{o.commentaire}</div>
                          <div style={styles.observationMeta}>
                            {o.role === "DG_USER" ? "DG" : o.role === "CPMP_USER" ? "CPMP" : o.role}{" "}
                            — {new Date(o.createdAt).toLocaleString("fr-FR")}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ marginTop: "1rem" }}>
                    <textarea
                      style={styles.obsTextarea}
                      value={obsInput}
                      onChange={(e) => setObsInput(e.target.value)}
                      placeholder="Ajouter une observation…"
                      maxLength={2000}
                    />
                    {obsError && (
                      <div style={{ ...styles.errorBox, marginBottom: "0.75rem" }} role="alert">
                        {obsError}
                      </div>
                    )}
                    <button
                      type="button"
                      style={styles.primaryButton}
                      disabled={obsLoading || obsInput.trim() === ""}
                      onClick={submitObservation}
                    >
                      {obsLoading ? "Envoi…" : "Publier l'observation"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {showAdd && renderPicker("add")}
        </div>
      )}

      {/* ---------- Liste ---------- */}
      {!selectedId && (
        <div>
          <div style={styles.toolbar}>
            <div style={styles.filters}>
              <label htmlFor="cons-status-filter" style={styles.filterLabel}>
                Statut
              </label>
              <select
                id="cons-status-filter"
                style={styles.select}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as ConsolidationStatus | "")}
              >
                <option value="">Toutes</option>
                <option value="BROUILLON">Brouillon</option>
                <option value="TRANSMISE">Transmise</option>
              </select>
              <label htmlFor="cons-search" style={styles.filterLabel}>
                Recherche
              </label>
              <input
                id="cons-search"
                type="search"
                style={styles.searchInput}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Référence (CONS-…)"
              />
            </div>
            <button type="button" style={styles.primaryButton} onClick={() => openPicker("new")}>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Nouvelle consolidation
            </button>
          </div>

          {error && (
            <div style={styles.errorBox} role="alert">
              <span style={{ flex: 1 }}>{error}</span>
              <button
                type="button"
                style={styles.smallButton}
                onClick={() => setReloadKey((k) => k + 1)}
              >
                Réessayer
              </button>
            </div>
          )}

          {!error && (
            <div style={styles.statsGrid}>
              <div className="card" style={styles.paddedCard} data-testid="stat-total">
                <div style={styles.statHeader}>Total</div>
                <div style={styles.statValue}>{items?.length ?? 0}</div>
              </div>
              <div className="card" style={styles.paddedCard} data-testid="stat-brouillons">
                <div style={styles.statHeader}>Brouillons</div>
                <div style={styles.statValue}>{brouillons}</div>
              </div>
              <div className="card" style={styles.paddedCard} data-testid="stat-transmises">
                <div style={styles.statHeader}>Transmises</div>
                <div style={styles.statValue}>{transmises}</div>
              </div>
            </div>
          )}

          {loading && (
            <div className="card" style={styles.stateBox} role="status" aria-live="polite">
              <div style={styles.spinner} aria-hidden="true" />
              <p>Chargement des consolidations…</p>
            </div>
          )}

          {!loading && !error && filteredItems.length === 0 && (
            <div className="card" style={styles.stateBox}>
              <p>
                {items && items.length > 0
                  ? "Aucune consolidation ne correspond aux filtres."
                  : "Aucune consolidation pour le moment."}
              </p>
              <p>Créez un brouillon pour regrouper des demandes avant transmission.</p>
            </div>
          )}

          {!loading && !error && filteredItems.length > 0 && (
            <div className="card" style={styles.card}>
              {isNarrow ? (
                <div>
                  {filteredItems.map((c) => (
                    <div key={c.id} style={styles.td}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "0.75rem",
                          alignItems: "center",
                          marginBottom: "0.5rem",
                        }}
                      >
                        <span style={styles.reference}>{c.reference}</span>
                        <span style={statusBadgeStyle(c.status)}>
                          {CONSOLIDATION_STATUS_LABELS[c.status]}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: "0.8125rem",
                          color: "var(--color-text-muted)",
                          marginBottom: "0.5rem",
                        }}
                      >
                        {formatDate(c.periodStart)} → {formatDate(c.periodEnd)} ·{" "}
                        {c.demandes.length} demande(s)
                      </div>
                      <button
                        type="button"
                        style={styles.smallButton}
                        onClick={() => openDetail(c.id)}
                      >
                        Ouvrir
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Référence</th>
                      <th style={styles.th}>Période</th>
                      <th style={styles.th}>Statut</th>
                      <th style={styles.th}>Demandes</th>
                      <th style={styles.th}>Créée le</th>
                      <th style={styles.th}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((c) => (
                      <tr key={c.id}>
                        <td style={styles.td}>
                          <span style={styles.reference}>{c.reference}</span>
                        </td>
                        <td style={styles.td}>
                          {formatDate(c.periodStart)} → {formatDate(c.periodEnd)}
                        </td>
                        <td style={styles.td}>
                          <span style={statusBadgeStyle(c.status)}>
                            {CONSOLIDATION_STATUS_LABELS[c.status]}
                          </span>
                        </td>
                        <td style={styles.td}>{c.demandes.length}</td>
                        <td style={styles.td}>{formatDate(c.createdAt)}</td>
                        <td style={styles.td}>
                          <button
                            type="button"
                            style={styles.smallButton}
                            onClick={() => openDetail(c.id)}
                          >
                            Ouvrir
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {showNew && renderPicker("new")}
        </div>
      )}
    </div>
  );
}
