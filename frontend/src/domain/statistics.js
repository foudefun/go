export const STAT_METRICS = [
  { key: "activity_count", label: "Activities", unit: "" },
  { key: "duration_min", label: "Duration", unit: "min" },
  { key: "distance_km", label: "Distance", unit: "km" },
  { key: "power", label: "Power", unit: "W" },
  { key: "avg_power", label: "Average power", unit: "W" },
  { key: "max_power", label: "Max power", unit: "W" },
  { key: "avg_hr", label: "Average heart rate", unit: "bpm" },
  { key: "max_hr", label: "Max heart rate", unit: "bpm" },
  { key: "avg_cadence", label: "Average cadence", unit: "rpm" },
  { key: "speed_kmh", label: "Speed", unit: "km/h" },
  { key: "pace_min_km", label: "Pace", unit: "min/km" },
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "strength_items", label: "Strength exercises", unit: "" },
  { key: "sets", label: "Sets", unit: "" },
  { key: "total_reps", label: "Reps", unit: "" },
  { key: "volume_kg", label: "Volume", unit: "kg" },
];

export const EXERCISE_STAT_METRICS = [
  { key: "exercise_sessions", label: "Exercise sessions", unit: "" },
  { key: "sets", label: "Sets", unit: "" },
  { key: "total_reps", label: "Reps", unit: "" },
  { key: "volume_kg", label: "Volume", unit: "kg" },
  { key: "heaviest_weight", label: "Heaviest", unit: "kg" },
  { key: "estimated_1rm", label: "Estimated 1RM", unit: "kg" },
  { key: "duration_min", label: "Duration", unit: "min" },
  { key: "avg_power", label: "Average power", unit: "W" },
  { key: "max_power", label: "Max power", unit: "W" },
];

const SUM_METRICS = new Set(["activity_count", "duration_min", "distance_km", "calories", "strength_items", "sets", "total_reps", "volume_kg"]);
const EXERCISE_SUM_METRICS = new Set(["exercise_sessions", "duration_min", "sets", "total_reps", "volume_kg"]);
const CYCLING_TOKENS = ["bike", "biking", "cycle", "cycling", "velo", "vélo", "zwift", "mywhoosh", "trainer", "erg"];
const ACTIVITY_TYPE_ALIASES = new Map([
  ["run", "course_a_pied"],
  ["running", "course_a_pied"],
  ["course", "course_a_pied"],
  ["course a pied", "course_a_pied"],
  ["course_a_pied", "course_a_pied"],
  ["bike", "velo"],
  ["biking", "velo"],
  ["cycle", "velo"],
  ["cycling", "velo"],
  ["velo", "velo"],
  ["vtt", "vtt"],
  ["mtb", "vtt"],
  ["mountain bike", "vtt"],
  ["hockey", "hockey"],
  ["climb", "escalade"],
  ["climbing", "escalade"],
  ["escalade", "escalade"],
  ["outdoor climbing", "outdoor_climbing"],
  ["outdoor_climbing", "outdoor_climbing"],
  ["hangboard", "hangboard"],
  ["strength", "musculation"],
  ["musculation", "musculation"],
  ["workout", "musculation"],
  ["yoga", "yoga"],
  ["pilates", "pilates"],
]);

export function getStatMetric(key) {
  return STAT_METRICS.find((metric) => metric.key === key) || EXERCISE_STAT_METRICS.find((metric) => metric.key === key) || STAT_METRICS[0];
}

