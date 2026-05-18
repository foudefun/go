import { api } from "./client.js";

export function getExercises() {
  return api("/exercises");
}

export function getExercisePerformance(name, { excludeDate = "" } = {}) {
  const params = new URLSearchParams();
  if (excludeDate) params.set("exclude_date", excludeDate);
  const query = params.toString();
  return api(`/exercises/${encodeURIComponent(name)}/performance${query ? `?${query}` : ""}`);
}

export function createExercise(payload) {
  return api("/exercises", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updateExercise(name, payload) {
  return api(`/exercises/${encodeURIComponent(name)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function deleteExercise(name) {
  return api(`/exercises/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
}

export function mergeExerciseInto(sourceName, targetName) {
  return api(`/exercises/${encodeURIComponent(sourceName)}/merge-into`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_name: targetName }),
  });
}

export function uploadExerciseImage(name, file) {
  const formData = new FormData();
  formData.append("image_file", file);
  return api(`/exercises/${encodeURIComponent(name)}/upload-image`, {
    method: "POST",
    body: formData,
  });
}

export function setPrimaryExerciseImage(name, imageUrl) {
  return api(`/exercises/${encodeURIComponent(name)}/set-primary-image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: imageUrl }),
  });
}

export function deleteExerciseImage(name, imageUrl) {
  return api(`/exercises/${encodeURIComponent(name)}/delete-image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: imageUrl }),
  });
}
