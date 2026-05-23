import { api } from "./client.js";

export function getHangboardBoards() {
  return api("/hangboard/boards");
}

export function generateHangboardWorkout(options) {
  return api("/hangboard/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
}

export function saveHangboardTemplate(name, options) {
  return api("/hangboard/templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, options }),
  });
}

export function createHangboardSession({ date, options, templateId = null }) {
  return api("/hangboard/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date, options, template_id: templateId }),
  });
}

export function completeHangboardSession(sessionId, log) {
  return api(`/hangboard/sessions/${sessionId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(log),
  });
}

export function getHangboardHistory(limit = 20) {
  return api(`/hangboard/sessions?limit=${encodeURIComponent(limit)}`);
}
