import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, clearStoredAuth, storeAuth } from "../api/client.js";

const AuthContext = createContext(null);

function normalizeUser(payload) {
  if (!payload?.username) {
    return null;
  }
  return {
    username: payload.username,
    isAdmin: Boolean(payload.is_admin),
    mustChangePassword: Boolean(payload.must_change_password),
    language: payload.language === "en" ? "en" : "fr",
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [error, setError] = useState("");

  const refreshUser = useCallback(async () => {
    try {
      const payload = await api("/auth/me", {}, { allowUnauthorized: true });
      const normalized = normalizeUser(payload);
      setUser(normalized);
      setError("");
      return normalized;
    } catch (refreshError) {
      clearStoredAuth();
      setUser(null);
      setError(refreshError.message === "Authentication required" || refreshError.message === "Invalid session" ? "" : refreshError.message);
      return null;
    } finally {
      setIsBootstrapping(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const login = useCallback(async ({ username, password }) => {
    const payload = await api(
      "/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      },
      { allowUnauthorized: true },
    );
    storeAuth(payload);
    const normalized = normalizeUser(payload);
    setUser(normalized);
    setError("");
    return normalized;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" }, { allowUnauthorized: true });
    } catch {
      // Logging out should still clear the local session if the server token is stale.
    }
    clearStoredAuth();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isBootstrapping,
      error,
      login,
      logout,
      refreshUser,
    }),
    [error, isBootstrapping, login, logout, refreshUser, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
