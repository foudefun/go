import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider.jsx";
import { useTranslation } from "./i18n/translations.js";
import ClimbingPage from "./climbing/pages/ClimbingPage.jsx";
import OutdoorClimbingPage from "./climbing/pages/OutdoorClimbingPage.jsx";
import AccountPage from "./pages/AccountPage.jsx";
import ActivityCleanupPage from "./pages/ActivityCleanupPage.jsx";
import ActivitiesPage from "./pages/ActivitiesPage.jsx";
import AdminPage from "./pages/AdminPage.jsx";
import CalendarPage from "./pages/CalendarPage.jsx";
import CommunityPage from "./pages/CommunityPage.jsx";
import EquipmentPage from "./pages/EquipmentPage.jsx";
import ExercisesPage from "./pages/ExercisesPage.jsx";
import ExplorePage from "./pages/ExplorePage.jsx";
import HangboardPage from "./pages/HangboardPage.jsx";
import ImportPage from "./pages/ImportPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import OutdoorDataAuditPage from "./pages/OutdoorDataAuditPage.jsx";
import OutdoorRouteDetailPage from "./pages/OutdoorRouteDetailPage.jsx";
import OutdoorRoutesPage from "./pages/OutdoorRoutesPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import StatisticsPage from "./pages/StatisticsPage.jsx";
import TodayPage from "./pages/TodayPage.jsx";

const OutdoorMapPage = lazy(() => import("./pages/OutdoorMapPage.jsx"));

const primaryTabs = [
  { to: "/today", labelKey: "Today", activePaths: ["/today"] },
  { to: "/plan", labelKey: "Plan", activePaths: ["/plan", "/calendar"] },
  {
    to: "/explore",
    labelKey: "Explore",
    activePaths: ["/explore", "/climbing", "/outdoor-climbing", "/outdoor-map", "/outdoor-routes"],
  },
  { to: "/log", labelKey: "Activities", activePaths: ["/log", "/activities"] },
  { to: "/progress", labelKey: "Progress", activePaths: ["/progress", "/statistics"] },
  { to: "/gear", labelKey: "Gear", activePaths: ["/gear", "/equipment"] },
  { to: "/community", labelKey: "Community", activePaths: ["/community"] },
];

const mobilePrimaryTabs = primaryTabs.filter((tab) => ["/today", "/plan", "/log", "/progress"].includes(tab.to));
const mobilePrimaryTabPaths = new Set(mobilePrimaryTabs.map((tab) => tab.to));

const secondaryNavGroups = [
  {
    labelKey: "Library",
    items: [
      { to: "/exercises", labelKey: "Exercises" },
      { to: "/hangboard", labelKey: "Hangboard" },
    ],
  },
  {
    labelKey: "Outdoor",
    items: [
      { to: "/climbing", labelKey: "Climbing" },
      { to: "/outdoor-map", labelKey: "Map" },
      { to: "/outdoor-routes", labelKey: "Outdoor routes" },
    ],
  },
  {
    labelKey: "Tools",
    items: [
      { to: "/import", labelKey: "Import" },
      { to: "/activity-cleanup", labelKey: "Activity cleanup" },
    ],
  },
];

