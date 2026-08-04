import { api } from "./client.js";

export function importProgram(payload) {
  return api("/import/program", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function importActivityFile({ file, format = "auto", activityTypeOverride = "", dateOverride = "", title = "", note = "" }) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("format", format);
  formData.append("activity_type_override", activityTypeOverride);
  formData.append("date_override", dateOverride);
  formData.append("title", title);
  formData.append("note", note);

  return api("/import/activity-file", {
    method: "POST",
    body: formData,
  });
}

export function getStravaStatus() {
  return api("/strava/status");
}

export function createStravaConnectUrl(frontendRedirectUrl = "") {
  return api("/strava/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ frontend_redirect_url: frontendRedirectUrl }),
  });
}

export function disconnectStrava() {
  return api("/strava/connection", { method: "DELETE" });
}

export function getStravaActivities({ after = "", before = "", limit = 20 } = {}) {
  const params = new URLSearchParams();
  if (after) params.set("after", after);
  if (before) params.set("before", before);
  if (limit) params.set("limit", String(limit));
  const query = params.toString();
  return api(`/strava/activities${query ? `?${query}` : ""}`);
}

export function importStravaActivities(activityIds) {
  return api("/strava/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ activity_ids: activityIds }),
  });
}

export function getIntervalsIcuStatus() {
  return api("/intervals-icu/status");
}

export function saveIntervalsIcuConnection({ apiKey, athleteId = "0" }) {
  return api("/intervals-icu/connection", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, athlete_id: athleteId }),
  });
}

export function disconnectIntervalsIcu() {
  return api("/intervals-icu/connection", { method: "DELETE" });
}

export function syncIntervalsIcuNow() {
  return api("/intervals-icu/sync", { method: "POST" });
}

export function getIntervalsIcuActivities({ oldest = "", newest = "" } = {}) {
  const params = new URLSearchParams({ oldest, newest });
  return api(`/intervals-icu/activities?${params.toString()}`);
}

export function importIntervalsIcuActivities(activityIds) {
  return api("/intervals-icu/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ activity_ids: activityIds }),
  });
}

export function getStravaExportPreview({ offset = 0, limit = 25 } = {}) {
  const params = new URLSearchParams();
  params.set("offset", String(offset));
  params.set("limit", String(limit));
  return api(`/strava/export/preview?${params.toString()}`);
}

export function importStravaExportFiles(filenames) {
  return api("/strava/export/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filenames }),
  });
}

export function previewUploadedStravaExportFiles(files) {
  const formData = new FormData();
  for (const file of files || []) {
    formData.append("files", file);
  }
  return api("/strava/export/upload-preview", {
    method: "POST",
    body: formData,
  });
}

export function importUploadedStravaExportFiles(files, { activityTypeOverride = "" } = {}) {
  const formData = new FormData();
  for (const file of files || []) {
    formData.append("files", file);
  }
  formData.append("activity_type_override", activityTypeOverride);
  return api("/strava/export/upload-import", {
    method: "POST",
    body: formData,
  });
}

export function getImportHistory({ limit = 10 } = {}) {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  return api(`/import/history?${params.toString()}`);
}
