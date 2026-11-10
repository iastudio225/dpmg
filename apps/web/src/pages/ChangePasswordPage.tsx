import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authApi, ApiError } from "../services/api";

function css<T extends React.CSSProperties>(styles: T): T {
  return styles;
}

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = await authApi.changePassword(currentPassword, newPassword);
      if (result.mustChangePassword) {
        setError("Le mot de passe temporaire doit être remplacé");
        return;
      }
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Changement de mot de passe impossible");
    } finally {
      setIsLoading(false);
    }
  };

  const styles = {
    container: css({ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1rem", background: "var(--color-secondary)" }),
    card: css({ width: "100%", maxWidth: "400px", background: "var(--color-background)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-md)", border: "1px solid var(--color-border)", padding: "2.5rem" }),
    title: css({ fontSize: "1.5rem", fontWeight: 700, color: "var(--color-primary)", marginBottom: "0.5rem", textAlign: "center" }),
    subtitle: css({ color: "var(--color-text-muted)", fontSize: "0.875rem", marginBottom: "1.5rem", textAlign: "center" }),
    form: css({ display: "flex", flexDirection: "column", gap: "1.25rem" }),
    field: css({ display: "flex", flexDirection: "column", gap: "0.5rem" }),
    label: css({ fontSize: "0.875rem", fontWeight: 500, color: "var(--color-text)" }),
    input: css({
      padding: "0.75rem 1rem",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-md)",
      fontSize: "1rem",
      color: "var(--color-text)",
      background: "var(--color-background)",
      outline: "none",
    }),
    error: css({ padding: "0.875rem 1rem", background: "var(--color-error-light)", border: "1px solid rgba(235, 87, 87, 0.35)", borderRadius: "var(--radius-md)", color: "var(--color-error)", fontSize: "0.875rem" }),
    submitButton: css({ marginTop: "0.5rem", padding: "0.875rem 1.5rem", background: "var(--color-primary)", color: "white", border: "none", borderRadius: "var(--radius-md)", fontSize: "1rem", fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }),
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.title}>Changement de mot de passe</div>
        <div style={styles.subtitle}>Vous devez définir un nouveau mot de passe avant d'accéder à l'application.</div>

        {error && (
          <div style={styles.error} role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label htmlFor="change-current-password" style={styles.label}>
              Mot de passe actuel
            </label>
            <input id="change-current-password" type="password" style={styles.input} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required autoComplete="current-password" data-testid="change-current-password" />
          </div>
          <div style={styles.field}>
            <label htmlFor="change-new-password" style={styles.label}>
              Nouveau mot de passe
            </label>
            <input id="change-new-password" type="password" style={styles.input} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={12} required autoComplete="new-password" data-testid="change-new-password" />
          </div>
          <button type="submit" disabled={isLoading} style={styles.submitButton} data-testid="change-password-submit">
            {isLoading ? "Enregistrement..." : "Définir le nouveau mot de passe"}
          </button>
        </form>
      </div>
    </div>
  );
}
