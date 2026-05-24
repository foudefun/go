import { useEffect, useMemo, useRef, useState } from "react";
import { getExercises } from "../../api/exerciseApi.js";
import {
  deleteActivityImage,
  getSession,
  saveSession,
  updateActivityMetricSources,
  uploadActivityImage,
  uploadActivitySourceFile,
} from "../../api/sessionApi.js";
import {
  ACTIVITY_TYPES,
  getActivityTypeColor,
  getActivityTypeLabel,
  isClimbingActivity,
  isStrengthActivity,
} from "../../domain/activityTypes.js";
import { useTranslation } from "../../i18n/translations.js";
import { formatPlannedItem, normalizePlannedItems } from "../plannedItems.js";
import { normalizeOptionalInt } from "../strengthItems.js";
import PlannedSessionEditor from "./PlannedSessionEditor.jsx";
import StrengthEditor from "./StrengthEditor.jsx";

function blankActivity() {
  return {
    exercises: [],
    note: "",
    status: "todo",
    load: 0,
    physio_time: "",
    title: "",
    activity_type: "",
    activity_details: "",
    image: "",
    climbing_routes: [],
    performed_items: [],
    used_equipment: [],
    source_files: [],
    metric_source_preferences: {},
  };
}

function activityHasContent(activity) {
  return Boolean(
    String(activity.title || "").trim() ||
      String(activity.activity_type || "").trim() ||
      String(activity.activity_details || "").trim() ||
      String(activity.note || "").trim() ||
      String(activity.image || "").trim() ||
      String(activity.physio_time || "").trim() ||
      (activity.performed_items || []).length ||
      (activity.climbing_routes || []).length ||
      (activity.source_files || []).length,
  );
}

function normalizeActivity(activity) {
  const next = { ...blankActivity(), ...(activity || {}) };
  next.exercises = Array.isArray(next.exercises) ? next.exercises : [];
  next.performed_items = Array.isArray(next.performed_items) ? next.performed_items : [];
  next.climbing_routes = Array.isArray(next.climbing_routes) ? next.climbing_routes : [];
  next.used_equipment = Array.isArray(next.used_equipment) ? next.used_equipment : [];
  next.source_files = Array.isArray(next.source_files) ? next.source_files : [];
  next.metric_source_preferences = next.metric_source_preferences && typeof next.metric_source_preferences === "object"
    ? next.metric_source_preferences
    : {};
  if (!isStrengthActivity(next.activity_type)) {
    next.exercises = [];
    next.performed_items = [];
  }
  if (!isClimbingActivity(next.activity_type)) {
    next.climbing_routes = [];
  }
  next.status = activityHasContent(next) ? "done" : "todo";
  return next;
}

function getLegacyActivityFromSession(session) {
  return normalizeActivity({
    note: session.note,
    status: session.status,
    load: session.load,
    physio_time: session.physio_time,
    title: session.title,
    activity_type: session.activity_type,
    activity_details: session.activity_details,
    image: session.image,
    climbing_routes: session.climbing_routes,
    performed_items: session.performed_items,
    exercises: session.exercises,
    used_equipment: session.used_equipment,
    source_files: session.source_files,
    metric_source_preferences: session.metric_source_preferences,
  });
}

function normalizeSession(session) {
  const rawSession = session || {};
  const activities = Array.isArray(rawSession.activities)
    ? rawSession.activities.map(normalizeActivity)
    : [];
  const legacyActivity = getLegacyActivityFromSession(rawSession);
  return {
    ...rawSession,
    plan_activity_type: rawSession.plan_activity_type || "",
    plan_time: rawSession.plan_time || "",
    plan_title: rawSession.plan_title || "",
    duration_target_min: rawSession.duration_target_min ?? "",
    location: rawSession.location || "",
    plan_notes: rawSession.plan_notes || "",
    planned_items: normalizePlannedItems(rawSession.planned_items),
    activities: activities.length ? activities : activityHasContent(legacyActivity) ? [legacyActivity] : [],
    draft_active_activity_index: Number(rawSession.draft_active_activity_index || 0) || 0,
  };
}

function getActivityTitle(activity, index, t = (value) => value) {
  return (
    String(activity.title || "").trim() ||
    t(getActivityTypeLabel(activity.activity_type)) ||
    t("Activity number", { number: index + 1 })
  );
}

function hasPlanContent(session) {
  return Boolean(
    String(session?.plan_activity_type || "").trim() ||
      String(session?.plan_time || "").trim() ||
      String(session?.plan_title || "").trim() ||
      normalizeOptionalInt(session?.duration_target_min) !== null ||
      String(session?.location || "").trim() ||
      String(session?.plan_notes || "").trim() ||
      normalizePlannedItems(session?.planned_items).length,
  );
}

