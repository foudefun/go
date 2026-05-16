import { api } from "./client.js";

export function getExercises() {
  return api("/exercises");
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
