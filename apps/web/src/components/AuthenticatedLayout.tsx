import { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { NotificationBell } from "./NotificationBell";

function css<T extends React.CSSProperties>(styles: T): T {
  return styles;
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : true
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

function StyledNavLink({ to, children, baseStyle, activeStyle, onClick }: {
  to: string;
  children: React.ReactNode;
  baseStyle: React.CSSProperties;
  activeStyle: React.CSSProperties;
  onClick?: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const isActive = location.pathname === to || (to !== "/" && location.pathname.startsWith(to));
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    navigate(to);
    onClick?.();
  };
  return (
    <a
      href={to}
      aria-current={isActive ? "page" : undefined}
      style={isActive ? { ...baseStyle, ...activeStyle } : baseStyle}
      onClick={handleClick}
    >
      {children}
    </a>
  );
}
export function AuthenticatedLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const isNarrow = useMediaQuery("(max-width: 640px)");
  const sidebarVisible = isDesktop || sidebarOpen;

  useEffect(() => {
    if (!sidebarVisible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sidebarVisible]);
  const location = useLocation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const navItems = [
    { path: "/", label: "Tableau de bord", icon: DashboardIcon },
    { path: "/demandes", label: "Demandes", icon: DemandesIcon },
    { path: "/structures", label: "Structures", icon: StructuresIcon },
    { path: "/utilisateurs", label: "Utilisateurs", icon: UsersIcon },
    { path: "/departements", label: "Départements", icon: DepartementsIcon },
    { path: "/parametres", label: "Paramètres", icon: SettingsIcon },
  ];

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const closeSidebar = () => setSidebarOpen(false);

  const userInitials = `${user?.firstName?.[0] || ""}${user?.lastName?.[0] || ""}`.toUpperCase();

  const activeItem = navItems.find(
    (item) => item.path === location.pathname ||
      (item.path !== "/" && location.pathname.startsWith(item.path))
  );
  const pageTitle = activeItem?.label ?? "Tableau de bord";

  const styles = {
    layout: css({
      minHeight: "100vh",
      display: "flex",
      background: "var(--color-secondary)",
    }),
    sidebar: css({
      position: "fixed" as const,
      top: 0,
      left: 0,
      height: "100vh",
      width: "var(--sidebar-width)",
      background: "var(--color-background)",
      borderRight: "1px solid var(--color-border)",
      display: "flex",
      flexDirection: "column" as const,
      zIndex: 1000,
      visibility: sidebarVisible ? "visible" : "hidden",
      transform: sidebarVisible ? "translateX(0)" : "translateX(-100%)",
      transition: "transform 0.3s ease, visibility 0.3s",
      boxShadow: isDesktop ? "none" : "var(--shadow-lg)",
    }),
    overlay: css({
      position: "fixed" as const,
      inset: 0,
      background: "rgba(32, 41, 57, 0.4)",
      zIndex: 999,
    }),
    sidebarHeader: css({
      display: "flex",
      alignItems: "center",
      gap: "0.75rem",
      padding: "1.5rem 1.25rem",
      borderBottom: "1px solid var(--color-border)",
    }),
    logoMark: css({
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "40px",
      height: "40px",
      borderRadius: "var(--radius-md)",
      background: "var(--color-primary)",
      color: "#ffffff",
      flexShrink: 0,
    }),
    appName: css({
      fontSize: "1.25rem",
      fontWeight: 700,
      color: "var(--color-text)",
      letterSpacing: "-0.01em",
    }),
    appTagline: css({
      fontSize: "0.75rem",
      color: "var(--color-text-muted)",
      lineHeight: 1.2,
    }),
    nav: css({
      flex: 1,
      padding: "1rem 0.75rem",
      overflowY: "auto" as const,
    }),
    navLabel: css({
      fontSize: "0.6875rem",
      fontWeight: 600,
      textTransform: "uppercase" as const,
      letterSpacing: "0.08em",
      color: "var(--color-text-muted)",
      padding: "0 0.75rem",
      marginBottom: "0.5rem",
    }),
    navList: css({
      listStyle: "none",
      display: "flex",
      flexDirection: "column" as const,
      gap: "0.25rem",
    }),
    navLink: css({
      display: "flex",
      alignItems: "center",
      gap: "0.75rem",
      padding: "0.6875rem 0.75rem",
      color: "var(--color-text)",
      textDecoration: "none",
      borderRadius: "var(--radius-md)",
      fontSize: "0.9375rem",
      fontWeight: 500,
      transition: "background-color var(--transition), color var(--transition)",
    }),
    navLinkActive: css({
      background: "var(--color-primary-light)",
      color: "var(--color-primary)",
    }),
    navIcon: css({
      width: "20px",
      height: "20px",
      flexShrink: 0,
      color: "currentColor",
    }),
    main: css({
      flex: 1,
      minWidth: 0,
      marginLeft: isDesktop ? "var(--sidebar-width)" : 0,
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column" as const,
      transition: "margin-left 0.3s ease",
    }),
    header: css({
      display: "flex",
      alignItems: "center",
      gap: "1rem",
      padding: isNarrow ? "0.75rem 1rem" : "1rem 2rem",
      background: "var(--color-background)",
      borderBottom: "1px solid var(--color-border)",
      position: "sticky" as const,
      top: 0,
      zIndex: 100,
    }),
    menuButton: css({
      display: isDesktop ? "none" : "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "40px",
      height: "40px",
      flexShrink: 0,
      background: "var(--color-background)",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-md)",
      color: "var(--color-text)",
      cursor: "pointer",
    }),
    headerTitles: css({
      display: "flex",
      flexDirection: "column" as const,
      minWidth: 0,
      flex: 1,
    }),
    pageTitle: css({
      fontSize: "1.25rem",
      fontWeight: 600,
      color: "var(--color-text)",
      lineHeight: 1.3,
    }),
    breadcrumb: css({
      fontSize: "0.75rem",
      color: "var(--color-text-muted)",
      lineHeight: 1.3,
    }),
    headerUser: css({
      display: "flex",
      alignItems: "center",
      gap: "0.75rem",
      paddingLeft: "1rem",
      borderLeft: "1px solid var(--color-border)",
    }),
    userAvatar: css({
      width: "38px",
      height: "38px",
      borderRadius: "50%",
      background: "var(--color-primary-light)",
      color: "var(--color-primary)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: 600,
      fontSize: "0.875rem",
      flexShrink: 0,
    }),
    userDetails: css({
      display: "flex",
      flexDirection: "column" as const,
      minWidth: 0,
    }),
    userName: css({
      fontSize: "0.875rem",
      fontWeight: 600,
      color: "var(--color-text)",
      whiteSpace: "nowrap" as const,
      overflow: "hidden",
      textOverflow: "ellipsis" as const,
    }),
    userEmail: css({
      fontSize: "0.75rem",
      color: "var(--color-text-muted)",
      whiteSpace: "nowrap" as const,
      overflow: "hidden",
      textOverflow: "ellipsis" as const,
    }),
    headerLogout: css({
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "40px",
      height: "40px",
      flexShrink: 0,
      background: "transparent",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-md)",
      color: "var(--color-text-muted)",
      cursor: "pointer",
      transition: "background-color var(--transition), color var(--transition), border-color var(--transition)",
    }),
    content: css({
      flex: 1,
      padding: isNarrow ? "1.25rem 1rem" : "2rem",
      width: "100%",
      maxWidth: "1280px",
      margin: "0 auto",
    }),
  };

  return (
    <div style={styles.layout}>
      <aside
        id="app-sidebar"
        className={isDesktop || sidebarOpen ? "sidebar open" : "sidebar"}
        style={styles.sidebar}
        aria-label="Navigation principale"
      >
        <div style={styles.sidebarHeader}>
          <span style={styles.logoMark} aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </span>
          <span>
            <span style={styles.appName}>DPMG</span>
            <br />
            <span style={styles.appTagline}>Espace administration</span>
          </span>
        </div>

        <nav style={styles.nav}>
          <p style={styles.navLabel}>Menu</p>
          <ul style={styles.navList}>
            {navItems.map((item) => (
              <li key={item.path}>
                <StyledNavLink
                  to={item.path}
                  baseStyle={styles.navLink}
                  activeStyle={styles.navLinkActive}
                  onClick={closeSidebar}
                >
                  <item.icon style={styles.navIcon} />
                  <span>{item.label}</span>
                </StyledNavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      {!isDesktop && sidebarOpen && (
        <div className="sidebar-overlay" onClick={closeSidebar} style={styles.overlay} />
      )}

      <main style={styles.main}>
        <header style={styles.header}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={sidebarOpen}
            aria-controls="app-sidebar"
            style={styles.menuButton}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <div style={styles.headerTitles}>
            <h1 style={styles.pageTitle}>{pageTitle}</h1>
            <span style={styles.breadcrumb}>Accueil / {pageTitle}</span>
          </div>

          <div style={styles.headerUser}>
            <NotificationBell />
            <div style={styles.userAvatar} aria-hidden="true">{userInitials}</div>
            <div className="header-user-details" style={styles.userDetails}>
              <span style={styles.userName}>{user?.firstName} {user?.lastName}</span>
              <span style={styles.userEmail}>{user?.email}</span>
            </div>
            <button
              onClick={handleLogout}
              title="Se déconnecter"
              aria-label="Se déconnecter"
              style={styles.headerLogout}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </header>

        <div style={styles.content}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}

const DashboardIcon = ({ style }: { style?: React.CSSProperties }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={style}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

const DemandesIcon = ({ style }: { style?: React.CSSProperties }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={style}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const StructuresIcon = ({ style }: { style?: React.CSSProperties }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={style}>
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const UsersIcon = ({ style }: { style?: React.CSSProperties }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={style}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const DepartementsIcon = ({ style }: { style?: React.CSSProperties }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={style}>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const SettingsIcon = ({ style }: { style?: React.CSSProperties }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={style}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

export default AuthenticatedLayout;
