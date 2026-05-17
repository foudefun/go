const API_BASE = "/api";
const USERNAME_KEY = "rehabUsername";
const CSRF_TOKEN_KEY = "rehabCsrfToken";
const LEGACY_TOKEN_KEY = "rehabToken";
const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function getStoredAuth() {
  return {
    username: localStorage.getItem(USERNAME_KEY) || "",
    csrfToken: localStorage.getItem(CSRF_TOKEN_KEY) || "",
  };
}

export function storeAuth(payload) {
  if (Object.hasOwn(payload, "username")) {
    localStorage.setItem(USERNAME_KEY, payload.username || "");
  }
  if (payload.csrf_token) {
    localStorage.setItem(CSRF_TOKEN_KEY, payload.csrf_token);
  }
}

export function clearStoredAuth() {
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
  localStorage.removeItem(CSRF_TOKEN_KEY);
}

export async function api(path, options = {}, config = {}) {
  const { csrfToken } = getStoredAuth();
  const headers = { ...(options.headers || {}) };
  const method = String(options.method || "GET").toUpperCase();
  if (csrfToken && MUTATION_METHODS.has(method) && path !== "/auth/login") {
    headers["X-CSRF-Token"] = csrfToken;
  }

  const response = await fetch(`${API_BASE}${path}`, { ...options, credentials: "same-origin", headers });
  const text = await response.text();
  let data = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { detail: text };
    }
  }

  if (!response.ok) {
    if (response.status === 401 && !config.allowUnauthorized) {
      clearStoredAuth();
    }
    throw new Error(data.detail || `API ${response.status}`);
  }

  if (data.csrf_token) {
    storeAuth(data);
  }

  return data;
}
