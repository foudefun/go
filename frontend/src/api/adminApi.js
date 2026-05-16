import { api } from "./client.js";

function jsonRequest(path, method, payload) {
  return api(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function getAdminUsers() {
  return api("/admin/users");
}

export function getAdminActivitySummary() {
  return api("/admin/activity-summary");
}

export function getAdminAuditLogs(query = "") {
  const suffix = query ? `?${query}` : "";
  return api(`/admin/audit-logs${suffix}`);
}

export function createAdminUser(payload) {
  return jsonRequest("/admin/users", "POST", payload);
}

export function updateAdminUserRole(username, payload) {
  return jsonRequest(`/admin/users/${encodeURIComponent(username)}`, "PUT", payload);
}

export function resetAdminUserPassword(username, payload) {
  return jsonRequest(`/admin/users/${encodeURIComponent(username)}/password`, "PUT", payload);
}

export function deleteAdminUser(username) {
  return api(`/admin/users/${encodeURIComponent(username)}`, { method: "DELETE" });
}
