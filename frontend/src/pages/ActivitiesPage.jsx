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

function parseLocalDateIso(dateValue) {
  const [year, month, day] = String(dateValue || "").split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatActivityDateHeading(dateValue, language, t) {
  if (dateValue === getLocalTodayIso()) {
    return t("Today");
  }
  const date = parseLocalDateIso(dateValue);
  if (!date) return dateValue || "";
  const locale = language === "fr" ? "fr-FR" : "en-US";
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
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
  const metrics = metricKeys
    .map((metricKey) => {
      const value = sourceFiles
        .map((source) => formatMetricValue(metricKey, source.metrics?.[metricKey]))
        .find(Boolean);
      return value ? { key: metricKey, value } : null;
    })
    .filter(Boolean);
  const elevationGain = calculateElevationGain(getAltitudeValuesFromSources(sourceFiles));
  if (elevationGain > 0) {
    metrics.splice(Math.min(metrics.length, 2), 0, { key: "elevation_gain", value: `D+ ${Math.round(elevationGain)} m` });
  }
  return metrics;
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

function getAltitudeValuesFromSources(sourceFiles = []) {
  for (const source of sourceFiles) {
    const points = Array.isArray(source?.series?.points) ? source.series.points : [];
    const altitudeValues = points
      .map((point) => Number(point.altitude_m))
      .filter((value) => Number.isFinite(value));
    if (altitudeValues.length >= 2) return altitudeValues;
  }
  return [];
}

function calculateElevationGain(altitudeValues) {
  if (!Array.isArray(altitudeValues) || altitudeValues.length < 2) return 0;
  return altitudeValues.reduce((total, value, index) => {
    if (index === 0) return total;
    const previous = altitudeValues[index - 1];
    const gain = value - previous;
    return gain > 0 ? total + gain : total;
  }, 0);
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
        <circle cx="21" cy="18" r="15" className="activity-track-thumb-water" />
        <circle cx="102" cy="66" r="18" className="activity-track-thumb-water secondary" />
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

function compactActivityDetails(value) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\b(cycling|walking|running)\s+\(virtual activity\)\s*/gi, "")
    .replace(/\b(cycling|walking|running)\s*/gi, "")
    .trim();
  if (!text) return "";
  const parts = text
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/^File:/i.test(part))
    .filter((part) => !/^Fichier:/i.test(part))
    .filter((part) => !/^Import/i.test(part))
    .filter((part) => !/^(course|run|velo|v[ée]lo|bike|vtt|hike|hiking|walking|randonn[ée]e|musculation|strength)$/i.test(part));
  const usefulParts = parts.length ? parts : [text];
  return usefulParts
    .slice(0, 2)
    .map((part) => (part.length > 36 ? `${part.slice(0, 35).trim()}...` : part))
    .join(" | ");
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

function getActivityKicker(activity, t) {
  const label = activity.activityType ? getActivityTypeLabel(activity.activityType) : "Activity";
  return t(label);
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
              details: compactActivityDetails(translateGeneratedActivityDetails(entry.details || (entry.title ? entry.summary : ""), language)),
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
  const activityGroups = useMemo(() => {
    const groups = [];
    for (const activity of filteredActivities) {
      const previousGroup = groups[groups.length - 1];
      if (previousGroup?.date === activity.date) {
        previousGroup.activities.push(activity);
      } else {
        groups.push({
          date: activity.date,
          label: formatActivityDateHeading(activity.date, language, t),
          activities: [activity],
        });
      }
    }
    return groups;
  }, [filteredActivities, language, t]);
  const currentFilterLabel = useMemo(() => {
    if (!activityTypeFilter) return t("All types");
    const selectedType = ACTIVITY_TYPES.find((activityType) => activityType.value === activityTypeFilter);
    return t(selectedType?.label || activityTypeFilter);
  }, [activityTypeFilter, t]);

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
          <h1>{t("Activity Log")}</h1>
          <p>{t("Activity log lead")}</p>
        </div>
      </section>
      <section className="app-panel activity-toolbar">
        <div className="activity-toolbar-primary">
          <div>
            <p className="eyebrow">{t("Quick add")}</p>
            <strong>{t("Choose a date, then add or import.")}</strong>
          </div>
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
          </div>
        </div>
        <div className="activity-toolbar-secondary">
          <button className="activity-import-trigger" type="button" onClick={openImportActivity}>
            {t("Import")}
          </button>
          <span className="activity-results-summary">
            {t("Showing activities", { count: filteredActivities.length, type: currentFilterLabel })}
          </span>
        </div>
      </section>
      <section className="activity-filter-strip" aria-label={t("Activity Type")}>
        <button
          type="button"
          className={!activityTypeFilter ? "active" : ""}
          onClick={() => setActivityTypeFilter("")}
        >
          {t("All types")}
        </button>
        {availableActivityTypes.map((activityType) => (
          <button
            type="button"
            key={activityType.value}
            className={activityTypeFilter === activityType.value ? "active" : ""}
            onClick={() => setActivityTypeFilter(activityType.value)}
          >
            {t(activityType.label)}
          </button>
        ))}
      </section>
      {error ? <div className="error-banner">{error}</div> : null}
      {status === "loading" ? <div className="empty-state">{t("Loading activities...")}</div> : null}
      <section className="activity-list-panel">
        {activityGroups.map((group) => (
          <div className="activity-date-group" key={group.date}>
            <div className="activity-date-heading">
              <span>{group.label}</span>
              <small>{t("Activity count", { count: group.activities.length })}</small>
            </div>
            {group.activities.map((activity) => {
              const metrics = getActivityMetrics(activity);
              const trackPointCount = getTrackPointsFromSources(activity.sourceFiles).length;
              const hasDataChips = metrics.length || trackPointCount;
              const hasVisualPreview = Boolean(activity.image || activity.sourceCount);
              return (
                <button
                  className={`app-panel activity-list-row clickable-card${hasVisualPreview ? "" : " activity-list-row-compact"}`}
                  type="button"
                  key={activity.id}
                  onClick={() => openExistingActivity(activity)}
                >
                  {hasVisualPreview ? (
                    <span className="activity-thumb" aria-hidden="true">
                      {activity.image ? (
                        <img src={activity.image} alt="" />
                      ) : (
                        <ActivityTrackThumbnail sourceFiles={activity.sourceFiles} t={t} />
                      )}
                    </span>
                  ) : null}
                  <span className="activity-list-main">
                    <span className="activity-list-kicker">
                      <span className="activity-type-dot" style={{ backgroundColor: getActivityTypeColor(activity.activityType) }} aria-hidden="true" />
                      {getActivityKicker(activity, t)}
                    </span>
                    <strong>{activity.title}</strong>
                    {activity.details ? <small>{activity.details}</small> : null}
                  </span>
                  <span className="activity-list-meta">
                    {metrics.map((metric) => (
                      <span className="activity-metric-chip" key={metric.key}>{metric.value}</span>
                    ))}
                    {trackPointCount ? (
                      <span className="activity-gps-chip" title={t("GPS point count", { count: trackPointCount })}>
                        {t("GPS track")}
                      </span>
                    ) : null}
                    {activity.sourceFiles.length && !hasDataChips ? (
                      <span className="activity-source-chip">{t("Imported source count", { count: activity.sourceFiles.length })}</span>
                    ) : null}
                    {!metrics.length && !activity.sourceFiles.length ? (
                      <span className="activity-source-chip">{t("Manual activity")}</span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
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
            <header className="import-dialog-header">
              <div>
                <p className="eyebrow">{t("Data")}</p>
                <h2>{t("Import")}</h2>
              </div>
              <div className="import-dialog-actions">
                <button type="button" onClick={() => setImportDialogMode("")}>{t("Close")}</button>
              </div>
            </header>
            <section className="import-mode-toolbar" aria-label={t("Import")}>
              <button type="button" className={importDialogMode === "activity" ? "active" : ""} onClick={() => setImportDialogMode("activity")}>
                {t("Activity File")}
              </button>
              <button type="button" className={importDialogMode === "program" ? "active" : ""} onClick={() => setImportDialogMode("program")}>
                {t("Program")}
              </button>
            </section>
            {importDialogMode === "activity" ? <ActivityImportPanel /> : <ProgramImportPanel />}
          </section>
        </div>
      ) : null}
    </main>
  );
}
