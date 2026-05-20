export const STAT_METRICS = [
  { key: "activity_count", label: "Activities", unit: "" },
  { key: "duration_min", label: "Duration", unit: "min" },
  { key: "distance_km", label: "Distance", unit: "km" },
  { key: "avg_power", label: "Average power", unit: "W" },
  { key: "max_power", label: "Max power", unit: "W" },
  { key: "avg_hr", label: "Average heart rate", unit: "bpm" },
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "strength_items", label: "Strength exercises", unit: "" },
  { key: "sets", label: "Sets", unit: "" },
  { key: "total_reps", label: "Reps", unit: "" },
  { key: "volume_kg", label: "Volume", unit: "kg" },
];

const SUM_METRICS = new Set(["activity_count", "duration_min", "distance_km", "calories", "strength_items", "sets", "total_reps", "volume_kg"]);

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

function addActivityMetrics(target, activity = {}) {
  target.activity_count += 1;
  target.strength_items += Array.isArray(activity.performed_items) ? activity.performed_items.length : Number(activity.performed_count || 0) || 0;

  for (const item of Array.isArray(activity.performed_items) ? activity.performed_items : []) {
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
    target.calories += readMetric(metrics, "calories", "total");
    target.avgPowerValues.push(readMetric(metrics, "power", "avg"));
    target.max_power = Math.max(target.max_power, readMetric(metrics, "power", "max"));
    target.avgHrValues.push(readMetric(metrics, "heart_rate", "avg"));
  }
}

function createBucket(label) {
  return {
    label,
    activity_count: 0,
    duration_min: 0,
    distance_km: 0,
    avg_power: 0,
    max_power: 0,
    avg_hr: 0,
    calories: 0,
    strength_items: 0,
    sets: 0,
    total_reps: 0,
    volume_kg: 0,
    avgPowerValues: [],
    avgHrValues: [],
  };
}

function finalizeBucket(bucket) {
  const avgPowerValues = bucket.avgPowerValues.filter((value) => value > 0);
  const avgHrValues = bucket.avgHrValues.filter((value) => value > 0);
  return {
    ...bucket,
    avg_power: avgPowerValues.length ? avgPowerValues.reduce((sum, value) => sum + value, 0) / avgPowerValues.length : 0,
    avg_hr: avgHrValues.length ? avgHrValues.reduce((sum, value) => sum + value, 0) / avgHrValues.length : 0,
    avgPowerValues: undefined,
    avgHrValues: undefined,
  };
}

function getActivityEntries(row = {}) {
  if (Array.isArray(row.activity_entries) && row.activity_entries.length) return row.activity_entries;
  if (Number(row.activity_count || 0) > 0 || row.activity_type || row.activity_details) {
    return [{ activity_type: row.activity_type, details: row.activity_details, source_files: row.source_files || [] }];
  }
  return [];
}

export function buildDailyStats(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const bucket = createBucket(row.date || "");
      for (const activity of getActivityEntries(row)) {
        addActivityMetrics(bucket, activity);
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
      if (metric.key === "avg_power" || metric.key === "avg_hr") continue;
      bucket[metric.key] += numberOrZero(row[metric.key]);
    }
    if (row.avg_power) bucket.avgPowerValues.push(row.avg_power);
    if (row.avg_hr) bucket.avgHrValues.push(row.avg_hr);
    buckets.set(month, bucket);
  }
  return Array.from(buckets.values()).map(finalizeBucket).sort((left, right) => left.label.localeCompare(right.label));
}

export function formatStatValue(value, metricKey) {
  const metric = getStatMetric(metricKey);
  const numberValue = numberOrZero(value);
  if (metricKey === "distance_km") return `${numberValue.toFixed(1)} ${metric.unit}`;
  if (metricKey === "duration_min") return `${Math.round(numberValue)} ${metric.unit}`;
  if (metricKey === "volume_kg") return `${Math.round(numberValue)} ${metric.unit}`;
  if (["avg_power", "max_power", "avg_hr", "calories"].includes(metricKey)) return `${Math.round(numberValue)} ${metric.unit}`;
  return String(Math.round(numberValue));
}

export function aggregateMetric(rows = [], metricKey) {
  const values = (Array.isArray(rows) ? rows : []).map((row) => numberOrZero(row[metricKey])).filter((value) => value > 0);
  if (!values.length) return 0;
  if (SUM_METRICS.has(metricKey)) return values.reduce((sum, value) => sum + value, 0);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
