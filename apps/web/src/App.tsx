import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Login } from "./pages/Login";
import { AuthenticatedLayout } from "./components/AuthenticatedLayout";
import { ChangePasswordModal } from "./components/ChangePasswordModal";
import { Dashboard } from "./pages/dashboard/Dashboard";
import { DemandeListPage } from "./pages/demandes/DemandeListPage";
import { DemandeCreatePage } from "./pages/demandes/DemandeCreatePage";
import { DemandeDetailPage } from "./pages/demandes/DemandeDetailPage";
import { UtilisateursPage } from "./pages/utilisateurs/UtilisateursPage";
import { UtilisateurForm } from "./pages/utilisateurs/UtilisateurForm";
import { AuditLogsPage } from "./pages/utilisateurs/AuditLogsPage";
import { StructuresPage } from "./pages/structures/StructuresPage";
import { StructureForm } from "./pages/structures/StructureForm";
import { DepartementsPage } from "./pages/departements/DepartementsPage";
import { DepartementForm } from "./pages/departements/DepartementForm";
import { ChangePasswordPage } from "./pages/ChangePasswordPage";
import "./index.css";

function css<T extends React.CSSProperties>(styles: T): T {
  return styles;
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div style={loadingStyles.container} role="status" aria-live="polite">
        <div style={loadingStyles.spinner} aria-hidden="true" />
        <p>Chargement de la session...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Modal obligatoire et bloquant de changement de mot de passe —
  // contrôle centralisé pour toutes les routes authentifiées.
  // Tant que mustChangePassword === true, le contenu métier n'est pas rendu.
  if (user?.mustChangePassword === true) {
    return <ChangePasswordModal isOpen={true} />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={loadingStyles.container} role="status" aria-live="polite">
        <div style={loadingStyles.spinner} aria-hidden="true" />
        <p>Chargement de la session...</p>
      </div>
    );
  }

  return isAuthenticated ? <Navigate to="/" replace /> : <>{children}</>;
}

function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div style={placeholderStyles.container}>
      <div className="card" style={placeholderStyles.card}>
        <h2 style={placeholderStyles.title}>{title}</h2>
        <p style={placeholderStyles.text}>{description}</p>
        <p style={placeholderStyles.note}>Ce module sera implémenté dans une phase ultérieure.</p>
      </div>
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route
        element={
          <PrivateRoute>
            <AuthenticatedLayout />
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="demandes" element={<DemandeListPage />} />
        <Route path="demandes/nouvelle" element={<DemandeCreatePage />} />
        <Route path="demandes/:id" element={<DemandeDetailPage />} />
        <Route path="structures" element={<StructuresPage />} />
        <Route path="structures/nouvelle" element={<StructureForm />} />
        <Route path="structures/:id/modifier" element={<StructureForm />} />
        <Route path="utilisateurs" element={<UtilisateursPage />} />
        <Route path="utilisateurs/nouvelle" element={<UtilisateurForm />} />
        <Route path="utilisateurs/:id/modifier" element={<UtilisateurForm />} />
        <Route path="utilisateurs/audit" element={<AuditLogsPage />} />
        <Route path="departements" element={<DepartementsPage />} />
        <Route path="departements/nouveau" element={<DepartementForm />} />
        <Route path="departements/:id/modifier" element={<DepartementForm />} />
        <Route path="parametres" element={<PlaceholderPage title="Paramètres" description="Configuration de l'application" />} />
        <Route path="changer-mot-de-passe" element={<ChangePasswordPage />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

const loadingStyles = {
  container: css({
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "1rem",
    color: "var(--color-text-muted)",
  }),
  spinner: css({
    width: "24px",
    height: "24px",
    border: "2px solid var(--color-border)",
    borderTopColor: "var(--color-primary)",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  }),
};

const placeholderStyles = {
  container: css({
    display: "flex",
    justifyContent: "center",
    paddingTop: "3rem",
  }),
  card: css({
    maxWidth: "600px",
    textAlign: "center",
    padding: "3rem 2rem",
    borderTop: "3px solid var(--color-primary)",
  }),
  title: css({
    fontSize: "1.5rem",
    fontWeight: 600,
    color: "var(--color-text)",
    marginBottom: "1rem",
  }),
  text: css({
    color: "var(--color-text-muted)",
    fontSize: "1rem",
    marginBottom: "1.5rem",
  }),
  note: css({
    color: "var(--color-text-muted)",
    fontSize: "0.875rem",
    fontStyle: "italic",
  }),
};

export default App;