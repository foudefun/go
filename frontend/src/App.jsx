import { lazy, Suspense } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider.jsx";
import { useTranslation } from "./i18n/translations.js";
import ClimbingPage from "./climbing/pages/ClimbingPage.jsx";
import OutdoorClimbingPage from "./climbing/pages/OutdoorClimbingPage.jsx";
import AccountPage from "./pages/AccountPage.jsx";
import ActivitiesPage from "./pages/ActivitiesPage.jsx";
import AdminPage from "./pages/AdminPage.jsx";
import CalendarPage from "./pages/CalendarPage.jsx";
import EquipmentPage from "./pages/EquipmentPage.jsx";
import ExercisesPage from "./pages/ExercisesPage.jsx";
import HangboardPage from "./pages/HangboardPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import OutdoorDataAuditPage from "./pages/OutdoorDataAuditPage.jsx";
import OutdoorRouteDetailPage from "./pages/OutdoorRouteDetailPage.jsx";
import OutdoorRoutesPage from "./pages/OutdoorRoutesPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import StatisticsPage from "./pages/StatisticsPage.jsx";

const OutdoorMapPage = lazy(() => import("./pages/OutdoorMapPage.jsx"));

const tabs = [
  { to: "/calendar", labelKey: "Calendar" },
  { to: "/activities", labelKey: "Activities" },
  { to: "/statistics", labelKey: "Statistics" },
  { to: "/exercises", labelKey: "Exercises" },
  { to: "/equipment", labelKey: "Equipment" },
  { to: "/climbing", labelKey: "Climbing" },
  { to: "/outdoor-map", labelKey: "Map" },
  { to: "/outdoor-routes", labelKey: "Outdoor routes" },
];

function AppLayout() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const visibleTabs = user?.isAdmin ? [...tabs, { to: "/admin", labelKey: "Admin" }] : tabs;

  return (
    <>
      <header className="topbar">
        <div className="brand-lockup">
          <strong>Let&apos;s GO</strong>
          <span>{t("Training tracker")}</span>
        </div>
        <nav className="nav-cluster app-tabs" aria-label="Primary">
          {visibleTabs.map((tab) => (
            <NavLink key={tab.to} to={tab.to}>
              {t(tab.labelKey)}
            </NavLink>
          ))}
        </nav>
        <div className="nav-cluster account-cluster">
          <details className="account-menu">
            <summary className="session-pill">
              {user?.username}
              {user?.isAdmin ? " - admin" : ""}
            </summary>
            <div className="account-menu-panel">
              <NavLink to="/account">{t("Account")}</NavLink>
              <button type="button" onClick={logout}>
                {t("Logout")}
              </button>
            </div>
          </details>
        </div>
      </header>
      <Routes>
        <Route path="/" element={<Navigate to="/calendar" replace />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/activities" element={<ActivitiesPage />} />
        <Route path="/statistics" element={<StatisticsPage />} />
        <Route path="/exercises" element={<ExercisesPage />} />
        <Route path="/equipment" element={<EquipmentPage />} />
        <Route path="/climbing" element={<ClimbingPage />} />
        <Route path="/outdoor-climbing" element={<OutdoorClimbingPage />} />
        <Route
          path="/outdoor-map"
          element={
            <Suspense fallback={<main className="page-shell"><div className="app-panel empty-state">{t("Loading map...")}</div></main>}>
              <OutdoorMapPage />
            </Suspense>
          }
        />
        <Route
          path="/outdoor-audit"
          element={user?.isAdmin ? <OutdoorDataAuditPage /> : <Navigate to="/account" replace />}
        />
        <Route path="/outdoor-routes" element={<OutdoorRoutesPage />} />
        <Route path="/outdoor-routes/:routeId" element={<OutdoorRouteDetailPage />} />
        <Route path="/hangboard" element={<HangboardPage />} />
        <Route path="/import" element={<Navigate to="/activities" replace />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route
          path="/admin"
          element={
            user?.isAdmin ? (
              <AdminPage />
            ) : (
              <Navigate to="/account" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/calendar" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  const { isAuthenticated, isBootstrapping } = useAuth();
  const { t } = useTranslation();

  if (isBootstrapping) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <h1>Let&apos;s GO</h1>
          <p>{t("Loading your session...")}</p>
        </section>
      </main>
    );
  }

  return isAuthenticated ? <AppLayout /> : <LoginPage />;
}
