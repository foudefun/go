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

function getTrackPointsFromSources(sourceFiles = []) {
  for (const source of sourceFiles) {
    const points = Array.isArray(source?.series?.points) ? source.series.points : [];
    const trackPoints = points
      .map((point) => ({
        lat: Number(point.lat),
        lon: Number(point.lon),
      }))
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));
    if (trackPoints.length >= 2) return trackPoints;
  }
  return [];
}

function buildTrackPolyline(points, width = 120, height = 84, padding = 10) {
  if (!Array.isArray(points) || points.length < 2) return "";
  const latitudes = points.map((point) => point.lat);
  const longitudes = points.map((point) => point.lon);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLon = Math.min(...longitudes);
  const maxLon = Math.max(...longitudes);
  const latSpan = Math.max(maxLat - minLat, 0.000001);
  const lonSpan = Math.max(maxLon - minLon, 0.000001);
  return points
    .map((point) => {
      const x = padding + ((point.lon - minLon) / lonSpan) * (width - padding * 2);
      const y = height - padding - ((point.lat - minLat) / latSpan) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function ActivityTrackThumbnail({ sourceFiles, t }) {
  const points = getTrackPointsFromSources(sourceFiles);
  const polyline = buildTrackPolyline(points);
  const projected = polyline
    ? polyline.split(" ").map((item) => {
        const [x, y] = item.split(",").map(Number);
        return { x, y };
      })
    : [];
  const start = projected[0];
  const finish = projected[projected.length - 1];
  if (!polyline) {
    return (
      <span className="activity-trace-thumb">
        <span />
        <small>{t("Trace")}</small>
      </span>
    );
  }
  return (
    <span className="activity-track-thumb" aria-label={t("GPS track")}>
      <svg viewBox="0 0 120 84" role="img" aria-label={t("GPS track")}>
        <rect x="0" y="0" width="120" height="84" rx="8" />
        <path className="activity-track-thumb-terrain" d="M -6 25 C 20 15, 34 34, 53 26 S 88 13, 126 27" />
        <path className="activity-track-thumb-terrain secondary" d="M -8 62 C 18 48, 37 70, 58 58 S 91 47, 128 64" />
        <g>
          <line x1="0" y1="28" x2="120" y2="28" />
          <line x1="0" y1="56" x2="120" y2="56" />
          <line x1="40" y1="0" x2="40" y2="84" />
          <line x1="80" y1="0" x2="80" y2="84" />
        </g>
        <polyline points={polyline} />
        {start ? <circle className="activity-track-thumb-start" cx={start.x} cy={start.y} r="3.5" /> : null}
        {finish ? <circle className="activity-track-thumb-finish" cx={finish.x} cy={finish.y} r="3.5" /> : null}
      </svg>
    </span>
  );
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
                <ActivityTrackThumbnail sourceFiles={activity.sourceFiles} t={t} />
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
