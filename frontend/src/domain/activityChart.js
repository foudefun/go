export const ACTIVITY_CHART_METRICS = [
  { key: "heart_rate", field: "hr", label: "Heart rate", unit: "bpm", color: "#dc2626" },
  { key: "pace", label: "Pace", unit: "min/km", color: "#2563eb", invert: true },
  { key: "power", field: "power", label: "Power", unit: "W", color: "#ca8a04" },
  { key: "cadence", field: "cadence", label: "Cadence", unit: "rpm", color: "#7c3aed" },
  { key: "altitude", field: "altitude_m", label: "Altitude", unit: "m", color: "#059669" },
];

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function paceAt(points, index) {
  const current = points[index];
  const directSpeed = numeric(current.speed_mps);
  if (directSpeed && directSpeed > 0.5) return 1000 / directSpeed / 60;
  const currentTime = numeric(current.t);
  const currentDistance = numeric(current.distance_m);
  if (currentTime === null || currentDistance === null) return null;
  let previousIndex = index - 1;
  while (previousIndex > 0 && currentTime - Number(points[previousIndex].t || 0) < 20) previousIndex -= 1;
  const previous = points[previousIndex];
  const elapsed = currentTime - Number(previous?.t || 0);
  const distance = currentDistance - Number(previous?.distance_m || 0);
  if (elapsed <= 0 || distance < 5) return null;
  return (elapsed / 60) / (distance / 1000);
}

function percentile(sorted, ratio) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * ratio)))];
}

function downsample(points, maximum = 600) {
  if (points.length <= maximum) return points;
  const stride = Math.ceil(points.length / maximum);
  return points.filter((_, index) => index % stride === 0 || index === points.length - 1);
}

export function buildActivityChartSeries(activity) {
  const sources = Array.isArray(activity?.source_files) ? activity.source_files : [];
  return ACTIVITY_CHART_METRICS.map((definition) => {
    let best = [];
    for (const source of sources) {
      const rawPoints = Array.isArray(source?.series?.points) ? source.series.points : [];
      const values = rawPoints.map((point, index) => {
        const t = numeric(point.t);
        const value = definition.key === "pace" ? paceAt(rawPoints, index) : numeric(point[definition.field]);
        return t === null || value === null || (definition.key !== "altitude" && value <= 0) ? null : { t, value };
      }).filter(Boolean);
      if (values.length > best.length) best = values;
    }
    if (best.length < 2) return null;
    const sorted = best.map((point) => point.value).sort((left, right) => left - right);
    let minimum = percentile(sorted, 0.02);
    let maximum = percentile(sorted, 0.98);
    if (maximum <= minimum) maximum = minimum + 1;
    return { ...definition, minimum, maximum, points: downsample(best) };
  }).filter(Boolean);
}

export function formatActivityChartValue(key, value) {
  if (!Number.isFinite(value)) return "";
  if (key === "pace") {
    const totalSeconds = Math.round(value * 60);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")} /km`;
  }
  if (key === "heart_rate") return `${Math.round(value)} bpm`;
  if (key === "power") return `${Math.round(value)} W`;
  if (key === "cadence") return `${Math.round(value)} rpm`;
  if (key === "altitude") return `${Math.round(value)} m`;
  return String(Math.round(value));
}
