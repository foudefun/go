import { useMemo, useState } from "react";
import {
  WORK_MODES,
  WORK_TYPES,
  buildExerciseMap,
  createBlankSetDraft,
  createBlankStrengthItem,
  formatPerformedSet,
  getExerciseDisplayName,
  getUniqueExerciseNames,
  normalizePerformedItem,
  normalizePerformedItems,
  normalizePerformedSet,
  normalizeTrackingMode,
  normalizeWeightUnit,
} from "../strengthItems.js";
import { useTranslation } from "../../i18n/translations.js";

function getItemTitle(item, exerciseMap) {
  const exercise = exerciseMap.get(item.exercise_name);
  return item.custom_name || getExerciseDisplayName(exercise) || item.exercise_name || "Strength item";
}

function sortExercises(exercises) {
  return [...(Array.isArray(exercises) ? exercises : [])].sort((left, right) =>
    getExerciseDisplayName(left).localeCompare(getExerciseDisplayName(right)),
  );
}

function getDraftTrackingMode(draft, exerciseMap) {
  const exercise = exerciseMap.get(draft.exercise_name);
  if (exercise?.tracking_mode) return normalizeTrackingMode(exercise.tracking_mode);
  if ((draft.sets || []).some((set) => set.duration_sec !== undefined || set.watts !== undefined)) {
    return "time_watts";
  }
  return "reps_weight";
}

function getDraftWeightUnit(draft, exerciseMap) {
  const exercise = exerciseMap.get(draft.exercise_name);
  const firstWeightedSet = (draft.sets || []).find((set) => set.weight_unit);
  return normalizeWeightUnit(exercise?.weight_unit || firstWeightedSet?.weight_unit);
}

function hasSetDraftContent(setDraft) {
  return Object.values(setDraft || {}).some((value) => value !== "" && value !== null && value !== undefined);
}