function getPlanTitle(session, t = (value) => value) {
  const plannedItems = normalizePlannedItems(session?.planned_items);
  const plannedType = session?.plan_activity_type || (plannedItems.length ? "musculation" : "");
  return (
    String(session?.plan_title || "").trim() ||
    t(getActivityTypeLabel(plannedType)) ||
    t("Planned session")
  );
}

function getPlanSummary(session, t = (value) => value) {
  const parts = [];
  if (session?.plan_time) parts.push(session.plan_time);
  if (session?.duration_target_min) parts.push(`${session.duration_target_min} min`);
  if (session?.location) parts.push(session.location);
  const plannedCount = normalizePlannedItems(session?.planned_items).length;
  if (plannedCount) parts.push(t("Item count", { count: plannedCount }));
  return parts.join(" | ") || t("Plan saved for this day");
}

function getActivityTypeInputValue(value, t = (item) => item) {
  const knownType = ACTIVITY_TYPES.find((activityType) => activityType.value === value);
  return knownType ? t(knownType.label) : value || "";
}

function normalizeActivityTypeInput(input, t = (item) => item) {
  const normalizedInput = String(input || "").trim().toLowerCase();
  const knownType = ACTIVITY_TYPES.find((activityType) => {
    if (!activityType.value) return false;
    return (
      activityType.value.toLowerCase() === normalizedInput ||
      activityType.label.toLowerCase() === normalizedInput ||
      t(activityType.label).toLowerCase() === normalizedInput
    );
  });
  return knownType?.value || input;
}

function getSaveActionLabel({ draftActivity, showPlanEditor, hasActivityEditor, t }) {
  if (draftActivity) return t("Create activity");
  if (showPlanEditor && !hasActivityEditor) return t("Save plan and close");
  if (hasActivityEditor) return t("Save selected activity");
  return t("Save day and close");
}

function getSaveScopeLabel({ draftActivity, showPlanEditor, hasActivityEditor, t }) {
  if (draftActivity) return t("Scope: new activity");
  if (showPlanEditor && !hasActivityEditor) return t("Scope: day plan");
  if (hasActivityEditor) return t("Scope: selected activity");
  return t("Scope: day");
}

function getSaveFlowNote({ draftActivity, showPlanEditor, hasActivityEditor, t }) {
  if (draftActivity) return t("Create activity flow note");
  if (showPlanEditor && !hasActivityEditor) return t("Save day plan flow note");
  if (hasActivityEditor) return t("Save activity flow note");
  return t("Save day flow note");
}

function buildActivityFromPlan(session) {
  const plannedItems = normalizePlannedItems(session?.planned_items);
  const plannedType = session?.plan_activity_type || (plannedItems.length ? "musculation" : "");
  const isStrengthPlan = isStrengthActivity(plannedType);
  return normalizeActivity({
    title: getPlanTitle(session),
    activity_type: plannedType,
    activity_details: [session?.duration_target_min ? `${session.duration_target_min} min` : "", session?.location || ""]
      .filter(Boolean)
      .join(" | "),
    physio_time: session?.plan_time || "",
    note: session?.plan_notes || "",
    performed_items: isStrengthPlan
      ? plannedItems.map((item) => ({
          exercise_name: item.exercise_name || "",
          custom_name: item.custom_name || "",
          work_type: item.work_type || "resistance",
          notes: [formatPlannedItem(item), item.notes].filter(Boolean).join(" | "),
          sets: [],
        }))
      : [],
    exercises: isStrengthPlan ? plannedItems.map((item) => item.exercise_name).filter(Boolean) : [],
  });
}

function ActivityImagePanel({ activity, canManage, uploading, error, onUpload, onDelete, t }) {
  const fileRef = useRef(null);
  const imageUrl = String(activity?.image || "").trim();

  function handleFile(file) {
    if (file && canManage) {
      onUpload(file);
    }
  }

  return (
    <section className="activity-image-panel">
      <div>
        <p className="eyebrow">{t("Photo")}</p>
        <h3>{t("Activity image")}</h3>
      </div>
      {imageUrl ? (
        <a className="activity-image-link" href={imageUrl} target="_blank" rel="noreferrer">
          <img src={imageUrl} alt={t("Activity")} />
        </a>
      ) : (
        <div className="activity-image-placeholder">{t("No activity image")}</div>
      )}
      <div className="compact-actions">
        <button type="button" disabled={!canManage || uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? t("Uploading...") : imageUrl ? t("Replace image") : t("Upload image")}
        </button>
        {imageUrl ? (
          <button type="button" className="danger-action" disabled={!canManage || uploading} onClick={onDelete}>
            {t("Delete image")}
          </button>
        ) : null}
      </div>
      <input
        ref={fileRef}
        className="visually-hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={(event) => {
          handleFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {!canManage ? <span className="visually-muted">{t("Save the activity before uploading an image.")}</span> : null}
      {error ? <div className="error-banner">{error}</div> : null}
    </section>
  );
}