function AppLayout() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const visibleSecondaryNavGroups = user?.isAdmin
    ? secondaryNavGroups.map((group) =>
        group.labelKey === "Tools"
          ? { ...group, items: [...group.items, { to: "/admin", labelKey: "Admin" }] }
          : group,
      )
    : secondaryNavGroups;
  const mobileNavGroups = [
    {
      labelKey: "More",
      items: primaryTabs
        .filter((tab) => !mobilePrimaryTabPaths.has(tab.to))
        .map((tab) => ({ to: tab.to, labelKey: tab.labelKey })),
    },
    ...visibleSecondaryNavGroups,
  ].filter((group) => group.items.length);
  const isActiveTab = (tab) => tab.activePaths.some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`));
  const primaryMenuIsActive = primaryTabs.some(isActiveTab);
  const moreMenuIsActive =
    !primaryMenuIsActive &&
    visibleSecondaryNavGroups.some((group) =>
      group.items.some((item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)),
    );
  const mobileMoreMenuIsActive = mobileNavGroups.some((group) =>
    group.items.some((item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)),
  );

  useEffect(() => {
    setMoreMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!moreMenuOpen) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") setMoreMenuOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [moreMenuOpen]);

  return (
    <>
      <header className="topbar">
        <div className="brand-lockup">
          <strong>Let&apos;s GO</strong>
          <span>{t("Training tracker")}</span>
        </div>
        <nav className="nav-cluster app-tabs desktop-tabs" aria-label="Primary">
          {primaryTabs.map((tab) => (
            <NavLink className={isActiveTab(tab) ? "active" : ""} key={tab.to} to={tab.to}>
              {t(tab.labelKey)}
            </NavLink>
          ))}
          <div className="more-menu">
            <button
              type="button"
              className={moreMenuIsActive || moreMenuOpen ? "more-menu-trigger active" : "more-menu-trigger"}
              aria-expanded={moreMenuOpen}
              aria-haspopup="menu"
              onClick={() => setMoreMenuOpen((open) => !open)}
            >
              {t("More")}
            </button>
            {moreMenuOpen ? (
              <div className="more-menu-layer" role="presentation" onMouseDown={() => setMoreMenuOpen(false)}>
                <div className="more-menu-panel" role="menu" aria-label={t("More")} onMouseDown={(event) => event.stopPropagation()}>
                  {visibleSecondaryNavGroups.map((group) => (
                    <div className="more-menu-section" key={group.labelKey}>
                      <span>{t(group.labelKey)}</span>
                      {group.items.map((item) => (
                        <NavLink key={item.to} to={item.to} role="menuitem" onClick={() => setMoreMenuOpen(false)}>
                          {t(item.labelKey)}
                        </NavLink>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
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
        <nav className="mobile-tabs" aria-label="Primary mobile">
          {mobilePrimaryTabs.map((tab) => (
            <NavLink className={isActiveTab(tab) ? "active" : ""} key={tab.to} to={tab.to}>
              {t(tab.labelKey)}
            </NavLink>
          ))}
          <div className="more-menu">
            <button
              type="button"
              className={mobileMoreMenuIsActive || moreMenuOpen ? "more-menu-trigger active" : "more-menu-trigger"}
              aria-expanded={moreMenuOpen}
              aria-haspopup="menu"
              onClick={() => setMoreMenuOpen((open) => !open)}
            >
              {t("More")}
            </button>
            {moreMenuOpen ? (
              <div className="more-menu-layer" role="presentation" onMouseDown={() => setMoreMenuOpen(false)}>
                <div className="more-menu-panel mobile-more-panel" role="menu" aria-label={t("More")} onMouseDown={(event) => event.stopPropagation()}>
                  {mobileNavGroups.map((group) => (
                    <div className="more-menu-section" key={group.labelKey}>
                      <span>{t(group.labelKey)}</span>
                      {group.items.map((item) => (
                        <NavLink key={item.to} to={item.to} role="menuitem" onClick={() => setMoreMenuOpen(false)}>
                          {t(item.labelKey)}
                        </NavLink>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<Navigate to="/today" replace />} />
        <Route path="/today" element={<TodayPage />} />
        <Route path="/plan" element={<CalendarPage />} />
        <Route path="/calendar" element={<Navigate to="/plan" replace />} />
        <Route path="/log" element={<ActivitiesPage />} />
        <Route path="/activities" element={<ActivitiesPage />} />
        <Route path="/progress" element={<StatisticsPage />} />
        <Route path="/statistics" element={<StatisticsPage />} />
        <Route path="/gear" element={<EquipmentPage />} />
        <Route path="/exercises" element={<ExercisesPage />} />
        <Route path="/equipment" element={<EquipmentPage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/climbing" element={<ClimbingPage />} />
        <Route path="/community" element={<CommunityPage />} />
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
        <Route path="/import" element={<ImportPage />} />
        <Route path="/activity-cleanup" element={<ActivityCleanupPage />} />
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
        <Route path="*" element={<Navigate to="/today" replace />} />
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
