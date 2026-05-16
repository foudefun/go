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
