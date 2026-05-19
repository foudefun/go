import { useEffect, useMemo, useState } from "react";
import { getExercisePerformance } from "../../api/exerciseApi.js";
import { filterExercises } from "../../domain/exerciseLibrary.js";
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

function getItemTitle(item, exerciseMap, language) {
  const exercise = exerciseMap.get(item.exercise_name);
  return item.custom_name || getExerciseDisplayName(exercise, language) || item.exercise_name || "Strength item";
}

function getItemExerciseImage(item, exerciseMap) {
  const exercise = exerciseMap.get(item.exercise_name);
  return exercise?.image || exercise?.images?.[0] || "";
}

function sortExercises(exercises, language) {
  return [...(Array.isArray(exercises) ? exercises : [])].sort((left, right) =>
    getExerciseDisplayName(left, language).localeCompare(getExerciseDisplayName(right, language)),
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

function formatDuration(seconds) {
  const totalSeconds = Number(seconds || 0);
  if (!totalSeconds) return "";
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatWeight(value, unit = "kg") {
  return value || value === 0 ? `${Number(value).toFixed(1).replace(/\.0$/, "")} ${unit}` : "";
}

function formatTopSet(set = {}, unit = "kg") {
  if (!set || typeof set !== "object") return "";
  if (set.duration_sec !== null && set.duration_sec !== undefined) {
    return [formatDuration(set.duration_sec), set.watts ? `${Math.round(set.watts)} W` : ""].filter(Boolean).join(" @ ");
  }
  return [set.reps !== null && set.reps !== undefined ? `${set.reps} reps` : "", formatWeight(set.weight, set.weight_unit || unit)].filter(Boolean).join(" x ");
}

function formatRecommendation(recommendation, t) {
  if (!recommendation) return "";
  if (recommendation.tracking_mode === "time_watts") {
    return t("Performance watts recommendation", {
      wattsLow: Math.round(recommendation.suggested_watts_low || 0),
      wattsHigh: Math.round(recommendation.suggested_watts_high || 0),
      durationLow: recommendation.target_duration_low || 0,
      durationHigh: recommendation.target_duration_high || 0,
    });
  }
  return t("Performance weight recommendation", {
    weightLow: recommendation.suggested_weight_low || 0,
    weightHigh: recommendation.suggested_weight_high || 0,
    unit: recommendation.weight_unit || "kg",
    repsLow: recommendation.target_reps_low || 0,
    repsHigh: recommendation.target_reps_high || 0,
  });
}

function getRecommendationBasis(recommendation, t) {
  if (!recommendation?.reference_metric || recommendation.reference_value === null || recommendation.reference_value === undefined) {
    return "";
  }
  const metricLabel = t(`Recommendation reference ${recommendation.reference_metric}`);
  const value =
    recommendation.tracking_mode === "time_watts"
      ? `${Math.round(recommendation.reference_value)} W`
      : `${recommendation.reference_value} ${recommendation.weight_unit || "kg"}`;
  const reps = recommendation.reference_reps
    ? `, ${t("Recommendation reference reps", { reps: recommendation.reference_reps })}`
    : "";
  const fallback = recommendation.based_on_same_work_type ? "" : ` ${t("Recommendation fallback work type")}`;
  return `${t("Based on")} ${metricLabel}: ${value}${reps}.${fallback}`;
}

function getWorkTypeDescription(workType, t) {
  const normalizedWorkType = workType || "resistance";
  const translationKey = `Work type help ${normalizedWorkType}`;
  const translated = t(translationKey);
  if (translated !== translationKey) return translated;
  return {
    endurance: "Long and light work to build tolerance.",
    explosive: "Fast and controlled work with moderate load: accelerate hard without losing technique.",
    force: "Heavy work, low reps, long rest.",
    plyometric: "Jumps, rebounds, or throws: low reps, clean impact, full rest, stop when quality drops.",
    resistance: "Main volume work with moderate load.",
  }[normalizedWorkType] || "Main volume work with moderate load.";
}

function WorkTypeHelp({ workType, t }) {
  return (
    <details className="inline-help">
      <summary aria-label={t("Work type help")}>?</summary>
      <div>{getWorkTypeDescription(workType, t)}</div>
    </details>
  );
}

function ExercisePerformancePanel({ summary, status, error, selectedWorkType, t }) {
  if (status === "idle") {
    return <div className="performance-panel empty">{t("Choose an exercise to see history and PRs.")}</div>;
  }
  if (status === "loading") {
    return <div className="performance-panel empty">{t("Loading exercise history...")}</div>;
  }
  if (error) {
    return <div className="performance-panel empty error">{error}</div>;
  }
  if (!summary || !summary.total_sessions) {
    return <div className="performance-panel empty">{t("No previous performance for this exercise yet.")}</div>;
  }

  const records = summary.personal_records || {};
  const unit = summary.weight_unit || "kg";
  const recordItems = [
    records.heaviest_weight || records.heaviest_weight === 0
      ? [t("Heaviest"), formatWeight(records.heaviest_weight, unit)]
      : null,
    records.best_estimated_1rm || records.best_estimated_1rm === 0
      ? [t("Estimated 1RM"), formatWeight(records.best_estimated_1rm, unit)]
      : null,
    records.max_watts || records.max_watts === 0 ? [t("Max watts"), `${Math.round(records.max_watts)} W`] : null,
    records.longest_duration_sec || records.longest_duration_sec === 0 ? [t("Longest duration"), formatDuration(records.longest_duration_sec)] : null,
  ].filter(Boolean);

  return (
    <section className="performance-panel">
      <div>
        <p className="eyebrow">{t("History")}</p>
        <h4>{t("Previous performance")}</h4>
        <span>
          {t("Performance session count", {
            total: summary.total_sessions,
            validated: summary.validated_sessions || 0,
          })}
        </span>
      </div>
      {summary.last_session ? (
        <div className="performance-last">
          <strong>{t("Last session")}</strong>
          <span>
            {summary.last_session.date} - {formatTopSet(summary.last_session.top_set, unit)}
          </span>
        </div>
      ) : null}
      {recordItems.length ? (
        <div className="performance-records">
          {recordItems.map(([label, value]) => (
            <span key={label}>
              <strong>{label}</strong>
              {value}
            </span>
          ))}
        </div>
      ) : null}
      {summary.recommendations?.[selectedWorkType] ? (
        <div className="notice-panel">
          <strong>{t("Suggested range")}</strong>
          <span>{formatRecommendation(summary.recommendations[selectedWorkType], t)}</span>
          <small>{getRecommendationBasis(summary.recommendations[selectedWorkType], t)}</small>
        </div>
      ) : null}
    </section>
  );
}

export default function StrengthEditor({ activity, exercises, loading, error, onChange, sessionDate = "" }) {
  const { language, t } = useTranslation();
  const exerciseMap = useMemo(() => buildExerciseMap(exercises), [exercises]);
  const sortedExercises = useMemo(() => sortExercises(exercises, language), [exercises, language]);
  const items = useMemo(
    () => normalizePerformedItems(activity?.performed_items, exercises),
    [activity?.performed_items, exercises],
  );
  const [draft, setDraft] = useState(createBlankStrengthItem);
  const [editIndex, setEditIndex] = useState(null);
  const [performance, setPerformance] = useState(null);
  const [performanceStatus, setPerformanceStatus] = useState("idle");
  const [performanceError, setPerformanceError] = useState("");
  const [exerciseQuery, setExerciseQuery] = useState("");
  const trackingMode = getDraftTrackingMode(draft, exerciseMap);
  const weightUnit = getDraftWeightUnit(draft, exerciseMap);
  const selectedWorkType = draft.work_type || "resistance";
  const [currentSet, setCurrentSet] = useState(() => createBlankSetDraft("reps_weight", "kg"));
  const filteredExercises = useMemo(
    () => filterExercises(sortedExercises, { query: exerciseQuery, language }),
    [sortedExercises, exerciseQuery, language],
  );

  useEffect(() => {
    let isMounted = true;
    const exerciseName = String(draft.exercise_name || "").trim();
    if (!exerciseName) {
      setPerformance(null);
      setPerformanceStatus("idle");
      setPerformanceError("");
      return () => {
        isMounted = false;
      };
    }
    setPerformanceStatus("loading");
    setPerformanceError("");
    getExercisePerformance(exerciseName, { excludeDate: sessionDate })
      .then((payload) => {
        if (!isMounted) return;
        setPerformance(payload);
        setPerformanceStatus("ready");
      })
      .catch((performanceLoadError) => {
        if (!isMounted) return;
        setPerformance(null);
        setPerformanceError(performanceLoadError.message);
        setPerformanceStatus("error");
      });
    return () => {
      isMounted = false;
    };
  }, [draft.exercise_name, sessionDate]);

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
    setExerciseQuery("");
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
    setExerciseQuery("");
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
          {items.map((item, index) => {
            const exerciseImage = getItemExerciseImage(item, exerciseMap);
            return (
              <article
                className={`performed-item-card${exerciseImage ? " has-image" : ""}`}
                key={`${item.exercise_name}-${item.custom_name}-${index}`}
              >
                {exerciseImage ? (
                  <img className="performed-item-image" src={exerciseImage} alt="" loading="lazy" />
                ) : null}
                <div className="performed-item-content">
                  <div>
                    <strong>{getItemTitle(item, exerciseMap, language)}</strong>
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
                </div>
              </article>
            );
          })}
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
          <div className="exercise-picker-field">
            <label>
              {t("Search")}
              <input
                value={exerciseQuery}
                onChange={(event) => setExerciseQuery(event.target.value)}
                placeholder={t("Exercise search placeholder")}
              />
            </label>
            <label>
              {t("Exercise")}
              <select value={draft.exercise_name || ""} onChange={(event) => handleExerciseChange(event.target.value)}>
                <option value="">{t("Choose exercise")}</option>
                {draft.exercise_name && !exerciseMap.has(draft.exercise_name) ? (
                  <option value={draft.exercise_name}>{draft.exercise_name}</option>
                ) : null}
                {filteredExercises.map((exercise) => (
                  <option value={exercise.name} key={exercise.name}>
                    {getExerciseDisplayName(exercise, language)}
                  </option>
                ))}
              </select>
            </label>
            {exerciseQuery && !filteredExercises.length ? (
              <span className="field-hint">{t("No exercise matches this filter.")}</span>
            ) : null}
          </div>
          <label>
            {t("Custom label")}
            <input
              value={draft.custom_name || ""}
              onChange={(event) => setDraft((current) => ({ ...current, custom_name: event.target.value }))}
              placeholder={t("Optional session label")}
            />
          </label>
          <label>
            <span className="field-label-row">
              {t("Work type")}
              <WorkTypeHelp workType={selectedWorkType} t={t} />
            </span>
            <select
              value={selectedWorkType}
              onChange={(event) => setDraft((current) => ({ ...current, work_type: event.target.value }))}
            >
              {WORK_TYPES.map((workType) => (
                <option value={workType.value} key={workType.value}>
                  {t(workType.label)}
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
                  {t(workMode.label)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <ExercisePerformancePanel
          summary={performance}
          status={performanceStatus}
          error={performanceError}
          selectedWorkType={selectedWorkType}
          t={t}
        />

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
