import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { demandesApi, ApiError, notificationsApi } from "../../services/api";
import {
  demandeUpdateSchema,
  type DemandeCategory,
  type DemandeResponse,
} from "@dpmg/shared/zod";
import {
  STATUS_LABELS,
  CATEGORY_LABELS,
  CATEGORY_OPTIONS,
  formatDate,
  firstFieldErrors,
  firstFieldErrorsFromDetails,
} from "./demandeUi";

function css<T extends React.CSSProperties>(styles: T): T {
  return styles;
}

export function DemandeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, roles, refreshUser } = useAuth();

  const [demande, setDemande] = useState<DemandeResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState<DemandeCategory | "">("");
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isApproveLoading, setIsApproveLoading] = useState(false);
  const [isDpmgApproving, setIsDpmgApproving] = useState(false);
  const [isDpmgRefusing, setIsDpmgRefusing] = useState(false);
  const [isDpmgReturning, setIsDpmgReturning] = useState(false);
  const [isDfcControlling, setIsDfcControlling] = useState(false);
  const [isExecutionLoading, setIsExecutionLoading] = useState(false);
  const [isSatisfactionLoading, setIsSatisfactionLoading] = useState(false);
  const [isClosingLoading, setIsClosingLoading] = useState(false);
  const [isReturningExecutionLoading, setIsReturningExecutionLoading] = useState(false);
  const [isRefusing, setIsRefusing] = useState(false);
  const [isReturning, setIsReturning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [avisMotif, setAvisMotif] = useState("");
  const [avisCommentaire, setAvisCommentaire] = useState("");
  const [avisErrors, setAvisErrors] = useState<Record<string, string>>({});
  const [isSavingAvis, setIsSavingAvis] = useState(false);
  const [avisEnregistre, setAvisEnregistre] = useState(false);
  const submitRef = useRef(false);
  const saveEditRef = useRef(false);
  const avisRef = useRef(false);
  const dpmgApproveRef = useRef(false);
  const dpmgRefuseRef = useRef(false);
  const dpmgReturnRef = useRef(false);
  const dfcControlRef = useRef(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoadError(null);
    setNotFound(false);
    try {
      const result = await demandesApi.get(id);
      setDemande(result);
    } catch (err) {
      setDemande(null);
      if (err instanceof ApiError && err.status === 401) {
        setLoadError("Session expirée. Veuillez vous reconnecter.");
        refreshUser().catch(() => {
          /* la redirection login est gérée par PrivateRoute */
        });
      } else if (err instanceof ApiError && err.status === 404) {
        setNotFound(true);
      } else if (err instanceof ApiError) {
        setLoadError(err.message || "Erreur lors du chargement de la demande");
      } else {
        setLoadError("Erreur de connexion au serveur");
      }
    }
  }, [id, refreshUser]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  // Marquer comme lues les notifications liées à cette demande (lot 9.6.6)
  useEffect(() => {
    if (!demande?.id) return;
    notificationsApi.markReadByDemande(demande.id).catch(() => {
      // silencieux : ne pas bloquer l'affichage
    });
  }, [demande?.id]);

  const isAuthor = !!user && !!demande && user.id === demande.authorId;
  const isDraft = demande?.status === "BROUILLON";
  const canManage = isAuthor && isDraft;
  const canValidate =
    !isAuthor &&
    demande?.status === "EN_ATTENTE_VALIDATION" &&
    roles.some((r) => r.role === "HIERARCHICAL_MANAGER" || r.role === "DEPARTMENT_MANAGER");

  /**
   * Éligibilité à une décision DPMG, calculée à partir des rôles ACTIFS exposés
   * par /api/auth/me. Elle ne remplace pas le contrôle serveur : le backend reste
   * l'autorité (habilitation active, délégation, périmètre, auteur exclu).
   */
  const canDpmg =
    !isAuthor &&
    demande?.status === "EN_ATTENTE_DECISION" &&
    roles.some((r) => r.role === "DPMG_MANAGER" || r.role === "DPMG_DELEGATE");

  const canDfc =
    !isAuthor &&
    demande?.status === "EN_ATTENTE_FINANCEMENT" &&
    roles.some((r) => r.role === "DFC_CONTROLLER");

  const canExecution =
    !isAuthor &&
    demande?.status === "EN_ATTENTE_EXECUTION" &&
    roles.some((r) => r.role === "DEPARTMENT_MANAGER" || r.role === "DEPARTMENT_DELEGATE" || r.role === "EXECUTION_AGENT");

  const canClose =
    !isAuthor &&
    demande?.status === "EN_ATTENTE_CONFIRMATION_SATISFACTION" &&
    roles.some((r) => r.role === "DPMG_MANAGER" || r.role === "DPMG_DELEGATE");
  /**
   * Éligibilité à l'avis départemental, calculée à partir des rôles ACTIFS
   * exposés par /api/auth/me. Elle ne remplace pas le contrôle serveur :
   * le backend reste l'autorité et peut refuser (403).
   *
   * `scope: "*"` n'est jamais considéré comme un droit départemental, et un
   * périmètre nul non plus. Le rattachement structurel du département n'est
   * pas exposé par l'API : seuls les rôles dont le périmètre correspond au
   * code du département peuvent être proposés (sous-affichage possible, jamais
   * de sur-autorisation).
   */
  const canGiveAvis =
    !isAuthor &&
    demande?.status === "EN_ATTENTE_ANALYSE" &&
    roles.some(
      (r) =>
        (r.role === "DEPARTMENT_MANAGER" || r.role === "DEPARTMENT_DELEGATE") &&
        !!r.scope &&
        r.scope !== "*" &&
        r.scope === demande.departmentCode
    );

  const reload = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  function openEdit() {
    if (!demande) return;
    setEditTitle(demande.title);
    setEditDescription(demande.description);
    setEditCategory(demande.category);
    setEditErrors({});
    setActionError(null);
    setIsEditOpen(true);
  }

  async function handleSaveEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!demande || saveEditRef.current) return;

    const parsed = demandeUpdateSchema.safeParse({
      title: editTitle,
      description: editDescription,
      category: editCategory === "" ? undefined : editCategory,
    });
    if (!parsed.success) {
      const errors = firstFieldErrors(parsed.error.flatten().fieldErrors);
      if (editCategory === "") {
        errors["category"] = "Catégorie requise";
      }
      setEditErrors(errors);
      return;
    }

    setEditErrors({});
    setActionError(null);
    saveEditRef.current = true;
    setIsSavingEdit(true);
    try {
      const updated = await demandesApi.update(demande.id, parsed.data);
      setDemande(updated);
      setIsEditOpen(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setActionError("Session expirée. Veuillez vous reconnecter.");
        refreshUser().catch(() => {
          /* la redirection login est gérée par PrivateRoute */
        });
      } else if (err instanceof ApiError && err.code === "VALIDATION_ERROR" && err.details) {
        setActionError(err.message || "Données de modification invalides");
        setEditErrors(firstFieldErrorsFromDetails(err.details));
      } else if (err instanceof ApiError) {
        setActionError(err.message || "Erreur lors de la modification");
      } else {
        setActionError("Erreur de connexion au serveur");
      }
    } finally {
      saveEditRef.current = false;
      setIsSavingEdit(false);
    }
  }

  async function handleSubmitDemande() {
    if (!demande || submitRef.current) return;
    setActionError(null);
    submitRef.current = true;
    setIsSubmitting(true);
    try {
      const updated = await demandesApi.submit(demande.id);
      setDemande(updated);
      setIsEditOpen(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setActionError("Session expirée. Veuillez vous reconnecter.");
        refreshUser().catch(() => {
          /* la redirection login est gérée par PrivateRoute */
        });
      } else if (err instanceof ApiError) {
        setActionError(err.message || "Erreur lors de la soumission");
      } else {
        setActionError("Erreur de connexion au serveur");
      }
    } finally {
      submitRef.current = false;
      setIsSubmitting(false);
    }
  }

  async function handleApprove() {
    if (!demande || isApproveLoading) return;
    setIsApproveLoading(true);
    setActionError(null);
    try {
      const updated = await demandesApi.approve(demande.id);
      setDemande(updated);
      setActionError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setActionError("Session expirée. Veuillez vous reconnecter.");
        refreshUser().catch(() => {
          /* la redirection login est gérée par PrivateRoute */
        });
      } else if (err instanceof ApiError && err.code === "AUCUN_VALIDATEUR") {
        setActionError("Vous n'êtes pas autorisé à valider cette demande.");
      } else if (err instanceof ApiError && err.code === "VALIDATEUR_AMBIGU") {
        setActionError("Plusieurs responsables sont possibles - designation explicite requise.");
      } else if (err instanceof ApiError) {
        setActionError(err.message || "Erreur lors de l'approbation");
      } else {
        setActionError("Erreur de connexion au serveur");
      }
    } finally {
      setIsApproveLoading(false);
    }
  }

  async function handleRefuse() {
    if (!demande || isRefusing) return;
    setIsRefusing(true);
    setActionError(null);
    const motif = window.prompt("Entrez le motif du refus :");
    if (motif === null || motif.trim() === "") {
      setActionError("Le motif du refus est requis");
      setIsRefusing(false);
      return;
    }
    try {
      const updated = await demandesApi.refuse(demande.id, motif);
      setDemande(updated);
      setActionError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setActionError("Session expirée. Veuillez vous reconnecter.");
        refreshUser().catch(() => {
          /* la redirection login est gérée par PrivateRoute */
        });
      } else if (err instanceof ApiError) {
        setActionError(err.message || "Erreur lors du refus");
      } else {
        setActionError("Erreur de connexion au serveur");
      }
    } finally {
      setIsRefusing(false);
    }
  }

  async function handleReturn() {
    if (!demande || isReturning) return;
    setIsReturning(true);
    setActionError(null);
    const motifInput = window.prompt("Entrez le motif du retour (optionnel) :");
    const commentaireInput = window.prompt("Entrez un commentaire de retour (optionnel) :");
    const motif = motifInput ? motifInput.trim() : "";
    const commentaire = commentaireInput ? commentaireInput.trim() : "";
    try {
      const updated = await demandesApi.return(demande.id, motif || undefined, commentaire || undefined);
      setDemande(updated);
      setActionError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setActionError("Session expirée. Veuillez vous reconnecter.");
        refreshUser().catch(() => {
          /* la redirection login est gérée par PrivateRoute */
        });
      } else if (err instanceof ApiError) {
        setActionError(err.message || "Erreur lors du retour");
      } else {
        setActionError("Erreur de connexion au serveur");
      }
    } finally {
      setIsReturning(false);
    }
  }

