export const ADMIN_ACTIONS = [
  "login",
  "login_failed",
  "login_locked",
  "logout",
  "change_password",
  "admin_access_denied",
  "update_preferences",
  "create_user",
  "update_user_role",
  "reset_user_password",
  "delete_user",
  "create_exercise",
  "update_exercise",
  "delete_exercise",
  "merge_exercise",
  "upload_exercise_image",
  "set_primary_exercise_image",
  "delete_exercise_image",
  "import_program",
  "import_activity_file",
  "save_session",
  "create_equipment",
  "update_equipment",
  "delete_equipment",
];

export const AUDIT_LIMITS = [25, 50, 100, 200, 500];

export function normalizeAuditLimit(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return 100;
  return Math.max(1, Math.min(Math.trunc(numberValue), 500));
}

export function buildAuditQuery(filters = {}) {
  const params = new URLSearchParams();
  const username = String(filters.username || "").trim();
  const action = String(filters.action || "").trim();
  const dateFrom = String(filters.dateFrom || "").trim();
  const dateTo = String(filters.dateTo || "").trim();
  if (username) params.set("username", username);
  if (action) params.set("action", action);
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo) params.set("date_to", dateTo);
  params.set("limit", String(normalizeAuditLimit(filters.limit)));
  return params.toString();
}

export function formatAuditDateTime(value) {
  if (!value) return "-";
  const dateValue = new Date(value);
  if (Number.isNaN(dateValue.getTime())) return String(value);
  return dateValue.toLocaleString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function normalizeAdminSummary(summary = {}) {
  return {
    total_actions_7d: Number(summary.total_actions_7d || 0),
    active_users_7d: Number(summary.active_users_7d || 0),
    logins_7d: Number(summary.logins_7d || 0),
    session_actions_7d: Number(summary.session_actions_7d || 0),
    latest_by_user: Array.isArray(summary.latest_by_user) ? summary.latest_by_user : [],
    latest_security: Array.isArray(summary.latest_security) ? summary.latest_security : [],
    latest_imports: Array.isArray(summary.latest_imports) ? summary.latest_imports : [],
    latest_sessions: Array.isArray(summary.latest_sessions) ? summary.latest_sessions : [],
  };
}

export function getAuditTargetLabel(entry = {}) {
  const targetType = String(entry.target_type || "").trim() || "-";
  const targetKey = String(entry.target_key || "").trim() || "-";
  return `${targetType}: ${targetKey}`;
}
