import { useEffect, useMemo, useState } from "react";
import {
  createAdminUser,
  deleteAdminUser,
  getAdminActivitySummary,
  getAdminAuditLogs,
  getAdminUsers,
  resetAdminUserPassword,
  updateAdminUserRole,
} from "../api/adminApi.js";
import { useAuth } from "../auth/AuthProvider.jsx";
import {
  ADMIN_ACTIONS,
  AUDIT_LIMITS,
  buildAuditQuery,
  formatAuditDateTime,
  getAuditTargetLabel,
  normalizeAdminSummary,
} from "../domain/adminTools.js";
import { useTranslation } from "../i18n/translations.js";

function MetricCard({ label, value }) {
  return (
    <article className="app-panel metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function RecentAuditList({ title, items, emptyText }) {
  return (
    <section className="app-panel admin-recent-panel">
      <h3>{title}</h3>
      <div className="admin-recent-list">
        {items.length ? (
          items.map((entry) => (
            <article key={entry.id}>
              <strong>{entry.username || "-"}</strong>
              <span>{formatAuditDateTime(entry.created_at)}</span>
              <p>{entry.summary || entry.action || "-"}</p>
            </article>
          ))
        ) : (
          <div className="empty-state compact">{emptyText}</div>
        )}
      </div>
    </section>
  );
}

function UserRow({
  user,
  isCurrentUser,
  roleDraft,
  passwordDraft,
  saving,
  onRoleChange,
  onSaveRole,
  onPasswordChange,
  onResetPassword,
  onDelete,
  t,
}) {
  return (
    <article className="admin-user-row">
      <div>
        <strong>{user.username}</strong>
        <span>
          {user.is_admin ? t("Admin") : t("User")}
          {isCurrentUser ? ` - ${t("current session")}` : ""}
          {user.is_default_admin ? ` - ${t("default admin")}` : ""}
        </span>
      </div>
      <label>
        {t("Role")}
        <select value={roleDraft} onChange={(event) => onRoleChange(user.username, event.target.value === "admin")}>
          <option value="user">{t("User")}</option>
          <option value="admin">{t("Admin")}</option>
        </select>
      </label>
      <button type="button" onClick={() => onSaveRole(user)} disabled={saving}>
        {t("Save Role")}
      </button>
      <label>
        {t("New password")}
        <input
          type="password"
          value={passwordDraft || ""}
          onChange={(event) => onPasswordChange(user.username, event.target.value)}
          placeholder={t("minimum 8 characters")}
        />
      </label>
      <button type="button" onClick={() => onResetPassword(user)} disabled={saving || !passwordDraft}>
        {t("Reset Password")}
      </button>
      <button type="button" onClick={() => onDelete(user)} disabled={saving || isCurrentUser}>
        {t("Delete")}
      </button>
    </article>
  );
}

export default function AdminPage() {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [summary, setSummary] = useState(() => normalizeAdminSummary());
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditFilters, setAuditFilters] = useState({ username: "", action: "", dateFrom: "", dateTo: "", limit: 100 });
  const [roleDrafts, setRoleDrafts] = useState({});
  const [passwordDrafts, setPasswordDrafts] = useState({});
  const [newUser, setNewUser] = useState({ username: "", password: "", is_admin: false });
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const summaryMetrics = useMemo(
    () => [
      [t("Actions 7d"), summary.total_actions_7d],
      [t("Active Users"), summary.active_users_7d],
      [t("Logins"), summary.logins_7d],
      [t("Sessions / Imports"), summary.session_actions_7d],
    ],
    [summary, t],
  );

  function syncRoleDrafts(userRows) {
    setRoleDrafts((current) => {
      const next = { ...current };
      for (const row of userRows) {
        next[row.username] = row.is_admin;
      }
      return next;
    });
  }

  function loadAdminData(nextFilters = auditFilters) {
    setStatus("loading");
    setError("");
    const query = buildAuditQuery(nextFilters);
    return Promise.all([getAdminUsers(), getAdminActivitySummary(), getAdminAuditLogs(query)])
      .then(([userRows, summaryPayload, auditRows]) => {
        const safeUsers = Array.isArray(userRows) ? userRows : [];
        setUsers(safeUsers);
        syncRoleDrafts(safeUsers);
        setSummary(normalizeAdminSummary(summaryPayload));
        setAuditLogs(Array.isArray(auditRows) ? auditRows : []);
        setStatus("ready");
      })
      .catch((loadError) => {
        setError(loadError.message);
        setStatus("error");
      });
  }

  useEffect(() => {
    loadAdminData();
  }, []);

  function updateAuditFilter(key, value) {
    setAuditFilters((current) => ({ ...current, [key]: value }));
  }

  async function applyAuditFilters(event) {
    event.preventDefault();
    await loadAdminData(auditFilters);
  }

  async function handleCreateUser(event) {
    event.preventDefault();
    setStatus("saving");
    setError("");
    setSuccess("");
    try {
      await createAdminUser(newUser);
      setNewUser({ username: "", password: "", is_admin: false });
      setSuccess(t("Created user", { username: newUser.username }));
      await loadAdminData();
    } catch (createError) {
      setError(createError.message);
      setStatus("ready");
    }
  }

  async function handleSaveRole(targetUser) {
    setStatus("saving");
    setError("");
    setSuccess("");
    try {
      await updateAdminUserRole(targetUser.username, { is_admin: Boolean(roleDrafts[targetUser.username]) });
      if (targetUser.username === user?.username) {
        await refreshUser();
      }
      setSuccess(t("Updated role for", { username: targetUser.username }));
      await loadAdminData();
    } catch (roleError) {
      setError(roleError.message);
      setStatus("ready");
    }
  }

  async function handleResetPassword(targetUser) {
    const password = passwordDrafts[targetUser.username] || "";
    if (!password) return;
    setStatus("saving");
    setError("");
    setSuccess("");
    try {
      await resetAdminUserPassword(targetUser.username, { new_password: password });
      setPasswordDrafts((current) => ({ ...current, [targetUser.username]: "" }));
      setSuccess(t("Password reset for", { username: targetUser.username }));
      await loadAdminData();
    } catch (passwordError) {
      setError(passwordError.message);
      setStatus("ready");
    }
  }

  async function handleDeleteUser(targetUser) {
    if (!window.confirm(t('Delete user "{username}"?', { username: targetUser.username }))) return;
    setStatus("saving");
    setError("");
    setSuccess("");
    try {
      await deleteAdminUser(targetUser.username);
      setSuccess(t("Deleted user", { username: targetUser.username }));
      await loadAdminData();
    } catch (deleteError) {
      setError(deleteError.message);
      setStatus("ready");
    }
  }

  if (!user?.isAdmin) {
    return (
      <main className="page-shell">
        <section className="app-panel empty-state">{t("Admin access required.")}</section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="module-header">
        <div>
          <p className="eyebrow">{t("Admin")}</p>
          <h1>{t("Administration")}</h1>
        </div>
      </section>

      {status === "loading" ? <div className="app-panel empty-state">{t("Loading admin data...")}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}
      {success ? <div className="success-banner">{success}</div> : null}

      <section className="summary-grid">
        {summaryMetrics.map(([label, value]) => (
          <MetricCard label={label} value={value} key={label} />
        ))}
      </section>

      <section className="admin-layout">
        <div className="settings-form-column">
          <section className="app-panel admin-panel">
            <div>
              <p className="eyebrow">{t("Users")}</p>
              <h2>{t("User Management")}</h2>
            </div>
            <form className="admin-create-user" onSubmit={handleCreateUser}>
              <label>
                {t("Username")}
                <input
                  value={newUser.username}
                  onChange={(event) => setNewUser((current) => ({ ...current, username: event.target.value }))}
                  placeholder={t("new user")}
                />
              </label>
              <label>
                {t("Initial password")}
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(event) => setNewUser((current) => ({ ...current, password: event.target.value }))}
                  placeholder={t("minimum 8 characters")}
                />
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={newUser.is_admin}
                  onChange={(event) => setNewUser((current) => ({ ...current, is_admin: event.target.checked }))}
                />
                {t("Admin")}
              </label>
              <button type="submit" className="primary-action" disabled={status === "saving"}>
                {t("Add User")}
              </button>
            </form>

            <div className="admin-user-list">
              {users.map((adminUser) => (
                <UserRow
                  key={adminUser.username}
                  user={adminUser}
                  isCurrentUser={adminUser.username === user.username}
                  roleDraft={roleDrafts[adminUser.username] ? "admin" : "user"}
                  passwordDraft={passwordDrafts[adminUser.username] || ""}
                  saving={status === "saving"}
                  onRoleChange={(username, isAdmin) => setRoleDrafts((current) => ({ ...current, [username]: isAdmin }))}
                  onSaveRole={handleSaveRole}
                  onPasswordChange={(username, password) => setPasswordDrafts((current) => ({ ...current, [username]: password }))}
                  onResetPassword={handleResetPassword}
                  onDelete={handleDeleteUser}
                  t={t}
                />
              ))}
            </div>
          </section>

          <section className="app-panel admin-panel">
            <div>
              <p className="eyebrow">{t("Audit")}</p>
              <h2>{t("Activity Log")}</h2>
            </div>
            <form className="admin-audit-filters" onSubmit={applyAuditFilters}>
              <label>
                {t("User")}
                <select value={auditFilters.username} onChange={(event) => updateAuditFilter("username", event.target.value)}>
                  <option value="">{t("All users")}</option>
                  {users.map((adminUser) => (
                    <option value={adminUser.username} key={adminUser.username}>
                      {adminUser.username}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("Action")}
                <select value={auditFilters.action} onChange={(event) => updateAuditFilter("action", event.target.value)}>
                  <option value="">{t("All actions")}</option>
                  {ADMIN_ACTIONS.map((action) => (
                    <option value={action} key={action}>
                      {action}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("From")}
                <input type="date" value={auditFilters.dateFrom} onChange={(event) => updateAuditFilter("dateFrom", event.target.value)} />
              </label>
              <label>
                {t("To")}
                <input type="date" value={auditFilters.dateTo} onChange={(event) => updateAuditFilter("dateTo", event.target.value)} />
              </label>
              <label>
                {t("Rows")}
                <select value={auditFilters.limit} onChange={(event) => updateAuditFilter("limit", event.target.value)}>
                  {AUDIT_LIMITS.map((limit) => (
                    <option value={limit} key={limit}>
                      {limit}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="secondary-action">
                {t("Refresh")}
              </button>
            </form>

            <div className="admin-audit-table">
              <div className="admin-audit-row header">
                <div>{t("Date")}</div>
                <div>{t("User")}</div>
                <div>{t("Action")}</div>
                <div>{t("Target")}</div>
                <div>{t("Summary")}</div>
              </div>
              {auditLogs.map((entry) => (
                <div className="admin-audit-row" key={entry.id}>
                  <div>{formatAuditDateTime(entry.created_at)}</div>
                  <div>{entry.username || "-"}</div>
                  <div>{entry.action || "-"}</div>
                  <div>{getAuditTargetLabel(entry)}</div>
                  <div>{entry.summary || "-"}</div>
                </div>
              ))}
              {!auditLogs.length ? <div className="empty-state compact">{t("No audit rows for these filters.")}</div> : null}
            </div>
          </section>
        </div>

        <aside className="admin-side-column">
          <section className="app-panel admin-panel">
            <div>
              <p className="eyebrow">{t("Users")}</p>
              <h2>{t("Latest By User")}</h2>
            </div>
            <div className="admin-latest-user-list">
              {summary.latest_by_user.map((entry) => (
                <article key={entry.username}>
                  <strong>
                    {entry.username}
                    {entry.is_admin ? ` (${t("admin")})` : ""}
                  </strong>
                  <span>{formatAuditDateTime(entry.last_seen_at)}</span>
                  <small>{t("User actions count", { action: entry.last_action || "-", count: entry.actions_7d || 0 })}</small>
                </article>
              ))}
              {!summary.latest_by_user.length ? <div className="empty-state compact">{t("No user activity yet.")}</div> : null}
            </div>
          </section>
          <RecentAuditList title={t("Security Events")} items={summary.latest_security} emptyText={t("No recent security events.")} />
          <RecentAuditList title={t("Latest Imports")} items={summary.latest_imports} emptyText={t("No recent imports.")} />
          <RecentAuditList title={t("Latest Sessions")} items={summary.latest_sessions} emptyText={t("No recent sessions.")} />
        </aside>
      </section>
    </main>
  );
}