export default function StrengthEditor({ activity, exercises, loading, error, onChange }) {
  const { t } = useTranslation();
  const exerciseMap = useMemo(() => buildExerciseMap(exercises), [exercises]);
  const sortedExercises = useMemo(() => sortExercises(exercises), [exercises]);
  const items = useMemo(
    () => normalizePerformedItems(activity?.performed_items, exercises),
    [activity?.performed_items, exercises],
  );
  const [draft, setDraft] = useState(createBlankStrengthItem);
  const [editIndex, setEditIndex] = useState(null);
  const trackingMode = getDraftTrackingMode(draft, exerciseMap);
  const weightUnit = getDraftWeightUnit(draft, exerciseMap);
  const [currentSet, setCurrentSet] = useState(() => createBlankSetDraft("reps_weight", "kg"));

  function emitItems(nextItems) {
    onChange({
      performed_items: nextItems,
      exercises: getUniqueExerciseNames(nextItems),
    });
  }

  function resetDraft() {
    setDraft(createBlankStrengthItem());
    setCurrentSet(createBlankSetDraft("reps_weight", "kg"));
    setEditIndex(null);
  }

  function handleExerciseChange(exerciseName) {
    const exercise = exerciseMap.get(exerciseName);
    const nextTrackingMode = normalizeTrackingMode(exercise?.tracking_mode);
    const nextWeightUnit = normalizeWeightUnit(exercise?.weight_unit);
    setDraft((current) => ({ ...current, exercise_name: exerciseName }));
    setCurrentSet(createBlankSetDraft(nextTrackingMode, nextWeightUnit));
  }

  function addSetToDraft() {
    if (!hasSetDraftContent(currentSet)) return;
    const normalizedSet = normalizePerformedSet(currentSet, trackingMode);
    if (!Object.keys(normalizedSet).length) return;
    setDraft((current) => ({
      ...current,
      sets: [...(current.sets || []), normalizedSet],
    }));
    setCurrentSet(createBlankSetDraft(trackingMode, weightUnit));
  }

  function removeDraftSet(indexToRemove) {
    setDraft((current) => ({
      ...current,
      sets: (current.sets || []).filter((_, index) => index !== indexToRemove),
    }));
  }

  function saveDraftItem() {
    const normalizedItem = normalizePerformedItem(draft, exerciseMap);
    if (!normalizedItem.exercise_name && !normalizedItem.custom_name && !normalizedItem.sets?.length) return;
    const nextItems =
      editIndex === null
        ? [...items, normalizedItem]
        : items.map((item, index) => (index === editIndex ? normalizedItem : item));
    emitItems(nextItems);
    resetDraft();
  }

  function editItem(item, index) {
    setDraft({ ...createBlankStrengthItem(), ...item, sets: item.sets || [] });
    setEditIndex(index);
    setCurrentSet(createBlankSetDraft(getDraftTrackingMode(item, exerciseMap), getDraftWeightUnit(item, exerciseMap)));
  }

  function deleteItem(indexToDelete) {
    emitItems(items.filter((_, index) => index !== indexToDelete));
    if (editIndex === indexToDelete) resetDraft();
  }

  return (
    <section className="strength-editor" aria-label={t("Strength performed items")}>
      <header className="strength-editor-header">
        <div>
          <p className="eyebrow">{t("Strength Details")}</p>
          <h3>{t("Performed items")}</h3>
        </div>
        <span>{t("Item count", { count: items.length })}</span>
      </header>

      {loading ? <div className="empty-state compact">{t("Loading exercise library...")}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}

      {items.length ? (
        <div className="performed-item-list">
          {items.map((item, index) => (
            <article className="performed-item-card" key={`${item.exercise_name}-${item.custom_name}-${index}`}>
              <div>
                <strong>{getItemTitle(item, exerciseMap)}</strong>
                <span>
                  {t(WORK_TYPES.find((workType) => workType.value === item.work_type)?.label || "Resistance")} -{" "}
                  {t(WORK_MODES.find((workMode) => workMode.value === item.work_mode)?.label || "Normal")}
                </span>
              </div>
              {item.sets?.length ? (
                <div className="set-chip-row">
                  {item.sets.map((set, setIndex) => (
                    <span className="set-chip" key={`${index}-${setIndex}`}>
                      {formatPerformedSet(set)}
                    </span>
                  ))}
                </div>
              ) : null}
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
        <div className="empty-state compact">{t("No performed strength items yet.")}</div>
      )}

      <div className="strength-builder">
        <div className="strength-builder-title">
          <strong>{editIndex === null ? t("Add item") : t("Edit item")}</strong>
          {editIndex !== null ? (
            <button type="button" onClick={resetDraft}>
              {t("Cancel")}
            </button>
          ) : null}
        </div>

        <div className="form-grid">
          <label>
            {t("Exercise")}
            <select value={draft.exercise_name || ""} onChange={(event) => handleExerciseChange(event.target.value)}>
              <option value="">{t("Choose exercise")}</option>
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
            {t("Custom label")}
            <input
              value={draft.custom_name || ""}
              onChange={(event) => setDraft((current) => ({ ...current, custom_name: event.target.value }))}
              placeholder={t("Optional session label")}
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
          <label>
            {t("Mode")}
            <select
              value={draft.work_mode || "normal"}
              onChange={(event) => setDraft((current) => ({ ...current, work_mode: event.target.value }))}
            >
              {WORK_MODES.map((workMode) => (
                <option value={workMode.value} key={workMode.value}>
                  {workMode.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label>
          {t("Item notes")}
          <textarea
            value={draft.notes || ""}
            onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
            placeholder={t("Tempo, pain, technique, substitutions...")}
          />
        </label>

        <div className="set-builder">
          <div className="set-builder-header">
            <strong>{t("Sets")}</strong>
            <span>{trackingMode === "time_watts" ? t("Timed / watts") : t("Reps / unit", { unit: weightUnit })}</span>
          </div>

          {trackingMode === "time_watts" ? (
            <div className="form-grid set-input-grid">
              <label>
                {t("Duration seconds")}
                <input
                  type="number"
                  min="0"
                  value={currentSet.duration_sec || ""}
                  onChange={(event) => setCurrentSet((current) => ({ ...current, duration_sec: event.target.value }))}
                  placeholder="300"
                />
              </label>
              <label>
                {t("Watts")}
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={currentSet.watts || ""}
                  onChange={(event) => setCurrentSet((current) => ({ ...current, watts: event.target.value }))}
                  placeholder="180"
                />
              </label>
            </div>
          ) : (
            <div className="form-grid set-input-grid">
              <label>
                {t("Reps")}
                <input
                  type="number"
                  min="0"
                  value={currentSet.reps || ""}
                  onChange={(event) => setCurrentSet((current) => ({ ...current, reps: event.target.value }))}
                  placeholder="8"
                />
              </label>
              <label>
                {t("Weight")}
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={currentSet.weight || ""}
                  onChange={(event) => setCurrentSet((current) => ({ ...current, weight: event.target.value }))}
                  placeholder="40"
                />
              </label>
              <label>
                {t("Unit")}
                <select
                  value={currentSet.weight_unit || weightUnit}
                  onChange={(event) => setCurrentSet((current) => ({ ...current, weight_unit: event.target.value }))}
                >
                  <option value="kg">kg</option>
                  <option value="lb">lb</option>
                </select>
              </label>
            </div>
          )}

          <button type="button" className="secondary-action" onClick={addSetToDraft}>
            {t("Add Set")}
          </button>

          {draft.sets?.length ? (
            <div className="set-chip-row">
              {draft.sets.map((set, index) => (
                <button className="set-chip removable" type="button" key={`${formatPerformedSet(set)}-${index}`} onClick={() => removeDraftSet(index)}>
                  {formatPerformedSet(set)}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <button type="button" className="primary-action" onClick={saveDraftItem}>
          {editIndex === null ? t("Add Strength Item") : t("Update Strength Item")}
        </button>
      </div>
    </section>
  );
}
