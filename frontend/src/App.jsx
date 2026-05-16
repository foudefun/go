import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider.jsx";
import OutdoorClimbingPage from "./climbing/pages/OutdoorClimbingPage.jsx";
import AccountPage from "./pages/AccountPage.jsx";
import ActivitiesPage from "./pages/ActivitiesPage.jsx";
import AdminPage from "./pages/AdminPage.jsx";
import CalendarPage from "./pages/CalendarPage.jsx";
import EquipmentPage from "./pages/EquipmentPage.jsx";
import ExercisesPage from "./pages/ExercisesPage.jsx";
import ImportPage from "./pages/ImportPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";

const tabs = [
  { to: "/calendar", label: "Calendar" },
  { to: "/activities", label: "Activities" },
  { to: "/exercises", label: "Exercises" },
  { to: "/equipment", label: "Equipment" },
  { to: "/outdoor-climbing", label: "Outdoor Climbing" },
  { to: "/import", label: "Import" },
  { to: "/settings", label: "Settings" },
  { to: "/account", label: "Account" },
];

function AppLayout() {
  const { user, logout } = useAuth();
  const visibleTabs = user?.isAdmin ? [...tabs, { to: "/admin", label: "Admin" }] : tabs;

  return (
    <>
      <header className="topbar">
        <div className="brand-lockup">
          <strong>Let&apos;s GO</strong>
          <span>Training tracker</span>
        </div>
        <nav className="nav-cluster app-tabs" aria-label="Primary">
          {visibleTabs.map((tab) => (
            <NavLink key={tab.to} to={tab.to}>
              {tab.label}
            </NavLink>
          ))}
        </nav>
        <div className="nav-cluster account-cluster">
          <span className="session-pill">
            {user?.username}
            {user?.isAdmin ? " - admin" : ""}
          </span>
          <button type="button" onClick={logout}>
            Logout
          </button>
        </div>
      </header>
      <Routes>
        <Route path="/" element={<Navigate to="/calendar" replace />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/activities" element={<ActivitiesPage />} />
        <Route path="/exercises" element={<ExercisesPage />} />
        <Route path="/equipment" element={<EquipmentPage />} />
        <Route path="/outdoor-climbing" element={<OutdoorClimbingPage />} />
        <Route path="/climbing" element={<Navigate to="/outdoor-climbing" replace />} />
        <Route path="/import" element={<ImportPage />} />
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

  if (isBootstrapping) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <h1>Let&apos;s GO</h1>
          <p>Loading your session...</p>
        </section>
      </main>
    );
  }

  return isAuthenticated ? <AppLayout /> : <LoginPage />;
}
