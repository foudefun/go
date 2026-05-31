import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getCalendar } from "../api/calendarApi.js";
import { ACTIVITY_TYPES, getActivityTypeColor, getActivityTypeLabel } from "../domain/activityTypes.js";
import { useTranslation } from "../i18n/translations.js";
import { ActivityImportPanel, ProgramImportPanel } from "./ImportPage.jsx";
import DaySessionModal from "../sessions/components/DaySessionModal.jsx";

function formatLocalDateIso(dateValue) {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getLocalTodayIso() {
  return formatLocalDateIso(new Date());
}

function formatMetricValue(metricKey, values) {
  if (!values || typeof values !== "object") return "";
  if (metricKey === "distance") {
    const km = Number(values.km ?? 0);
    return Number.isFinite(km) && km > 0 ? `${km.toFixed(1)} km` : "";
  }
  if (metricKey === "duration") {
    const seconds = Number(values.seconds ?? 0);
    return Number.isFinite(seconds) && seconds > 0 ? `${Math.round(seconds / 60)} min` : "";
  }
  const value = Number(values.avg ?? values.max ?? values.total ?? values.value ?? 0);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (metricKey === "heart_rate") return `${Math.round(value)} bpm`;
  if (metricKey === "power") return `${Math.round(value)} W`;
  return "";
}

function getActivityMetrics(activity) {
  const metricKeys = ["distance", "duration", "heart_rate", "power"];
  const sourceFiles = Array.isArray(activity.sourceFiles) ? activity.sourceFiles : [];
  return metricKeys
    .map((metricKey) => {
      const value = sourceFiles
        .map((source) => formatMetricValue(metricKey, source.metrics?.[metricKey]))
        .find(Boolean);
      return value ? { key: metricKey, value } : null;
    })
    .filter(Boolean);
}

function translateGeneratedActivityDetails(value, language) {
  let text = String(value || "").trim();
  if (!text) return "";
  text = text.replaceAll("DurÃ©e", "Durée");
  if (language === "en") {
    return text
      .replaceAll("Fichier:", "File:")
      .replaceAll("Durée", "Duration")
      .replaceAll("Puissance moy.", "Avg power")
      .replaceAll("Puissance max", "Max power")
      .replaceAll("FC moy.", "Avg HR")
      .replaceAll("FC max", "Max HR")
      .replaceAll("Cadence moy.", "Avg cadence")
      .replaceAll("Importé depuis un fichier FIT", "Imported from a FIT file");
  }
  return text
    .replaceAll("cycling (virtual activity)", "vélo virtuel")
    .replaceAll("cycling", "vélo")
    .replaceAll("running", "course");
}

function buildActivityTitle(entry, t) {
  const title = String(entry.title || "").trim();
  if (title) return title;
  const activityType = String(entry.activity_type || "").trim();
  const typeLabel = activityType ? t(getActivityTypeLabel(activityType)) : "";
  const performedCount = Number(entry.performed_count || 0);
  const climbingCount = Number(entry.climbing_count || 0);
  if (typeLabel && performedCount) return `${typeLabel} | ${performedCount} ex.`;
  if (typeLabel && climbingCount) return `${typeLabel} | ${climbingCount} voie(s)`;
  if (typeLabel) return typeLabel;
  return String(entry.summary || "").trim() || t("Activity");
}

export default function ActivitiesPage() {
  const { language, t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("loading");
  const [activityDate, setActivityDate] = useState(getLocalTodayIso());
  const [activityTypeFilter, setActivityTypeFilter] = useState("");
  const [modalState, setModalState] = useState(null);
  const [importDialogMode, setImportDialogMode] = useState("");

  function loadActivityRows({ mountedRef } = {}) {
    setStatus("loading");
    setError("");
    getCalendar({ daysBack: 45, daysForward: 7 })
      .then((payload) => {
        if (mountedRef && !mountedRef.current) return;
        setRows(Array.isArray(payload) ? payload : []);
        setStatus("ready");
      })
      .catch((activityError) => {
        if (mountedRef && !mountedRef.current) return;
        setError(activityError.message);
        setStatus("error");
      });
  }

  useEffect(() => {
    const mountedRef = { current: true };
    loadActivityRows({ mountedRef });
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const action = params.get("action");
    if (action === "new") {
      openNewActivity();
      navigate(location.pathname, { replace: true });
    }
    if (action === "import") {
      setImportDialogMode("activity");
      navigate(location.pathname, { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  const activities = useMemo(
    () =>
      rows
        .filter(
          (row) =>
            Number(row.activity_count || 0) > 0 ||
            (row.activity_entries || []).length ||
            (row.activity_summaries || []).length,
        )
        .flatMap((row) => {
          const entries = row.activity_entries?.length
            ? row.activity_entries
            : [{ summary: row.activity_details || row.activity_type || "Activity", activity_type: row.activity_type }];
          return entries.map((entry, index) => {
            const sourceFiles = Array.isArray(entry.source_files) ? entry.source_files : [];
            return {
              id: `${row.date}-${entry.index ?? index}`,
              index: Number(entry.index ?? index),
              date: row.date,
              title: buildActivityTitle(entry, t),
              details: translateGeneratedActivityDetails(entry.details || (entry.title ? entry.summary : ""), language),
              activityType: entry.activity_type || "",
              image: entry.image || "",
              sourceFiles,
              sourceCount: Number(entry.source_count || sourceFiles.length || 0),
            };
          });
        })
        .sort((left, right) => {
          const dateCompare = String(right.date || "").localeCompare(String(left.date || ""));
          return dateCompare || Number(right.index || 0) - Number(left.index || 0);
        }),
    [rows, language, t],
  );

  const filteredActivities = useMemo(
    () =>
      activityTypeFilter
        ? activities.filter((activity) => activity.activityType === activityTypeFilter)
        : activities,
    [activities, activityTypeFilter],
  );

  const availableActivityTypes = useMemo(() => {
    const values = new Set(activities.map((activity) => activity.activityType).filter(Boolean));
    return ACTIVITY_TYPES.filter((activityType) => activityType.value && values.has(activityType.value));
  }, [activities]);

  function openNewActivity() {
    const date = activityDate || getLocalTodayIso();
    setModalState({
      date,
      createNewOnOpen: true,
      initialActivity: null,
      initialShowImportPanel: false,
    });
  }

  function openImportActivity() {
    setImportDialogMode("activity");
  }

  function openExistingActivity(activity) {
    setModalState({
      date: activity.date,
      createNewOnOpen: false,
      initialActivity: null,
      initialActivityIndex: activity.index,
    });
  }

  return (
    <main className="page-shell">
      <section className="module-header">
        <div>
          <p className="eyebrow">{t("Training")}</p>
          <h1>{t("Activities")}</h1>
        </div>
      </section>
      <section className="calendar-toolbar app-panel activity-toolbar">
        <div className="activity-add-controls">
          <label>
            {t("Date")}
            <input
              type="date"
              value={activityDate}
              onChange={(event) => setActivityDate(event.target.value || getLocalTodayIso())}
            />
          </label>
          <button className="primary-action" type="button" onClick={openNewActivity}>
            {t("+ Activity")}
          </button>
          <button type="button" onClick={openImportActivity}>
            {t("Import Activity")}
          </button>
          <button type="button" onClick={() => setImportDialogMode("program")}>
            {t("Import Program")}
          </button>
        </div>
        <label className="activity-filter-control">
          {t("Activity Type")}
          <select value={activityTypeFilter} onChange={(event) => setActivityTypeFilter(event.target.value)}>
            <option value="">{t("All types")}</option>
            {availableActivityTypes.map((activityType) => (
              <option key={activityType.value} value={activityType.value}>
                {t(activityType.label)}
              </option>
            ))}
          </select>
        </label>
      </section>
      {error ? <div className="error-banner">{error}</div> : null}
      {status === "loading" ? <div className="empty-state">{t("Loading activities...")}</div> : null}
      <section className="activity-list-panel">
        {filteredActivities.map((activity) => (
          <button className="app-panel activity-list-row clickable-card" type="button" key={activity.id} onClick={() => openExistingActivity(activity)}>
            <span className="activity-thumb" aria-hidden="true">
              {activity.image ? (
                <img src={activity.image} alt="" />
              ) : activity.sourceCount ? (
                <span className="activity-trace-thumb">
                  <span />
                  <small>{t("Trace")}</small>
                </span>
              ) : (
                <span className="activity-type-thumb" style={{ backgroundColor: getActivityTypeColor(activity.activityType) }}>
                  {t(getActivityTypeLabel(activity.activityType))}
                </span>
              )}
            </span>
            <span className="activity-list-main">
              <span>{activity.date}</span>
              <strong>{activity.title}</strong>
              {activity.details ? <small>{activity.details}</small> : null}
            </span>
            <span className="activity-list-meta">
              {activity.sourceFiles.length ? <span>{t("Source count", { count: activity.sourceFiles.length })}</span> : null}
              {getActivityMetrics(activity).map((metric) => (
                <span key={metric.key}>{metric.value}</span>
              ))}
            </span>
          </button>
        ))}
        {!filteredActivities.length && status !== "loading" && !error ? (
          <div className="app-panel empty-state">{t("No recent activities loaded.")}</div>
        ) : null}
      </section>
      {modalState ? (
        <DaySessionModal
          date={modalState.date}
          createNewOnOpen={modalState.createNewOnOpen}
          initialActivity={modalState.initialActivity}
          initialActivityIndex={modalState.initialActivityIndex}
          initialShowImportPanel={modalState.initialShowImportPanel}
          onClose={() => setModalState(null)}
          onSaved={() => loadActivityRows()}
        />
      ) : null}
      {importDialogMode ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setImportDialogMode("")}>
          <section className="day-modal import-dialog" role="dialog" aria-modal="true" aria-label={t("Import")} onMouseDown={(event) => event.stopPropagation()}>
            <header className="day-modal-header">
              <div>
                <p className="eyebrow">{t("Data")}</p>
                <h2>{t("Import")}</h2>
              </div>
              <div className="day-modal-actions">
                <button type="button" onClick={() => setImportDialogMode("")}>{t("Close")}</button>
              </div>
            </header>
            <section className="calendar-toolbar app-panel import-mode-toolbar">
              <div className="view-switch">
                <button type="button" className={importDialogMode === "activity" ? "active" : ""} onClick={() => setImportDialogMode("activity")}>
                  {t("Activity File")}
                </button>
                <button type="button" className={importDialogMode === "program" ? "active" : ""} onClick={() => setImportDialogMode("program")}>
                  {t("Program")}
                </button>
              </div>
            </section>
            {importDialogMode === "activity" ? <ActivityImportPanel /> : <ProgramImportPanel />}
          </section>
        </div>
      ) : null}
    </main>
  );
}
