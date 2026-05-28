import { useEffect, useMemo, useRef, useState } from "react";
import {
  createStravaConnectUrl,
  disconnectStrava,
  getStravaActivities,
  getStravaStatus,
  importActivityFile,
  importProgram,
  importStravaActivities,
} from "../api/importApi.js";
import { ACTIVITY_TYPES, getActivityTypeLabel } from "../domain/activityTypes.js";
import {
  IMPORT_FORMATS,
  PROGRAM_IMPORT_SAMPLES,
  buildImportAiPrompt,
  detectActivityFileFormat,
  detectProgramImportFormat,
  summarizeProgramImport,
} from "../domain/importTools.js";
import { useTranslation } from "../i18n/translations.js";

export function ProgramImportPanel() {
  const { t } = useTranslation();
  const [format, setFormat] = useState("json");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [dropActive, setDropActive] = useState(false);
  const aiPrompt = useMemo(() => buildImportAiPrompt(), []);

  function loadSample() {
    setContent(PROGRAM_IMPORT_SAMPLES[format] || "");
    setError("");
    setResult(null);
  }

  async function loadFile(file) {
    if (!file) return;
    const text = await file.text();
    setFormat(detectProgramImportFormat(text, file.name));
    setContent(text);
    setError("");
    setResult(null);
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(aiPrompt);
      setResult({ copiedPrompt: true });
      setError("");
    } catch {
      setError(t("Clipboard copy failed. Select the prompt text and copy it manually."));
    }
  }

  async function handleImport() {
    if (!content.trim()) {
      setError(t("Add JSON or CSV content to import."));
      return;
    }
    setStatus("importing");
    setError("");
    setResult(null);
    try {
      const payload = await importProgram({ format, content });
      setResult(summarizeProgramImport(payload));
      setStatus("idle");
    } catch (importError) {
      setError(importError.message);
      setStatus("idle");
    }
  }

  return (
    <section className="import-layout">
      <div className="settings-form-column">
        <section className="app-panel import-panel">
          <div>
            <p className="eyebrow">{t("Program")}</p>
            <h2>{t("Import A Program")}</h2>
            <p>{t("Paste JSON or CSV content, or load a local file into the editor before importing.")}</p>
          </div>

          <div className="form-grid">
            <label>
              {t("Format")}
              <select value={format} onChange={(event) => setFormat(event.target.value)}>
                {IMPORT_FORMATS.map((option) => (
                  <option value={option.value} key={option.value}>
                    {t(option.label)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("File")}
              <input type="file" accept=".json,.csv,text/csv,application/json" onChange={(event) => loadFile(event.target.files?.[0])} />
            </label>
          </div>

          <div
            className={dropActive ? "import-dropzone active" : "import-dropzone"}
            onDragOver={(event) => {
              event.preventDefault();
              setDropActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setDropActive(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDropActive(false);
              loadFile(event.dataTransfer.files?.[0]);
            }}
          >
            {t("Drop a JSON or CSV file here")}
          </div>

          <label>
            {t("Content")}
            <textarea
              className="import-textarea"
              value={content}
              onChange={(event) => {
                const nextContent = event.target.value;
                setContent(nextContent);
                setFormat(detectProgramImportFormat(nextContent, ""));
              }}
              placeholder={t("Paste JSON or CSV here")}
            />
          </label>

          <div className="day-modal-actions">
            <button type="button" className="primary-action" onClick={handleImport} disabled={status === "importing"}>
              {status === "importing" ? t("Importing...") : t("Import Program")}
            </button>
            <button type="button" className="secondary-action" onClick={loadSample}>
              {t("Load Sample")}
            </button>
          </div>
        </section>

        {error ? <div className="error-banner">{error}</div> : null}
        {result ? (
          <div className="success-banner">
            {result.copiedPrompt
              ? t("Prompt copied.")
              : t("Import finished summary", {
                  sessions: result.imported_sessions,
                  created: result.created_exercises,
                  updated: result.updated_exercises,
                })}
          </div>
        ) : null}
      </div>

      <section className="app-panel import-panel">
        <div>
          <p className="eyebrow">{t("AI Helper")}</p>
          <h2>{t("Prompt Template")}</h2>
          <p>{t("Use this prompt to convert a free-text program into the importer JSON shape.")}</p>
        </div>
        <textarea className="import-prompt" value={aiPrompt} readOnly />
        <button type="button" className="secondary-action" onClick={copyPrompt}>
          {t("Copy Prompt")}
        </button>
      </section>
    </section>
  );
}

export function ActivityImportPanel() {
  const { t } = useTranslation();
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [dateOverride, setDateOverride] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [activityTypeOverride, setActivityTypeOverride] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const detectedFormat = detectActivityFileFormat(file?.name || "");

  async function handleImport() {
    if (!file) {
      setError(t("Choose a .fit, .tcx, or .gpx file to import."));
      return;
    }
    setStatus("importing");
    setError("");
    setResult(null);
    try {
      const payload = await importActivityFile({
        file,
        format: detectedFormat,
        activityTypeOverride,
        dateOverride,
        title,
        note,
      });
      setResult(payload);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      setStatus("idle");
    } catch (importError) {
      setError(importError.message);
      setStatus("idle");
    }
  }

  return (
    <section className="import-layout single">
      <div className="settings-form-column">
        <section className="app-panel import-panel">
          <div>
            <p className="eyebrow">{t("Activity File")}</p>
            <h2>{t("Import An Activity")}</h2>
            <p>{t("Add a new activity from a device file without overwriting existing activities on that day.")}</p>
          </div>

          <label>
            {t("Activity file")}
            <input
              ref={fileRef}
              type="file"
              accept=".fit,.tcx,.gpx,application/octet-stream,application/gpx+xml,application/xml,text/xml"
              onChange={(event) => {
                setFile(event.target.files?.[0] || null);
                setResult(null);
                setError("");
              }}
            />
          </label>

          {file ? (
            <div className="notice-panel">
              <span>{file.name}</span>
              <span>{t("Detected format", { format: detectedFormat.toUpperCase() })}</span>
            </div>
          ) : null}

          <div className="form-grid">
            <label>
              {t("Date override")}
              <input type="date" value={dateOverride} onChange={(event) => setDateOverride(event.target.value)} />
            </label>
            <label>
              {t("Activity type override")}
              <select value={activityTypeOverride} onChange={(event) => setActivityTypeOverride(event.target.value)}>
                <option value="">{t("Use file sport")}</option>
                {ACTIVITY_TYPES.filter((activityType) => activityType.value).map((activityType) => (
                  <option value={activityType.value} key={activityType.value}>
                    {t(activityType.label)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label>
            {t("Title")}
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("Morning ride, Zwift test...")} />
          </label>

          <label>
            {t("Note")}
            <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("Optional note added to the imported summary")} />
          </label>

          <button type="button" className="primary-action" onClick={handleImport} disabled={status === "importing"}>
            {status === "importing" ? t("Importing...") : t("Import Activity")}
          </button>
        </section>

        {error ? <div className="error-banner">{error}</div> : null}
        {result ? (
          <div className="success-banner">
            {t("Activity imported summary", {
              date: result.imported_date || "-",
              type: t(getActivityTypeLabel(result.activity_type)),
            })}
            {result.summary ? <span className="import-summary-text">{result.summary}</span> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function StravaImportPanel() {
  const { t } = useTranslation();
  const [connection, setConnection] = useState({ configured: false, connected: false });
  const [activities, setActivities] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [after, setAfter] = useState("");
  const [before, setBefore] = useState("");
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function loadStatus() {
    setStatus("loading");
    setError("");
    try {
      const payload = await getStravaStatus();
      setConnection(payload);
      setStatus("idle");
    } catch (loadError) {
      setError(loadError.message);
      setStatus("idle");
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function connect() {
    setStatus("connecting");
    setError("");
    try {
      const payload = await createStravaConnectUrl("/import?strava=connected");
      window.location.href = payload.authorization_url;
    } catch (connectError) {
      setError(connectError.message);
      setStatus("idle");
    }
  }

  async function disconnect() {
    setStatus("saving");
    setError("");
    try {
      await disconnectStrava();
      setActivities([]);
      setSelectedIds([]);
      setResult(null);
      await loadStatus();
    } catch (disconnectError) {
      setError(disconnectError.message);
      setStatus("idle");
    }
  }

  async function loadActivities() {
    setStatus("fetching");
    setError("");
    setResult(null);
    try {
      const payload = await getStravaActivities({ after, before, limit: 30 });
      setActivities(payload.activities || []);
      setSelectedIds([]);
      setStatus("idle");
    } catch (fetchError) {
      setError(fetchError.message);
      setStatus("idle");
    }
  }

  function toggleActivity(activityId) {
    setSelectedIds((current) => (current.includes(activityId) ? current.filter((id) => id !== activityId) : [...current, activityId]));
  }

  async function handleImport() {
    if (!selectedIds.length) {
      setError(t("Select at least one Strava activity to import."));
      return;
    }
    setStatus("importing");
    setError("");
    setResult(null);
    try {
      const payload = await importStravaActivities(selectedIds);
      setResult(payload);
      await loadActivities();
    } catch (importError) {
      setError(importError.message);
      setStatus("idle");
    }
  }

  return (
    <section className="import-layout single">
      <div className="settings-form-column">
        <section className="app-panel import-panel">
          <div>
            <p className="eyebrow">{t("Strava")}</p>
            <h2>{t("Import From Strava")}</h2>
            <p>{t("Connect your Strava account, review recent activities, then import selected items into your calendar.")}</p>
          </div>

          {!connection.configured ? (
            <div className="notice-panel">
              <span>{t("Strava is not configured on the backend.")}</span>
              <small>{t("Set STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, and STRAVA_REDIRECT_URI before connecting.")}</small>
            </div>
          ) : connection.connected ? (
            <div className="notice-panel">
              <span>{t("Connected account")}: {connection.athlete_name || connection.athlete_id}</span>
              {connection.scopes ? <small>{t("Scopes")}: {connection.scopes}</small> : null}
            </div>
          ) : (
            <div className="notice-panel">
              <span>{t("No Strava account connected.")}</span>
            </div>
          )}

          <div className="day-modal-actions">
            {connection.connected ? (
              <button type="button" className="secondary-action" onClick={disconnect} disabled={status === "saving"}>
                {t("Disconnect")}
              </button>
            ) : (
              <button type="button" className="primary-action" onClick={connect} disabled={!connection.configured || status === "connecting"}>
                {status === "connecting" ? t("Connecting...") : t("Connect Strava")}
              </button>
            )}
            <button type="button" className="secondary-action" onClick={loadStatus} disabled={status === "loading"}>
              {t("Refresh Status")}
            </button>
          </div>

          {connection.connected ? (
            <>
              <div className="form-grid">
                <label>
                  {t("After")}
                  <input type="date" value={after} onChange={(event) => setAfter(event.target.value)} />
                </label>
                <label>
                  {t("Before")}
                  <input type="date" value={before} onChange={(event) => setBefore(event.target.value)} />
                </label>
              </div>
              <div className="day-modal-actions">
                <button type="button" className="primary-action" onClick={loadActivities} disabled={status === "fetching"}>
                  {status === "fetching" ? t("Loading...") : t("Load Strava Activities")}
                </button>
                <button type="button" className="secondary-action" onClick={handleImport} disabled={status === "importing" || !selectedIds.length}>
                  {status === "importing" ? t("Importing...") : t("Import Selected")}
                </button>
              </div>
            </>
          ) : null}
        </section>

        {error ? <div className="error-banner">{error}</div> : null}
        {result ? (
          <div className="success-banner">
            {`${result.imported?.length || 0} ${t("imported")}, ${result.skipped?.length || 0} ${t("skipped")}`}
          </div>
        ) : null}

        {activities.length ? (
          <section className="app-panel import-panel">
            <div>
              <p className="eyebrow">{t("Preview")}</p>
              <h2>{t("Strava Activities")}</h2>
            </div>
            <div className="strava-activity-list">
              {activities.map((activity) => (
                <label className={activity.existing ? "strava-activity-row imported" : "strava-activity-row"} key={activity.id}>
                  <input
                    type="checkbox"
                    disabled={Boolean(activity.existing)}
                    checked={selectedIds.includes(activity.id)}
                    onChange={() => toggleActivity(activity.id)}
                  />
                  <span>
                    <strong>{activity.name}</strong>
                    <small>
                      {activity.date} - {t(getActivityTypeLabel(activity.activity_type))} - {activity.distance_km ?? "-"} km - {activity.duration || "-"}
                      {activity.existing ? ` - ${t("Already imported")}` : ""}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}

export default function ImportPage() {
  const { t } = useTranslation();
  const [mode, setMode] = useState("program");

  return (
    <main className="page-shell">
      <section className="module-header">
        <div>
          <p className="eyebrow">{t("Data")}</p>
          <h1>{t("Import")}</h1>
        </div>
      </section>

      <section className="calendar-toolbar app-panel import-mode-toolbar">
        <div className="view-switch">
          <button type="button" className={mode === "program" ? "active" : ""} onClick={() => setMode("program")}>
            {t("Program")}
          </button>
          <button type="button" className={mode === "activity" ? "active" : ""} onClick={() => setMode("activity")}>
            {t("Activity File")}
          </button>
          <button type="button" className={mode === "strava" ? "active" : ""} onClick={() => setMode("strava")}>
            {t("Strava")}
          </button>
        </div>
      </section>

      {mode === "program" ? <ProgramImportPanel /> : null}
      {mode === "activity" ? <ActivityImportPanel /> : null}
      {mode === "strava" ? <StravaImportPanel /> : null}
    </main>
  );
}
