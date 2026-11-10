import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { usersApi, ApiError } from "../../services/api";
import type { UserResponse, UserStatus } from "@dpmg/shared";

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Actif",
  SUSPENDED: "Suspendu",
  DISABLED: "Désactivé",
};

function css<T extends React.CSSProperties>(styles: T): T {
  return styles;
}

export function UtilisateursPage() {
  const navigate = useNavigate();
  const { user: currentUser, roles: currentRoles } = useAuth();
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const isCurrentUserTechnicalAdmin = currentRoles.some(
    (r) => r.role === "TECHNICAL_ADMIN"
  );

  const isCurrentUserSuperAdmin = currentRoles.some(
    (r) => r.role === "SUPER_ADMIN"
  );

  const isTargetTechnicalAdmin = (user: UserResponse) =>
    user.roles?.some((r) => r.role === "TECHNICAL_ADMIN") ?? false;

  const isTargetSuperAdmin = (user: UserResponse) =>
    user.roles?.some((r) => r.role === "SUPER_ADMIN") ?? false;

  const isTargetPrivilegedAdmin = (user: UserResponse) =>
    isTargetTechnicalAdmin(user) || isTargetSuperAdmin(user);

  const loadUsers = useCallback(async (searchTerm?: string, status?: string, role?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await usersApi.list({
        search: searchTerm,
        status: status ? (status as UserStatus) : undefined,
        role: role || undefined,
      });
      setUsers(response);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Impossible de charger les utilisateurs");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers(search || undefined, statusFilter || undefined, roleFilter || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, roleFilter]);

  const handleResetPassword = async (userId: string) => {
    const target = users.find((u) => u.id === userId);
    if (
      isCurrentUserTechnicalAdmin &&
      !isCurrentUserSuperAdmin &&
      target &&
      isTargetPrivilegedAdmin(target) &&
      target.id !== (currentUser?.id ?? "")
    ) {
      setError(
        "Action refusée : vous ne pouvez pas réinitialiser le mot de passe d'un compte administrateur protégé."
      );
      return;
    }
    setIsResetting(true);
    setTemporaryPassword(null);
    try {
      const result = await usersApi.resetPassword(userId, "ResetTemp!1234567890");
      setTemporaryPassword(result.temporaryPassword);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Réinitialisation impossible");
    } finally {
      setIsResetting(false);
    }
  };

  const handleToggleStatus = async (user: UserResponse) => {
    if (
      isCurrentUserTechnicalAdmin &&
      !isCurrentUserSuperAdmin &&
      isTargetPrivilegedAdmin(user) &&
      user.id !== (currentUser?.id ?? "")
    ) {
      setError(
        "Action refusée : vous ne pouvez pas modifier le statut d'un compte administrateur protégé."
      );
      return;
    }
    const nextStatus = user.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    try {
      const updated = await usersApi.changeStatus(user.id, nextStatus);
      setUsers((current) => current.map((u) => (u.id === user.id ? updated : u)));
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Modification du statut impossible");
    }
  };

  const styles = {
    container: css({ display: "flex", flexDirection: "column", gap: "1.5rem" }),
    header: css({ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }),
    title: css({ fontSize: "1.5rem", fontWeight: 600, color: "var(--color-text)", margin: 0 }),
    subtitle: css({ color: "var(--color-text-muted)", fontSize: "0.875rem", margin: 0 }),
    actions: css({ display: "flex", gap: "0.5rem" }),
    buttonPrimary: css({
      display: "inline-flex",
      alignItems: "center",
      gap: "0.5rem",
      padding: "0.625rem 1rem",
      background: "var(--color-primary)",
      color: "#fff",
      border: "none",
      borderRadius: "var(--radius-md)",
      fontSize: "0.875rem",
      fontWeight: 500,
      cursor: "pointer",
      textDecoration: "none",
    }),
    buttonSecondary: css({
      padding: "0.625rem 1rem",
      background: "var(--color-background)",
      color: "var(--color-text)",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-md)",
      fontSize: "0.875rem",
      fontWeight: 500,
      cursor: "pointer",
    }),
    filters: css({
      display: "flex",
      flexWrap: "wrap",
      gap: "0.75rem",
      alignItems: "flex-end",
    }),
    field: css({ display: "flex", flexDirection: "column", gap: "0.25rem" }),
    label: css({ fontSize: "0.75rem", fontWeight: 500, color: "var(--color-text)" }),
    input: css({
      padding: "0.5rem 0.75rem",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-md)",
      fontSize: "0.875rem",
      background: "var(--color-background)",
      color: "var(--color-text)",
    }),
    select: css({ padding: "0.5rem 0.75rem", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", fontSize: "0.875rem", background: "var(--color-background)", color: "var(--color-text)" }),
    card: css({
      background: "var(--color-background)",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-lg)",
      overflow: "hidden",
    }),
    table: css({ width: "100%", borderCollapse: "collapse" }),
    tableHeader: css({ textAlign: "left", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)", padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border)", background: "var(--color-secondary)" }),
    tableCell: css({ padding: "0.75rem 1rem", fontSize: "0.875rem", borderBottom: "1px solid var(--color-border)", color: "var(--color-text)" }),
    tableRow: css({}),
    badge: css({ display: "inline-block", padding: "0.125rem 0.5rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 500 }),
    badgeActive: css({ background: "rgba(46, 204, 113, 0.15)", color: "#1e8449" }),
    badgeSuspended: css({ background: "rgba(230, 126, 34, 0.15)", color: "#b9770e" }),
    badgeDisabled: css({ background: "rgba(231, 76, 60, 0.15)", color: "#c0392b" }),
    alert: css({ padding: "0.875rem 1rem", background: "var(--color-error-light)", border: "1px solid rgba(235, 87, 87, 0.35)", borderRadius: "var(--radius-md)", color: "var(--color-error)", fontSize: "0.875rem" }),
    alertInfo: css({ padding: "0.875rem 1rem", background: "var(--color-primary-light)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", color: "var(--color-text)", fontSize: "0.875rem" }),
    empty: css({ padding: "3rem 1rem", textAlign: "center", color: "var(--color-text-muted)", fontSize: "0.9375rem" }),
    loading: css({ padding: "3rem 1rem", textAlign: "center", color: "var(--color-text-muted)", fontSize: "0.9375rem" }),
  };

  return (
    <div style={styles.container} data-testid="users-page">
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Utilisateurs</h2>
          <p style={styles.subtitle}>Gestion des comptes et des habilitations techniques</p>
        </div>
        <div style={styles.actions}>
          <button style={styles.buttonPrimary} onClick={() => navigate("/utilisateurs/nouvelle")} data-testid="btn-new-user">
            + Nouvel utilisateur
          </button>
        </div>
      </div>

      {error && (
        <div style={styles.alert} role="alert">
          {error}
        </div>
      )}

      <div style={styles.filters}>
        <div style={styles.field}>
          <label htmlFor="users-search" style={styles.label}>
            Recherche
          </label>
          <input
            id="users-search"
            data-testid="users-search"
            style={styles.input}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nom, e-mail"
          />
        </div>
        <div style={styles.field}>
          <label htmlFor="users-status-filter" style={styles.label}>
            Statut
          </label>
          <select
            id="users-status-filter"
            data-testid="users-status-filter"
            style={styles.select}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Tous</option>
            <option value="ACTIVE">Actif</option>
            <option value="SUSPENDED">Suspendu</option>
            <option value="DISABLED">Désactivé</option>
          </select>
        </div>
        <div style={styles.field}>
          <label htmlFor="users-role-filter" style={styles.label}>
            Rôle
          </label>
          <select
            id="users-role-filter"
            data-testid="users-role-filter"
            style={styles.select}
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="">Tous</option>
            <option value="TECHNICAL_ADMIN">Administrateur technique</option>
            <option value="DPMG_MANAGER">Responsable DPMG</option>
            <option value="EXECUTION_AGENT">Agent d'exécution</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div style={styles.card}>
          <div style={styles.loading} data-testid="users-loading">
            Chargement des utilisateurs...
          </div>
        </div>
      ) : users.length === 0 ? (
        <div style={styles.card}>
          <div style={styles.empty} data-testid="users-empty">
            Aucun utilisateur trouvé
          </div>
        </div>
      ) : (
        <div style={styles.card}>
          <table style={styles.table} data-testid="users-list">
            <thead>
              <tr>
                <th style={styles.tableHeader}>Nom</th>
                <th style={styles.tableHeader}>E-mail</th>
                <th style={styles.tableHeader}>Statut</th>
                <th style={styles.tableHeader}>Mot de passe à changer</th>
                <th style={styles.tableHeader}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={styles.tableCell}>
                    {u.firstName} {u.lastName}
                  </td>
                  <td style={styles.tableCell} data-testid={`user-email-${u.id}`}>
                    {u.email}
                  </td>
                  <td style={styles.tableCell}>
                    <span style={{ ...styles.badge, ...(u.status === "ACTIVE" ? styles.badgeActive : u.status === "SUSPENDED" ? styles.badgeSuspended : styles.badgeDisabled) }} data-testid={`user-status-${u.id}`}>
                      {STATUS_LABELS[u.status] ?? u.status}
                    </span>
                    {isTargetSuperAdmin(u) && (
                      <span style={{ ...styles.badge, ...styles.badgeActive }} data-testid={`user-super-admin-${u.id}`} title="Super administrateur protégé">
                        SUPER_ADMIN
                      </span>
                    )}
                    {isTargetTechnicalAdmin(u) && (
                      <span style={{ ...styles.badge, ...styles.badgeActive }} data-testid={`user-tech-admin-${u.id}`} title="Administrateur technique protégé">
                        TECHNICAL_ADMIN
                      </span>
                    )}
                  </td>
                  <td style={styles.tableCell}>{u.mustChangePassword ? "Oui" : "Non"}</td>
                  <td style={styles.tableCell}>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        style={styles.buttonSecondary}
                        onClick={() => navigate(`/utilisateurs/${u.id}/modifier`)}
                        disabled={
                          u.id !== (currentUser?.id ?? "") &&
                          isTargetPrivilegedAdmin(u) &&
                          (
                            (isCurrentUserTechnicalAdmin && !isCurrentUserSuperAdmin) ||
                            (isCurrentUserSuperAdmin && isTargetSuperAdmin(u))
                          )
                        }
                        data-testid={`btn-edit-user-${u.id}`}
                      >
                        Modifier
                      </button>
                      <button
                        style={styles.buttonSecondary}
                        onClick={() => void handleResetPassword(u.id)}
                        disabled={
                          isResetting ||
                          (((isCurrentUserTechnicalAdmin && !isCurrentUserSuperAdmin) || isCurrentUserSuperAdmin) &&
                            isTargetPrivilegedAdmin(u) &&
                            u.id !== (currentUser?.id ?? ""))
                        }
                        data-testid={`btn-reset-password-${u.id}`}
                      >
                        Réinitialiser le mot de passe
                      </button>
                      <button
                        style={styles.buttonSecondary}
                        onClick={() => void handleToggleStatus(u)}
                        disabled={
                          isCurrentUserTechnicalAdmin &&
                          !isCurrentUserSuperAdmin &&
                          isTargetPrivilegedAdmin(u) &&
                          u.id !== (currentUser?.id ?? "")
                        }
                        data-testid={`btn-toggle-status-${u.id}`}
                      >
                        {u.status === "ACTIVE" ? "Désactiver" : "Réactiver"}
                      </button>
                    </div>
                    {isTargetPrivilegedAdmin(u) && u.id !== (currentUser?.id ?? "") && (
                      <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.25rem" }}>
                        Compte administrateur protégé — actions restreintes.
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {temporaryPassword && (
        <div style={styles.alert} data-testid="reset-password-result">
          <div>Mot de passe temporaire généré :</div>
          <code>{temporaryPassword}</code>
          <button
            style={styles.buttonSecondary}
            onClick={() => setTemporaryPassword(null)}
            data-testid="btn-clear-temporary-password"
          >
            Fermer
          </button>
        </div>
      )}
    </div>
  );
}

export default UtilisateursPage;
