import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { structuresApi, ApiError } from "../../services/api";
import { STRUCTURE_TYPE_LABELS } from "./StructuresPage";
import type { StructureResponse, StructureType } from "@dpmg/shared";

function css<T extends React.CSSProperties>(styles: T): T {
  return styles;
}

const inputStyles = css({
  padding: "0.75rem 1rem",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  fontSize: "1rem",
  color: "var(--color-text)",
  background: "var(--color-background)",
});

export function StructureForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<StructureType>("OTHER");
  const [parentId, setParentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingStructure, setIsLoadingStructure] = useState(false);
  const [allStructures, setAllStructures] = useState<StructureResponse[]>([]);

  const loadStructures = useCallback(async () => {
    try {
      const response = await structuresApi.list({ limit: 100 });
      setAllStructures(response);
    } catch {
      // Le sélecteur de parent reste vide ; l'erreur bloquante est portée par le submit.
    }
  }, []);

  const loadStructure = useCallback(
    async (structureId: string) => {
      setIsLoadingStructure(true);
      setError(null);
      try {
        const response = await structuresApi.get(structureId);
        setCode(response.code);
        setName(response.name);
        setType(response.type);
        setParentId(response.parentId ?? "");
      } catch (err) {
        if (err instanceof ApiError) setError(err.message || "Impossible de charger la structure");
        else setError("Impossible de charger la structure");
      } finally {
        setIsLoadingStructure(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadStructures();
    if (isEdit && id) {
      void loadStructure(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (isEdit) {
        await structuresApi.update(id!, {
          code: code.trim(),
          name: name.trim(),
          type,
          parentId: parentId === "" ? null : parentId,
        });
      } else {
        await structuresApi.create({
          code: code.trim(),
          name: name.trim(),
          type,
          parentId: parentId === "" ? null : parentId,
        });
      }
      navigate("/structures");
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Enregistrement impossible");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    navigate("/structures");
  };

  // Filtrage dynamique des parents selon le type sélectionné (règles V2).
  const parentOptions = allStructures.filter((s) => {
    if (s.id === id) return false;
    if (type === "REGIONAL_DIRECTION") return s.type === "DIRECTION";
    if (type === "AGENCY") return s.type === "REGIONAL_DIRECTION";
    return true;
  });

  const styles = {
    container: css({ maxWidth: "640px", display: "flex", flexDirection: "column", gap: "1.5rem" }),
    title: css({ fontSize: "1.5rem", fontWeight: 600, color: "var(--color-text)", margin: 0 }),
    form: css({ display: "flex", flexDirection: "column", gap: "1.25rem" }),
    field: css({ display: "flex", flexDirection: "column", gap: "0.5rem" }),
    label: css({ fontSize: "0.875rem", fontWeight: 500, color: "var(--color-text)" }),
    input: css(inputStyles),
    select: css(inputStyles),
    hint: css({ fontSize: "0.75rem", color: "var(--color-text-muted)" }),
    error: css({
      padding: "0.875rem 1rem",
      background: "var(--color-error-light)",
      border: "1px solid rgba(235, 87, 87, 0.35)",
      borderRadius: "var(--radius-md)",
      color: "var(--color-error)",
      fontSize: "0.875rem",
    }),
    card: css({
      background: "var(--color-background)",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-md)",
      padding: "1rem",
    }),
    submitButton: css({
      padding: "0.875rem 1.5rem",
      background: "var(--color-primary)",
      color: "#fff",
      border: "none",
      borderRadius: "var(--radius-md)",
      fontSize: "1rem",
      fontWeight: 500,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "0.5rem",
    }),
    cancelButton: css({
      padding: "0.875rem 1.5rem",
      background: "var(--color-background)",
      color: "var(--color-text)",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-md)",
      fontSize: "1rem",
      fontWeight: 500,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "0.5rem",
    }),
    actionsBar: css({ display: "flex", gap: "0.75rem", marginTop: "1rem" }),
  };

  return (
    <div style={styles.container} data-testid="structure-form">
      <h2 style={styles.title}>{isEdit ? "Modifier la structure" : "Nouvelle structure"}</h2>

      {error && (
        <div style={styles.error} role="alert">
          {error}
        </div>
      )}

      {isLoadingStructure ? (
        <div style={{ ...styles.card, padding: "2rem", textAlign: "center", color: "var(--color-text-muted)" }}>
          Chargement de la structure...
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label htmlFor="structure-code" style={styles.label}>
              Code
            </label>
            <input
              id="structure-code"
              style={styles.input}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ex : DIR-DPMG"
              required
              data-testid="structure-code"
            />
            <span style={styles.hint}>
              Lettres, chiffres, tiret et tiret bas uniquement — 2 à 30 caractères.
            </span>
          </div>
          <div style={styles.field}>
            <label htmlFor="structure-name" style={styles.label}>
              Nom
            </label>
            <input
              id="structure-name"
              style={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              data-testid="structure-name"
            />
          </div>
          <div style={styles.field}>
            <label htmlFor="structure-type" style={styles.label}>
              Type
            </label>
            <select
              id="structure-type"
              style={styles.select}
              value={type}
              onChange={(e) => setType(e.target.value as StructureType)}
              data-testid="structure-type"
            >
              {(Object.keys(STRUCTURE_TYPE_LABELS) as StructureType[]).map((t) => (
                <option key={t} value={t}>
                  {STRUCTURE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div style={styles.field}>
            <label htmlFor="structure-parent" style={styles.label}>
              Structure parente
            </label>
            <select
              id="structure-parent"
              style={styles.select}
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              data-testid="structure-parent"
            >
              <option value="">Aucune (racine)</option>
              {parentOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          <div style={styles.actionsBar}>
            <button type="button" onClick={handleCancel} style={styles.cancelButton} data-testid="cancel-form-btn">
              Annuler
            </button>
            <button
              type="submit"
              disabled={
                isLoading ||
                ((type === "REGIONAL_DIRECTION" || type === "AGENCY") && parentId === "")
              }
              style={styles.submitButton}
              data-testid="structure-form-submit"
            >
              {isLoading ? "Enregistrement..." : isEdit ? "Enregistrer" : "Créer la structure"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default StructureForm;