function numberOrZero(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function readMetric(metrics = {}, metricKey, valueKey) {
  const metric = metrics?.[metricKey];
  if (!metric || typeof metric !== "object") return 0;
  return numberOrZero(metric[valueKey]);
}

function readFirstNumber(text = "", pattern) {
  const match = String(text || "").match(pattern);
  if (!match) return 0;
  return numberOrZero(String(match[1] || "").replace(",", "."));
}

function parseDurationSeconds(value = "") {
  const parts = String(value || "").split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function parseActivityDetailsMetrics(details = "") {
  const text = String(details || "");
  const durationMatch = text.match(/Durée\s*([0-9]{1,3}:[0-9]{2}(?::[0-9]{2})?)/i);
  return {
    duration_min: durationMatch ? parseDurationSeconds(durationMatch[1]) / 60 : 0,
    distance_km: readFirstNumber(text, /Distance\s*([0-9]+(?:[.,][0-9]+)?)\s*km/i),
    avg_power: readFirstNumber(text, /Puissance\s*moy\.?\s*([0-9]+(?:[.,][0-9]+)?)\s*W/i),
    max_power: readFirstNumber(text, /Puissance\s*max\s*([0-9]+(?:[.,][0-9]+)?)\s*W/i),
    avg_hr: readFirstNumber(text, /FC\s*moy\.?\s*([0-9]+(?:[.,][0-9]+)?)\s*bpm/i),
    max_hr: readFirstNumber(text, /FC\s*max\s*([0-9]+(?:[.,][0-9]+)?)\s*bpm/i),
    avg_cadence: readFirstNumber(text, /Cadence\s*moy\.?\s*([0-9]+(?:[.,][0-9]+)?)\s*rpm/i),
    calories: readFirstNumber(text, /Calories\s*([0-9]+(?:[.,][0-9]+)?)/i),
  };
}

function normalizedText(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeActivityTypeValue(value = "") {
  const normalized = normalizedText(value).replace(/[^a-z0-9_]+/g, " ").trim();
  return ACTIVITY_TYPE_ALIASES.get(normalized) || ACTIVITY_TYPE_ALIASES.get(normalized.replaceAll(" ", "_")) || "";
}

function isCyclingStrengthItem(item = {}) {
  const text = normalizedText([item.exercise_name, item.custom_name, item.notes].filter(Boolean).join(" "));
  return CYCLING_TOKENS.some((token) => text.includes(normalizedText(token)));
}

function getSourceActivityType(source = {}) {
  const parsed = source?.parsed && typeof source.parsed === "object" ? source.parsed : {};
  return (
    normalizeActivityTypeValue(source.activity_type) ||
    normalizeActivityTypeValue(source.sport) ||
    normalizeActivityTypeValue(parsed.activity_type) ||
    normalizeActivityTypeValue(parsed.sport) ||
    normalizeActivityTypeValue(parsed.sub_sport) ||
    normalizeActivityTypeValue(source.provider) ||
    normalizeActivityTypeValue(source.label) ||
    normalizeActivityTypeValue(source.filename)
  );
}

function sourceMatchesType(source = {}, activityType = "") {
  return !activityType || getSourceActivityType(source) === activityType;
}

function activityMatchesType(activity = {}, activityType = "") {
  if (!activityType) return true;
  if (activity.activity_type === activityType) return true;
  if (activityType === "velo" && activity.activity_type === "musculation") {
    return (Array.isArray(activity.performed_items) ? activity.performed_items : []).some(isCyclingStrengthItem);
  }
  if ((Array.isArray(activity.source_files) ? activity.source_files : []).some((source) => sourceMatchesType(source, activityType))) return true;
  return false;
}

function getPerformedItemsForStats(activity = {}, activityType = "") {
  const items = Array.isArray(activity.performed_items) ? activity.performed_items : [];
  if (activityType === "velo" && activity.activity_type === "musculation") {
    return items.filter(isCyclingStrengthItem);
  }
  return items;
}

function addActivityMetrics(target, activity = {}, activityType = "") {
  target.activity_count += 1;
  const performedItems = getPerformedItemsForStats(activity, activityType);
  target.strength_items += performedItems.length || Number(activity.performed_count || 0) || 0;

  for (const item of performedItems) {
    for (const set of Array.isArray(item?.sets) ? item.sets : []) {
      target.sets += 1;
      target.total_reps += numberOrZero(set.reps);
      target.volume_kg += numberOrZero(set.reps) * numberOrZero(set.weight);
      target.duration_min += numberOrZero(set.duration_sec) / 60;
    }
  }

  const allSourceFiles = Array.isArray(activity.source_files) ? activity.source_files : [];
  const activityTypeMatches = !activityType || activity.activity_type === activityType;
  const sourceFiles = activityTypeMatches ? allSourceFiles : allSourceFiles.filter((source) => sourceMatchesType(source, activityType));
  const activityDetails = activity.activity_details || activity.details || "";
  if (!sourceFiles.length && activityTypeMatches && activityDetails) {
    const detailsMetrics = parseActivityDetailsMetrics(activityDetails);
    target.duration_min += detailsMetrics.duration_min;
    target.distance_km += detailsMetrics.distance_km;
    target.calories += detailsMetrics.calories;
    target.avgPowerValues.push(detailsMetrics.avg_power);
    target.max_power = Math.max(target.max_power, detailsMetrics.max_power);
    target.avgHrValues.push(detailsMetrics.avg_hr);
    target.max_hr = Math.max(target.max_hr, detailsMetrics.max_hr);
    target.avgCadenceValues.push(detailsMetrics.avg_cadence);
  }
  for (const source of sourceFiles) {
    const metrics = source?.metrics || {};
    target.duration_min += readMetric(metrics, "duration", "seconds") / 60;
    target.distance_km += readMetric(metrics, "distance", "km");
    target.calories += readMetric(metrics, "calories", "total") || readMetric(metrics, "calories", "value");
    target.avgPowerValues.push(readMetric(metrics, "power", "avg"));
    target.max_power = Math.max(target.max_power, readMetric(metrics, "power", "max"));
    target.avgHrValues.push(readMetric(metrics, "heart_rate", "avg"));
    target.max_hr = Math.max(target.max_hr, readMetric(metrics, "heart_rate", "max"));
    target.avgCadenceValues.push(readMetric(metrics, "cadence", "avg"));
  }
}

function createBucket(label) {
  return {
    label,
    activity_count: 0,
    duration_min: 0,
    distance_km: 0,
    avg_power: 0,
    power: 0,
    max_power: 0,
    avg_hr: 0,
    max_hr: 0,
    avg_cadence: 0,
    speed_kmh: 0,
    pace_min_km: 0,
    calories: 0,
    strength_items: 0,
    sets: 0,
    total_reps: 0,
    volume_kg: 0,
    avgPowerValues: [],
    avgHrValues: [],
    avgCadenceValues: [],
  };
}

function createExerciseBucket(label) {
  return {
    label,
    exercise_sessions: 0,
    sets: 0,
    total_reps: 0,
    volume_kg: 0,
    heaviest_weight: 0,
    estimated_1rm: 0,
    duration_min: 0,
    avg_power: 0,
    max_power: 0,
    powerValues: [],
  };
}

function finalizeBucket(bucket) {
  const avgPowerValues = bucket.avgPowerValues.filter((value) => value > 0);
  const avgHrValues = bucket.avgHrValues.filter((value) => value > 0);
  const avgCadenceValues = bucket.avgCadenceValues.filter((value) => value > 0);
  const speedKmh = bucket.distance_km && bucket.duration_min ? bucket.distance_km / (bucket.duration_min / 60) : 0;
  const paceMinKm = bucket.distance_km && bucket.duration_min ? bucket.duration_min / bucket.distance_km : 0;
  return {
    ...bucket,
    avg_power: avgPowerValues.length ? avgPowerValues.reduce((sum, value) => sum + value, 0) / avgPowerValues.length : 0,
    power: avgPowerValues.length ? avgPowerValues.reduce((sum, value) => sum + value, 0) / avgPowerValues.length : 0,
    avg_hr: avgHrValues.length ? avgHrValues.reduce((sum, value) => sum + value, 0) / avgHrValues.length : 0,
    avg_cadence: avgCadenceValues.length ? avgCadenceValues.reduce((sum, value) => sum + value, 0) / avgCadenceValues.length : 0,
    speed_kmh: speedKmh,
    pace_min_km: paceMinKm,
    avgPowerValues: undefined,
    avgHrValues: undefined,
    avgCadenceValues: undefined,
  };
}

function getActivityEntries(row = {}) {
  if (Array.isArray(row.activity_entries) && row.activity_entries.length) return row.activity_entries;
  if (Number(row.activity_count || 0) > 0 || row.activity_type || row.activity_details) {
    return [{ activity_type: row.activity_type, details: row.activity_details, source_files: row.source_files || [] }];
  }
  return [];
}

function getPerformedItems(activity = {}) {
  return Array.isArray(activity.performed_items) ? activity.performed_items : [];
}

function getAllPerformedItemsForRow(row = {}) {
  return getActivityEntries(row).flatMap(getPerformedItems);
}

function getExerciseItemName(item = {}) {
  return String(item.exercise_name || item.custom_name || "").trim();
}

function itemMatchesExercise(item = {}, exerciseName = "") {
  return getExerciseItemName(item) === exerciseName;
}

function estimateOneRepMax(weight, reps) {
  const safeWeight = numberOrZero(weight);
  const safeReps = numberOrZero(reps);
  if (!safeWeight || !safeReps) return 0;
  return safeWeight * (1 + safeReps / 30);
}

function addExerciseItemMetrics(bucket, item = {}) {
  bucket.exercise_sessions += 1;
  for (const set of Array.isArray(item.sets) ? item.sets : []) {
    bucket.sets += 1;
    const reps = numberOrZero(set.reps);
    const weight = numberOrZero(set.weight);
    const durationSec = numberOrZero(set.duration_sec);
    const watts = numberOrZero(set.watts);
    bucket.total_reps += reps;
    bucket.volume_kg += reps * weight;
    bucket.heaviest_weight = Math.max(bucket.heaviest_weight, weight);
    bucket.estimated_1rm = Math.max(bucket.estimated_1rm, estimateOneRepMax(weight, reps));
    bucket.duration_min += durationSec / 60;
    if (watts) {
      bucket.powerValues.push(watts);
      bucket.max_power = Math.max(bucket.max_power, watts);
    }
  }
}

function finalizeExerciseBucket(bucket) {
  const powerValues = bucket.powerValues.filter((value) => value > 0);
  return {
    ...bucket,
    avg_power: powerValues.length ? powerValues.reduce((sum, value) => sum + value, 0) / powerValues.length : 0,
    powerValues: undefined,
  };
}

export function getAvailableStatisticExercises(rows = []) {
  const names = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    for (const item of getAllPerformedItemsForRow(row)) {
      const name = getExerciseItemName(item);
      if (name) names.add(name);
    }
  }
  return names;
}

export function getAvailableStatisticActivityTypes(rows = []) {
  const values = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const directTypes = row.activity_types || (row.activity_type ? [row.activity_type] : []);
    for (const type of directTypes) {
      if (type) values.add(type);
    }
    for (const activity of getActivityEntries(row)) {
      if (activity.activity_type) values.add(activity.activity_type);
      for (const source of Array.isArray(activity.source_files) ? activity.source_files : []) {
        const sourceType = getSourceActivityType(source);
        if (sourceType) values.add(sourceType);
      }
      if (activity.activity_type === "musculation" && (Array.isArray(activity.performed_items) ? activity.performed_items : []).some(isCyclingStrengthItem)) {
        values.add("velo");
      }
    }
  }
  return values;
}

export function buildDailyStats(rows = [], activityType = "") {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const bucket = createBucket(row.date || "");
      for (const activity of getActivityEntries(row)) {
        if (!activityMatchesType(activity, activityType)) continue;
        addActivityMetrics(bucket, activity, activityType);
      }
      return finalizeBucket(bucket);
    })
    .filter((bucket) => bucket.label)
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function buildMonthlyStats(dailyRows = []) {
  const buckets = new Map();
  for (const row of Array.isArray(dailyRows) ? dailyRows : []) {
    const month = String(row.label || "").slice(0, 7);
    if (!month) continue;
    const bucket = buckets.get(month) || createBucket(month);
    for (const metric of STAT_METRICS) {
      if (["power", "avg_power", "avg_hr", "avg_cadence", "speed_kmh", "pace_min_km"].includes(metric.key)) continue;
      bucket[metric.key] += numberOrZero(row[metric.key]);
    }
    if (row.avg_power) bucket.avgPowerValues.push(row.avg_power);
    if (row.avg_hr) bucket.avgHrValues.push(row.avg_hr);
    if (row.avg_cadence) bucket.avgCadenceValues.push(row.avg_cadence);
    buckets.set(month, bucket);
  }
  return Array.from(buckets.values()).map(finalizeBucket).sort((left, right) => left.label.localeCompare(right.label));
}

