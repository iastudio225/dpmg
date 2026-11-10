import { useRef, useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { demandesApi, ApiError } from "../../services/api";
import { demandeCreateSchema, type DemandeCategory, type DemandeResponse } from "@dpmg/shared/zod";
import { CATEGORY_OPTIONS, firstFieldErrors, firstFieldErrorsFromDetails } from "./demandeUi";

function css<T extends React.CSSProperties>(styles: T): T {
  return styles;
}

export function DemandeCreatePage() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<DemandeCategory | "">("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveAndSubmit, setSaveAndSubmit] = useState(false);
  const [createdDraft, setCreatedDraft] = useState<DemandeResponse | null>(null);
  const savingRef = useRef(false);

  async function save(andThenSubmit: boolean) {
    if (savingRef.current) return;
    const parsed = demandeCreateSchema.safeParse({
      title,
      description,
      category: category === "" ? undefined : category,
    });
    if (!parsed.success) {
      const errors = firstFieldErrors(parsed.error.flatten().fieldErrors);
      if (category === "") {
        errors["category"] = "Catégorie requise";
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setError(null);
    savingRef.current = true;
    setIsSaving(true);
    setSaveAndSubmit(andThenSubmit);
    let created: DemandeResponse | null = null;
    try {
      created = await demandesApi.create(parsed.data);
      if (andThenSubmit) {
        await demandesApi.submit(created.id);
      }
      navigate(`/demandes/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Session expirée. Veuillez vous reconnecter.");
        refreshUser().catch(() => {
          /* la redirection login est gérée par PrivateRoute */
        });
      } else if (err instanceof ApiError && err.code === "VALIDATION_ERROR" && err.details) {
        setError(err.message || "Données de demande invalides");
        setFieldErrors(firstFieldErrorsFromDetails(err.details));
      } else if (created) {
        // La demande existe déjà côté serveur : ne jamais re-créer, proposer d'aller au détail.
        setCreatedDraft(created);
        setError(
          andThenSubmit
            ? `La demande ${created.reference} a été créée comme brouillon, mais sa soumission a échoué : ${err instanceof ApiError ? err.message : "erreur de connexion"}.`
            : `La demande ${created.reference} a été créée, mais la redirection a échoué.`
        );
      } else if (err instanceof ApiError) {
        setError(err.message || "Erreur lors de la création de la demande");
      } else {
        setError("Erreur de connexion au serveur");
      }
    } finally {
      savingRef.current = false;
      setIsSaving(false);
      setSaveAndSubmit(false);
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    save(false);
  }

  const styles = {
    card: css({
      maxWidth: "640px",
      padding: "2rem",
      borderTop: "3px solid var(--color-primary)",
    }),
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
    title: css({
      fontSize: "1.5rem",
      fontWeight: 600,
      color: "var(--color-text)",
      marginBottom: "0.375rem",
    }),
    subtitle: css({
      color: "var(--color-text-muted)",
      fontSize: "0.9375rem",
      marginBottom: "1.75rem",
    }),
    form: css({
      display: "flex",
      flexDirection: "column",
      gap: "1.25rem",
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
    infoNote: css({
      fontSize: "0.8125rem",
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
    }),
    actions: css({
      display: "flex",
      gap: "0.75rem",
      marginTop: "0.5rem",
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
      transition: "background-color var(--transition), transform var(--transition)",
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
  };

  return (
    <div>
      <Link to="/demandes" style={styles.backLink}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Retour à la liste
      </Link>

      <div className="card" style={styles.card}>
        <h1 style={styles.title}>Nouvelle demande</h1>
        <p style={styles.subtitle}>
          Créez une demande opérationnelle. Elle sera enregistrée comme brouillon avant sa soumission.
        </p>

        {error && (
          <div style={styles.errorBox} role="alert">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </div>
        )}

        <form
          style={styles.form}
          onSubmit={handleSubmit}
          noValidate
        >
          <div style={styles.field}>
            <label htmlFor="create-title" style={styles.label}>
              Titre
            </label>
            <input
              type="text"
              id="create-title"
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex : Achat de 10 postes de travail"
              disabled={isSaving || createdDraft !== null}
              className="form-input"
              style={{ ...styles.input, ...(fieldErrors["title"] ? styles.inputError : {}) }}
              aria-invalid={fieldErrors["title"] ? "true" : undefined}
              aria-describedby={fieldErrors["title"] ? "create-title-error" : undefined}
            />
            {fieldErrors["title"] && (
              <p id="create-title-error" style={styles.errorText} role="alert">
                {fieldErrors["title"]}
              </p>
            )}
          </div>

          <div style={styles.field}>
            <label htmlFor="create-category" style={styles.label}>
              Catégorie
            </label>
            <select
              id="create-category"
              name="category"
              value={category}
              onChange={(e) => setCategory(e.target.value as DemandeCategory | "")}
              disabled={isSaving || createdDraft !== null}
              className="form-input"
              style={{ ...styles.input, ...(fieldErrors["category"] ? styles.inputError : {}) }}
              aria-invalid={fieldErrors["category"] ? "true" : undefined}
              aria-describedby={fieldErrors["category"] ? "create-category-error" : undefined}
            >
              <option value="">Sélectionner une catégorie</option>
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {fieldErrors["category"] && (
              <p id="create-category-error" style={styles.errorText} role="alert">
                {fieldErrors["category"]}
              </p>
            )}
            <p style={styles.infoNote}>
              Le département rattaché est déterminé automatiquement selon la catégorie choisie.
            </p>
          </div>

          <div style={styles.field}>
            <label htmlFor="create-description" style={styles.label}>
              Description
            </label>
            <textarea
              id="create-description"
              name="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Décrivez le besoin, la quantité, le contexte..."
              disabled={isSaving || createdDraft !== null}
              className="form-input"
              style={{ ...styles.textarea, ...(fieldErrors["description"] ? styles.inputError : {}) }}
              aria-invalid={fieldErrors["description"] ? "true" : undefined}
              aria-describedby={fieldErrors["description"] ? "create-description-error" : undefined}
            />
            {fieldErrors["description"] && (
              <p id="create-description-error" style={styles.errorText} role="alert">
                {fieldErrors["description"]}
              </p>
            )}
          </div>

          <div style={styles.actions}>
            {createdDraft ? (
              <button
                type="button"
                style={styles.primaryButton}
                onClick={() => navigate(`/demandes/${createdDraft.id}`)}
              >
                Voir la demande {createdDraft.reference}
              </button>
            ) : (
              <>
                <button
                  type="submit"
                  disabled={isSaving || createdDraft !== null}
                  style={styles.primaryButton}
                >
                  {isSaving && !saveAndSubmit ? (
                    <>
                      <span style={styles.spinner} aria-hidden="true" />
                      Enregistrement...
                    </>
                  ) : (
                    "Enregistrer"
                  )}
                </button>
                <button
                  type="button"
                  disabled={isSaving || createdDraft !== null}
                  style={styles.secondaryButton}
                  onClick={() => save(true)}
                >
                  {isSaving && saveAndSubmit ? (
                    <>
                      <span style={styles.spinner} aria-hidden="true" />
                      Soumission...
                    </>
                  ) : (
                    "Enregistrer et soumettre"
                  )}
                </button>
              </>
            )}
            <button
              type="button"
              disabled={isSaving}
              style={styles.cancelButton}
              onClick={() => navigate("/demandes")}
            >
              {createdDraft ? "Retour à la liste" : "Annuler"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default DemandeCreatePage;
