import { api } from "./client.js";

export function getSession(date) {
  return api(`/session/${date}`);
}

export function saveSession(date, payload) {
  return api(`/session/${date}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function uploadActivityImage(date, activityIndex, file) {
  const formData = new FormData();
  formData.append("image_file", file);
  return api(`/session/${date}/activities/${activityIndex}/upload-image`, {
    method: "POST",
    body: formData,
  });
}

export function deleteActivityImage(date, activityIndex) {
  return api(`/session/${date}/activities/${activityIndex}/delete-image`, {
    method: "POST",
  });
}

export function uploadActivitySourceFile(date, activityIndex, { file, format = "", provider = "", label = "" }) {
  const formData = new FormData();
  formData.append("activity_file", file);
  formData.append("format", format);
  formData.append("provider", provider);
  formData.append("label", label);
  return api(`/session/${date}/activities/${activityIndex}/source-files`, {
    method: "POST",
    body: formData,
  });
}

export function updateActivityMetricSources(date, activityIndex, metricSourcePreferences) {
  return api(`/session/${date}/activities/${activityIndex}/metric-sources`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ metric_source_preferences: metricSourcePreferences }),
  });
}
