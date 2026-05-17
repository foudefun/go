export const WORK_MODES = [
  { value: "normal", label: "Normal" },
  { value: "superset", label: "Superset" },
  { value: "biset", label: "Biset" },
];

export const WORK_TYPES = [
  { value: "resistance", label: "Resistance" },
  { value: "explosive", label: "Explosive" },
  { value: "force", label: "Force" },
  { value: "endurance", label: "Endurance" },
];

export function normalizeTrackingMode(value) {
  return value === "time_watts" ? "time_watts" : "reps_weight";
}

export function normalizeWeightUnit(value) {
  return value === "lb" ? "lb" : "kg";
}

export function normalizeWorkMode(value) {
  return WORK_MODES.some((item) => item.value === value) ? value : "normal";
}

export function normalizeWorkType(value) {
  return WORK_TYPES.some((item) => item.value === value) ? value : "resistance";
}

export function normalizeOptionalInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return null;
  const integerValue = Math.trunc(numberValue);
  return integerValue >= 0 ? integerValue : null;
}

export function normalizeOptionalFloat(value) {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) return null;
  return Math.round(numberValue * 100) / 100;
}

export function getExerciseDisplayName(exercise, language = "fr") {
  const localizedName =
    language === "en"
      ? String(exercise?.display_name_en || "").trim()
      : String(exercise?.display_name_fr || "").trim();
  return (
    localizedName ||
    String(exercise?.display_name || "").trim() ||
    String(language === "en" ? exercise?.display_name_fr || "" : exercise?.display_name_en || "").trim() ||
    String(exercise?.name || "").replaceAll("_", " ").trim()
  );
}

export function buildExerciseMap(exercises = []) {
  return new Map(
    (Array.isArray(exercises) ? exercises : [])
      .filter((exercise) => exercise?.name)
      .map((exercise) => [exercise.name, exercise]),
  );
}

function inferSetTrackingMode(rawSet) {
  if (rawSet?.duration_sec !== undefined || rawSet?.watts !== undefined) {
    return "time_watts";
  }
  return "reps_weight";
}

export function normalizePerformedSet(rawSet = {}, trackingMode = "") {
  const mode = normalizeTrackingMode(trackingMode || inferSetTrackingMode(rawSet));
  const normalized = {};

  if (mode === "time_watts") {
    const durationSec = normalizeOptionalInt(rawSet.duration_sec);
    const watts = normalizeOptionalFloat(rawSet.watts);
    if (durationSec !== null) normalized.duration_sec = durationSec;
    if (watts !== null) normalized.watts = watts;
  } else {
    const reps = normalizeOptionalInt(rawSet.reps);
    const weight = normalizeOptionalFloat(rawSet.weight);
    if (reps !== null) normalized.reps = reps;
    if (weight !== null) {
      normalized.weight = weight;
      normalized.weight_unit = normalizeWeightUnit(rawSet.weight_unit);
    }
  }

  return normalized;
}

export function normalizePerformedItem(rawItem = {}, exerciseMap = new Map()) {
  const exerciseName = String(rawItem.exercise_name || "").trim();
  const customName = String(rawItem.custom_name || "").trim();
  const exercise = exerciseMap.get(exerciseName);
  const trackingMode = exercise?.tracking_mode ? normalizeTrackingMode(exercise.tracking_mode) : "";
  const sets = (Array.isArray(rawItem.sets) ? rawItem.sets : [])
    .map((set) => normalizePerformedSet(set, trackingMode))
    .filter((set) => Object.keys(set).length > 0);

  const normalized = {
    exercise_name: exerciseName,
    custom_name: customName,
    work_mode: normalizeWorkMode(rawItem.work_mode),
    work_type: normalizeWorkType(rawItem.work_type),
    notes: String(rawItem.notes || "").trim(),
    sets,
    used_equipment: Array.isArray(rawItem.used_equipment) ? rawItem.used_equipment : [],
  };

  return Object.fromEntries(
    Object.entries(normalized).filter(([, value]) => value !== "" && value !== null && !(Array.isArray(value) && !value.length)),
  );
}

export function normalizePerformedItems(rawItems = [], exercises = []) {
  const exerciseMap = buildExerciseMap(exercises);
  return (Array.isArray(rawItems) ? rawItems : [])
    .map((item) => normalizePerformedItem(item, exerciseMap))
    .filter((item) => item.exercise_name || item.custom_name || item.sets?.length);
}

export function createBlankStrengthItem() {
  return {
    exercise_name: "",
    custom_name: "",
    work_mode: "normal",
    work_type: "resistance",
    notes: "",
    sets: [],
    used_equipment: [],
  };
}

export function createBlankSetDraft(trackingMode = "reps_weight", weightUnit = "kg") {
  if (normalizeTrackingMode(trackingMode) === "time_watts") {
    return { duration_sec: "", watts: "" };
  }
  return { reps: "", weight: "", weight_unit: normalizeWeightUnit(weightUnit) };
}

export function getUniqueExerciseNames(items = []) {
  const seen = new Set();
  const names = [];
  for (const item of Array.isArray(items) ? items : []) {
    const name = String(item?.exercise_name || "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

export function formatDurationSeconds(value) {
  const totalSeconds = normalizeOptionalInt(value) || 0;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatPerformedSet(set = {}) {
  if (set.duration_sec !== undefined || set.watts !== undefined) {
    const duration = set.duration_sec !== undefined ? formatDurationSeconds(set.duration_sec) : "time";
    const watts = set.watts !== undefined ? `${set.watts} W` : "";
    return [duration, watts].filter(Boolean).join(" @ ");
  }

  const reps = set.reps !== undefined ? `${set.reps} rep${Number(set.reps) === 1 ? "" : "s"}` : "reps";
  const weight = set.weight !== undefined ? `${set.weight} ${normalizeWeightUnit(set.weight_unit)}` : "";
  return [reps, weight].filter(Boolean).join(" x ");
}
