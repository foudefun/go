import { useEffect, useMemo, useState } from "react";
import { getExercises } from "../../api/exerciseApi.js";
import { getSession, saveSession } from "../../api/sessionApi.js";
import {
  ACTIVITY_TYPES,
  getActivityTypeLabel,
  isClimbingActivity,
  isStrengthActivity,
} from "../../domain/activityTypes.js";
import { normalizePlannedItems } from "../plannedItems.js";
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
  };
}

function activityHasContent(activity) {
  return Boolean(
    String(activity.title || "").trim() ||
      String(activity.activity_type || "").trim() ||
      String(activity.activity_details || "").trim() ||
      String(activity.note || "").trim() ||
      String(activity.image || "").trim() ||
      Number(activity.load || 0) > 0 ||
      String(activity.physio_time || "").trim() ||
      (activity.performed_items || []).length ||
      (activity.climbing_routes || []).length,
  );
}

function normalizeActivity(activity) {
  const next = { ...blankActivity(), ...(activity || {}) };
  next.exercises = Array.isArray(next.exercises) ? next.exercises : [];
  next.performed_items = Array.isArray(next.performed_items) ? next.performed_items : [];
  next.climbing_routes = Array.isArray(next.climbing_routes) ? next.climbing_routes : [];
  next.used_equipment = Array.isArray(next.used_equipment) ? next.used_equipment : [];
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

function getActivityTitle(activity, index) {
  return (
    String(activity.title || "").trim() ||
    getActivityTypeLabel(activity.activity_type) ||
    `Activity ${index + 1}`
  );
}

function buildSavePayload(session, activeIndex) {
  const activities = (session.activities || []).map(normalizeActivity).filter(activityHasContent);
  const safeIndex = Math.max(0, Math.min(activeIndex, Math.max(activities.length - 1, 0)));
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
    activities,
    draft_active_activity_index: safeIndex,
    draft_performed_editor: {},
    draft_planned_editor: {},
    draft_selected_strength_category: "",
    draft_planned_section_expanded: false,
    draft_updated_at: "",
  };
}

