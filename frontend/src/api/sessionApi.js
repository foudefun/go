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
