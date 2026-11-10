import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../services/api";

function css<T extends React.CSSProperties>(styles: T): T {
  return styles;
}

export function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await login(email.trim(), password);
      // Le modal obligatoire gère le cas mustChangePassword === true de manière centralisée.
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        switch (err.code) {
          case "INVALID_CREDENTIALS":
            setError("Adresse e-mail ou mot de passe incorrect");
            break;
          case "ACCOUNT_DISABLED":
            setError("Ce compte est désactivé ou suspendu");
            break;
          case "RATE_LIMIT_EXCEEDED":
            setError("Trop de tentatives. Veuillez patienter avant de réessayer");
            break;
          case "VALIDATION_ERROR":
            setError("Veuillez vérifier les champs du formulaire");
            break;
          default:
            setError(err.message || "Erreur de connexion");
        }
      } else {
        setError("Erreur de connexion au serveur");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const styles = {
    container: css({
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "2rem 1rem",
      background: "var(--color-secondary)",
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
    header: css({
      textAlign: "center",
      marginBottom: "2rem",
    }),
    logo: css({
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "56px",
      height: "56px",
      borderRadius: "var(--radius-lg)",
      background: "var(--color-primary)",
      color: "#ffffff",
      marginBottom: "1rem",
    }),
    title: css({
      fontSize: "1.75rem",
      fontWeight: 700,
      color: "var(--color-primary)",
      marginBottom: "0.25rem",
    }),
    subtitle: css({
      color: "var(--color-text-muted)",
      fontSize: "0.9375rem",
    }),
    error: css({
      display: "flex",
      alignItems: "center",
      gap: "0.5rem",
      padding: "0.875rem 1rem",
      background: "var(--color-error-light)",
      border: "1px solid rgba(235, 87, 87, 0.35)",
      borderRadius: "var(--radius-md)",
      color: "var(--color-error)",
      fontSize: "0.875rem",
      marginBottom: "1.5rem",
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
    spinner: css({
      width: "18px",
      height: "18px",
      border: "2px solid transparent",
      borderTopColor: "white",
      borderRadius: "50%",
      animation: "spin 0.8s linear infinite",
    }),
    footer: css({
      marginTop: "2rem",
      textAlign: "center",
      fontSize: "0.75rem",
      color: "var(--color-text-muted)",
    }),
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <span style={styles.logo} aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </span>
          <h1 style={styles.title}>DPMG</h1>
          <p style={styles.subtitle}>Connexion à l'espace administration</p>
        </div>

        {error && (
          <div style={styles.error} role="alert">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label htmlFor="email" style={styles.label}>
              Adresse e-mail
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="votre@email.fr"
              required
              autoComplete="email"
              disabled={isLoading}
              className="form-input"
              style={styles.input}
            />
          </div>

          <div style={styles.field}>
            <label htmlFor="password" style={styles.label}>
              Mot de passe
            </label>
            <input
              type="password"
              id="password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              disabled={isLoading}
              className="form-input"
              style={styles.input}
            />
          </div>

          <button type="submit" disabled={isLoading} className="btn-login" style={styles.submitButton}>
            {isLoading ? (
              <>
                <span style={styles.spinner} />
                Connexion en cours...
              </>
            ) : (
              "Se connecter"
            )}
          </button>
        </form>

        <p style={styles.footer}>
          DPMG v0.0.0 — Application interne
        </p>
      </div>
    </div>
  );
}