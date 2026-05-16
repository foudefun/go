const API_BASE = "/api";
const TOKEN_KEY = "rehabToken";
const USERNAME_KEY = "rehabUsername";

export function getStoredAuth() {
  return {
    token: localStorage.getItem(TOKEN_KEY) || "",
    username: localStorage.getItem(USERNAME_KEY) || "",
  };
}

export function storeAuth(payload) {
  localStorage.setItem(TOKEN_KEY, payload.token || "");
  localStorage.setItem(USERNAME_KEY, payload.username || "");
}

export function clearStoredAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

export async function api(path, options = {}, config = {}) {
  const { token } = getStoredAuth();
  const headers = { ...(options.headers || {}) };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
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

  return data;
}
