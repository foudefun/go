import { useMemo, useRef, useState } from "react";
import { importActivityFile, importProgram } from "../api/importApi.js";
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

function ProgramImportPanel() {
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

function ActivityImportPanel() {
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
        </div>
      </section>

      {mode === "program" ? <ProgramImportPanel /> : <ActivityImportPanel />}
    </main>
  );
}
