import { useState } from "react";
import { useAuth } from "../auth/AuthProvider.jsx";
import { getStoredAuth } from "../api/client.js";

export default function LoginPage() {
  const { login, error: authError } = useAuth();
  const [username, setUsername] = useState(getStoredAuth().username);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(authError || "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    try {
      await login({ username: username.trim(), password });
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Let&apos;s GO</h1>
        <p>Sign in to access the tracker.</p>
        {error ? <div className="error-banner">{error}</div> : null}
        <label>
          Username
          <input
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label>
          Password
          <input
            autoComplete="current-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button className="primary-action" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}
