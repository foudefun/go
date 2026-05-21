import { useEffect, useMemo, useState } from "react";
import { getCalendar } from "../api/calendarApi.js";
import { getExercises } from "../api/exerciseApi.js";
import { ACTIVITY_TYPES, getActivityTypeLabel } from "../domain/activityTypes.js";
import { getExerciseLabel } from "../domain/exerciseLibrary.js";
import { useTranslation } from "../i18n/translations.js";
import {
  EXERCISE_STAT_METRICS,
  STAT_METRICS,
  aggregateMetric,
  buildDailyStats,
  buildExerciseDailyStats,
  buildExerciseMonthlyStats,
  buildMonthlyStats,
  formatStatValue,
  getAvailableStatisticActivityTypes,
  getAvailableStatisticExercises,
  getStatMetric,
} from "../domain/statistics.js";

function getLocalTodayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function shiftDateIso(dateIso, days) {
  const date = new Date(`${dateIso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function normalizeChartValue(row, metricKey) {
  const value = Number(row?.[metricKey] || 0);
  return Number.isFinite(value) ? value : 0;
}

function rowHasSelectedMetric(row, metricA, metricB) {
  return normalizeChartValue(row, metricA) > 0 || (metricB && normalizeChartValue(row, metricB) > 0);
}

function isWholeNumberMetric(metricKey) {
  return ["activity_count", "exercise_sessions", "strength_items", "sets", "total_reps", "calories"].includes(metricKey);
}

function buildAxisTicks(maxValue, metricKey) {
  const safeMax = Math.max(Number(maxValue) || 0, 1);
  if (isWholeNumberMetric(metricKey) && safeMax <= 6) {
    return Array.from({ length: Math.ceil(safeMax) + 1 }, (_, index) => index);
  }
  return [0, 0.25, 0.5, 0.75, 1].map((ratio) => safeMax * ratio);
}

function buildBarItems(rows, metricKey, maxValue, width, height, padding, offsetRatio, widthRatio) {
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const slotWidth = chartWidth / Math.max(rows.length, 1);
  const barWidth = Math.max(4, slotWidth * widthRatio);
  const baseY = height - padding.bottom;
  return rows.map((row, index) => {
    const value = normalizeChartValue(row, metricKey);
    const barHeight = (value / (maxValue || 1)) * chartHeight;
    const slotX = padding.left + index * slotWidth;
    return {
      x: slotX + slotWidth * offsetRatio - barWidth / 2,
      y: baseY - barHeight,
      width: barWidth,
      height: barHeight,
      value,
      label: row.label,
      labelX: slotX + slotWidth / 2,
    };
  });
}

function StatsChart({ rows, metricA, metricB, t }) {
  const width = 900;
  const height = 360;
  const padding = { top: 30, right: metricB ? 82 : 42, bottom: 58, left: 64 };
  const chartRows = rows;

  if (!chartRows.length) {
    return <div className="empty-state compact">{t("No data for the selected variables.")}</div>;
  }

  const maxValueA = Math.max(...chartRows.map((row) => normalizeChartValue(row, metricA)), 1);
  const maxValueB = metricB ? Math.max(...chartRows.map((row) => normalizeChartValue(row, metricB)), 1) : 0;
  const axisTicksA = buildAxisTicks(maxValueA, metricA);
  const barsA = buildBarItems(chartRows, metricA, maxValueA, width, height, padding, metricB ? 0.38 : 0.5, metricB ? 0.32 : 0.52);
  const barsB = metricB ? buildBarItems(chartRows, metricB, maxValueB, width, height, padding, 0.62, 0.32) : [];
  const xLabels = chartRows.filter((_, index) => index === 0 || index === chartRows.length - 1 || index % Math.ceil(chartRows.length / 6) === 0);
  const metricALabel = t(getStatMetric(metricA).label);
  const metricBLabel = metricB ? t(getStatMetric(metricB).label) : "";

  return (
    <div className="stats-chart-frame">
      <div className="chart-legend-row">
        <span><i className="legend-dot primary" />{metricALabel} · max {formatStatValue(maxValueA, metricA)}</span>
        {metricB ? <span><i className="legend-dot secondary" />{metricBLabel} · max {formatStatValue(maxValueB, metricB)}</span> : null}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t("Statistics chart")}>
        <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} className="chart-axis" />
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} className="chart-axis" />
        {axisTicksA.map((valueA) => {
          const ratio = maxValueA ? valueA / maxValueA : 0;
          const y = height - padding.bottom - (height - padding.top - padding.bottom) * ratio;
          const valueB = maxValueB * ratio;
          return (
            <g key={valueA}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} className="chart-grid-line" />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" className="chart-label primary">{formatStatValue(valueA, metricA)}</text>
              {metricB ? <text x={width - padding.right + 8} y={y + 4} textAnchor="start" className="chart-label secondary">{formatStatValue(valueB, metricB)}</text> : null}
            </g>
          );
        })}
        {barsA.map((bar) => (
          <rect key={`${bar.label}-a`} x={bar.x} y={bar.y} width={bar.width} height={bar.height} rx="4" className="chart-bar primary">
            <title>{`${bar.label} - ${metricALabel}: ${formatStatValue(bar.value, metricA)}`}</title>
          </rect>
        ))}
        {barsB.map((bar) => (
          <rect key={`${bar.label}-b`} x={bar.x} y={bar.y} width={bar.width} height={bar.height} rx="4" className="chart-bar secondary">
            <title>{`${bar.label} - ${metricBLabel}: ${formatStatValue(bar.value, metricB)}`}</title>
          </rect>
        ))}
        {xLabels.map((row) => {
          const bar = barsA.find((item) => item.label === row.label) || barsB.find((item) => item.label === row.label);
          return bar ? (
            <text key={row.label} x={bar.labelX} y={height - 18} textAnchor="middle" className="chart-label">
              {row.label}
            </text>
          ) : null;
        })}
      </svg>
    </div>
  );
}

export default function StatisticsPage() {
  const { language, t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [statsMode, setStatsMode] = useState("activities");
  const [period, setPeriod] = useState("daily");
  const [metricA, setMetricA] = useState("duration_min");
  const [metricB, setMetricB] = useState("distance_km");
  const [activityType, setActivityType] = useState("");
  const [exerciseName, setExerciseName] = useState("");
  const today = getLocalTodayIso();
  const [startDate, setStartDate] = useState(shiftDateIso(today, -180));
  const [endDate, setEndDate] = useState(today);

  useEffect(() => {
    let mounted = true;
    setStatus("loading");
    setError("");
    getCalendar({ startDate, endDate })
      .then((payload) => {
        if (!mounted) return;
        setRows(Array.isArray(payload) ? payload : []);
        setStatus("ready");
      })
      .catch((statsError) => {
        if (!mounted) return;
        setError(statsError.message);
        setStatus("error");
      });
    return () => {
      mounted = false;
    };
  }, [startDate, endDate]);

  useEffect(() => {
    let mounted = true;
    getExercises()
      .then((payload) => {
        if (!mounted) return;
        setExercises(Array.isArray(payload) ? payload : []);
      })
      .catch(() => {
        if (!mounted) return;
        setExercises([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const availableActivityTypes = useMemo(() => {
    const values = getAvailableStatisticActivityTypes(rows);
    return ACTIVITY_TYPES.filter((type) => values.has(type.value));
  }, [rows]);
  const availableExerciseNames = useMemo(() => getAvailableStatisticExercises(rows), [rows]);
  const exerciseOptions = useMemo(() => {
    const knownNames = new Set(exercises.map((exercise) => exercise.name));
    const catalogOptions = exercises
      .filter((exercise) => availableExerciseNames.has(exercise.name))
      .map((exercise) => ({ name: exercise.name, label: getExerciseLabel(exercise, language) }));
    const customOptions = Array.from(availableExerciseNames)
      .filter((name) => !knownNames.has(name))
      .map((name) => ({ name, label: name.replaceAll("_", " ") }));
    return [...catalogOptions, ...customOptions].sort((left, right) => left.label.localeCompare(right.label));
  }, [availableExerciseNames, exercises, language]);
  const selectedExerciseName = exerciseName || exerciseOptions[0]?.name || "";
  const selectedExercise = exercises.find((exercise) => exercise.name === selectedExerciseName);
  const selectedExerciseLabel = selectedExercise ? getExerciseLabel(selectedExercise, language) : selectedExerciseName.replaceAll("_", " ");
  const availableMetrics = statsMode === "exercises" ? EXERCISE_STAT_METRICS : STAT_METRICS;
  const safeMetricA = availableMetrics.some((metric) => metric.key === metricA) ? metricA : availableMetrics[0].key;
  const safeMetricB = metricB && availableMetrics.some((metric) => metric.key === metricB) ? metricB : "";
  const dailyRows = useMemo(
    () => (statsMode === "exercises" ? buildExerciseDailyStats(rows, selectedExerciseName) : buildDailyStats(rows, activityType)),
    [activityType, rows, selectedExerciseName, statsMode],
  );
  const monthlyRows = useMemo(
    () => (statsMode === "exercises" ? buildExerciseMonthlyStats(dailyRows) : buildMonthlyStats(dailyRows)),
    [dailyRows, statsMode],
  );
  const chartRows = period === "monthly" ? monthlyRows : dailyRows;
  const plottedRows = useMemo(() => chartRows.filter((row) => rowHasSelectedMetric(row, safeMetricA, safeMetricB)), [chartRows, safeMetricA, safeMetricB]);
  const selectedActivityLabel = activityType ? t(getActivityTypeLabel(activityType)) : t("All types");
  const summaryRows = [
    { metric: safeMetricA, value: aggregateMetric(chartRows, safeMetricA) },
    safeMetricB ? { metric: safeMetricB, value: aggregateMetric(chartRows, safeMetricB) } : null,
  ].filter(Boolean);

  useEffect(() => {
    if (statsMode !== "exercises") return;
    if (exerciseName && exerciseOptions.some((exercise) => exercise.name === exerciseName)) return;
    setExerciseName(exerciseOptions[0]?.name || "");
  }, [exerciseName, exerciseOptions, statsMode]);

  return (
    <main className="page-shell">
      <section className="module-header">
        <div>
          <p className="eyebrow">{t("Training")}</p>
          <h1>{t("Statistics")}</h1>
        </div>
      </section>

      <section className="app-panel statistics-toolbar">
        <label>
          {t("From")}
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </label>
        <label>
          {t("To")}
          <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </label>
        <label>
          {t("Stats mode")}
          <select
            value={statsMode}
            onChange={(event) => {
              const nextMode = event.target.value;
              setStatsMode(nextMode);
              setMetricA(nextMode === "exercises" ? "volume_kg" : "duration_min");
              setMetricB(nextMode === "exercises" ? "heaviest_weight" : "distance_km");
            }}
          >
            <option value="activities">{t("Activities")}</option>
            <option value="exercises">{t("Exercises")}</option>
          </select>
        </label>
        <label>
          {t("View")}
          <select value={period} onChange={(event) => setPeriod(event.target.value)}>
            <option value="daily">{t("Daily")}</option>
            <option value="monthly">{t("Monthly")}</option>
          </select>
        </label>
        <label>
          {t("Activity Type")}
          <select value={activityType} disabled={statsMode === "exercises"} onChange={(event) => setActivityType(event.target.value)}>
            <option value="">{t("All types")}</option>
            {availableActivityTypes.map((type) => (
              <option value={type.value} key={type.value}>
                {t(getActivityTypeLabel(type.value))}
              </option>
            ))}
          </select>
        </label>
        {statsMode === "exercises" ? (
          <label>
            {t("Exercise")}
            <select value={selectedExerciseName} onChange={(event) => setExerciseName(event.target.value)}>
              {!exerciseOptions.length ? <option value="">{t("No data")}</option> : null}
              {exerciseOptions.map((exercise) => (
                <option value={exercise.name} key={exercise.name}>{exercise.label}</option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          {t("Variable 1")}
          <select value={safeMetricA} onChange={(event) => setMetricA(event.target.value)}>
            {availableMetrics.map((metric) => (
              <option value={metric.key} key={metric.key}>{t(metric.label)}</option>
            ))}
          </select>
        </label>
        <label>
          {t("Variable 2")}
          <select value={safeMetricB} onChange={(event) => setMetricB(event.target.value)}>
            <option value="">{t("None")}</option>
            {availableMetrics.map((metric) => (
              <option value={metric.key} key={metric.key}>{t(metric.label)}</option>
            ))}
          </select>
        </label>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}
      {status === "loading" ? <div className="empty-state">{t("Loading statistics...")}</div> : null}

      <section className="stats-summary-grid">
        {summaryRows.map((row) => (
          <article className="app-panel stats-summary-card" key={row.metric}>
            <span>{t(getStatMetric(row.metric).label)}</span>
            <strong>{formatStatValue(row.value, row.metric)}</strong>
          </article>
        ))}
      </section>

      <section className="app-panel statistics-chart-panel">
        <div className="chart-header">
          <div>
            <p className="eyebrow">{period === "monthly" ? t("Monthly evolution") : t("Daily evolution")}</p>
            <h2>{t(getStatMetric(safeMetricA).label)}{safeMetricB ? ` / ${t(getStatMetric(safeMetricB).label)}` : ""}</h2>
            <span className="muted-text">{statsMode === "exercises" ? selectedExerciseLabel : selectedActivityLabel}</span>
          </div>
          <span>{t("Rows visible", { count: plottedRows.length })}</span>
        </div>
        <StatsChart rows={plottedRows} metricA={safeMetricA} metricB={safeMetricB} t={t} />
      </section>
    </main>
  );
}
