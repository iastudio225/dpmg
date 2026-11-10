import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { authApi, ApiError } from "../services/api";

function css<T extends React.CSSProperties>(styles: T): T {
  return styles;
}

interface ChangePasswordModalProps {
  isOpen: boolean;
}

/**
 * Modal obligatoire et bloquant de changement de mot de passe.
 * S'affiche lorsque l'utilisateur authentifié a mustChangePassword === true.
 * Empêche l'accès aux fonctionnalités métier tant que le changement n'a pas réussi.
 */
export function ChangePasswordModal({ isOpen }: ChangePasswordModalProps) {
  const { user, refreshUser } = useAuth();
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const mustChangePassword = user?.mustChangePassword === true;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // Validation côté UI : confirmation doit correspondre
      if (newPassword !== confirmPassword) {
        setError("La confirmation du nouveau mot de passe ne correspond pas.");
        return;
      }

      // Réutilisation exclusive du mécanisme backend existant.
      await authApi.changePassword(temporaryPassword, newPassword);

      // Actualisation de l'état d'authentification via le mécanisme existant.
      await refreshUser();

      // Le modal ne se ferme que lorsque mustChangePassword est effectivement passé à false.
      if (user && !user.mustChangePassword) {
        // Effacer les champs après réussite.
        setTemporaryPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || "Changement de mot de passe impossible");
      } else {
        setError("Changement de mot de passe impossible");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Effacer les champs à la fermeture / démontage du modal.
  useEffect(() => {
    if (!isOpen) {
      setTemporaryPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setError(null);
    }
  }, [isOpen]);

  // Le modal ne s'affiche que s'il est ouvert ET que le changement est obligatoire.
  if (!isOpen || !mustChangePassword) return null;

  const styles = {
    overlay: css({
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: "rgba(0, 0, 0, 0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
    }),
    card: css({
      width: "100%",
      maxWidth: "400px",
      background: "var(--color-background)",
      borderRadius: "var(--radius-lg)",
      boxShadow: "var(--shadow-md)",
      border: "1px solid var(--color-border)",
      padding: "2.5rem",
    }),
    title: css({
      fontSize: "1.5rem",
      fontWeight: 700,
      color: "var(--color-primary)",
      marginBottom: "0.5rem",
      textAlign: "center",
    }),
    subtitle: css({
      color: "var(--color-text-muted)",
      fontSize: "0.875rem",
      marginBottom: "1.5rem",
      textAlign: "center",
    }),
    error: css({
      padding: "0.875rem 1rem",
      background: "var(--color-error-light)",
      border: "1px solid rgba(235, 87, 87, 0.35)",
      borderRadius: "var(--radius-md)",
      color: "var(--color-error)",
      fontSize: "0.875rem",
      marginBottom: "1rem",
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
      outline: "none",
    }),
    submitButton: css({
      marginTop: "0.5rem",
      padding: "0.875rem 1.5rem",
      background: "var(--color-primary)",
      color: "white",
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
  };

  return (
    <div
      style={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-password-modal-title"
    >
      <div style={styles.card}>
        <h2 id="change-password-modal-title" style={styles.title}>
          Changement de mot de passe obligatoire
        </h2>
        <p style={styles.subtitle}>
          Vous devez changer votre mot de passe temporaire avant d'accéder à l'application.
        </p>

        {error && (
          <div style={styles.error} role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={styles.form} noValidate>
          <div style={styles.field}>
            <label htmlFor="modal-temporary-password" style={styles.label}>
              Mot de passe temporaire actuel
            </label>
            <input
              id="modal-temporary-password"
              type="password"
              style={styles.input}
              value={temporaryPassword}
              onChange={(e) => setTemporaryPassword(e.target.value)}
              required
              autoComplete="current-password"
              data-testid="modal-temporary-password"
            />
          </div>
          <div style={styles.field}>
            <label htmlFor="modal-new-password" style={styles.label}>
              Nouveau mot de passe
            </label>
            <input
              id="modal-new-password"
              type="password"
              style={styles.input}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={12}
              required
              autoComplete="new-password"
              data-testid="modal-new-password"
            />
          </div>
          <div style={styles.field}>
            <label htmlFor="modal-confirm-password" style={styles.label}>
              Confirmer le nouveau mot de passe
            </label>
            <input
              id="modal-confirm-password"
              type="password"
              style={styles.input}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={12}
              required
              autoComplete="new-password"
              data-testid="modal-confirm-password"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            style={styles.submitButton}
            data-testid="modal-change-password-submit"
          >
            {isLoading ? "Changement en cours..." : "Changer mon mot de passe"}
          </button>
        </form>
      </div>
    </div>
  );
}
