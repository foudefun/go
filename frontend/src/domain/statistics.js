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

const SUM_METRICS = new Set(["activity_count", "duration_min", "distance_km", "calories", "strength_items", "sets", "total_reps", "volume_kg"]);
const CYCLING_TOKENS = ["bike", "biking", "cycle", "cycling", "velo", "vélo", "zwift", "mywhoosh", "trainer", "erg"];

export function getStatMetric(key) {
  return STAT_METRICS.find((metric) => metric.key === key) || STAT_METRICS[0];
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

function normalizedText(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isCyclingStrengthItem(item = {}) {
  const text = normalizedText([item.exercise_name, item.custom_name, item.notes].filter(Boolean).join(" "));
  return CYCLING_TOKENS.some((token) => text.includes(normalizedText(token)));
}

function activityMatchesType(activity = {}, activityType = "") {
  if (!activityType) return true;
  if (activity.activity_type === activityType) return true;
  if (activityType === "velo" && activity.activity_type === "musculation") {
    return (Array.isArray(activity.performed_items) ? activity.performed_items : []).some(isCyclingStrengthItem);
  }
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

  const sourceFiles = Array.isArray(activity.source_files) ? activity.source_files : [];
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

export function formatStatValue(value, metricKey) {
  const metric = getStatMetric(metricKey);
  const numberValue = numberOrZero(value);
  if (metricKey === "distance_km") return `${numberValue.toFixed(1)} ${metric.unit}`;
  if (metricKey === "pace_min_km") return numberValue ? `${numberValue.toFixed(1)} ${metric.unit}` : `0 ${metric.unit}`;
  if (metricKey === "speed_kmh") return `${numberValue.toFixed(1)} ${metric.unit}`;
  if (metricKey === "duration_min") return `${Math.round(numberValue)} ${metric.unit}`;
  if (metricKey === "volume_kg") return `${Math.round(numberValue)} ${metric.unit}`;
  if (["power", "avg_power", "max_power", "avg_hr", "max_hr", "avg_cadence", "calories"].includes(metricKey)) return `${Math.round(numberValue)} ${metric.unit}`;
  return String(Math.round(numberValue));
}

export function aggregateMetric(rows = [], metricKey) {
  const values = (Array.isArray(rows) ? rows : []).map((row) => numberOrZero(row[metricKey])).filter((value) => value > 0);
  if (!values.length) return 0;
  if (SUM_METRICS.has(metricKey)) return values.reduce((sum, value) => sum + value, 0);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
