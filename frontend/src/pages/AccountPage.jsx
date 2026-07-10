import { useEffect, useState } from "react";
import { updatePreferences } from "../api/authApi.js";
import { getConfig, updateConfig } from "../api/configApi.js";
import { createStravaConnectUrl, disconnectStrava, getStravaStatus } from "../api/importApi.js";
import { useAuth } from "../auth/AuthProvider.jsx";
import { normalizeConfigDraft } from "../domain/settingsConfig.js";
import { useTranslation } from "../i18n/translations.js";

const FIELD_GROUPS = [
  {
    title: "Athlete Weight Context",
    description: "Used as the bodyweight reference in training summaries.",
    fields: [
      { key: "weight", label: "Body Weight Reference", suffix: "kg" },
      { key: "shoe_size", label: "Shoe Size", suffix: "EU", step: "0.5" },
    ],
  },
];

function SettingsField({ field, value, onChange }) {
  const { t } = useTranslation();
  return (
    <label>
      {t(field.label)}
      <div className="settings-input-row">
        <input
          type={field.type || "number"}
          min={field.type === "date" ? undefined : "1"}
          step={field.type === "date" ? undefined : field.step || "1"}
          value={value}
          onChange={(event) => onChange(field.key, event.target.value)}
        />
        {field.suffix ? <span>{field.suffix}</span> : null}
      </div>
    </label>
  );
}

export default function AccountPage() {
  const { user, logout, refreshUser } = useAuth();
  const { t } = useTranslation();
  const [language, setLanguage] = useState(user?.language || "fr");
  const [draft, setDraft] = useState(() => normalizeConfigDraft());
  const [status, setStatus] = useState("loading");
  const [stravaStatus, setStravaStatus] = useState("loading");
  const [stravaConnection, setStravaConnection] = useState({ configured: false, connected: false });
  const [error, setError] = useState("");
  const [stravaError, setStravaError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    setLanguage(user?.language || "fr");
  }, [user?.language]);

  useEffect(() => {
    let isMounted = true;
    setStatus("loading");
    setError("");
    getConfig()
      .then((config) => {
        if (!isMounted) return;
        setDraft(normalizeConfigDraft(config));
        setStatus("ready");
      })
      .catch((loadError) => {
        if (!isMounted) return;
        setError(loadError.message);
        setStatus("error");
      });
    return () => {
      isMounted = false;
    };
  }, []);

  async function loadStravaStatus() {
    setStravaStatus("loading");
    setStravaError("");
    try {
      const payload = await getStravaStatus();
      setStravaConnection(payload);
      setStravaStatus("ready");
    } catch (loadError) {
      setStravaError(loadError.message);
      setStravaStatus("ready");
    }
  }

  useEffect(() => {
    loadStravaStatus();
  }, []);

  function updateField(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
    setSavedMessage("");
  }

  async function handleSave() {
    const payload = normalizeConfigDraft(draft);
    setStatus("saving");
    setError("");
    setSavedMessage("");
    try {
      const [configResult] = await Promise.all([
        updateConfig(payload),
        updatePreferences({ language }),
      ]);
      setDraft(normalizeConfigDraft(configResult.config || payload));
      await refreshUser();
      setSavedMessage(t("Account settings saved."));
      setStatus("ready");
    } catch (saveError) {
      setError(saveError.message);
      setStatus("ready");
    }
  }

  async function handleConnectStrava() {
    setStravaStatus("connecting");
    setStravaError("");
    try {
      const payload = await createStravaConnectUrl("/account?strava=connected");
      if (!payload.authorization_url) {
        throw new Error(t("Strava did not return a login link. Check the backend Strava configuration."));
      }
      window.location.assign(payload.authorization_url);
    } catch (connectError) {
      setStravaError(connectError.message);
      setStravaStatus("ready");
    }
  }

  async function handleDisconnectStrava() {
    setStravaStatus("saving");
    setStravaError("");
    try {
      await disconnectStrava();
      await loadStravaStatus();
    } catch (disconnectError) {
      setStravaError(disconnectError.message);
      setStravaStatus("ready");
    }
  }

  return (
    <main className="page-shell">
      <section className="module-header">
        <div>
          <p className="eyebrow">{t("Profile")}</p>
          <h1>{t("Account")}</h1>
        </div>
        <button type="button" onClick={logout}>
          {t("Logout")}
        </button>
      </section>

      {status === "loading" ? <div className="app-panel empty-state">{t("Loading account settings...")}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}
      {stravaError ? <div className="error-banner">{stravaError}</div> : null}
      {savedMessage ? <div className="success-banner">{savedMessage}</div> : null}

      <section className="app-panel account-panel">
        <div>
          <span>{t("Username")}</span>
          <strong>{user?.username}</strong>
        </div>
        <div>
          <span>{t("Role")}</span>
          <strong>{user?.isAdmin ? t("Admin") : t("User")}</strong>
        </div>
        <div>
          <span>{t("Language")}</span>
          <select value={language} onChange={(event) => setLanguage(event.target.value)}>
            <option value="fr">Français</option>
            <option value="en">English</option>
          </select>
        </div>
      </section>

      <section className="settings-layout single">
        <div className="settings-form-column">
          {FIELD_GROUPS.map((group) => (
            <section className="app-panel settings-panel" key={group.title}>
              <div>
                <p className="eyebrow">{t(group.title)}</p>
                <h2>{t(group.title)}</h2>
                <p>{t(group.description)}</p>
              </div>
              <div className="settings-field-grid">
                {group.fields.map((field) => (
                  <SettingsField field={field} value={draft[field.key] || ""} onChange={updateField} key={field.key} />
                ))}
              </div>
            </section>
          ))}

          <section className="app-panel settings-panel">
            <div>
              <p className="eyebrow">{t("Connected Apps")}</p>
              <h2>{t("Strava")}</h2>
              <p>{t("Connect your own Strava account. Imported activities are saved only to your user calendar.")}</p>
            </div>

            {!stravaConnection.configured ? (
              <div className="notice-panel">
                <span>{t("Strava is not configured on the backend.")}</span>
              </div>
            ) : stravaConnection.connected ? (
              <div className="notice-panel">
                <span>{t("Connected account")}: {stravaConnection.athlete_name || stravaConnection.athlete_id}</span>
                {stravaConnection.scopes ? <small>{t("Scopes")}: {stravaConnection.scopes}</small> : null}
              </div>
            ) : (
              <div className="notice-panel">
                <span>{t("No Strava account connected.")}</span>
              </div>
            )}

            <div className="day-modal-actions">
              {stravaConnection.connected ? (
                <button type="button" className="secondary-action" onClick={handleDisconnectStrava} disabled={stravaStatus === "saving"}>
                  {t("Disconnect Strava")}
                </button>
              ) : (
                <button
                  type="button"
                  className="primary-action"
                  onClick={handleConnectStrava}
                  disabled={!stravaConnection.configured || stravaStatus === "connecting"}
                >
                  {stravaStatus === "connecting" ? t("Connecting...") : t("Connect Strava")}
                </button>
              )}
              <button type="button" className="secondary-action" onClick={loadStravaStatus} disabled={stravaStatus === "loading"}>
                {t("Refresh Status")}
              </button>
            </div>
          </section>

          <div className="day-modal-actions">
            <button type="button" className="primary-action" onClick={handleSave} disabled={status === "saving"}>
              {status === "saving" ? t("Saving...") : t("Save Account Settings")}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
