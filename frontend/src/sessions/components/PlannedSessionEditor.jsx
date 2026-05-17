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
import { useTranslation } from "../../i18n/translations.js";

function sortExercises(exercises, language) {
  return [...(Array.isArray(exercises) ? exercises : [])].sort((left, right) =>
    getExerciseDisplayName(left, language).localeCompare(getExerciseDisplayName(right, language)),
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
  const { language, t } = useTranslation();
  const exerciseMap = useMemo(() => buildPlannedExerciseMap(exercises), [exercises]);
  const sortedExercises = useMemo(() => sortExercises(exercises, language), [exercises, language]);
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
    <section className="planned-editor" aria-label={t("Planned session")}>
      <header className="strength-editor-header">
        <div>
          <p className="eyebrow">{t("Plan Details")}</p>
          <h3>{t("Planned session")}</h3>
        </div>
        <div className="compact-actions">
          <span>{t("Item count", { count: plannedItems.length })}</span>
          {onDone ? (
            <button type="button" onClick={onDone}>
              {t("Done")}
            </button>
          ) : null}
          <button type="button" onClick={clearPlan}>
            {t("Clear Plan")}
          </button>
        </div>
      </header>

      <div className="form-grid">
        <label>
          {t("Planned activity")}
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
          {t("Planned time")}
          <input
            type="time"
            value={session?.plan_time || ""}
            onChange={(event) => updatePlanField("plan_time", event.target.value)}
          />
        </label>
        <label>
          {t("Plan title")}
          <input
            value={session?.plan_title || ""}
            onChange={(event) => updatePlanField("plan_title", event.target.value)}
            placeholder={t("Workout, climb, recovery...")}
          />
        </label>
        <label>
          {t("Location")}
          <input
            value={session?.location || ""}
            onChange={(event) => updatePlanField("location", event.target.value)}
            placeholder={t("Gym, crag, route...")}
          />
        </label>
        <label>
          {t("Target duration min")}
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
        {t("Plan notes")}
        <textarea
          value={session?.plan_notes || ""}
          onChange={(event) => updatePlanField("plan_notes", event.target.value)}
          placeholder={t("Intent, constraints, equipment, route plan...")}
        />
      </label>

      {loading ? <div className="empty-state compact">{t("Loading exercise library...")}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}

      {plannedItems.length ? (
        <div className="performed-item-list">
          {plannedItems.map((item, index) => (
            <article className="performed-item-card" key={`${item.exercise_name}-${item.custom_name}-${index}`}>
              <div>
                <strong>{getPlannedItemTitle(item, exerciseMap, language)}</strong>
                <span>{formatPlannedItem(item) || t("Planned work")}</span>
              </div>
              {item.notes ? <p>{item.notes}</p> : null}
              <div className="compact-actions">
                <button type="button" onClick={() => editItem(item, index)}>
                  {t("Edit")}
                </button>
                <button type="button" onClick={() => deleteItem(index)}>
                  {t("Delete")}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state compact">{t("No planned items yet.")}</div>
      )}

      <div className="planned-builder">
        <div className="strength-builder-title">
          <strong>{editIndex === null ? t("Add planned item") : t("Edit planned item")}</strong>
          {editIndex !== null ? (
            <button type="button" onClick={resetDraft}>
              {t("Cancel")}
            </button>
          ) : null}
        </div>

        <div className="form-grid">
          <label>
            {t("Exercise")}
            <select
              value={draft.exercise_name || ""}
              onChange={(event) => setDraft((current) => ({ ...current, exercise_name: event.target.value }))}
            >
              <option value="">{t("Choose exercise")}</option>
              {draft.exercise_name && !exerciseMap.has(draft.exercise_name) ? (
                <option value={draft.exercise_name}>{draft.exercise_name}</option>
              ) : null}
              {sortedExercises.map((exercise) => (
                <option value={exercise.name} key={exercise.name}>
                  {getExerciseDisplayName(exercise, language)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("Custom label")}
            <input
              value={draft.custom_name || ""}
              onChange={(event) => setDraft((current) => ({ ...current, custom_name: event.target.value }))}
              placeholder={t("Optional planned label")}
            />
          </label>
          <label>
            {t("Block")}
            <input
              value={draft.block || ""}
              onChange={(event) => setDraft((current) => ({ ...current, block: event.target.value }))}
              placeholder={t("A, warmup, main...")}
            />
          </label>
          <label>
            {t("Work type")}
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
            {t("Sets")}
            <input
              type="number"
              min="0"
              value={draft.sets ?? ""}
              onChange={(event) => setDraft((current) => ({ ...current, sets: event.target.value }))}
              placeholder="3"
            />
          </label>
          <label>
            {t("Reps")}
            <input
              type="number"
              min="0"
              value={draft.reps ?? ""}
              onChange={(event) => setDraft((current) => ({ ...current, reps: event.target.value }))}
              placeholder="8"
            />
          </label>
          <label>
            {t("Duration min")}
            <input
              type="number"
              min="0"
              value={draft.duration_min ?? ""}
              onChange={(event) => setDraft((current) => ({ ...current, duration_min: event.target.value }))}
              placeholder="20"
            />
          </label>
          <label>
            {t("Duration sec")}
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
          {t("Item notes")}
          <textarea
            value={draft.notes || ""}
            onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
            placeholder={t("Targets, substitutions, rest, technique...")}
          />
        </label>

        <button type="button" className="primary-action" onClick={saveDraftItem}>
          {editIndex === null ? t("Add Planned Item") : t("Update Planned Item")}
        </button>
      </div>
    </section>
  );
}
