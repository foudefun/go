import { useAuth } from "../auth/AuthProvider.jsx";

export default function AccountPage() {
  const { user, logout } = useAuth();

  return (
    <main className="page-shell">
      <section className="module-header">
        <div>
          <p className="eyebrow">Profile</p>
          <h1>Account</h1>
        </div>
        <button type="button" onClick={logout}>
          Logout
        </button>
      </section>
      <section className="app-panel account-panel">
        <div>
          <span>Username</span>
          <strong>{user?.username}</strong>
        </div>
        <div>
          <span>Role</span>
          <strong>{user?.isAdmin ? "Admin" : "User"}</strong>
        </div>
        <div>
          <span>Language</span>
          <strong>{user?.language || "fr"}</strong>
        </div>
      </section>
    </main>
  );
}