async function handleDpmgApprove() {
    if (!demande || isDpmgApproving || dpmgApproveRef.current) return;
    dpmgApproveRef.current = true;
    setIsDpmgApproving(true);
    setActionError(null);
    try {
      const updated = await demandesApi.dpmgApprove(demande.id);
      setDemande(updated);
      setActionError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setActionError("Session expirée. Veuillez vous reconnecter.");
        refreshUser().catch(() => {
          /* la redirection login est gérée par PrivateRoute */
        });
      } else if (err instanceof ApiError) {
        setActionError(err.message || "Erreur lors de la décision DPMG");
      } else {
        setActionError("Erreur de connexion au serveur");
      }
    } finally {
      dpmgApproveRef.current = false;
      setIsDpmgApproving(false);
    }
  }

  async function handleDpmgRefuse() {
    if (!demande || isDpmgRefusing || dpmgRefuseRef.current) return;
    dpmgRefuseRef.current = true;
    setIsDpmgRefusing(true);
    setActionError(null);
    const motif = window.prompt("Entrez le motif du refus DPMG :");
    if (motif === null || motif.trim() === "") {
      setActionError("Le motif du refus est requis");
      dpmgRefuseRef.current = false;
      setIsDpmgRefusing(false);
      return;
    }
    try {
      const updated = await demandesApi.dpmgRefuse(demande.id, motif.trim());
      setDemande(updated);
      setActionError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setActionError("Session expirée. Veuillez vous reconnecter.");
        refreshUser().catch(() => {
          /* la redirection login est gérée par PrivateRoute */
        });
      } else if (err instanceof ApiError) {
        setActionError(err.message || "Erreur lors de la décision DPMG");
      } else {
        setActionError("Erreur de connexion au serveur");
      }
    } finally {
      dpmgRefuseRef.current = false;
      setIsDpmgRefusing(false);
    }
  }

  async function handleDpmgReturn() {
    if (!demande || isDpmgReturning || dpmgReturnRef.current) return;
    dpmgReturnRef.current = true;
    setIsDpmgReturning(true);
    setActionError(null);
    const motifInput = window.prompt("Entrez le motif du retour DPMG (obligatoire) :");
    if (motifInput === null || motifInput.trim() === "") {
      setActionError("Le motif du retour est requis");
      dpmgReturnRef.current = false;
      setIsDpmgReturning(false);
      return;
    }
    const commentaireInput = window.prompt("Entrez un commentaire (optionnel) :");
    const commentaire = commentaireInput ? commentaireInput.trim() : "";
    try {
      const updated = await demandesApi.dpmgReturn(
        demande.id,
        motifInput.trim(),
        commentaire || undefined
      );
      setDemande(updated);
      setActionError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setActionError("Session expirée. Veuillez vous reconnecter.");
        refreshUser().catch(() => {
          /* la redirection login est gérée par PrivateRoute */
        });
      } else if (err instanceof ApiError) {
        setActionError(err.message || "Erreur lors de la décision DPMG");
      } else {
        setActionError("Erreur de connexion au serveur");
      }
    } finally {
      dpmgReturnRef.current = false;
      setIsDpmgReturning(false);
    }
  }

