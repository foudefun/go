import { api } from "./client.js";

export function getConfig() {
  return api("/config");
}

export function updateConfig(payload) {
  return api("/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
