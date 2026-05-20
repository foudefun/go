export const TRACKING_MODES = [
  { value: "reps_weight", label: "Reps and weight" },
  { value: "time_watts", label: "Time and watts" },
];

export const WEIGHT_UNITS = [
  { value: "kg", label: "kg" },
  { value: "lb", label: "lb" },
];

export const DEFAULT_EXERCISE_CATEGORIES = ["plyométrie"];

export function blankExercise() {
  return {
    name: "",
    display_name: "",
    display_name_fr: "",
    display_name_en: "",
    category: "",
    movement_family: "",
    variant_label: "",
    tracking_mode: "reps_weight",
    weight_unit: "kg",
    description: "",
    link: "",
    image: "",
    images: [],
    document: "",
    primary_muscles: [],
    secondary_muscles: [],
    stabilizers: [],
    muscle_notes_fr: "",
    muscle_notes_en: "",
  };
}

export function normalizeExerciseDraft(exercise = {}) {
  const next = { ...blankExercise(), ...exercise };
  next.name = String(next.name || "").trim();
  next.display_name = String(next.display_name || "").trim();
  next.display_name_fr = String(next.display_name_fr || "").trim();
  next.display_name_en = String(next.display_name_en || "").trim();
  next.category = String(next.category || "").trim();
  next.movement_family = String(next.movement_family || "").trim();
  next.variant_label = String(next.variant_label || "").trim();
  next.tracking_mode = next.tracking_mode === "time_watts" ? "time_watts" : "reps_weight";
  next.weight_unit = next.weight_unit === "lb" ? "lb" : "kg";
  next.description = String(next.description || "").trim();
  next.link = String(next.link || "").trim();
  next.image = String(next.image || "").trim();
  next.images = Array.isArray(next.images) ? next.images.filter(Boolean) : [];
  next.document = String(next.document || "").trim();
  next.primary_muscles = normalizeMuscleNameList(next.primary_muscles);
  next.secondary_muscles = normalizeMuscleNameList(next.secondary_muscles);
  next.stabilizers = normalizeMuscleNameList(next.stabilizers);
  next.muscle_notes_fr = String(next.muscle_notes_fr || "").trim();
  next.muscle_notes_en = String(next.muscle_notes_en || "").trim();
  return next;
}

export function normalizeMuscleNameList(value = []) {
  const rawItems = Array.isArray(value) ? value : String(value || "").replaceAll(";", ",").split(",");
  const seen = new Set();
  return rawItems
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .map((item) => slugifyExerciseName(item))
    .filter((item) => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    });
}

export function formatMuscleName(value = "") {
  return String(value || "").replaceAll("_", " ").trim();
}

export function getMuscleLabel(muscle = {}, language = "en") {
  if (typeof muscle === "string") return formatMuscleName(muscle);
  const localized = language === "fr" ? muscle.display_name_fr : muscle.display_name_en;
  return String(localized || muscle.display_name_en || muscle.display_name_fr || formatMuscleName(muscle.name)).trim();
}

export function muscleListToText(value = []) {
  return normalizeMuscleNameList(value).map(formatMuscleName).join(", ");
}

export function getExerciseLabel(exercise = {}, language = "en") {
  const localizedName =
    language === "fr"
      ? String(exercise.display_name_fr || "").trim()
      : String(exercise.display_name_en || "").trim();
  return (
    localizedName ||
    String(exercise.display_name || "").trim() ||
    String(exercise.display_name_en || "").trim() ||
    String(exercise.display_name_fr || "").trim() ||
    String(exercise.name || "").replaceAll("_", " ").trim() ||
    "Unnamed exercise"
  );
}

export function slugifyExerciseName(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeExerciseSearchValue(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getExerciseSearchText(exercise = {}) {
  const technicalName = String(exercise.name || "").trim();
  return normalizeExerciseSearchValue([
    exercise.name,
    technicalName.replaceAll("_", " "),
    exercise.display_name,
    exercise.display_name_fr,
    exercise.display_name_en,
    exercise.category,
    exercise.movement_family,
    exercise.variant_label,
    exercise.description,
    exercise.primary_muscles,
    exercise.secondary_muscles,
    exercise.stabilizers,
    exercise.muscle_notes_fr,
    exercise.muscle_notes_en,
  ].join(" "));
}

export function getExerciseCategoryList(exercise = {}) {
  return String(exercise.category || "")
    .split(",")
    .map((category) => category.trim())
    .filter(Boolean);
}

export function getExerciseCategories(exercises = []) {
  const discoveredCategories = (Array.isArray(exercises) ? exercises : [])
    .flatMap((exercise) => getExerciseCategoryList(exercise));
  return Array.from(
    new Set(DEFAULT_EXERCISE_CATEGORIES.concat(discoveredCategories)),
  ).sort((left, right) => left.localeCompare(right));
}

export function filterExercises(exercises = [], filters = {}) {
  const query = normalizeExerciseSearchValue(filters.query || "");
  const category = String(filters.category || "").trim();
  const trackingMode = String(filters.trackingMode || "").trim();

  return (Array.isArray(exercises) ? exercises : [])
    .filter((exercise) => {
      if (category && !getExerciseCategoryList(exercise).includes(category)) return false;
      if (trackingMode && exercise.tracking_mode !== trackingMode) return false;
      if (!query) return true;
      return getExerciseSearchText(exercise).includes(query);
    })
    .sort((left, right) => getExerciseLabel(left, filters.language).localeCompare(getExerciseLabel(right, filters.language)));
}