const SOURCE_PROVIDERS = ["Garmin", "Strava", "MyWhoosh", "TrainingPeaks", "Wahoo", "Other"];

const SOURCE_METRICS = [
  { key: "heart_rate", label: "Heart rate" },
  { key: "power", label: "Power" },
  { key: "cadence", label: "Cadence" },
  { key: "distance", label: "Distance" },
  { key: "duration", label: "Duration" },
  { key: "calories", label: "Calories" },
];

function formatMetricValue(metricKey, values) {
  if (!values || typeof values !== "object") return "";
  if (metricKey === "heart_rate") return [values.avg ? `${Math.round(values.avg)} avg` : "", values.max ? `${Math.round(values.max)} max` : ""].filter(Boolean).join(" / ");
  if (metricKey === "power") return [values.avg ? `${Math.round(values.avg)} W avg` : "", values.max ? `${Math.round(values.max)} W max` : ""].filter(Boolean).join(" / ");
  if (metricKey === "cadence") return values.avg ? `${Math.round(values.avg)} rpm` : "";
  if (metricKey === "distance") return values.km ? `${Number(values.km).toFixed(2)} km` : "";
  if (metricKey === "duration") {
    return formatDurationSeconds(values.seconds);
  }
  if (metricKey === "calories") return values.value ? `${Math.round(values.value)} kcal` : "";
  return "";
}

function getSourceTitle(source, fallbackIndex) {
  return String(source.label || source.provider || source.filename || `Source ${fallbackIndex + 1}`).trim();
}

