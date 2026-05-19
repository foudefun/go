export const WORK_MODES = [
  { value: "normal", label: "Normal" },
  { value: "superset", label: "Superset" },
  { value: "biset", label: "Biset" },
];

export const WORK_TYPES = [
  { value: "resistance", label: "Resistance" },
  { value: "explosive", label: "Explosive" },
  { value: "plyometric", label: "Plyometric" },
  { value: "force", label: "Force" },
  { value: "hypertrophy", label: "Hypertrophy" },
  { value: "mobility", label: "Mobility" },
  { value: "stability", label: "Stability / core" },
  { value: "conditioning", label: "Conditioning" },
  { value: "technique", label: "Technique" },
  { value: "unilateral", label: "Unilateral" },
  { value: "endurance", label: "Endurance" },
];

export const WORK_TYPE_DETAILS = {
  resistance: {
    description_fr: "Exercice avec charge légère à modérée ou effort prolongé, visant l’endurance musculaire et la capacité à répéter un mouvement.",
    description_en: "Exercise with light to moderate load or sustained effort, aimed at muscular endurance and repeated movement capacity.",
    reps_fr: "12–25+ reps ou effort long",
    reps_en: "12–25+ reps or sustained effort",
    load_fr: "30–60% 1RM",
    load_en: "30–60% 1RM",
  },
  explosive: {
    description_fr: "Exercice réalisé avec une intention de vitesse maximale, pour produire beaucoup de force très rapidement.",
    description_en: "Exercise performed with maximal speed intent, to produce high force very quickly.",
    reps_fr: "1–6 reps, qualité maximale",
    reps_en: "1–6 reps, maximal quality",
    load_fr: "30–70% 1RM selon l’exercice",
    load_en: "30–70% 1RM depending on the exercise",
  },
  plyometric: {
    description_fr: "Exercice basé sur un cycle rapide étirement-contraction, comme un saut ou un rebond, pour améliorer la réactivité et la puissance élastique.",
    description_en: "Exercise based on a rapid stretch-shortening cycle, such as a jump or rebound, to improve reactivity and elastic power.",
    reps_fr: "3–8 reps, repos complet",
    reps_en: "3–8 reps, full rest",
    load_fr: "Poids du corps, parfois 0–30% 1RM",
    load_en: "Bodyweight, sometimes 0–30% 1RM",
  },
  force: {
    description_fr: "Exercice avec charge lourde et peu de répétitions, visant à augmenter la force maximale.",
    description_en: "Exercise with heavy load and low repetitions, aimed at increasing maximal strength.",
    reps_fr: "1–6 reps, charge lourde",
    reps_en: "1–6 reps, heavy load",
    load_fr: "80–100% 1RM",
    load_en: "80–100% 1RM",
  },
  hypertrophy: {
    description_fr: "Exercice visant à augmenter le volume musculaire, généralement avec charge modérée à lourde.",
    description_en: "Exercise aimed at increasing muscle size, usually with moderate to heavy load.",
    reps_fr: "6–15 reps",
    reps_en: "6–15 reps",
    load_fr: "60–85% 1RM",
    load_en: "60–85% 1RM",
  },
  mobility: {
    description_fr: "Exercice visant à améliorer l’amplitude articulaire, le contrôle du mouvement et la qualité des positions.",
    description_en: "Exercise aimed at improving joint range of motion, movement control and positional quality.",
    reps_fr: "5–15 reps lentes ou 30–60 sec",
    reps_en: "5–15 slow reps or 30–60 sec",
    load_fr: "0–30% 1RM, souvent poids du corps",
    load_en: "0–30% 1RM, often bodyweight",
  },
  stability: {
    description_fr: "Exercice visant à renforcer le contrôle du tronc ou d’une articulation, afin de mieux transmettre la force.",
    description_en: "Exercise aimed at improving trunk or joint control, helping transfer force more efficiently.",
    reps_fr: "20–60 sec ou 6–12 reps contrôlées",
    reps_en: "20–60 sec or 6–12 controlled reps",
    load_fr: "0–50% 1RM, selon contrôle",
    load_en: "0–50% 1RM, depending on control",
  },
  conditioning: {
    description_fr: "Bloc d’effort visant à améliorer la capacité cardiovasculaire, la tolérance à l’effort et la récupération.",
    description_en: "Effort block aimed at improving cardiovascular capacity, work tolerance and recovery.",
    reps_fr: "Intervalles, par ex. 20 sec à 3 min",
    reps_en: "Intervals, e.g. 20 sec to 3 min",
    load_fr: "Variable, souvent poids du corps à 50% 1RM",
    load_en: "Variable, often bodyweight to 50% 1RM",
  },
  technique: {
    description_fr: "Exercice réalisé avec priorité sur la qualité du mouvement, le contrôle et la précision, plutôt que sur la charge.",
    description_en: "Exercise performed with priority on movement quality, control and precision, rather than load.",
    reps_fr: "3–8 reps propres, charge légère",
    reps_en: "3–8 clean reps, light load",
    load_fr: "30–60% 1RM",
    load_en: "30–60% 1RM",
  },
  unilateral: {
    description_fr: "Exercice réalisé principalement sur un côté du corps à la fois, utile pour corriger les déséquilibres.",
    description_en: "Exercise performed mainly on one side of the body at a time, useful to correct imbalances.",
    reps_fr: "6–15 reps / côté",
    reps_en: "6–15 reps / side",
    load_fr: "40–80% 1RM, selon stabilité",
    load_en: "40–80% 1RM, depending on stability",
  },
  endurance: {
    description_fr: "Travail long et léger pour construire la tolérance à l’effort.",
    description_en: "Long and light work to build effort tolerance.",
    reps_fr: "15–30+ reps ou effort long",
    reps_en: "15–30+ reps or sustained effort",
    load_fr: "30–60% 1RM",
    load_en: "30–60% 1RM",
  },
};

export function getWorkTypeDetail(value, language = "fr") {
  const normalizedValue = normalizeWorkType(value);
  const detail = WORK_TYPE_DETAILS[normalizedValue] || WORK_TYPE_DETAILS.resistance;
  return {
    description: detail[language === "en" ? "description_en" : "description_fr"],
    reps: detail[language === "en" ? "reps_en" : "reps_fr"],
    load: detail[language === "en" ? "load_en" : "load_fr"],
  };
}

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
