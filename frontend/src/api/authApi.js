import { api } from "./client.js";

export function updatePreferences(payload) {
  return api("/auth/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
