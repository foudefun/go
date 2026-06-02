import { useEffect, useMemo, useRef, useState } from "react";
import {
  createStravaConnectUrl,
  disconnectStrava,
  getImportHistory,
  getStravaActivities,
  getStravaExportPreview,
  getStravaStatus,
  importActivityFile,
  importProgram,
  importStravaActivities,
  importStravaExportFiles,
  importUploadedStravaExportFiles,
  previewUploadedStravaExportFiles,
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
import DaySessionModal from "../sessions/components/DaySessionModal.jsx";

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
  const folderRef = useRef(null);
  const [file, setFile] = useState(null);
  const [dateOverride, setDateOverride] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [activityTypeOverride, setActivityTypeOverride] = useState("");
  const [batchFiles, setBatchFiles] = useState([]);
  const [status, setStatus] = useState("idle");
  const [batchStatus, setBatchStatus] = useState("idle");
  const [retryActivityType, setRetryActivityType] = useState("");
  const [error, setError] = useState("");
  const [batchError, setBatchError] = useState("");
  const [result, setResult] = useState(null);
  const [batchResult, setBatchResult] = useState(null);
  const detectedFormat = detectActivityFileFormat(file?.name || "");

  useEffect(() => {
    if (!folderRef.current) return;
    folderRef.current.setAttribute("webkitdirectory", "");
    folderRef.current.setAttribute("directory", "");
  }, []);

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

  function setBatchSelection(fileList) {
    const nextFiles = Array.from(fileList || []).filter((item) => /\.(fit|gpx|tcx)(\.gz)?$/i.test(item.name || ""));
    setBatchFiles(nextFiles);
    setBatchResult(null);
    setRetryActivityType("");
    setBatchError(nextFiles.length ? "" : t("Choose FIT, GPX, or TCX activity files."));
  }

  async function importBatchFiles() {
    if (!batchFiles.length) {
      setBatchError(t("Choose FIT, GPX, or TCX activity files."));
      return;
    }
    setBatchStatus("importing");
    setBatchError("");
    setBatchResult(null);
    try {
      const payload = await importUploadedStravaExportFiles(batchFiles);
      setBatchResult(payload);
      setBatchStatus("idle");
    } catch (importError) {
      setBatchError(importError.message);
      setBatchStatus("idle");
    }
  }

  async function retryBatchErrors() {
    const errorNames = new Set((batchResult?.errors || []).map((item) => item.filename));
    const filesToRetry = batchFiles.filter((item) => errorNames.has(item.name));
    if (!filesToRetry.length) {
      setBatchError(t("No failed files to retry."));
      return;
    }
    if (!retryActivityType) {
      setBatchError(t("Choose an activity type before retrying failed files."));
      return;
    }
    setBatchStatus("importing");
    setBatchError("");
    try {
      const payload = await importUploadedStravaExportFiles(filesToRetry, { activityTypeOverride: retryActivityType });
      setBatchResult(payload);
      setBatchStatus("idle");
    } catch (importError) {
      setBatchError(importError.message);
      setBatchStatus("idle");
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

        <section className="app-panel import-panel">
          <div>
            <p className="eyebrow">{t("Batch Import")}</p>
            <h2>{t("Import Multiple Activities")}</h2>
            <p>{t("Choose several FIT, GPX, or TCX files, or select a folder from your computer, then import them in one step.")}</p>
          </div>

          <div className="form-grid">
            <label>
              {t("Activity files")}
              <input
                type="file"
                multiple
                accept=".fit,.fit.gz,.gpx,.gpx.gz,.tcx,.tcx.gz,application/gzip,application/octet-stream,application/gpx+xml,application/xml,text/xml"
                onChange={(event) => setBatchSelection(event.target.files)}
              />
            </label>
            <label>
              {t("Folder")}
              <input
                ref={folderRef}
                type="file"
                multiple
                onChange={(event) => setBatchSelection(event.target.files)}
              />
            </label>
          </div>

          {batchFiles.length ? (
            <div className="notice-panel">
              <span>{t("Selected files")}: {batchFiles.length}</span>
              <small>{batchFiles.slice(0, 5).map((item) => item.webkitRelativePath || item.name).join(", ")}{batchFiles.length > 5 ? "..." : ""}</small>
            </div>
          ) : null}

          <div className="day-modal-actions">
            <button type="button" className="primary-action" onClick={importBatchFiles} disabled={batchStatus === "importing" || !batchFiles.length}>
              {batchStatus === "importing" ? t("Importing...") : t("Import All Selected Files")}
            </button>
          </div>

          {batchError ? <div className="error-banner">{batchError}</div> : null}
          <BatchImportSummary result={batchResult} t={t} />

          {batchResult?.errors?.length ? (
            <section className="app-panel import-panel compact">
              <div>
                <p className="eyebrow">{t("Resolve Errors")}</p>
                <h3>{t("Assign a type and retry")}</h3>
                <p>{t("Some files could not be mapped to an activity type. Choose the best type and retry only failed files.")}</p>
              </div>
              <label>
                {t("Activity type")}
                <select value={retryActivityType} onChange={(event) => setRetryActivityType(event.target.value)}>
                  <option value="">{t("Choose activity type")}</option>
                  {ACTIVITY_TYPES.filter((activityType) => activityType.value).map((activityType) => (
                    <option value={activityType.value} key={activityType.value}>
                      {t(activityType.label)}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="secondary-action" onClick={retryBatchErrors} disabled={batchStatus === "importing" || !retryActivityType}>
                {batchStatus === "importing" ? t("Importing...") : t("Retry Failed Files")}
              </button>
              <div className="error-banner">
                {batchResult.errors.slice(0, 8).map((item) => `${item.filename}: ${item.detail}`).join(" | ")}
              </div>
            </section>
          ) : null}
        </section>
      </div>
    </section>
  );
}

function BatchImportSummary({ result, t }) {
  if (!result) return null;
  const imported = result.imported || [];
  const skipped = result.skipped || [];
  const errors = result.errors || [];

  return (
    <section className="batch-result-summary">
      <div className="batch-result-header">
        <div>
          <p className="eyebrow">{t("Batch Import Summary")}</p>
          <h3>{t("What happened to the selected files")}</h3>
          <p>{t("Skipped files are duplicates already present in your activities.")}</p>
        </div>
        <div className="batch-result-counts" aria-label={t("Batch import counts")}>
          <span className="success">{imported.length} {t("imported")}</span>
          <span>{skipped.length} {t("skipped")}</span>
          <span className={errors.length ? "error" : ""}>{errors.length} {t("errors")}</span>
        </div>
      </div>

      <div className="batch-result-grid">
        <BatchImportGroup title={t("Imported files")} items={imported} tone="success" t={t} />
        <BatchImportGroup title={t("Skipped duplicates")} items={skipped} tone="neutral" t={t} />
        <BatchImportGroup title={t("Failed files")} items={errors} tone="error" t={t} />
      </div>
    </section>
  );
}

function BatchImportGroup({ title, items, tone, t }) {
  return (
    <div className={`batch-result-group ${tone}`}>
      <div className="batch-result-group-header">
        <h4>{title}</h4>
        <span>{items.length}</span>
      </div>
      {items.length ? (
        <div className="batch-result-list">
          {items.map((item, index) => (
            <div className="batch-result-row" key={`${item.filename || title}-${index}`}>
              <strong>{item.filename || t("Unknown file")}</strong>
              <small>{formatBatchImportMeta(item, t)}</small>
            </div>
          ))}
        </div>
      ) : (
        <p className="batch-result-empty">{t("No files in this group")}</p>
      )}
    </div>
  );
}

function formatBatchImportMeta(item, t) {
  const parts = [];
  if (item.date) parts.push(item.date);
  if (item.imported_date) parts.push(item.imported_date);
  if (item.activity_type) parts.push(t(getActivityTypeLabel(item.activity_type)));
  if (Number.isInteger(item.activity_index)) parts.push(`${t("Activity")} ${item.activity_index + 1}`);
  if (item.detail) parts.push(item.detail);
  if (item.summary) parts.push(item.summary);
  return parts.filter(Boolean).join(" | ") || t("No detail available");
}

function formatImportBatchSource(source, t) {
  const labels = {
    activity_file: "Activity File",
    strava_api: "Strava",
    strava_export_folder: "Strava Export Folder",
    strava_export_upload: "Upload Export",
  };
  return t(labels[source] || source || "Import");
}

function ImportHistoryPanel() {
  const { t } = useTranslation();
  const [batches, setBatches] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [modalActivity, setModalActivity] = useState(null);

  async function loadHistory() {
    setStatus("loading");
    setError("");
    try {
      const payload = await getImportHistory({ limit: 20 });
      setBatches(Array.isArray(payload.batches) ? payload.batches : []);
      setStatus("idle");
    } catch (loadError) {
      setError(loadError.message);
      setStatus("idle");
    }
  }

  useEffect(() => {
    loadHistory();
  }, []);

  const filteredBatches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return batches;
    return batches
      .map((batch) => ({
        ...batch,
        items: (batch.items || []).filter((item) => (
          `${item.filename || ""} ${item.summary || ""} ${item.detail || ""} ${item.date || ""} ${item.activity_type || ""}`
            .toLowerCase()
            .includes(needle)
        )),
      }))
      .filter((batch) => batch.items.length);
  }, [batches, query]);

  return (
    <section className="import-layout single">
      <div className="settings-form-column">
        <section className="app-panel import-panel">
          <div>
            <p className="eyebrow">{t("Import Review")}</p>
            <h2>{t("Import history")}</h2>
            <p>{t("Review recent imports, skipped duplicates, files saved as Other, and files that still need attention.")}</p>
          </div>
          <div className="form-grid">
            <label>
              {t("Search")}
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Filename, date, type...")} />
            </label>
            <div className="day-modal-actions align-end">
              <button type="button" className="secondary-action" onClick={loadHistory} disabled={status === "loading"}>
                {status === "loading" ? t("Loading...") : t("Refresh")}
              </button>
            </div>
          </div>
          <div className="day-modal-actions">
            <a className="secondary-action link-action" href="/activity-cleanup">{t("Open duplicate cleanup")}</a>
          </div>
        </section>

        {error ? <div className="error-banner">{error}</div> : null}

        {filteredBatches.length ? (
          <section className="import-history-list">
            {filteredBatches.map((batch) => (
              <ImportHistoryBatch batch={batch} key={batch.id} onOpenActivity={setModalActivity} t={t} />
            ))}
          </section>
        ) : status !== "loading" && !error ? (
          <div className="app-panel empty-state">{t("No import history yet.")}</div>
        ) : null}
      </div>

      {modalActivity ? (
        <DaySessionModal
          date={modalActivity.date}
          initialActivityIndex={modalActivity.activity_index}
          onClose={() => setModalActivity(null)}
          onSaved={loadHistory}
        />
      ) : null}
    </section>
  );
}

function ImportHistoryBatch({ batch, onOpenActivity, t }) {
  const summary = batch.summary || {};
  const items = Array.isArray(batch.items) ? batch.items : [];
  return (
    <article className="app-panel import-history-batch">
      <div className="batch-result-header">
        <div>
          <p className="eyebrow">{formatImportBatchSource(batch.source, t)}</p>
          <h3>{formatImportDate(batch.created_at)}</h3>
          <p>{batch.status === "needs_review" ? t("This import needs review.") : t("This import looks clean.")}</p>
        </div>
        <div className="batch-result-counts">
          <span className="success">{summary.imported || 0} {t("imported")}</span>
          <span>{summary.skipped || 0} {t("skipped")}</span>
          <span className={(summary.other || 0) ? "warning" : ""}>{summary.other || 0} {t("Other")}</span>
          <span className={(summary.errors || 0) ? "error" : ""}>{summary.errors || 0} {t("errors")}</span>
        </div>
      </div>
      <div className="import-history-table">
        {items.map((item, index) => (
          <ImportHistoryRow item={item} key={`${item.status}-${item.filename || item.strava_activity_id || index}`} onOpenActivity={onOpenActivity} t={t} />
        ))}
      </div>
    </article>
  );
}

function ImportHistoryRow({ item, onOpenActivity, t }) {
  const canOpen = item.status === "imported" && item.date && Number.isInteger(item.activity_index);
  return (
    <div className={`import-history-row ${item.status || "imported"}`}>
      <span className="import-history-status">{t(item.status || "imported")}</span>
      <div>
        <strong>{item.filename || item.strava_activity_id || t("Unknown file")}</strong>
        <small>{formatBatchImportMeta(item, t)}</small>
      </div>
      {canOpen ? (
        <button type="button" className="secondary-action" onClick={() => onOpenActivity(item)}>
          {t("Open activity")}
        </button>
      ) : null}
    </div>
  );
}

function formatImportDate(value) {
  if (!value) return "";
  const dateValue = new Date(value);
  if (Number.isNaN(dateValue.getTime())) return value;
  return dateValue.toLocaleString();
}

export function StravaImportPanel() {
  const { t } = useTranslation();
  const [connection, setConnection] = useState({ configured: false, connected: false });
  const [activities, setActivities] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [exportPreview, setExportPreview] = useState({ activities: [], errors: [], total: 0, offset: 0, limit: 25 });
  const [selectedExportFiles, setSelectedExportFiles] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [uploadedPreview, setUploadedPreview] = useState({ activities: [], errors: [] });
  const [selectedUploadedFiles, setSelectedUploadedFiles] = useState([]);
  const [uploadDropActive, setUploadDropActive] = useState(false);
  const [after, setAfter] = useState("");
  const [before, setBefore] = useState("");
  const [status, setStatus] = useState("loading");
  const [exportStatus, setExportStatus] = useState("idle");
  const [uploadStatus, setUploadStatus] = useState("idle");
  const [error, setError] = useState("");
  const [exportError, setExportError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [result, setResult] = useState(null);
  const [exportResult, setExportResult] = useState(null);
  const [uploadResult, setUploadResult] = useState(null);

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

  async function loadExportPreview(nextOffset = exportPreview.offset || 0) {
    setExportStatus("loading");
    setExportError("");
    setExportResult(null);
    try {
      const payload = await getStravaExportPreview({ offset: nextOffset, limit: exportPreview.limit || 25 });
      setExportPreview(payload);
      setSelectedExportFiles([]);
      setExportStatus("idle");
    } catch (loadError) {
      setExportError(loadError.message);
      setExportStatus("idle");
    }
  }

  function toggleExportFile(filename) {
    setSelectedExportFiles((current) => (current.includes(filename) ? current.filter((item) => item !== filename) : [...current, filename]));
  }

  async function importSelectedExportFiles() {
    if (!selectedExportFiles.length) {
      setExportError(t("Select at least one Strava export file to import."));
      return;
    }
    setExportStatus("importing");
    setExportError("");
    setExportResult(null);
    try {
      const payload = await importStravaExportFiles(selectedExportFiles);
      setExportResult(payload);
      await loadExportPreview(exportPreview.offset || 0);
    } catch (importError) {
      setExportError(importError.message);
      setExportStatus("idle");
    }
  }

  function setUploadSelection(fileList) {
    const nextFiles = Array.from(fileList || []).filter((file) => /\.(fit|gpx|tcx)(\.gz)?$/i.test(file.name || ""));
    setUploadedFiles(nextFiles);
    setUploadedPreview({ activities: [], errors: [] });
    setSelectedUploadedFiles([]);
    setUploadResult(null);
    setUploadError(nextFiles.length ? "" : t("Choose FIT, GPX, or TCX Strava export files."));
  }

  async function previewUploadedFiles() {
    if (!uploadedFiles.length) {
      setUploadError(t("Choose FIT, GPX, or TCX Strava export files."));
      return;
    }
    setUploadStatus("previewing");
    setUploadError("");
    setUploadResult(null);
    try {
      const payload = await previewUploadedStravaExportFiles(uploadedFiles);
      setUploadedPreview(payload);
      setSelectedUploadedFiles([]);
      setUploadStatus("idle");
    } catch (previewError) {
      setUploadError(previewError.message);
      setUploadStatus("idle");
    }
  }

  function toggleUploadedFile(filename) {
    setSelectedUploadedFiles((current) => (current.includes(filename) ? current.filter((item) => item !== filename) : [...current, filename]));
  }

  async function importSelectedUploadedFiles() {
    if (!selectedUploadedFiles.length) {
      setUploadError(t("Select at least one uploaded Strava file to import."));
      return;
    }
    const filesToImport = uploadedFiles.filter((file) => selectedUploadedFiles.includes(file.name));
    setUploadStatus("importing");
    setUploadError("");
    setUploadResult(null);
    try {
      const payload = await importUploadedStravaExportFiles(filesToImport);
      setUploadResult(payload);
      setSelectedUploadedFiles([]);
      setUploadStatus("idle");
    } catch (importError) {
      setUploadError(importError.message);
      setUploadStatus("idle");
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
                    disabled={Boolean(activity.existing || activity.requires_review)}
                    checked={selectedIds.includes(activity.id)}
                    onChange={() => toggleActivity(activity.id)}
                  />
                  <span>
                    <strong>{activity.name}</strong>
                    <small>
                      {activity.date} - {t(getActivityTypeLabel(activity.activity_type))} - {activity.distance_km ?? "-"} km - {activity.duration || "-"}
                      {activity.existing ? ` - ${t("Already imported")}` : ""}
                      {activity.requires_review ? ` - ${t("Review activity type before import")}` : ""}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          </section>
        ) : null}

        <section className="app-panel import-panel">
          <div>
            <p className="eyebrow">{t("Local Export")}</p>
            <h2>{t("Strava Export Folder")}</h2>
            <p>{t("Preview local files from the configured Strava export folder, then import selected mapped activities.")}</p>
          </div>

          <div className="day-modal-actions">
            <button type="button" className="primary-action" onClick={() => loadExportPreview(0)} disabled={exportStatus === "loading"}>
              {exportStatus === "loading" ? t("Loading...") : t("Load Local Export")}
            </button>
            <button type="button" className="secondary-action" onClick={importSelectedExportFiles} disabled={exportStatus === "importing" || !selectedExportFiles.length}>
              {exportStatus === "importing" ? t("Importing...") : t("Import Selected")}
            </button>
          </div>

          {exportPreview.total ? (
            <div className="notice-panel">
              <span>
                {exportPreview.offset + 1}-{Math.min(exportPreview.offset + exportPreview.limit, exportPreview.total)} / {exportPreview.total}
              </span>
              <small>{exportPreview.configured_dir}</small>
            </div>
          ) : null}

          {exportError ? <div className="error-banner">{exportError}</div> : null}
          {exportResult ? (
            <div className="success-banner">
              {`${exportResult.imported?.length || 0} ${t("imported")}, ${exportResult.skipped?.length || 0} ${t("skipped")}, ${exportResult.errors?.length || 0} ${t("errors")}`}
            </div>
          ) : null}

          {exportPreview.activities?.length ? (
            <>
              <div className="strava-activity-list">
                {exportPreview.activities.map((activity) => (
                  <label className={activity.existing ? "strava-activity-row imported" : "strava-activity-row"} key={activity.filename}>
                    <input
                      type="checkbox"
                      disabled={Boolean(activity.existing || activity.requires_review)}
                      checked={selectedExportFiles.includes(activity.filename)}
                      onChange={() => toggleExportFile(activity.filename)}
                    />
                    <span>
                      <strong>{activity.title || activity.filename}</strong>
                      <small>
                        {activity.date || "-"} - {activity.sport || "-"} - {t(getActivityTypeLabel(activity.activity_type))} - {activity.distance_km ?? "-"} km - {activity.duration || "-"}
                        {activity.existing ? ` - ${t("Already imported")}` : ""}
                        {activity.requires_review ? ` - ${t("Review activity type before import")}` : ""}
                      </small>
                      <small>{activity.metrics?.length ? activity.metrics.join(", ") : t("No metrics detected")}</small>
                    </span>
                  </label>
                ))}
              </div>
              <div className="day-modal-actions">
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => loadExportPreview(Math.max(0, (exportPreview.offset || 0) - (exportPreview.limit || 25)))}
                  disabled={(exportPreview.offset || 0) <= 0 || exportStatus === "loading"}
                >
                  {t("Previous")}
                </button>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => loadExportPreview((exportPreview.offset || 0) + (exportPreview.limit || 25))}
                  disabled={(exportPreview.offset || 0) + (exportPreview.limit || 25) >= (exportPreview.total || 0) || exportStatus === "loading"}
                >
                  {t("Next")}
                </button>
              </div>
            </>
          ) : null}
        </section>

        <section className="app-panel import-panel">
          <div>
            <p className="eyebrow">{t("Upload Export")}</p>
            <h2>{t("Drop Strava Files")}</h2>
            <p>{t("Upload FIT, GPX, or TCX files from your Strava export, preview them, then import selected mapped activities.")}</p>
          </div>

          <div
            className={uploadDropActive ? "import-dropzone active" : "import-dropzone"}
            onDragOver={(event) => {
              event.preventDefault();
              setUploadDropActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setUploadDropActive(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setUploadDropActive(false);
              setUploadSelection(event.dataTransfer.files);
            }}
          >
            {t("Drop Strava .fit, .fit.gz, .gpx, .gpx.gz, .tcx, or .tcx.gz files here")}
          </div>

          <label>
            {t("Strava files")}
            <input
              type="file"
              multiple
              accept=".fit,.fit.gz,.gpx,.gpx.gz,.tcx,.tcx.gz,application/gzip,application/octet-stream,application/gpx+xml,application/xml,text/xml"
              onChange={(event) => setUploadSelection(event.target.files)}
            />
          </label>

          {uploadedFiles.length ? (
            <div className="notice-panel">
              <span>{t("Selected files")}: {uploadedFiles.length}</span>
              <small>{uploadedFiles.slice(0, 5).map((file) => file.name).join(", ")}{uploadedFiles.length > 5 ? "..." : ""}</small>
            </div>
          ) : null}

          <div className="day-modal-actions">
            <button type="button" className="primary-action" onClick={previewUploadedFiles} disabled={uploadStatus === "previewing" || !uploadedFiles.length}>
              {uploadStatus === "previewing" ? t("Loading...") : t("Preview Uploaded Files")}
            </button>
            <button type="button" className="secondary-action" onClick={importSelectedUploadedFiles} disabled={uploadStatus === "importing" || !selectedUploadedFiles.length}>
              {uploadStatus === "importing" ? t("Importing...") : t("Import Selected")}
            </button>
          </div>

          {uploadError ? <div className="error-banner">{uploadError}</div> : null}
          {uploadResult ? (
            <div className="success-banner">
              {`${uploadResult.imported?.length || 0} ${t("imported")}, ${uploadResult.skipped?.length || 0} ${t("skipped")}, ${uploadResult.errors?.length || 0} ${t("errors")}`}
            </div>
          ) : null}

          {uploadedPreview.activities?.length ? (
            <div className="strava-activity-list">
              {uploadedPreview.activities.map((activity) => (
                <label className={activity.existing ? "strava-activity-row imported" : "strava-activity-row"} key={activity.filename}>
                  <input
                    type="checkbox"
                    disabled={Boolean(activity.existing || activity.requires_review)}
                    checked={selectedUploadedFiles.includes(activity.filename)}
                    onChange={() => toggleUploadedFile(activity.filename)}
                  />
                  <span>
                    <strong>{activity.title || activity.filename}</strong>
                    <small>
                      {activity.date || "-"} - {activity.sport || "-"} - {t(getActivityTypeLabel(activity.activity_type))} - {activity.distance_km ?? "-"} km - {activity.duration || "-"}
                      {activity.existing ? ` - ${t("Already imported")}` : ""}
                      {activity.requires_review ? ` - ${t("Review activity type before import")}` : ""}
                    </small>
                    <small>{activity.metrics?.length ? activity.metrics.join(", ") : t("No metrics detected")}</small>
                  </span>
                </label>
              ))}
            </div>
          ) : null}

          {uploadedPreview.errors?.length ? (
            <div className="error-banner">
              {uploadedPreview.errors.slice(0, 3).map((item) => `${item.filename}: ${item.detail}`).join(" | ")}
            </div>
          ) : null}
        </section>
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
          <button type="button" className={mode === "history" ? "active" : ""} onClick={() => setMode("history")}>
            {t("History")}
          </button>
        </div>
      </section>

      {mode === "program" ? <ProgramImportPanel /> : null}
      {mode === "activity" ? <ActivityImportPanel /> : null}
      {mode === "strava" ? <StravaImportPanel /> : null}
      {mode === "history" ? <ImportHistoryPanel /> : null}
    </main>
  );
}