export default function DaySessionModal({ date, onClose, onSaved }) {
  const [session, setSession] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [exerciseList, setExerciseList] = useState([]);
  const [exerciseStatus, setExerciseStatus] = useState("idle");
  const [exerciseError, setExerciseError] = useState("");

  useEffect(() => {
    let isMounted = true;
    setStatus("loading");
    setError("");
    getSession(date)
      .then((payload) => {
        if (!isMounted) return;
        const normalized = normalizeSession(payload);
        setSession(normalized);
        setActiveIndex(
          Math.max(
            0,
            Math.min(normalized.draft_active_activity_index || 0, Math.max(normalized.activities.length - 1, 0)),
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
  }, [date]);

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

  const activeActivity = session?.activities?.[activeIndex] || blankActivity();
  const isActiveStrengthActivity = isStrengthActivity(activeActivity.activity_type);
  const hasAdvancedStrengthData = Boolean(activeActivity.performed_items?.length);
  const hasClimbingLogData = Boolean(activeActivity.climbing_routes?.length);
  const targetSummary = useMemo(() => {
    if (!session) return "";
    return `Target ${session.target_load ?? "-"} kg - diff ${session.diff ?? 0}`;
  }, [session]);

  function updateActiveActivity(patch) {
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
    setSession((current) => {
      const activities = [...(current?.activities || []), blankActivity()];
      setActiveIndex(activities.length - 1);
      return { ...(current || {}), activities };
    });
  }

  async function handleSave() {
    if (!session) return;
    setStatus("saving");
    setError("");
    try {
      await saveSession(date, buildSavePayload(session, activeIndex));
      setStatus("ready");
      onSaved?.();
      onClose();
    } catch (saveError) {
      setStatus("ready");
      setError(saveError.message);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="day-modal" role="dialog" aria-modal="true" aria-label={`Edit ${date}`} onMouseDown={(event) => event.stopPropagation()}>
        <header className="day-modal-header">
          <div>
            <p className="eyebrow">Day Editor</p>
            <h2>{date}</h2>
            {session ? <span>{targetSummary}</span> : null}
          </div>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </header>

        {status === "loading" ? <div className="empty-state">Loading day...</div> : null}
        {error ? <div className="error-banner">{error}</div> : null}

        {session && status !== "loading" ? (
          <div className="day-editor-grid">
            <aside className="day-activity-list">
              <button type="button" className="primary-action" onClick={addActivity}>
                Add Activity
              </button>
              {(session.activities || []).map((activity, index) => (
                <button
                  type="button"
                  className={index === activeIndex ? "activity-select active" : "activity-select"}
                  key={`${index}-${activity.title}-${activity.activity_type}`}
                  onClick={() => setActiveIndex(index)}
                >
                  <strong>{getActivityTitle(activity, index)}</strong>
                  <span>{getActivityTypeLabel(activity.activity_type)}</span>
                </button>
              ))}
              {!session.activities?.length ? <div className="empty-state compact">No activity yet.</div> : null}
            </aside>

            <section className="day-form">
              <PlannedSessionEditor
                session={session}
                exercises={exerciseList}
                loading={exerciseStatus === "loading"}
                error={exerciseError}
                onChange={updateSession}
              />

              <div className="form-grid">
                <label>
                  Title
                  <input
                    value={activeActivity.title || ""}
                    onChange={(event) => updateActiveActivity({ title: event.target.value })}
                    placeholder="Morning ride, climbing session, match..."
                  />
                </label>
                <label>
                  Activity Type
                  <select
                    value={activeActivity.activity_type || ""}
                    onChange={(event) => updateActiveActivity({ activity_type: event.target.value })}
                  >
                    {ACTIVITY_TYPES.map((activityType) => (
                      <option key={activityType.value} value={activityType.value}>
                        {activityType.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Load
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={activeActivity.load || 0}
                    onChange={(event) => updateActiveActivity({ load: Number(event.target.value || 0) })}
                  />
                </label>
                <label>
                  Time
                  <input
                    type="time"
                    value={activeActivity.physio_time || ""}
                    onChange={(event) => updateActiveActivity({ physio_time: event.target.value })}
                  />
                </label>
              </div>

              <label>
                Details
                <input
                  value={activeActivity.activity_details || ""}
                  onChange={(event) => updateActiveActivity({ activity_details: event.target.value })}
                  placeholder="Duration, zone, location, quick summary..."
                />
              </label>
              <label>
                Notes
                <textarea
                  value={activeActivity.note || ""}
                  onChange={(event) => updateActiveActivity({ note: event.target.value })}
                  placeholder="How it felt, context, anything useful for later."
                />
              </label>

              {isActiveStrengthActivity ? (
                <StrengthEditor
                  activity={activeActivity}
                  exercises={exerciseList}
                  loading={exerciseStatus === "loading"}
                  error={exerciseError}
                  onChange={updateActiveActivity}
                />
              ) : null}

              {((hasAdvancedStrengthData && !isActiveStrengthActivity) || hasClimbingLogData) && (
                <div className="notice-panel">
                  {hasAdvancedStrengthData && !isActiveStrengthActivity ? <span>{activeActivity.performed_items.length} strength item(s) are preserved.</span> : null}
                  {hasClimbingLogData ? <span>{activeActivity.climbing_routes.length} climbing route log(s) are preserved.</span> : null}
                </div>
              )}

              <div className="day-modal-actions">
                <button type="button" className="primary-action" onClick={handleSave} disabled={status === "saving"}>
                  {status === "saving" ? "Saving..." : "Save Day"}
                </button>
                <a className="secondary-action" href="/legacy.html">
                  Advanced Editor
                </a>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </div>
  );
}