async function handleDfcControl(result: "DISPONIBLE" | "INDISPONIBLE") {
    if (!demande || isDfcControlling || dfcControlRef.current) return;
    dfcControlRef.current = true;
    setIsDfcControlling(true);
    setActionError(null);
    const motifInput = window.prompt("Motif du contrôle DFC (optionnel) :");
    const motif = motifInput ? motifInput.trim() : "";
    try {
      const updated = await demandesApi.dfcControl(
        demande.id,
        result,
        motif || undefined
      );
      setDemande(updated);
      setActionError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setActionError("Session expirée. Veuillez vous reconnecter.");
        refreshUser().catch(() => {
          /* la redirection login est gérée par PrivateRoute */
        });
      } else if (err instanceof ApiError) {
        setActionError(err.message || "Erreur lors du contrôle financier");
      } else {
        setActionError("Erreur de connexion au serveur");
      }
    } finally {
      dfcControlRef.current = false;
      setIsDfcControlling(false);
    }
  }

  async function handleStartExecution() {
    if (!demande || isExecutionLoading) return;
    setIsExecutionLoading(true);
    setActionError(null);
    try {
      const updated = await demandesApi.startExecution(demande.id);
      setDemande(updated);
      setActionError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setActionError("Session expirée. Veuillez vous reconnecter.");
        refreshUser().catch(() => {});
      } else if (err instanceof ApiError) {
        setActionError(err.message || "Erreur lors de la prise en charge");
      } else {
        setActionError("Erreur de connexion au serveur");
      }
    } finally {
      setIsExecutionLoading(false);
    }
  }

  async function handleDeclareSatisfaction() {
    if (!demande || isSatisfactionLoading) return;
    setIsSatisfactionLoading(true);
    setActionError(null);
    const proofUrl = window.prompt("URL du justificatif d'exécution (obligatoire) :");
    if (proofUrl === null || proofUrl.trim() === "") {
      setActionError("Le justificatif est requis");
      setIsSatisfactionLoading(false);
      return;
    }
    const observations = window.prompt("Observations (optionnel) :");
    try {
      const updated = await demandesApi.declareSatisfaction(demande.id, proofUrl.trim(), observations ? observations.trim() : undefined);
      setDemande(updated);
      setActionError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setActionError("Session expirée. Veuillez vous reconnecter.");
        refreshUser().catch(() => {});
      } else if (err instanceof ApiError) {
        setActionError(err.message || "Erreur lors de la déclaration de satisfaction");
      } else {
        setActionError("Erreur de connexion au serveur");
      }
    } finally {
      setIsSatisfactionLoading(false);
    }
  }

  async function handleCloseDemande() {
    if (!demande || isClosingLoading) return;
    setIsClosingLoading(true);
    setActionError(null);
    try {
      const updated = await demandesApi.closeDemande(demande.id);
      setDemande(updated);
      setActionError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setActionError("Session expirée. Veuillez vous reconnecter.");
        refreshUser().catch(() => {});
      } else if (err instanceof ApiError) {
        setActionError(err.message || "Erreur lors de la clôture");
      } else {
        setActionError("Erreur de connexion au serveur");
      }
    } finally {
      setIsClosingLoading(false);
    }
  }

  async function handleReturnForExecution() {
    if (!demande || isReturningExecutionLoading) return;
    setIsReturningExecutionLoading(true);
    setActionError(null);
    const motif = window.prompt("Motif du retour au département (obligatoire) :");
    if (motif === null || motif.trim() === "") {
      setActionError("Le motif du retour est requis");
      setIsReturningExecutionLoading(false);
      return;
    }
    try {
      const updated = await demandesApi.returnForExecution(demande.id, motif.trim());
      setDemande(updated);
      setActionError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setActionError("Session expirée. Veuillez vous reconnecter.");
        refreshUser().catch(() => {});
      } else if (err instanceof ApiError) {
        setActionError(err.message || "Erreur lors du retour");
      } else {
        setActionError("Erreur de connexion au serveur");
      }
    } finally {
      setIsReturningExecutionLoading(false);
    }
  }

  async function handleSubmitAvis(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!demande || avisRef.current) return;

    const motif = avisMotif.trim();
    const commentaire = avisCommentaire.trim();

    // Au moins un des deux champs doit être renseigné (après trim).
    if (motif === "" && commentaire === "") {
      setAvisErrors({ avis: "Renseignez au moins un motif ou un commentaire." });
      return;
    }

    setAvisErrors({});
    setActionError(null);
    avisRef.current = true;
    setIsSavingAvis(true);
    try {
      const updated = await demandesApi.avis(demande.id, {
        motif: motif === "" ? undefined : motif,
        commentaire: commentaire === "" ? undefined : commentaire,
      });
      // Le statut n'est mis à jour qu'après confirmation du serveur.
      setDemande(updated);
      setAvisEnregistre(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setActionError("Session expirée. Veuillez vous reconnecter.");
        refreshUser().catch(() => {
          /* la redirection login est gérée par PrivateRoute */
        });
      } else if (err instanceof ApiError && err.status === 400) {
        setAvisErrors(firstFieldErrorsFromDetails(err.details ?? {}));
        setActionError(err.message || "Données d'avis invalides");
      } else if (err instanceof ApiError && err.status === 404) {
        setNotFound(true);
      } else if (err instanceof ApiError && err.code === "DEMANDE_NOT_ANALYSE") {
        setActionError("La demande n'est plus en attente d'analyse : son état a été mis à jour.");
        reload();
      } else if (err instanceof ApiError && err.code === "CONCURRENT_MODIFICATION") {
        setActionError("La demande a été modifiée ou traitée par un autre utilisateur.");
        reload();
      } else if (err instanceof ApiError) {
        setActionError(err.message || "Erreur lors de l'enregistrement de l'avis");
      } else {
        setActionError("Erreur de connexion au serveur");
      }
    } finally {
      avisRef.current = false;
      setIsSavingAvis(false);
    }
  }

  const styles = {
    backLink: css({
      display: "inline-flex",
      alignItems: "center",
      gap: "0.375rem",
      color: "var(--color-text-muted)",
      fontSize: "0.875rem",
      textDecoration: "none",
      marginBottom: "1.25rem",
      transition: "color var(--transition)",
    }),
    card: css({
      maxWidth: "800px",
      padding: "2rem",
      borderTop: "3px solid var(--color-primary)",
    }),
    header: css({
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: "1rem",
      flexWrap: "wrap" as const,
      marginBottom: "0.5rem",
    }),
    reference: css({
      fontSize: "0.8125rem",
      fontWeight: 600,
      color: "var(--color-primary)",
      letterSpacing: "0.03em",
      marginBottom: "0.25rem",
      display: "block",
    }),
    title: css({
      fontSize: "1.5rem",
      fontWeight: 600,
      color: "var(--color-text)",
    }),
    statusBadge: css({
      display: "inline-block",
      padding: "0.25rem 0.875rem",
      borderRadius: "999px",
      fontSize: "0.8125rem",
      fontWeight: 600,
      whiteSpace: "nowrap" as const,
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
    metaGrid: css({
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
      gap: "1rem",
      padding: "1.25rem 0",
      marginTop: "0.5rem",
      borderTop: "1px solid var(--color-border)",
      borderBottom: "1px solid var(--color-border)",
    }),
    metaLabel: css({
      display: "block",
      fontSize: "0.75rem",
      fontWeight: 600,
      textTransform: "uppercase" as const,
      letterSpacing: "0.05em",
      color: "var(--color-text-muted)",
      marginBottom: "0.25rem",
    }),
    metaValue: css({
      fontSize: "0.9375rem",
      color: "var(--color-text)",
    }),
    descriptionSection: css({
      marginTop: "1.5rem",
    }),
    descriptionLabel: css({
      fontSize: "0.75rem",
      fontWeight: 600,
      textTransform: "uppercase" as const,
      letterSpacing: "0.05em",
      color: "var(--color-text-muted)",
      marginBottom: "0.5rem",
    }),
    descriptionText: css({
      fontSize: "0.9375rem",
      color: "var(--color-text)",
      lineHeight: 1.6,
      whiteSpace: "pre-wrap" as const,
    }),
    actions: css({
      display: "flex",
      gap: "0.75rem",
      marginTop: "1.75rem",
      flexWrap: "wrap" as const,
    }),
    primaryButton: css({
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "0.5rem",
      padding: "0.75rem 1.5rem",
      background: "var(--color-primary)",
      color: "#ffffff",
      border: "none",
      borderRadius: "var(--radius-md)",
      fontSize: "0.9375rem",
      fontWeight: 500,
      cursor: "pointer",
      transition: "background-color var(--transition)",
    }),
    secondaryButton: css({
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "0.5rem",
      padding: "0.75rem 1.5rem",
      background: "var(--color-background)",
      color: "var(--color-primary)",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-md)",
      fontSize: "0.9375rem",
      fontWeight: 500,
      cursor: "pointer",
      transition: "background-color var(--transition), border-color var(--transition)",
    }),
    cancelButton: css({
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0.75rem 1.5rem",
      background: "transparent",
      color: "var(--color-text-muted)",
      border: "none",
      borderRadius: "var(--radius-md)",
      fontSize: "0.9375rem",
      fontWeight: 500,
      cursor: "pointer",
    }),
    spinner: css({
      width: "16px",
      height: "16px",
      border: "2px solid rgba(255, 255, 255, 0.4)",
      borderTopColor: "#ffffff",
      borderRadius: "50%",
      animation: "spin 0.8s linear infinite",
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
      marginTop: "1.5rem",
    }),
    successBox: css({
      display: "flex",
      alignItems: "center",
      gap: "0.5rem",
      padding: "0.875rem 1rem",
      background: "#e8f7ef",
      border: "1px solid rgba(39, 174, 96, 0.35)",
      borderRadius: "var(--radius-md)",
      color: "var(--color-success)",
      fontSize: "0.875rem",
    }),
    stateBox: css({
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "0.75rem",
      padding: "3rem 1.5rem",
      textAlign: "center" as const,
      color: "var(--color-text-muted)",
      maxWidth: "800px",
    }),
    stateTitle: css({
      fontSize: "1.125rem",
      fontWeight: 600,
      color: "var(--color-text)",
    }),
    stateLink: css({
      color: "var(--color-primary)",
      fontSize: "0.9375rem",
      fontWeight: 500,
    }),
    spinnerLarge: css({
      width: "24px",
      height: "24px",
      border: "2px solid var(--color-border)",
      borderTopColor: "var(--color-primary)",
      borderRadius: "50%",
      animation: "spin 1s linear infinite",
    }),
    form: css({
      display: "flex",
      flexDirection: "column",
      gap: "1.25rem",
      marginTop: "1.5rem",
      paddingTop: "1.5rem",
      borderTop: "1px solid var(--color-border)",
    }),
    formTitle: css({
      fontSize: "1.125rem",
      fontWeight: 600,
      color: "var(--color-text)",
    }),
    field: css({
      display: "flex",
      flexDirection: "column",
      gap: "0.5rem",
    }),
    label: css({
      fontSize: "0.875rem",
      fontWeight: 500,
      color: "var(--color-text)",
    }),
    input: css({
      padding: "0.75rem 1rem",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-md)",
      fontSize: "1rem",
      color: "var(--color-text)",
      background: "var(--color-background)",
      transition: "border-color var(--transition), box-shadow var(--transition)",
      outline: "none",
      width: "100%",
    }),
    inputError: css({
      borderColor: "var(--color-error)",
    }),
    textarea: css({
      padding: "0.75rem 1rem",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-md)",
      fontSize: "1rem",
      color: "var(--color-text)",
      background: "var(--color-background)",
      transition: "border-color var(--transition), box-shadow var(--transition)",
      outline: "none",
      width: "100%",
      minHeight: "140px",
      resize: "vertical" as const,
      fontFamily: "inherit",
      lineHeight: 1.5,
    }),
    errorText: css({
      fontSize: "0.8125rem",
      color: "var(--color-error)",
    }),
  };

  if (loadError) {
    return (
      <div>
        <Link to="/demandes" style={styles.backLink}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Retour à la liste
        </Link>
        <div className="card" style={styles.stateBox} role="alert">
          <p style={styles.stateTitle}>{loadError}</p>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            style={styles.secondaryButton}
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div>
        <Link to="/demandes" style={styles.backLink}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Retour à la liste
        </Link>
        <div className="card" style={styles.stateBox}>
          <p style={styles.stateTitle}>Demande non trouvée</p>
          <p>Vous n'avez peut-être pas accès à cette demande, ou elle n'existe pas.</p>
          <Link to="/demandes" style={styles.stateLink}>
            Retour à la liste
          </Link>
        </div>
      </div>
    );
  }

  if (!demande) {
    return (
      <div className="card" style={styles.stateBox} role="status" aria-live="polite">
        <div style={styles.spinnerLarge} aria-hidden="true" />
        <p>Chargement de la demande...</p>
      </div>
    );
  }

  return (
    <div>
      <Link to="/demandes" style={styles.backLink}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Retour à la liste
      </Link>

      <div className="card" style={styles.card}>
        <div style={styles.header}>
          <div>
            <span style={styles.reference}>{demande.reference}</span>
            <h1 style={styles.title}>{demande.title}</h1>
          </div>
<span
              style={{
                ...styles.statusBadge,
                ...(demande.status === "BROUILLON"
                  ? styles.statusBrouillon
                  : demande.status === "EN_ATTENTE_VALIDATION"
                    ? styles.statusBrouillon
                    : demande.status === "EN_ATTENTE_ANALYSE"
                      ? styles.statusBrouillon
                      : demande.status === "EN_ATTENTE_DECISION"
                        ? styles.statusBrouillon
                        : demande.status === "RETOURNEE"
                          ? styles.statusBrouillon
                          : demande.status === "REFUSEE"
                            ? styles.statusBrouillon
                            : styles.statusBrouillon),
              }}
            >
            {STATUS_LABELS[demande.status]}
          </span>
        </div>

        <div style={styles.metaGrid}>
          <div>
            <span style={styles.metaLabel}>Catégorie</span>
            <span style={styles.metaValue}>{CATEGORY_LABELS[demande.category]}</span>
          </div>
          <div>
            <span style={styles.metaLabel}>Département</span>
            <span style={styles.metaValue}>{demande.departmentName}</span>
          </div>
          <div>
            <span style={styles.metaLabel}>Auteur</span>
            <span style={styles.metaValue}>
              {demande.authorFirstName} {demande.authorLastName}
            </span>
          </div>
          <div>
            <span style={styles.metaLabel}>Créée le</span>
            <span style={styles.metaValue}>{formatDate(demande.createdAt)}</span>
          </div>
          {demande.submittedAt && (
            <div>
              <span style={styles.metaLabel}>Soumise le</span>
              <span style={styles.metaValue}>{formatDate(demande.submittedAt)}</span>
            </div>
          )}
        </div>

        {actionError && (
          <div style={styles.errorBox} role="alert">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {actionError}
          </div>
        )}

        <div style={styles.descriptionSection}>
          <h2 style={styles.descriptionLabel}>Description</h2>
          <p style={styles.descriptionText}>{demande.description}</p>
        </div>

        {demande.satisfactionProofUrl ? (
          <div style={styles.descriptionSection}>
            <h2 style={styles.descriptionLabel}>Justificatif de satisfaction</h2>
            <a
              href={demande.satisfactionProofUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.stateLink}
            >
              {demande.satisfactionProofUrl}
            </a>
            {demande.satisfactionObservations && (
              <p style={{ ...styles.descriptionText, marginTop: "0.5rem" }}>
                <strong>Observations :</strong> {demande.satisfactionObservations}
              </p>
            )}
          </div>
        ) : (
          <div style={styles.descriptionSection}>
            <h2 style={styles.descriptionLabel}>Justificatif de satisfaction</h2>
            <p style={styles.descriptionText}>Aucun justificatif renseigné.</p>
          </div>
        )}

        {demande.closureReturnReason && (
          <div style={styles.descriptionSection}>
            <h2 style={styles.descriptionLabel}>Motif du retour</h2>
            <p style={styles.descriptionText}>{demande.closureReturnReason}</p>
          </div>
        )}

        {avisEnregistre && (
          <div style={styles.successBox} role="status">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Avis départemental enregistré. La demande passe en attente de décision.
          </div>
        )}

        {canGiveAvis && (
          <form style={styles.form} onSubmit={handleSubmitAvis} noValidate>
            <h2 style={styles.formTitle}>Avis départemental</h2>

            {avisErrors["avis"] && (
              <p id="avis-error" style={styles.errorText} role="alert">
                {avisErrors["avis"]}
              </p>
            )}

            <div style={styles.field}>
              <label htmlFor="avis-motif" style={styles.label}>
                Motif de l'avis
              </label>
              <input
                type="text"
                id="avis-motif"
                name="motif"
                value={avisMotif}
                onChange={(e) => setAvisMotif(e.target.value)}
                disabled={isSavingAvis}
                className="form-input"
                style={{ ...styles.input, ...(avisErrors["motif"] ? styles.inputError : {}) }}
                aria-invalid={avisErrors["motif"] ? "true" : undefined}
                aria-describedby={avisErrors["motif"] ? "avis-motif-error" : undefined}
              />
              {avisErrors["motif"] && (
                <p id="avis-motif-error" style={styles.errorText} role="alert">
                  {avisErrors["motif"]}
                </p>
              )}
            </div>

            <div style={styles.field}>
              <label htmlFor="avis-commentaire" style={styles.label}>
                Commentaire
              </label>
              <textarea
                id="avis-commentaire"
                name="commentaire"
                value={avisCommentaire}
                onChange={(e) => setAvisCommentaire(e.target.value)}
                disabled={isSavingAvis}
                className="form-input"
                style={{ ...styles.textarea, ...(avisErrors["commentaire"] ? styles.inputError : {}) }}
                aria-invalid={avisErrors["commentaire"] ? "true" : undefined}
                aria-describedby={avisErrors["commentaire"] ? "avis-commentaire-error" : undefined}
              />
              {avisErrors["commentaire"] && (
                <p id="avis-commentaire-error" style={styles.errorText} role="alert">
                  {avisErrors["commentaire"]}
                </p>
              )}
            </div>

            <div style={styles.actions}>
              <button type="submit" disabled={isSavingAvis} style={styles.primaryButton}>
                {isSavingAvis ? (
                  <>
                    <span style={styles.spinner} aria-hidden="true" />
                    Enregistrement...
                  </>
                ) : (
                  "Enregistrer l'avis"
                )}
              </button>
            </div>
          </form>
        )}

        {canManage && !isEditOpen && (
          <div style={styles.actions}>
            <button
              type="button"
              disabled={isSubmitting}
              style={styles.primaryButton}
              onClick={() => handleSubmitDemande()}
            >
              {isSubmitting ? (
                <>
                  <span style={styles.spinner} aria-hidden="true" />
                  Soumission...
                </>
              ) : (
                "Soumettre la demande"
              )}
            </button>
            <button type="button" style={styles.secondaryButton} onClick={openEdit}>
              Modifier
            </button>
          </div>
        )}

        {canValidate && !isEditOpen && (
          <div style={styles.actions}>
            <button
              type="button"
              disabled={isApproveLoading}
              style={styles.primaryButton}
              onClick={() => handleApprove()}
            >
              {isApproveLoading ? (
                <>
                  <span style={styles.spinner} aria-hidden="true" />
                  Approbation...
                </>
              ) : (
                "Approuver"
              )}
            </button>
            <button
              type="button"
              disabled={isRefusing}
              style={styles.secondaryButton}
              onClick={() => handleRefuse()}
            >
              {isRefusing ? "Refus en cours..." : "Refuser"}
            </button>
            <button
              type="button"
              disabled={isReturning}
              style={styles.secondaryButton}
              onClick={() => handleReturn()}
            >
              {isReturning ? "Retour en cours..." : "Retourner pour correction"}
            </button>
          </div>
        )}

        {canDpmg && !isEditOpen && (
          <div style={styles.actions}>
            <button
              type="button"
              disabled={isDpmgApproving}
              style={styles.primaryButton}
              onClick={() => handleDpmgApprove()}
            >
              {isDpmgApproving ? (
                <>
                  <span style={styles.spinner} aria-hidden="true" />
                  Approbation DPMG...
                </>
              ) : (
                "Approuver (DPMG)"
              )}
            </button>
            <button
              type="button"
              disabled={isDpmgRefusing}
              style={styles.secondaryButton}
              onClick={() => handleDpmgRefuse()}
            >
              {isDpmgRefusing ? "Refus DPMG en cours..." : "Refuser (DPMG)"}
            </button>
            <button
              type="button"
              disabled={isDpmgReturning}
              style={styles.secondaryButton}
              onClick={() => handleDpmgReturn()}
            >
              {isDpmgReturning ? "Retour DPMG en cours..." : "Retourner pour correction (DPMG)"}
            </button>
          </div>
        )}

        {canDfc && !isEditOpen && (
          <div style={styles.actions}>
            <button
              type="button"
              disabled={isDfcControlling}
              style={styles.primaryButton}
              onClick={() => handleDfcControl("DISPONIBLE")}
            >
              {isDfcControlling ? (
                <>
                  <span style={styles.spinner} aria-hidden="true" />
                  Contrôle en cours...
                </>
              ) : (
                "Financement disponible"
              )}
            </button>
            <button
              type="button"
              disabled={isDfcControlling}
              style={styles.secondaryButton}
              onClick={() => handleDfcControl("INDISPONIBLE")}
            >
              {isDfcControlling ? "Contrôle en cours..." : "Financement indisponible"}
            </button>
          </div>
        )}

                {canExecution && !isEditOpen && (
          <div style={styles.actions}>
            <button type="button" disabled={isExecutionLoading} style={styles.primaryButton} onClick={() => handleStartExecution()}>
              {isExecutionLoading ? "Prise en charge..." : "Prendre en charge"}
            </button>
            <button type="button" disabled={isSatisfactionLoading} style={styles.primaryButton} onClick={() => handleDeclareSatisfaction()}>
              {isSatisfactionLoading ? "Déclaration..." : "Déclarer l'exécution terminée"}
            </button>
          </div>
        )}

        {canClose && !isEditOpen && (
          <div style={styles.actions}>
            <button type="button" disabled={isClosingLoading} style={styles.primaryButton} onClick={() => handleCloseDemande()}>
              {isClosingLoading ? "Clôture..." : "Clôturer la demande"}
            </button>
            <button type="button" disabled={isReturningExecutionLoading} style={styles.secondaryButton} onClick={() => handleReturnForExecution()}>
              {isReturningExecutionLoading ? "Retour..." : "Retourner au département"}
            </button>
          </div>
        )}

        {canManage && isEditOpen && (
          <form style={styles.form} onSubmit={handleSaveEdit} noValidate>
            <h2 style={styles.formTitle}>Modifier la demande</h2>

            <div style={styles.field}>
              <label htmlFor="edit-title" style={styles.label}>
                Titre
              </label>
              <input
                type="text"
                id="edit-title"
                name="title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                disabled={isSavingEdit}
                className="form-input"
                style={{ ...styles.input, ...(editErrors["title"] ? styles.inputError : {}) }}
                aria-invalid={editErrors["title"] ? "true" : undefined}
                aria-describedby={editErrors["title"] ? "edit-title-error" : undefined}
              />
              {editErrors["title"] && (
                <p id="edit-title-error" style={styles.errorText} role="alert">
                  {editErrors["title"]}
                </p>
              )}
            </div>

            <div style={styles.field}>
              <label htmlFor="edit-category" style={styles.label}>
                Catégorie
              </label>
              <select
                id="edit-category"
                name="category"
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value as DemandeCategory | "")}
                disabled={isSavingEdit}
                className="form-input"
                style={{ ...styles.input, ...(editErrors["category"] ? styles.inputError : {}) }}
                aria-invalid={editErrors["category"] ? "true" : undefined}
                aria-describedby={editErrors["category"] ? "edit-category-error" : undefined}
              >
                <option value="">Sélectionner une catégorie</option>
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {editErrors["category"] && (
                <p id="edit-category-error" style={styles.errorText} role="alert">
                  {editErrors["category"]}
                </p>
              )}
            </div>

            <div style={styles.field}>
              <label htmlFor="edit-description" style={styles.label}>
                Description
              </label>
              <textarea
                id="edit-description"
                name="description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                disabled={isSavingEdit}
                className="form-input"
                style={{ ...styles.textarea, ...(editErrors["description"] ? styles.inputError : {}) }}
                aria-invalid={editErrors["description"] ? "true" : undefined}
                aria-describedby={editErrors["description"] ? "edit-description-error" : undefined}
              />
              {editErrors["description"] && (
                <p id="edit-description-error" style={styles.errorText} role="alert">
                  {editErrors["description"]}
                </p>
              )}
            </div>

            <div style={styles.actions}>
              <button type="submit" disabled={isSavingEdit} style={styles.primaryButton}>
                {isSavingEdit ? (
                  <>
                    <span style={styles.spinner} aria-hidden="true" />
                    Enregistrement...
                  </>
                ) : (
                  "Enregistrer les modifications"
                )}
              </button>
              <button
                type="button"
                disabled={isSavingEdit}
                style={styles.cancelButton}
                onClick={() => {
                  setIsEditOpen(false);
                  setEditErrors({});
                  setActionError(null);
                }}
              >
                Annuler
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default DemandeDetailPage;
