import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { usersApi, structuresApi, departmentsApi, ApiError } from "../../services/api";
import type {
  DepartmentResponse,
  RoleType,
  StructureResponse,
  UserRoleResponse,
  UserStatus,
} from "@dpmg/shared";

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

const ROLE_LABELS: Record<string, string> = {
  EMPLOYEE: "Employé",
  HIERARCHICAL_MANAGER: "Manager hiérarchique",
  DEPARTMENT_MANAGER: "Manager de département",
  DPMG_MANAGER: "Responsable DPMG",
  DPMG_DELEGATE: "Délégué DPMG",
  DFC_CONTROLLER: "Contrôleur DFC",
  CPMP_USER: "Utilisateur CPMP",
  DG_USER: "Utilisateur DG",
  EXECUTION_AGENT: "Agent d'exécution",
  TECHNICAL_ADMIN: "Administrateur technique",
  SUPER_ADMIN: "Super administrateur",
};

/** Résultat de la recherche du département associé à une structure donnée. */
type DepartmentLookup = {
  structureId: string;
  status: "loading" | "loaded" | "error";
  department: DepartmentResponse | null;
};

export function UtilisateurForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<UserStatus>("ACTIVE");
  const [originalStatus, setOriginalStatus] = useState<UserStatus>("ACTIVE");
  const [structureId, setStructureId] = useState("");
  const [role, setRole] = useState<RoleType>("EMPLOYEE");
  const [scope, setScope] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingUser, setIsLoadingUser] = useState(false);

  const [structures, setStructures] = useState<StructureResponse[]>([]);
  const [isLoadingStructures, setIsLoadingStructures] = useState(false);
  const [structuresError, setStructuresError] = useState<string | null>(null);
  const [departmentLookup, setDepartmentLookup] = useState<DepartmentLookup | null>(null);

  const [existingRoles, setExistingRoles] = useState<UserRoleResponse[]>([]);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editingScope, setEditingScope] = useState("");
  const [editingStartDate, setEditingStartDate] = useState("");
  const [editingEndDate, setEditingEndDate] = useState("");

  const isGlobalAdmin = role === "TECHNICAL_ADMIN" || role === "SUPER_ADMIN";
  const activeStructures = structures.filter((s) => s.status);
  const editedRole = existingRoles.find((r) => r.id === editingRoleId) ?? null;

  // Chargement unique des structures actives, partagé par la création et l'édition.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setIsLoadingStructures(true);
      setStructuresError(null);
      try {
        const response = await structuresApi.list({ status: true, limit: 100 });
        if (!cancelled) setStructures(response);
      } catch {
        if (!cancelled) setStructuresError("Impossible de charger les structures");
      } finally {
        if (!cancelled) setIsLoadingStructures(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Récupération du département associé à la structure sélectionnée.
  // Le drapeau `cancelled` et la garde sur `structureId` empêchent une réponse
  // obsolète d'être affichée après un changement rapide de sélection.
  useEffect(() => {
    if (!structureId || isGlobalAdmin) {
      setDepartmentLookup(null);
      return;
    }

    const requestedStructureId = structureId;
    let cancelled = false;
    setDepartmentLookup({ structureId: requestedStructureId, status: "loading", department: null });

    void (async () => {
      try {
        const departments = await departmentsApi.list({ structureId: requestedStructureId });
        if (cancelled) return;
        setDepartmentLookup({
          structureId: requestedStructureId,
          status: "loaded",
          department: departments[0] ?? null,
        });
      } catch {
        if (cancelled) return;
        setDepartmentLookup({ structureId: requestedStructureId, status: "error", department: null });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [structureId, isGlobalAdmin]);

  const loadUser = useCallback(async (userId: string) => {
    setIsLoadingUser(true);
    setError(null);
    try {
      const response = await usersApi.get(userId);
      setFirstName(response.user.firstName);
      setLastName(response.user.lastName);
      setEmail(response.user.email);
      setPhone(response.user.phone ?? "");
      setStatus(response.user.status as UserStatus);
      setOriginalStatus(response.user.status as UserStatus);
      setExistingRoles(response.roles);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || "Impossible de charger l'utilisateur");
      } else {
        setError("Impossible de charger l'utilisateur");
      }
    } finally {
      setIsLoadingUser(false);
    }
  }, []);

  useEffect(() => {
    if (isEdit && id) {
      void loadUser(id);
    }
  }, [isEdit, id, loadUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (isEdit) {
        await usersApi.update(id!, {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim() === "" ? null : phone.trim(),
          email: email.trim(),
        });
        if (status !== originalStatus) {
          await usersApi.changeStatus(id!, status);
        }
        navigate("/utilisateurs");
      } else {
        await usersApi.create({
          email: email.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim() === "" ? null : phone.trim(),
          status,
          password,
          roles: [
            {
              role,
              structureId: isGlobalAdmin ? null : structureId,
              scope: isGlobalAdmin ? "*" : (scope.trim() === "" ? null : scope.trim()),
            },
          ],
        });
        navigate("/utilisateurs");
      }
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Enregistrement impossible");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddRole = async () => {
    setError(null);
    setIsLoading(true);
    try {
      await usersApi.assignRole(id!, {
        role,
        structureId: isGlobalAdmin ? null : structureId,
        scope: isGlobalAdmin ? "*" : (scope.trim() === "" ? null : scope.trim()),
      });
      if (id) {
        const response = await usersApi.get(id);
        setExistingRoles(response.roles);
        setStructureId("");
        setRole("EMPLOYEE");
        setScope("");
      }
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Impossible d'ajouter le rôle");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveRole = async (roleToRemove: UserRoleResponse) => {
    setError(null);
    if (!roleToRemove.id) {
      setError("Identifiant du rôle introuvable : suppression impossible");
      return;
    }
    setIsLoading(true);
    try {
      await usersApi.removeRole(id!, roleToRemove.id);
      if (id) {
        const response = await usersApi.get(id);
        setExistingRoles(response.roles);
      }
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Impossible de supprimer le rôle");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditRole = (roleToEdit: UserRoleResponse) => {
    if (!roleToEdit.id) {
      setError("Identifiant du rôle introuvable : modification impossible");
      return;
    }
    setEditingRoleId(roleToEdit.id);
    setEditingScope(roleToEdit.scope ?? "");
    const tIndex = roleToEdit.startDate.indexOf("T");
    setEditingStartDate(tIndex >= 0 ? roleToEdit.startDate.substring(0, tIndex) : roleToEdit.startDate);
    const endDateStr = roleToEdit.endDate ?? "";
    const endDateTIndex = endDateStr.indexOf("T");
    setEditingEndDate(endDateTIndex >= 0 ? endDateStr.substring(0, endDateTIndex) : "");
  };

  const handleSaveRole = async () => {
    setError(null);
    if (editingRoleId === null) return;
    const roleToEdit = existingRoles.find((r) => r.id === editingRoleId);
    if (!roleToEdit?.id) {
      setError("Identifiant du rôle introuvable : modification impossible");
      return;
    }
    setIsLoading(true);
    try {
      await usersApi.updateRole(id!, roleToEdit.id, {
        scope: editingScope || undefined,
        startDate: editingStartDate ? `${editingStartDate}T00:00:00.000Z` : undefined,
        endDate: editingEndDate ? `${editingEndDate}T00:00:00.000Z` : undefined,
      });
      if (id) {
        const response = await usersApi.get(id);
        setExistingRoles(response.roles);
        setEditingRoleId(null);
        setEditingScope("");
        setEditingStartDate("");
        setEditingEndDate("");
      }
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Impossible de modifier le rôle");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelRoleEdit = () => {
    setEditingRoleId(null);
    setEditingScope("");
    setEditingStartDate("");
    setEditingEndDate("");
  };

  const handleCancel = () => {
    navigate("/utilisateurs");
  };

  const roleOptions: { value: RoleType; label: string }[] = [
    { value: "EMPLOYEE", label: "Employé" },
    { value: "HIERARCHICAL_MANAGER", label: "Manager hiérarchique" },
    { value: "DEPARTMENT_MANAGER", label: "Manager de département" },
    { value: "DPMG_MANAGER", label: "Responsable DPMG" },
    { value: "EXECUTION_AGENT", label: "Agent d'exécution" },
    { value: "TECHNICAL_ADMIN", label: "Administrateur technique" },
    { value: "SUPER_ADMIN", label: "Super administrateur" },
  ];

  const styles = {
    container: css({ maxWidth: "640px", display: "flex", flexDirection: "column", gap: "1.5rem" }),
    title: css({ fontSize: "1.5rem", fontWeight: 600, color: "var(--color-text)", margin: 0 }),
    form: css({ display: "flex", flexDirection: "column", gap: "1.25rem" }),
    field: css({ display: "flex", flexDirection: "column", gap: "0.5rem" }),
    label: css({ fontSize: "0.875rem", fontWeight: 500, color: "var(--color-text)" }),
    input: css(inputStyles),
    select: css(inputStyles),
    hint: css({ fontSize: "0.75rem", color: "var(--color-text-muted)" }),
    readOnlyValue: css({ fontSize: "0.875rem", color: "var(--color-text)" }),
    error: css({ padding: "0.875rem 1rem", background: "var(--color-error-light)", border: "1px solid rgba(235, 87, 87, 0.35)", borderRadius: "var(--radius-md)", color: "var(--color-error)", fontSize: "0.875rem" }),
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
    card: css({
      background: "var(--color-background)",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-md)",
      padding: "1rem",
    }),
    rolesContainer: css({
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-md)",
      padding: "1rem",
      background: "var(--color-background)",
    }),
    roleRow: css({
      display: "flex",
      flexDirection: "column",
      gap: "0.5rem",
      padding: "0.75rem",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-sm)",
      marginBottom: "0.5rem",
      background: "var(--color-background-light)",
    }),
    roleActions: css({
      display: "flex",
      gap: "0.5rem",
      marginTop: "0.5rem",
    }),
    smallButton: css({
      padding: "0.375rem 0.75rem",
      fontSize: "0.875rem",
      cursor: "pointer",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-sm)",
      background: "var(--color-background)",
      color: "var(--color-text)",
    }),
    smallButtonDanger: css({
      padding: "0.375rem 0.75rem",
      fontSize: "0.875rem",
      cursor: "pointer",
      border: "1px solid var(--color-error)",
      borderRadius: "var(--radius-sm)",
      background: "var(--color-error-light)",
      color: "var(--color-error)",
    }),
    actionsBar: css({
      display: "flex",
      gap: "0.75rem",
      marginTop: "1rem",
    }),
  };

  // Seules les données de la structure effectivement sélectionnée sont affichables :
  // aucune réponse d'une sélection précédente ne peut être restituée.
  const activeDepartmentLookup =
    departmentLookup &&
    departmentLookup.structureId === structureId &&
    !isGlobalAdmin &&
    structureId !== ""
      ? departmentLookup
      : null;

  const renderDepartment = (prefix: string) => (
    <div style={styles.field} data-testid={`${prefix}-department`}>
      <span style={styles.label}>Département associé</span>
      {activeDepartmentLookup?.status === "loading" && (
        <span style={styles.hint} role="status" data-testid={`${prefix}-department-loading`}>
          Récupération du département associé…
        </span>
      )}
      {activeDepartmentLookup?.status === "error" && (
        <span style={styles.hint} role="status" data-testid={`${prefix}-department-error`}>
          Impossible de récupérer le département associé
        </span>
      )}
      {activeDepartmentLookup?.status === "loaded" &&
        (activeDepartmentLookup.department ? (
          <span style={styles.readOnlyValue} data-testid={`${prefix}-department-value`}>
            {activeDepartmentLookup.department.name}
            {!activeDepartmentLookup.department.status && (
              <span style={styles.hint} data-testid={`${prefix}-department-inactive`}>
                {" "}
                (inactif)
              </span>
            )}
          </span>
        ) : (
          <span style={styles.hint} role="status" data-testid={`${prefix}-department-empty`}>
            Aucun département associé
          </span>
        ))}
    </div>
  );

  const renderStructureFields = (prefix: string) => (
    <>
      <div style={styles.field}>
        <label htmlFor={`${prefix}-structure-id`} style={styles.label}>
          Structure
        </label>
        <select
          id={`${prefix}-structure-id`}
          style={styles.select}
          value={structureId}
          onChange={(e) => setStructureId(e.target.value)}
          disabled={isLoadingStructures}
          data-testid={`${prefix}-structure-id`}
        >
          <option value="">— Choisir une structure —</option>
          {activeStructures.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.code})
            </option>
          ))}
        </select>
        {isLoadingStructures && (
          <span style={styles.hint} role="status" data-testid={`${prefix}-structures-loading`}>
            Chargement des structures…
          </span>
        )}
        {structuresError && (
          <span style={styles.hint} role="status" data-testid={`${prefix}-structures-error`}>
            {structuresError}
          </span>
        )}
        <span style={styles.hint}>
          Structure à laquelle l'utilisateur est rattaché.
        </span>
      </div>
      {renderDepartment(prefix)}
    </>
  );

  return (
    <div style={styles.container} data-testid="utilisateur-form">
      <h2 style={styles.title}>{isEdit ? "Modifier l'utilisateur" : "Nouvel utilisateur"}</h2>

      {error && (
        <div style={styles.error} role="alert">
          {error}
        </div>
      )}

      {isLoadingUser && (
        <div style={{ ...styles.card, padding: "2rem", textAlign: "center", color: "var(--color-text-muted)" }}>
          Chargement de l'utilisateur...
        </div>
      )}

      {!isLoadingUser && (
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label htmlFor="user-last-name" style={styles.label}>
              Nom
            </label>
            <input
              id="user-last-name"
              style={styles.input}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              data-testid="user-last-name"
            />
          </div>
          <div style={styles.field}>
            <label htmlFor="user-first-name" style={styles.label}>
              Prénom
            </label>
            <input
              id="user-first-name"
              style={styles.input}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              data-testid="user-first-name"
            />
          </div>
          <div style={styles.field}>
            <label htmlFor="user-email" style={styles.label}>
              E-mail
            </label>
            <input
              id="user-email"
              type="email"
              style={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              data-testid="user-email"
            />
          </div>
          <div style={styles.field}>
            <label htmlFor="user-phone" style={styles.label}>
              Téléphone
            </label>
            <input
              id="user-phone"
              style={styles.input}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              data-testid="user-phone"
            />
          </div>

          {!isEdit && (
            <>
              <div style={styles.field}>
                <label htmlFor="user-password" style={styles.label}>
                  Mot de passe temporaire
                </label>
                <input
                  id="user-password"
                  type="text"
                  style={styles.input}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={12}
                  required
                  data-testid="user-password"
                />
                <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                  Le compte sera créé avec un mot de passe temporaire et le changement sera obligatoire à la première connexion.
                </span>
              </div>
              <div style={styles.field}>
                <label htmlFor="user-status" style={styles.label}>
                  Statut
                </label>
                <select
                  id="user-status"
                  style={styles.input}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as UserStatus)}
                  data-testid="user-status"
                >
                  <option value="ACTIVE">Actif</option>
                  <option value="SUSPENDED">Suspendu</option>
                  <option value="DISABLED">Désactivé</option>
                </select>
              </div>
              <div style={styles.field}>
                <label htmlFor="user-role" style={styles.label}>
                  Rôle
                </label>
                <select
                  id="user-role"
                  style={styles.input}
                  value={role}
                  onChange={(e) => setRole(e.target.value as RoleType)}
                  data-testid="user-role"
                >
                  {roleOptions.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                {!isGlobalAdmin && (
                  <>
                    {renderStructureFields("user")}
                    <div style={styles.field}>
                      <label htmlFor="user-scope" style={styles.label}>
                        Périmètre (optionnel)
                      </label>
                      <input
                        id="user-scope"
                        style={styles.input}
                        value={scope}
                        onChange={(e) => setScope(e.target.value)}
                        placeholder="Périmètre"
                        data-testid="user-scope"
                      />
                    </div>
                  </>
                )}
                {isGlobalAdmin && (
                  <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                    Périmètre global (*) — aucun rattachement à une structure.
                  </span>
                )}
              </div>
            </>
          )}

          {isEdit && (
            <>
              <div style={styles.field}>
                <label htmlFor="user-status-edit" style={styles.label}>
                  Statut du compte
                </label>
                <select
                  id="user-status-edit"
                  style={styles.input}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as UserStatus)}
                  data-testid="user-status-edit"
                >
                  <option value="ACTIVE">Actif</option>
                  <option value="SUSPENDED">Suspendu</option>
                  <option value="DISABLED">Désactivé</option>
                </select>
              </div>

              <div style={styles.rolesContainer}>
                <div style={styles.field}>
                  <label htmlFor="user-role-edit" style={styles.label}>
                    Rôles existants
                  </label>
                </div>
                {existingRoles.length === 0 ? (
                  <div style={{ color: "var(--color-text-muted)", fontSize: "0.875rem", padding: "0.5rem" }}>
                    Aucun rôle assigné.
                  </div>
                ) : (
                  existingRoles.map((existingRole) => {
                    const roleKey = existingRole.id || "sans-identifiant";
                    return (
                      <div key={roleKey} style={styles.roleRow} data-testid={`role-row-${roleKey}`}>
                        <div style={{ fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.25rem" }}>
                          {ROLE_LABELS[existingRole.role] ?? existingRole.role}
                          {existingRole.scope && (
                            <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginLeft: "0.5rem" }}>
                              [{existingRole.scope}]
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginBottom: "0.5rem" }}>
                          Structure : {existingRole.structureId ?? "Aucune (global)"}
                        </div>
                        <div style={styles.roleActions}>
                          <button
                            type="button"
                            onClick={() => handleEditRole(existingRole)}
                            style={styles.smallButton}
                            data-testid={`edit-role-${roleKey}`}
                          >
                            Modifier
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveRole(existingRole)}
                            style={styles.smallButtonDanger}
                            data-testid={`remove-role-${roleKey}`}
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}

                <div style={styles.field}>
                  <label htmlFor="add-user-role" style={styles.label}>
                    Ajouter un rôle
                  </label>
                  <select
                    id="add-user-role"
                    style={styles.input}
                    value={role}
                    onChange={(e) => setRole(e.target.value as RoleType)}
                    data-testid="add-user-role"
                  >
                    {roleOptions.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  {!isGlobalAdmin && (
                    <>
                      {renderStructureFields("add-user")}
                      <div style={styles.field}>
                        <label htmlFor="add-user-scope" style={styles.label}>
                          Périmètre (optionnel)
                        </label>
                        <input
                          id="add-user-scope"
                          style={styles.input}
                          value={scope}
                          onChange={(e) => setScope(e.target.value)}
                          placeholder="Périmètre"
                          data-testid="add-user-scope"
                        />
                      </div>
                    </>
                  )}
                  {isGlobalAdmin && (
                    <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                      Périmètre global (*) — aucun rattachement à une structure.
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleAddRole}
                  style={styles.submitButton}
                  data-testid="add-user-role-btn"
                >
                  Ajouter le rôle
                </button>
              </div>

              {editingRoleId !== null && editedRole && (
                <div style={styles.rolesContainer}>
                  <div style={styles.field}>
                    <label htmlFor="edit-role-scope" style={styles.label}>
                      Modifier le rôle — {ROLE_LABELS[editedRole.role] ?? editedRole.role}
                    </label>
                  </div>
                  <div style={styles.field}>
                    <label htmlFor="edit-role-scope-input" style={styles.label}>
                      Périmètre
                    </label>
                    <input
                      id="edit-role-scope-input"
                      style={styles.input}
                      value={editingScope}
                      onChange={(e) => setEditingScope(e.target.value)}
                      data-testid="edit-role-scope-input"
                    />
                  </div>
                  <div style={styles.field}>
                    <label htmlFor="edit-role-start-date" style={styles.label}>
                      Date de début
                    </label>
                    <input
                      id="edit-role-start-date"
                      type="date"
                      style={styles.input}
                      value={editingStartDate}
                      onChange={(e) => setEditingStartDate(e.target.value)}
                      data-testid="edit-role-start-date"
                    />
                  </div>
                  <div style={styles.field}>
                    <label htmlFor="edit-role-end-date" style={styles.label}>
                      Date de fin (optionnel)
                    </label>
                    <input
                      id="edit-role-end-date"
                      type="date"
                      style={styles.input}
                      value={editingEndDate}
                      onChange={(e) => setEditingEndDate(e.target.value)}
                      data-testid="edit-role-end-date"
                    />
                  </div>
                  <div style={styles.roleActions}>
                    <button
                      type="button"
                      onClick={handleSaveRole}
                      style={styles.smallButton}
                      data-testid="save-role-btn"
                    >
                      Enregistrer
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelRoleEdit}
                      style={styles.smallButtonDanger}
                      data-testid="cancel-role-edit-btn"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          <div style={styles.actionsBar}>
            <button
              type="button"
              onClick={handleCancel}
              style={styles.cancelButton}
              data-testid="cancel-form-btn"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isLoading}
              style={styles.submitButton}
              data-testid="user-form-submit"
            >
              {isLoading ? "Enregistrement..." : isEdit ? "Enregistrer" : "Créer l'utilisateur"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default UtilisateurForm;
