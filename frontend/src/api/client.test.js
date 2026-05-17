import assert from "node:assert/strict";
import test from "node:test";

import { api, clearStoredAuth, storeAuth } from "./client.js";

function installLocalStorage() {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("api sends CSRF header for authenticated mutations", async () => {
  installLocalStorage();
  clearStoredAuth();
  storeAuth({ username: "user", csrf_token: "csrf-token" });

  let request = null;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  await api("/auth/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: "{}" });

  assert.equal(request.url, "/api/auth/preferences");
  assert.equal(request.options.headers["X-CSRF-Token"], "csrf-token");
  assert.equal(request.options.credentials, "same-origin");
});

test("api does not send CSRF header for login", async () => {
  installLocalStorage();
  clearStoredAuth();
  storeAuth({ username: "user", csrf_token: "csrf-token" });

  let request = null;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ username: "user", csrf_token: "new-csrf" }), { status: 200 });
  };

  await api("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });

  assert.equal(request.url, "/api/auth/login");
  assert.equal(request.options.headers["X-CSRF-Token"], undefined);
});
