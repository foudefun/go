import { api } from "./client.js";

export function getActivityCleanupDuplicates() {
  return api("/activity-cleanup/duplicates");
}

export function mergeActivityCleanupDuplicates(payload) {
  return api("/activity-cleanup/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
