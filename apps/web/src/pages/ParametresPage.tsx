import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { databaseAdminApi, ApiError } from "../services/api";

function css<T extends React.CSSProperties>(styles: T): T {
  return styles;
}

export function ParametresPage() {
  const { roles } = useAuth();
  const isTechAdmin = roles.some((r) => r.role === "TECHNICAL_ADMIN");

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [lastBackup, setLastBackup] = useState<string | null>(null);

  // Operational reset modal state
  const [opOpen, setOpOpen] = useState(false);
  const [opPassword, setOpPassword] = useState("");
  const [opConfirm, setOpConfirm] = useState("");

  const [fullOpen, setFullOpen] = useState(false);
  const [fullPassword, setFullPassword] = useState("");
  const [fullConfirm, setFullConfirm] = useState("");

  const handleBackup = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await databaseAdminApi.backup();
      setLastBackup(res.createdAt);
      setMessage(`Sauvegarde créée avec succès (${res.sizeBytes} octets).`);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Échec de la sauvegarde.");
    } finally {
      setBusy(false);
    }
  };

  const handleOperational = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await databaseAdminApi.resetOperational(opPassword, opConfirm);
      setMessage(`Réinitialisation opérationnelle terminée. Sauvegarde : ${res.backupReference}.`);
      setOpOpen(false);
      setOpPassword("");
      setOpConfirm("");
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Échec de la réinitialisation opérationnelle.");
    } finally {
      setBusy(false);
    }
  };

  const handleFull = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await databaseAdminApi.resetFull(fullPassword, fullConfirm);
      setMessage(`Réinitialisation complète terminée. Sauvegarde : ${res.backupReference}.`);
      setFullOpen(false);
      setFullPassword("");
      setFullConfirm("");
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Échec de la réinitialisation complète.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Paramètres</h1>
      {message && <div style={styles.success}>{message}</div>}
      {error && <div style={styles.error}>{error}</div>}

      {isTechAdmin && (
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Administration de la base de données</h2>

          {/* Backup */}
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Sauvegarde</h3>
            <p style={styles.text}>Créer une sauvegarde vérifiable de la base de données.</p>
            {lastBackup && <p style={styles.text}>Dernière sauvegarde : {lastBackup}</p>}
            <button style={styles.button} onClick={handleBackup} disabled={busy}>
              Créer une sauvegarde
            </button>
          </div>

          {/* Operational reset */}
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Réinitialisation opérationnelle</h3>
            <p style={styles.text}>
              Supprime les données opérationnelles (demandes, décisions, consolidations, observations, notifications, files de notifications, sessions).
            </p>
            <p style={styles.text}><strong>Conservé :</strong> utilisateurs, rôles, structures, départements, journaux d'audit.</p>
            <button style={styles.buttonDanger} onClick={() => setOpOpen(true)} disabled={busy}>
              Réinitialiser les données opérationnelles
            </button>
          </div>

          {/* Full reset */}
          <div style={styles.cardDanger}>
            <h3 style={styles.cardTitle}>⚠ Réinitialisation complète</h3>
            <p style={styles.text}>
              Supprime toutes les données applicatives, y compris structures, départements et données métier.
              Tous les comptes TECHNICAL_ADMIN sont conservés.
            </p>
            <button style={styles.buttonDanger} onClick={() => setFullOpen(true)} disabled={busy}>
              Réinitialisation complète
            </button>
          </div>
        </section>
      )}

      {opOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h3>Confirmer la réinitialisation opérationnelle</h3>
            <p>Saisissez votre mot de passe actuel et le texte REINITIALISER.</p>
            <input
              type="password"
              placeholder="Mot de passe actuel"
              value={opPassword}
              onChange={(e) => setOpPassword(e.target.value)}
              style={styles.input}
            />
            <input
              type="text"
              placeholder="REINITIALISER"
              value={opConfirm}
              onChange={(e) => setOpConfirm(e.target.value)}
              style={styles.input}
            />
            <div style={styles.modalActions}>
              <button style={styles.button} onClick={() => setOpOpen(false)} disabled={busy}>Annuler</button>
              <button style={styles.buttonDanger} onClick={handleOperational} disabled={busy}>Confirmer</button>
            </div>
          </div>
        </div>
      )}

      {fullOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h3>Confirmer la réinitialisation complète</h3>
            <p>Attention : opération irréversible. Saisissez votre mot de passe et REINITIALISER.</p>
            <input
              type="password"
              placeholder="Mot de passe actuel"
              value={fullPassword}
              onChange={(e) => setFullPassword(e.target.value)}
              style={styles.input}
            />
            <input
              type="text"
              placeholder="REINITIALISER"
              value={fullConfirm}
              onChange={(e) => setFullConfirm(e.target.value)}
              style={styles.input}
            />
            <div style={styles.modalActions}>
              <button style={styles.button} onClick={() => setFullOpen(false)} disabled={busy}>Annuler</button>
              <button style={styles.buttonDanger} onClick={handleFull} disabled={busy}>Confirmer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: css({ padding: "2rem", maxWidth: "900px", margin: "0 auto" }),
  title: css({ fontSize: "1.75rem", marginBottom: "1rem" }),
  section: css({ marginTop: "1.5rem" }),
  sectionTitle: css({ fontSize: "1.25rem", marginBottom: "1rem" }),
  card: css({ background: "var(--color-surface, #fff)", border: "1px solid var(--color-border, #ddd)", borderRadius: "8px", padding: "1.25rem", marginBottom: "1rem" }),
  cardDanger: css({ background: "#fff5f5", border: "1px solid #f5c2c7", borderRadius: "8px", padding: "1.25rem", marginBottom: "1rem" }),
  cardTitle: css({ fontSize: "1.1rem", marginBottom: "0.5rem" }),
  text: css({ marginBottom: "0.5rem", color: "var(--color-text-muted, #555)" }),
  button: css({ padding: "0.5rem 1rem", borderRadius: "6px", border: "1px solid var(--color-border, #ccc)", background: "var(--color-primary, #2563eb)", color: "#fff", cursor: "pointer" }),
  buttonDanger: css({ padding: "0.5rem 1rem", borderRadius: "6px", border: "none", background: "#dc2626", color: "#fff", cursor: "pointer" }),
  success: css({ background: "#ecfdf5", border: "1px solid #a7f3d0", padding: "0.75rem", borderRadius: "6px", marginBottom: "1rem", color: "#065f46" }),
  error: css({ background: "#fef2f2", border: "1px solid #fecaca", padding: "0.75rem", borderRadius: "6px", marginBottom: "1rem", color: "#991b1b" }),
  modalOverlay: css({ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }),
  modal: css({ background: "#fff", padding: "1.5rem", borderRadius: "8px", width: "400px", maxWidth: "90vw" }),
  input: css({ width: "100%", padding: "0.5rem", marginBottom: "0.75rem", border: "1px solid #ccc", borderRadius: "6px" }),
  modalActions: css({ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }),
};