function formatDurationSeconds(rawSeconds) {
  const seconds = Number(rawSeconds || 0);
  if (!seconds) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.round(seconds % 60);
  if (hours) return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(remainingSeconds).padStart(2, "0")}s`;
  if (minutes) return `${minutes}m ${String(remainingSeconds).padStart(2, "0")}s`;
  return `${remainingSeconds}s`;
}

function getPreferredMetricSource(activity, metricKey) {
  const sourceFiles = Array.isArray(activity?.source_files) ? activity.source_files : [];
  const preferredId = activity?.metric_source_preferences?.[metricKey];
  const preferredSource = sourceFiles.find((source) => source.id === preferredId && source.metrics?.[metricKey]);
  return preferredSource || sourceFiles.find((source) => source.metrics?.[metricKey]) || null;
}

function readMetricValue(activity, metricKey, valueKey) {
  const source = getPreferredMetricSource(activity, metricKey);
  const value = source?.metrics?.[metricKey]?.[valueKey];
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function buildActivityMetricFields(activity) {
  const durationSeconds = readMetricValue(activity, "duration", "seconds");
  const distanceKm = readMetricValue(activity, "distance", "km");
  const avgPower = readMetricValue(activity, "power", "avg");
  const maxPower = readMetricValue(activity, "power", "max");
  const avgCadence = readMetricValue(activity, "cadence", "avg");
  const calories = readMetricValue(activity, "calories", "value");
  const avgHeartRate = readMetricValue(activity, "heart_rate", "avg");
  const maxHeartRate = readMetricValue(activity, "heart_rate", "max");
  return [
    durationSeconds ? { label: "Duration", value: formatDurationSeconds(durationSeconds) } : null,
    distanceKm ? { label: "Distance", value: `${distanceKm.toFixed(2)} km` } : null,
    avgPower ? { label: "Average power", value: `${Math.round(avgPower)} W` } : null,
    maxPower ? { label: "Max power", value: `${Math.round(maxPower)} W` } : null,
    avgCadence ? { label: "Average cadence", value: `${Math.round(avgCadence)} rpm` } : null,
    calories ? { label: "Calories", value: `${Math.round(calories)} kcal` } : null,
    avgHeartRate ? { label: "Average heart rate", value: `${Math.round(avgHeartRate)} bpm` } : null,
    maxHeartRate ? { label: "Max heart rate", value: `${Math.round(maxHeartRate)} bpm` } : null,
  ].filter(Boolean);
}

function ActivityMetricFields({ activity, t }) {
  const fields = buildActivityMetricFields(activity);
  if (!fields.length) return null;
  return (
    <section className="activity-metric-fields" aria-label={t("Activity metrics")}>
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">{t("Activity data")}</p>
          <h3>{t("Imported metrics")}</h3>
        </div>
      </div>
      <div className="activity-metric-grid">
        {fields.map((field) => (
          <div className="activity-metric-field" key={field.label}>
            <span>{t(field.label)}</span>
            <strong>{field.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function ActivitySourceFilesPanel({ activity, canManage, uploading, error, onUpload, onPreferenceChange, t }) {
  const fileRef = useRef(null);
  const [provider, setProvider] = useState("Garmin");
  const [format, setFormat] = useState("");
  const sourceFiles = Array.isArray(activity?.source_files) ? activity.source_files : [];
  const preferences = activity?.metric_source_preferences || {};
  const availableMetrics = SOURCE_METRICS.filter((metric) => sourceFiles.some((source) => source.metrics?.[metric.key]));

  return (
    <section className="activity-source-panel">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">{t("External files")}</p>
          <h3>{t("Activity sources")}</h3>
        </div>
      </div>
      <div className="activity-source-controls">
        <label>
          {t("Provider")}
          <select value={provider} onChange={(event) => setProvider(event.target.value)}>
            {SOURCE_PROVIDERS.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          {t("Format")}
          <select value={format} onChange={(event) => setFormat(event.target.value)}>
            <option value="">{t("Auto")}</option>
            <option value="fit">FIT</option>
            <option value="tcx">TCX</option>
            <option value="gpx">GPX</option>
          </select>
        </label>
        <button type="button" disabled={!canManage || uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? t("Uploading...") : t("Attach file")}
        </button>
      </div>
      <input
        ref={fileRef}
        className="visually-hidden"
        type="file"
        accept=".fit,.tcx,.gpx"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onUpload({ file, provider, format });
          event.target.value = "";
        }}
      />
      {!canManage ? <span className="visually-muted">{t("Save the activity before attaching files.")}</span> : null}
      {error ? <div className="error-banner">{error}</div> : null}
      {sourceFiles.length ? (
        <div className="activity-source-list">
          {sourceFiles.map((source, index) => (
            <div className="activity-source-item" key={source.id || `${source.filename}-${index}`}>
              <div>
                <strong>{getSourceTitle(source, index)}</strong>
                <span>{[source.provider, source.file_format?.toUpperCase(), source.filename].filter(Boolean).join(" | ")}</span>
              </div>
              <div className="activity-source-summary">
                {SOURCE_METRICS.map((metric) => {
                  const value = formatMetricValue(metric.key, source.metrics?.[metric.key]);
                  return value ? <span key={metric.key}>{t(metric.label)}: {value}</span> : null;
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state compact">{t("No external source file attached.")}</div>
      )}
      {availableMetrics.length ? (
        <div className="source-comparison-table">
          <div className="source-comparison-row header">
            <span>{t("Metric")}</span>
            <span>{t("Primary source")}</span>
            <span>{t("Comparison")}</span>
          </div>
          {availableMetrics.map((metric) => (
            <div className="source-comparison-row" key={metric.key}>
              <strong>{t(metric.label)}</strong>
              <select
                value={preferences[metric.key] || ""}
                disabled={!canManage || uploading}
                onChange={(event) => onPreferenceChange({ ...preferences, [metric.key]: event.target.value })}
              >
                {sourceFiles.filter((source) => source.metrics?.[metric.key]).map((source, index) => (
                  <option key={source.id} value={source.id}>{getSourceTitle(source, index)}</option>
                ))}
              </select>
              <span>
                {sourceFiles
                  .map((source, index) => {
                    const value = formatMetricValue(metric.key, source.metrics?.[metric.key]);
                    return value ? `${getSourceTitle(source, index)}: ${value}` : "";
                  })
                  .filter(Boolean)
                  .join(" | ")}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function buildSavePayload(session, activeIndex, draftActivity = null) {
  const activities = (session.activities || []).map(normalizeActivity).filter(activityHasContent);
  let requestedIndex = activeIndex;
  if (draftActivity && activityHasContent(draftActivity)) {
    activities.push(normalizeActivity(draftActivity));
    requestedIndex = activities.length - 1;
  }
  const safeIndex = Math.max(0, Math.min(Number(requestedIndex || 0), Math.max(activities.length - 1, 0)));
  const activeActivity = activities[safeIndex] || normalizeActivity(blankActivity());
  const durationTargetMin = normalizeOptionalInt(session.duration_target_min);
  return {
    ...session,
    plan_activity_type: session.plan_activity_type || "",
    plan_time: session.plan_time || "",
    plan_title: session.plan_title || "",
    duration_target_min: durationTargetMin,
    location: session.location || "",
    plan_notes: session.plan_notes || "",
    planned_items: normalizePlannedItems(session.planned_items),
    exercises: activeActivity.exercises || [],
    note: activeActivity.note || "",
    status: activityHasContent(activeActivity) ? "done" : "todo",
    load: Number(activeActivity.load || 0) || 0,
    physio_time: activeActivity.physio_time || "",
    title: activeActivity.title || "",
    activity_type: activeActivity.activity_type || "",
    activity_details: activeActivity.activity_details || "",
    image: activeActivity.image || "",
    climbing_routes: activeActivity.climbing_routes || [],
    performed_items: activeActivity.performed_items || [],
    used_equipment: activeActivity.used_equipment || [],
    source_files: activeActivity.source_files || [],
    metric_source_preferences: activeActivity.metric_source_preferences || {},
    activities,
    draft_active_activity_index: safeIndex,
    draft_performed_editor: {},
    draft_planned_editor: {},
    draft_selected_strength_category: "",
    draft_planned_section_expanded: false,
    draft_updated_at: "",
  };
}

export default function DaySessionModal({
  date,
  onClose,
  onSaved,
  createNewOnOpen = false,
  initialActivity = null,
  initialActivityIndex = 0,
  initialShowImportPanel = false,
}) {
  const { t } = useTranslation();
  const [session, setSession] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [draftActivity, setDraftActivity] = useState(null);
  const [showPlanEditor, setShowPlanEditor] = useState(false);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [exerciseList, setExerciseList] = useState([]);
  const [exerciseStatus, setExerciseStatus] = useState("idle");
  const [exerciseError, setExerciseError] = useState("");
  const [imageStatus, setImageStatus] = useState("idle");
  const [imageError, setImageError] = useState("");
  const [sourceStatus, setSourceStatus] = useState("idle");
  const [sourceError, setSourceError] = useState("");
  const [isActivityTypeMenuOpen, setIsActivityTypeMenuOpen] = useState(false);
  const [showImportPanel, setShowImportPanel] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setStatus("loading");
    setError("");
    getSession(date)
      .then((payload) => {
        if (!isMounted) return;
        const normalized = normalizeSession(payload);
        const nextActivities = (normalized.activities || []).filter(activityHasContent);
        const nextSession = { ...normalized, activities: nextActivities };
        setSession(nextSession);
        setDraftActivity(createNewOnOpen ? normalizeActivity({ ...blankActivity(), ...(initialActivity || {}) }) : null);
        setShowPlanEditor(false);
        setShowImportPanel(Boolean(initialShowImportPanel));
        setActiveIndex(
          createNewOnOpen
            ? null
            : Math.max(
                0,
                Math.min(
                  Number(initialActivityIndex ?? nextSession.draft_active_activity_index ?? 0) || 0,
                  Math.max(nextActivities.length - 1, 0),
                ),
              ),
        );
        setStatus("ready");
      })
      .catch((sessionError) => {
        if (!isMounted) return;
        setStatus("error");
        setError(sessionError.message);
      });
    return () => {
      isMounted = false;
    };
  }, [date, createNewOnOpen, initialActivity, initialActivityIndex, initialShowImportPanel]);

  useEffect(() => {
    let isMounted = true;
    setExerciseStatus("loading");
    setExerciseError("");
    getExercises()
      .then((payload) => {
        if (!isMounted) return;
        setExerciseList(Array.isArray(payload) ? payload : []);
        setExerciseStatus("ready");
      })
      .catch((exerciseLoadError) => {
        if (!isMounted) return;
        setExerciseError(exerciseLoadError.message);
        setExerciseStatus("error");
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const activeActivity = activeIndex === null ? draftActivity || blankActivity() : session?.activities?.[activeIndex] || blankActivity();
  const activityTypeInputValue = getActivityTypeInputValue(activeActivity.activity_type, t);
  const activityTypeSuggestions = ACTIVITY_TYPES.filter((activityType) => {
    if (!activityType.value) return false;
    const search = activityTypeInputValue.trim().toLowerCase();
    if (!search || ACTIVITY_TYPES.some((knownType) => knownType.value === activeActivity.activity_type)) return true;
    return (
      activityType.value.toLowerCase().includes(search) ||
      activityType.label.toLowerCase().includes(search) ||
      t(activityType.label).toLowerCase().includes(search)
    );
  });
  const isActiveStrengthActivity = isStrengthActivity(activeActivity.activity_type);
  const hasAdvancedStrengthData = Boolean(activeActivity.performed_items?.length);
  const hasClimbingLogData = Boolean(activeActivity.climbing_routes?.length);
  const savedActivities = session?.activities || [];
  const planExists = hasPlanContent(session);
  const hasActivityEditor = activeIndex === null ? Boolean(draftActivity) : Boolean(savedActivities[activeIndex]);
  const isNewActivityDraft = activeIndex === null && Boolean(draftActivity);
  const shouldShowActivitySidebar = savedActivities.length > 1 || isNewActivityDraft;
  const headerActivityLabel = String(activeActivity.activity_type || "").trim()
    ? t(getActivityTypeLabel(activeActivity.activity_type))
    : "";
  const headerActivityTitle = hasActivityEditor
    ? getActivityTitle(activeActivity, activeIndex ?? savedActivities.length, t)
    : "";
  const targetSummary = useMemo(() => {
    if (!session) return "";
    return session.target_load !== null && session.target_load !== undefined
      ? t("Target kg", { value: session.target_load })
      : t("No active target");
  }, [session, t]);
  const saveActionLabel = getSaveActionLabel({ draftActivity, showPlanEditor, hasActivityEditor, t });
  const saveScopeLabel = getSaveScopeLabel({ draftActivity, showPlanEditor, hasActivityEditor, t });
  const saveFlowNote = getSaveFlowNote({ draftActivity, showPlanEditor, hasActivityEditor, t });

  function updateActiveActivity(patch) {
    if (activeIndex === null) {
      setDraftActivity((current) => normalizeActivity({ ...(current || blankActivity()), ...patch }));
      return;
    }
    setSession((current) => {
      if (!current) return current;
      const activities = current.activities?.length ? [...current.activities] : [blankActivity()];
      activities[activeIndex] = normalizeActivity({ ...activities[activeIndex], ...patch });
      return { ...current, activities };
    });
  }

  function updateSession(patch) {
    setSession((current) => (current ? { ...current, ...patch } : current));
  }

  function addActivity() {
    setDraftActivity(blankActivity());
    setActiveIndex(null);
    setShowImportPanel(false);
  }

  function cancelDraftActivity() {
    setDraftActivity(null);
    setActiveIndex(savedActivities.length ? 0 : 0);
  }

  async function deleteSelectedActivity() {
    if (activeIndex === null || !session?.activities?.[activeIndex]) return;
    const activity = session.activities[activeIndex];
    if (!window.confirm(t('Delete "{name}"?', { name: getActivityTitle(activity, activeIndex, t) }))) return;
    const activities = session.activities.filter((_, index) => index !== activeIndex);
    const nextActiveIndex = activities.length ? Math.max(0, Math.min(activeIndex, activities.length - 1)) : 0;
    const nextSession = { ...session, activities, draft_active_activity_index: nextActiveIndex };
    const payload = buildSavePayload(nextSession, activities.length ? nextActiveIndex : 0, null);
    setStatus("saving");
    setError("");
    try {
      await saveSession(date, payload);
      applySessionPayload(payload);
      onSaved?.();
      if (!activities.length) {
        onClose();
      }
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setStatus("ready");
    }
  }

  function startFromPlan() {
    if (!session) return;
    setDraftActivity(buildActivityFromPlan(session));
    setActiveIndex(null);
  }

  async function handleSave() {
    if (!session) return;
    setStatus("saving");
    setError("");
    try {
      const payload = buildSavePayload(session, activeIndex, draftActivity);
      await saveSession(date, payload);
      setStatus("ready");
      onSaved?.();
      if (draftActivity) {
        applySessionPayload(payload);
        return;
      }
      onClose();
    } catch (saveError) {
      setStatus("ready");
      setError(saveError.message);
    }
  }

  function applySessionPayload(payload) {
    const normalized = normalizeSession(payload);
    const nextActivities = (normalized.activities || []).filter(activityHasContent);
    setSession({ ...normalized, activities: nextActivities });
    setActiveIndex(Math.max(0, Math.min(normalized.draft_active_activity_index || 0, Math.max(nextActivities.length - 1, 0))));
    setDraftActivity(null);
  }

  async function handleActivityImageUpload(file) {
    if (!file || !session) return;
    setImageStatus("uploading");
    setImageError("");
    try {
      const targetIndex = activeIndex === null ? savedActivities.length : activeIndex;
      await saveSession(date, buildSavePayload(session, activeIndex, draftActivity));
      const result = await uploadActivityImage(date, targetIndex, file);
      applySessionPayload(result.session);
      onSaved?.();
    } catch (uploadError) {
      setImageError(uploadError.message);
    } finally {
      setImageStatus("idle");
    }
  }

  async function handleActivityImageDelete() {
    if (activeIndex === null || !activeActivity.image || !session) return;
    if (!window.confirm(t("Delete this activity image?"))) return;
    setImageStatus("uploading");
    setImageError("");
    try {
      await saveSession(date, buildSavePayload(session, activeIndex, draftActivity));
      const result = await deleteActivityImage(date, activeIndex);
      applySessionPayload(result.session);
      onSaved?.();
    } catch (deleteError) {
      setImageError(deleteError.message);
    } finally {
      setImageStatus("idle");
    }
  }

  async function handleActivitySourceUpload({ file, provider, format }) {
    if (!file || !session) return;
    setSourceStatus("uploading");
    setSourceError("");
    try {
      const targetIndex = activeIndex === null ? savedActivities.length : activeIndex;
      await saveSession(date, buildSavePayload(session, activeIndex, draftActivity));
      const result = await uploadActivitySourceFile(date, targetIndex, { file, provider, format });
      applySessionPayload(result.session);
      onSaved?.();
    } catch (uploadError) {
      setSourceError(uploadError.message);
    } finally {
      setSourceStatus("idle");
    }
  }

  async function handleMetricSourceChange(preferences) {
    if (activeIndex === null || !session) return;
    setSourceStatus("uploading");
    setSourceError("");
    try {
      await saveSession(date, buildSavePayload(session, activeIndex, draftActivity));
      const result = await updateActivityMetricSources(date, activeIndex, preferences);
      applySessionPayload(result.session);
      onSaved?.();
    } catch (preferenceError) {
      setSourceError(preferenceError.message);
    } finally {
      setSourceStatus("idle");
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="day-modal" role="dialog" aria-modal="true" aria-label={t("Edit date", { date })} onMouseDown={(event) => event.stopPropagation()}>
        <header className="day-modal-header">
          <div>
            <p className="eyebrow">{t("Day Editor")}</p>
            <div className="day-modal-title-row">
              <h2>{date}</h2>
              {headerActivityLabel ? (
                <span
                  className="activity-type-badge compact"
                  style={{ backgroundColor: getActivityTypeColor(activeActivity.activity_type) }}
                >
                  {headerActivityLabel}
                </span>
              ) : null}
            </div>
            {headerActivityTitle && headerActivityTitle !== headerActivityLabel ? (
              <span>{headerActivityTitle}</span>
            ) : session ? (
              <span>{targetSummary}</span>
            ) : null}
          </div>
          <div className="day-modal-actions">
            {session && status !== "loading" && !isNewActivityDraft ? (
              <button type="button" className="primary-action" onClick={addActivity}>
                {t("+ Activity")}
              </button>
            ) : null}
            <button type="button" onClick={onClose}>
              {t("Close")}
            </button>
          </div>
        </header>

        {status === "loading" ? <div className="empty-state">{t("Loading day...")}</div> : null}
        {error ? <div className="error-banner">{error}</div> : null}

        {session && status !== "loading" ? (
          <div className={shouldShowActivitySidebar ? "day-editor-grid" : "day-editor-grid no-activity-sidebar"}>
            {shouldShowActivitySidebar ? (
              <aside className="day-activity-list">
                {isNewActivityDraft ? <div className="activity-select active draft">{t("New activity")}</div> : null}
                {savedActivities.map((activity, index) => (
                  <button
                    type="button"
                    className={index === activeIndex ? "activity-select active" : "activity-select"}
                    key={`${index}-${activity.title}-${activity.activity_type}`}
                    onClick={() => {
                      setActiveIndex(index);
                      setShowImportPanel(false);
                    }}
                  >
                    <strong>{getActivityTitle(activity, index, t)}</strong>
                    <span>{t(getActivityTypeLabel(activity.activity_type))}</span>
                  </button>
                ))}
              </aside>
            ) : null}

            <section className="day-form">
              {planExists && !showPlanEditor ? (
                <section className="day-plan-summary">
                  <div>
                    <p className="eyebrow">{t("Plan")}</p>
                    <h3>{getPlanTitle(session, t)}</h3>
                    <span>{getPlanSummary(session, t)}</span>
                  </div>
                  <div className="compact-actions">
                    <button type="button" className="primary-action" onClick={startFromPlan}>
                      {t("Start from plan")}
                    </button>
                    <button type="button" onClick={() => setShowPlanEditor(true)}>
                      {t("Edit plan")}
                    </button>
                  </div>
                </section>
              ) : null}

              {showPlanEditor ? (
                <PlannedSessionEditor
                  session={session}
                  exercises={exerciseList}
                  loading={exerciseStatus === "loading"}
                  error={exerciseError}
                  onChange={updateSession}
                  onDone={() => setShowPlanEditor(false)}
                />
              ) : null}

              {hasActivityEditor ? (
                <>
                  <div className="activity-type-only-row">
                    <label>
                      {t("Activity Type")}
                      <span className="activity-type-combobox">
                        <input
                          value={activityTypeInputValue}
                          onChange={(event) => {
                            updateActiveActivity({ activity_type: normalizeActivityTypeInput(event.target.value, t) });
                            setIsActivityTypeMenuOpen(true);
                          }}
                          onFocus={() => setIsActivityTypeMenuOpen(true)}
                          onBlur={() => setIsActivityTypeMenuOpen(false)}
                          placeholder={t("Choose type")}
                        />
                        {isActivityTypeMenuOpen ? (
                          <span className="activity-type-menu">
                            {activityTypeSuggestions.map((activityType) => (
                              <button
                                type="button"
                                key={activityType.value}
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  updateActiveActivity({ activity_type: activityType.value });
                                  setIsActivityTypeMenuOpen(false);
                                }}
                              >
                                {t(activityType.label)}
                              </button>
                            ))}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </div>

                  {showImportPanel ? (
                    <ActivitySourceFilesPanel
                      activity={activeActivity}
                      canManage={activityHasContent(activeActivity)}
                      uploading={sourceStatus === "uploading"}
                      error={sourceError}
                      onUpload={handleActivitySourceUpload}
                      onPreferenceChange={handleMetricSourceChange}
                      t={t}
                    />
                  ) : null}

                  {!showImportPanel ? (
                    <>
                      {activeIndex !== null ? (
                        <>
                          <div className="form-grid">
                            <label>
                              {t("Title")}
                              <input
                                value={activeActivity.title || ""}
                                onChange={(event) => updateActiveActivity({ title: event.target.value })}
                                placeholder={t("Morning ride, climbing session, match...")}
                              />
                            </label>
                            <label>
                              {t("Time")}
                              <input
                                type="time"
                                value={activeActivity.physio_time || ""}
                                onChange={(event) => updateActiveActivity({ physio_time: event.target.value })}
                              />
                            </label>
                          </div>

                          <label>
                            {t("Details")}
                            <input
                              value={activeActivity.activity_details || ""}
                              onChange={(event) => updateActiveActivity({ activity_details: event.target.value })}
                              placeholder={t("Duration, zone, location, quick summary...")}
                            />
                          </label>
                          <ActivityMetricFields activity={activeActivity} t={t} />
                          <label>
                            {t("Notes")}
                            <textarea
                              value={activeActivity.note || ""}
                              onChange={(event) => updateActiveActivity({ note: event.target.value })}
                              placeholder={t("How it felt, context, anything useful for later.")}
                            />
                          </label>

                          <ActivityImagePanel
                            activity={activeActivity}
                            canManage={activityHasContent(activeActivity)}
                            uploading={imageStatus === "uploading"}
                            error={imageError}
                            onUpload={handleActivityImageUpload}
                            onDelete={handleActivityImageDelete}
                            t={t}
                          />
                        </>
                      ) : null}

                      {isActiveStrengthActivity ? (
                        <StrengthEditor
                          activity={activeActivity}
                          exercises={exerciseList}
                          loading={exerciseStatus === "loading"}
                          error={exerciseError}
                          onChange={updateActiveActivity}
                          sessionDate={date}
                        />
                      ) : null}

                      {((hasAdvancedStrengthData && !isActiveStrengthActivity) || hasClimbingLogData) && (
                        <div className="notice-panel">
                          {hasAdvancedStrengthData && !isActiveStrengthActivity ? (
                            <span>{t("Strength items preserved", { count: activeActivity.performed_items.length })}</span>
                          ) : null}
                          {hasClimbingLogData ? <span>{t("Climbing routes preserved", { count: activeActivity.climbing_routes.length })}</span> : null}
                        </div>
                      )}
                    </>
                  ) : null}
                </>
              ) : (
                <section className="empty-state activity-empty-panel">
                  {t("Select an existing activity or add a new one.")}
                </section>
              )}

              <div className="day-modal-actions">
                <span className="save-flow-note">
                  <strong>{saveScopeLabel}</strong>
                  {saveFlowNote}
                </span>
                <button type="button" className="primary-action" onClick={handleSave} disabled={status === "saving"}>
                  {status === "saving" ? t("Saving...") : saveActionLabel}
                </button>
                {draftActivity ? (
                  <button type="button" onClick={cancelDraftActivity}>
                    {t("Discard new activity")}
                  </button>
                ) : null}
                {activeIndex !== null && savedActivities[activeIndex] ? (
                  <button type="button" className="danger-action" onClick={deleteSelectedActivity} disabled={status === "saving"}>
                    {t("Delete activity")}
                  </button>
                ) : null}
                {!hasActivityEditor && !planExists && !showPlanEditor ? (
                  <button type="button" onClick={() => setShowPlanEditor(true)}>
                    {t("Plan a future activity")}
                  </button>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </div>
  );
}
