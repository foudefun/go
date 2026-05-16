import { useEffect, useState } from "react";
import { getConfig, updateConfig } from "../api/configApi.js";
import { normalizeConfigDraft } from "../domain/settingsConfig.js";

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
  return (
    <label>
      {field.label}
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

export default function SettingsPage() {
  const [draft, setDraft] = useState(() => normalizeConfigDraft());
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

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
      const result = await updateConfig(payload);
      setDraft(normalizeConfigDraft(result.config || payload));
      setSavedMessage("Settings saved.");
      setStatus("ready");
    } catch (saveError) {
      setError(saveError.message);
      setStatus("ready");
    }
  }

  return (
    <main className="page-shell">
      <section className="module-header">
        <div>
          <p className="eyebrow">Configuration</p>
          <h1>Settings</h1>
        </div>
        <a className="secondary-action" href="/legacy.html">
          Legacy Settings
        </a>
      </section>

      {status === "loading" ? <div className="app-panel empty-state">Loading settings...</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}
      {savedMessage ? <div className="success-banner">{savedMessage}</div> : null}

      <section className="settings-layout single">
        <div className="settings-form-column">
          {FIELD_GROUPS.map((group) => (
            <section className="app-panel settings-panel" key={group.title}>
              <div>
                <p className="eyebrow">{group.title}</p>
                <h2>{group.title}</h2>
                <p>{group.description}</p>
              </div>
              <div className="settings-field-grid">
                {group.fields.map((field) => (
                  <SettingsField field={field} value={draft[field.key] || ""} onChange={updateField} key={field.key} />
                ))}
              </div>
            </section>
          ))}

          <div className="day-modal-actions">
            <button type="button" className="primary-action" onClick={handleSave} disabled={status === "saving"}>
              {status === "saving" ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