export function buildExerciseDailyStats(rows = [], exerciseName = "") {
  if (!exerciseName) return [];
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const bucket = createExerciseBucket(row.date || "");
      for (const item of getAllPerformedItemsForRow(row).filter((performedItem) => itemMatchesExercise(performedItem, exerciseName))) {
        addExerciseItemMetrics(bucket, item);
      }
      return finalizeExerciseBucket(bucket);
    })
    .filter((bucket) => bucket.label)
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function buildExerciseMonthlyStats(dailyRows = []) {
  const buckets = new Map();
  for (const row of Array.isArray(dailyRows) ? dailyRows : []) {
    const month = String(row.label || "").slice(0, 7);
    if (!month) continue;
    const bucket = buckets.get(month) || createExerciseBucket(month);
    for (const metric of EXERCISE_STAT_METRICS) {
      if (["heaviest_weight", "estimated_1rm", "avg_power", "max_power"].includes(metric.key)) continue;
      bucket[metric.key] += numberOrZero(row[metric.key]);
    }
    bucket.heaviest_weight = Math.max(bucket.heaviest_weight, numberOrZero(row.heaviest_weight));
    bucket.estimated_1rm = Math.max(bucket.estimated_1rm, numberOrZero(row.estimated_1rm));
    bucket.max_power = Math.max(bucket.max_power, numberOrZero(row.max_power));
    if (row.avg_power) bucket.powerValues.push(row.avg_power);
    buckets.set(month, bucket);
  }
  return Array.from(buckets.values()).map(finalizeExerciseBucket).sort((left, right) => left.label.localeCompare(right.label));
}

