import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { departmentsApi, structuresApi, ApiError } from "../../services/api";
import type { DepartmentResponse, StructureResponse } from "@dpmg/shared";

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

export function DepartementForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [structureId, setStructureId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDepartment, setIsLoadingDepartment] = useState(false);

  const [structures, setStructures] = useState<StructureResponse[]>([]);
  const [allDepartments, setAllDepartments] = useState<DepartmentResponse[]>([]);
  const [currentStructureMissing, setCurrentStructureMissing] = useState(false);

  /** Structures réelles, hors celles rattachées à un AUTRE département. */
  const availableStructures = structures.filter((s) => {
    const assignedToOther = allDepartments.some(
      (d) => d.structureId === s.id && d.id !== id
    );
    return !assignedToOther;
  });

  const loadReferenceData = useCallback(async () => {
    try {
      const [structureList, departmentList] = await Promise.all([
        structuresApi.list({ limit: 100 }),
        departmentsApi.list({ limit: 100 }),
      ]);
      setStructures(structureList);
      setAllDepartments(departmentList);
      return structureList;
    } catch {
      // Erreur non bloquante pour le rendu : signalée à la soumission si besoin.
      return [] as StructureResponse[];
    }
  }, []);

  const loadDepartment = useCallback(
    async (departmentId: string, structureList: StructureResponse[]) => {
      setIsLoadingDepartment(true);
      setError(null);
      try {
        const response = await departmentsApi.get(departmentId);
        setName(response.name);
        setCode(response.code);
        setDescription(response.description ?? "");
        setStructureId(response.structureId ?? "");
        // La structure actuelle doit rester proposée, même s'elle a disparu de
        // la liste : on signale alors explicitement son indisponibilité.
        if (response.structureId && !structureList.some((s) => s.id === response.structureId)) {
          setCurrentStructureMissing(true);
        }
      } catch (err) {
        if (err instanceof ApiError) setError(err.message || "Impossible de charger le département");
        else setError("Impossible de charger le département");
      } finally {
        setIsLoadingDepartment(false);
      }
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const structureList = await loadReferenceData();
      if (cancelled) return;
      if (isEdit && id) {
        await loadDepartment(id, structureList);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!structureId) {
      setError("La structure de rattachement est requise.");
      return;
    }

    setIsLoading(true);
    try {
      if (isEdit) {
        await departmentsApi.update(id!, {
          name: name.trim(),
          code: code.trim(),
          description: description.trim() === "" ? null : description.trim(),
          structureId,
        });
      } else {
        await departmentsApi.create({
          name: name.trim(),
          code: code.trim(),
          description: description.trim() === "" ? null : description.trim(),
          structureId,
        });
      }
      navigate("/departements");
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Enregistrement impossible");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    navigate("/departements");
  };

  const styles = {
    container: css({ maxWidth: "640px", display: "flex", flexDirection: "column", gap: "1.5rem" }),
    title: css({ fontSize: "1.5rem", fontWeight: 600, color: "var(--color-text)", margin: 0 }),
    form: css({ display: "flex", flexDirection: "column", gap: "1.25rem" }),
    field: css({ display: "flex", flexDirection: "column", gap: "0.5rem" }),
    label: css({ fontSize: "0.875rem", fontWeight: 500, color: "var(--color-text)" }),
    input: css(inputStyles),
    select: css(inputStyles),
    hint: css({ fontSize: "0.75rem", color: "var(--color-text-muted)" }),
    warning: css({
      padding: "0.75rem 1rem",
      background: "var(--color-primary-light)",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-md)",
      color: "var(--color-text)",
      fontSize: "0.875rem",
    }),
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
    <div style={styles.container} data-testid="departement-form">
      <h2 style={styles.title}>{isEdit ? "Modifier le département" : "Nouveau département"}</h2>

      {error && (
        <div style={styles.error} role="alert">
          {error}
        </div>
      )}

      {isLoadingDepartment ? (
        <div style={{ ...styles.card, padding: "2rem", textAlign: "center", color: "var(--color-text-muted)" }}>
          Chargement du département...
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label htmlFor="department-name" style={styles.label}>
              Nom
            </label>
            <input
              id="department-name"
              style={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              data-testid="department-name"
            />
          </div>
          <div style={styles.field}>
            <label htmlFor="department-code" style={styles.label}>
              Code
            </label>
            <input
              id="department-code"
              style={styles.input}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ex : INFRA"
              required
              data-testid="department-code"
            />
            <span style={styles.hint}>
              Lettres, chiffres, tiret et tiret bas uniquement — 2 à 30 caractères.
            </span>
          </div>
          <div style={styles.field}>
            <label htmlFor="department-description" style={styles.label}>
              Description
            </label>
            <textarea
              id="department-description"
              style={{ ...styles.input, minHeight: "96px", resize: "vertical" }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              data-testid="department-description"
            />
          </div>
          <div style={styles.field}>
            <label htmlFor="department-structure" style={styles.label}>
              Structure de rattachement
            </label>
            <select
              id="department-structure"
              style={styles.select}
              value={structureId}
              onChange={(e) => setStructureId(e.target.value)}
              required
              data-testid="department-structure"
            >
              <option value="">— Choisir une structure —</option>
              {availableStructures.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
              {/* Structure actuelle conservée même si absente de la liste. */}
              {isEdit &&
                structureId &&
                !availableStructures.some((s) => s.id === structureId) && (
                  <option value={structureId} data-testid="current-structure-option">
                    {structureId} (indisponible)
                  </option>
                )}
            </select>
            <span style={styles.hint}>
              Seules les structures sans département rattaché sont proposées.
            </span>
            {currentStructureMissing && (
              <span style={styles.warning} role="status" data-testid="structure-missing-warning">
                La structure actuelle de ce département n'est plus disponible. Choisissez une
                structure de remplacement avant d'enregistrer.
              </span>
            )}
          </div>

          <div style={styles.actionsBar}>
            <button type="button" onClick={handleCancel} style={styles.cancelButton} data-testid="cancel-form-btn">
              Annuler
            </button>
            <button
              type="submit"
              disabled={isLoading}
              style={styles.submitButton}
              data-testid="departement-form-submit"
            >
              {isLoading ? "Enregistrement..." : isEdit ? "Enregistrer" : "Créer le département"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default DepartementForm;
