import { useMemo, useState } from "react";
import { ACTIVITY_TYPES } from "../../domain/activityTypes.js";
import { WORK_TYPES, getExerciseDisplayName } from "../strengthItems.js";
import {
  buildPlannedExerciseMap,
  createBlankPlannedItem,
  formatPlannedItem,
  getPlannedItemTitle,
  normalizePlannedItem,
  normalizePlannedItems,
} from "../plannedItems.js";

function sortExercises(exercises) {
  return [...(Array.isArray(exercises) ? exercises : [])].sort((left, right) =>
    getExerciseDisplayName(left).localeCompare(getExerciseDisplayName(right)),
  );
}

function hasPlannedItemContent(item) {
  const normalized = normalizePlannedItem(item);
  return Boolean(
    normalized.exercise_name ||
      normalized.custom_name ||
      normalized.block ||
      normalized.sets !== undefined ||
      normalized.reps !== undefined ||
      normalized.duration_min !== undefined ||
      normalized.duration_sec !== undefined ||
      normalized.notes,
  );
}

export default function PlannedSessionEditor({ session, exercises, loading, error, onChange, onDone }) {
  const exerciseMap = useMemo(() => buildPlannedExerciseMap(exercises), [exercises]);
  const sortedExercises = useMemo(() => sortExercises(exercises), [exercises]);
  const plannedItems = useMemo(
    () => normalizePlannedItems(session?.planned_items),
    [session?.planned_items],
  );
  const [draft, setDraft] = useState(createBlankPlannedItem);
  const [editIndex, setEditIndex] = useState(null);

  function updatePlanField(field, value) {
    onChange({ [field]: value });
  }

  function emitItems(nextItems) {
    onChange({ planned_items: normalizePlannedItems(nextItems) });
  }

  function resetDraft() {
    setDraft(createBlankPlannedItem());
    setEditIndex(null);
  }

  function saveDraftItem() {
    if (!hasPlannedItemContent(draft)) return;
    const normalizedItem = normalizePlannedItem(draft);
    const nextItems =
      editIndex === null
        ? [...plannedItems, normalizedItem]
        : plannedItems.map((item, index) => (index === editIndex ? normalizedItem : item));
    emitItems(nextItems);
    resetDraft();
  }

  function editItem(item, index) {
    setDraft({ ...createBlankPlannedItem(), ...item });
    setEditIndex(index);
  }

  function deleteItem(indexToDelete) {
    emitItems(plannedItems.filter((_, index) => index !== indexToDelete));
    if (editIndex === indexToDelete) resetDraft();
  }

  function clearPlan() {
    onChange({
      plan_activity_type: "",
      plan_time: "",
      plan_title: "",
      duration_target_min: "",
      location: "",
      plan_notes: "",
      planned_items: [],
    });
    resetDraft();
  }

  return (
    <section className="planned-editor" aria-label="Planned session">
      <header className="strength-editor-header">
        <div>
          <p className="eyebrow">Plan Details</p>
          <h3>Planned session</h3>
        </div>
        <div className="compact-actions">
          <span>{plannedItems.length} item(s)</span>
          {onDone ? (
            <button type="button" onClick={onDone}>
              Done
            </button>
          ) : null}
          <button type="button" onClick={clearPlan}>
            Clear Plan
          </button>
        </div>
      </header>

      <div className="form-grid">
        <label>
          Planned activity
          <select
            value={session?.plan_activity_type || ""}
            onChange={(event) => updatePlanField("plan_activity_type", event.target.value)}
          >
            {ACTIVITY_TYPES.map((activityType) => (
              <option key={activityType.value} value={activityType.value}>
                {activityType.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Planned time
          <input
            type="time"
            value={session?.plan_time || ""}
            onChange={(event) => updatePlanField("plan_time", event.target.value)}
          />
        </label>
        <label>
          Plan title
          <input
            value={session?.plan_title || ""}
            onChange={(event) => updatePlanField("plan_title", event.target.value)}
            placeholder="Workout, climb, recovery..."
          />
        </label>
        <label>
          Location
          <input
            value={session?.location || ""}
            onChange={(event) => updatePlanField("location", event.target.value)}
            placeholder="Gym, crag, route..."
          />
        </label>
        <label>
          Target duration min
          <input
            type="number"
            min="0"
            step="1"
            value={session?.duration_target_min ?? ""}
            onChange={(event) => updatePlanField("duration_target_min", event.target.value)}
          />
        </label>
      </div>

      <label>
        Plan notes
        <textarea
          value={session?.plan_notes || ""}
          onChange={(event) => updatePlanField("plan_notes", event.target.value)}
          placeholder="Intent, constraints, equipment, route plan..."
        />
      </label>

      {loading ? <div className="empty-state compact">Loading exercise library...</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}

      {plannedItems.length ? (
        <div className="performed-item-list">
          {plannedItems.map((item, index) => (
            <article className="performed-item-card" key={`${item.exercise_name}-${item.custom_name}-${index}`}>
              <div>
                <strong>{getPlannedItemTitle(item, exerciseMap)}</strong>
                <span>{formatPlannedItem(item) || "Planned work"}</span>
              </div>
              {item.notes ? <p>{item.notes}</p> : null}
              <div className="compact-actions">
                <button type="button" onClick={() => editItem(item, index)}>
                  Edit
                </button>
                <button type="button" onClick={() => deleteItem(index)}>
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state compact">No planned items yet.</div>
      )}

      <div className="planned-builder">
        <div className="strength-builder-title">
          <strong>{editIndex === null ? "Add planned item" : "Edit planned item"}</strong>
          {editIndex !== null ? (
            <button type="button" onClick={resetDraft}>
              Cancel
            </button>
          ) : null}
        </div>

        <div className="form-grid">
          <label>
            Exercise
            <select
              value={draft.exercise_name || ""}
              onChange={(event) => setDraft((current) => ({ ...current, exercise_name: event.target.value }))}
            >
              <option value="">Choose exercise</option>
              {draft.exercise_name && !exerciseMap.has(draft.exercise_name) ? (
                <option value={draft.exercise_name}>{draft.exercise_name}</option>
              ) : null}
              {sortedExercises.map((exercise) => (
                <option value={exercise.name} key={exercise.name}>
                  {getExerciseDisplayName(exercise)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Custom label
            <input
              value={draft.custom_name || ""}
              onChange={(event) => setDraft((current) => ({ ...current, custom_name: event.target.value }))}
              placeholder="Optional planned label"
            />
          </label>
          <label>
            Block
            <input
              value={draft.block || ""}
              onChange={(event) => setDraft((current) => ({ ...current, block: event.target.value }))}
              placeholder="A, warmup, main..."
            />
          </label>
          <label>
            Work type
            <select
              value={draft.work_type || "resistance"}
              onChange={(event) => setDraft((current) => ({ ...current, work_type: event.target.value }))}
            >
              {WORK_TYPES.map((workType) => (
                <option value={workType.value} key={workType.value}>
                  {workType.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="form-grid set-input-grid">
          <label>
            Sets
            <input
              type="number"
              min="0"
              value={draft.sets ?? ""}
              onChange={(event) => setDraft((current) => ({ ...current, sets: event.target.value }))}
              placeholder="3"
            />
          </label>
          <label>
            Reps
            <input
              type="number"
              min="0"
              value={draft.reps ?? ""}
              onChange={(event) => setDraft((current) => ({ ...current, reps: event.target.value }))}
              placeholder="8"
            />
          </label>
          <label>
            Duration min
            <input
              type="number"
              min="0"
              value={draft.duration_min ?? ""}
              onChange={(event) => setDraft((current) => ({ ...current, duration_min: event.target.value }))}
              placeholder="20"
            />
          </label>
          <label>
            Duration sec
            <input
              type="number"
              min="0"
              value={draft.duration_sec ?? ""}
              onChange={(event) => setDraft((current) => ({ ...current, duration_sec: event.target.value }))}
              placeholder="45"
            />
          </label>
        </div>

        <label>
          Item notes
          <textarea
            value={draft.notes || ""}
            onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
            placeholder="Targets, substitutions, rest, technique..."
          />
        </label>

        <button type="button" className="primary-action" onClick={saveDraftItem}>
          {editIndex === null ? "Add Planned Item" : "Update Planned Item"}
        </button>
      </div>
    </section>
  );
}