export function formatStatValue(value, metricKey) {
  const metric = getStatMetric(metricKey);
  const numberValue = numberOrZero(value);
  if (metricKey === "distance_km") return `${numberValue.toFixed(1)} ${metric.unit}`;
  if (metricKey === "pace_min_km") return numberValue ? `${numberValue.toFixed(1)} ${metric.unit}` : `0 ${metric.unit}`;
  if (metricKey === "speed_kmh") return `${numberValue.toFixed(1)} ${metric.unit}`;
  if (metricKey === "duration_min") return `${Math.round(numberValue)} ${metric.unit}`;
  if (metricKey === "volume_kg") return `${Math.round(numberValue)} ${metric.unit}`;
  if (["heaviest_weight", "estimated_1rm"].includes(metricKey)) return `${numberValue.toFixed(1).replace(/\.0$/, "")} ${metric.unit}`;
  if (["power", "avg_power", "max_power", "avg_hr", "max_hr", "avg_cadence", "calories"].includes(metricKey)) return `${Math.round(numberValue)} ${metric.unit}`;
  return String(Math.round(numberValue));
}

export function aggregateMetric(rows = [], metricKey) {
  const values = (Array.isArray(rows) ? rows : []).map((row) => numberOrZero(row[metricKey])).filter((value) => value > 0);
  if (!values.length) return 0;
  if (SUM_METRICS.has(metricKey) || EXERCISE_SUM_METRICS.has(metricKey)) return values.reduce((sum, value) => sum + value, 0);
  if (["heaviest_weight", "estimated_1rm", "max_power"].includes(metricKey)) return Math.max(...values);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
