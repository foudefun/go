import { api } from "./client.js";

export function getActivityCleanupDuplicates() {
  return api("/activity-cleanup/duplicates");
}
