import { useEffect, useMemo, useState } from "react";
import { getCalendar } from "../api/calendarApi.js";
import { getExercises } from "../api/exerciseApi.js";
import { ACTIVITY_TYPES, getActivityTypeColor, getActivityTypeLabel } from "../domain/activityTypes.js";
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
  buildPowerDurationCurve,
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

function shiftMonthIso(dateIso, months) {
  const date = new Date(`${dateIso}T12:00:00`);
  const targetMonth = date.getMonth() + months;
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(targetMonth);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getYearStartIso(dateIso) {
  return `${String(dateIso || getLocalTodayIso()).slice(0, 4)}-01-01`;
}

function minDateIso(...values) {
  return values.filter(Boolean).sort()[0] || getLocalTodayIso();
}

function maxDateIso(...values) {
  const dates = values.filter(Boolean).sort();
  return dates[dates.length - 1] || getLocalTodayIso();
}

function getPowerPeriodRange(mode, customStart, customEnd, today) {
  if (mode === "inception") return { start: "2020-01-01", end: today };
  if (mode === "custom") return { start: customStart || today, end: customEnd || today };
  return { start: getYearStartIso(today), end: today };
}

function getComparePowerPeriodRange(mode, customStart, customEnd, today, primaryRange) {
  if (mode === "none") return null;
  if (mode === "previous_month") {
    return { start: shiftMonthIso(primaryRange.start, -1), end: shiftMonthIso(primaryRange.end, -1) };
  }
  if (mode === "previous_year") {
    return { start: shiftMonthIso(primaryRange.start, -12), end: shiftMonthIso(primaryRange.end, -12) };
  }
  return getPowerPeriodRange(mode, customStart, customEnd, today);
}

function normalizeChartValue(row, metricKey) {
  const value = Number(row?.[metricKey] || 0);
  return Number.isFinite(value) ? value : 0;
}

function rowHasSelectedMetric(row, metricA, metricB) {
  return normalizeChartValue(row, metricA) > 0 || (metricB && normalizeChartValue(row, metricB) > 0);
}

function buildStackedChartRows(baseRows, typedRowsByActivityType) {
  const rowsByLabel = new Map((Array.isArray(baseRows) ? baseRows : []).map((row) => [row.label, { ...row, stacks: {} }]));
  for (const [activityType, rows] of typedRowsByActivityType) {
    for (const row of rows) {
      const current = rowsByLabel.get(row.label) || { label: row.label, stacks: {} };
      current.stacks = { ...(current.stacks || {}), [activityType]: row };
      rowsByLabel.set(row.label, current);
    }
  }
  return Array.from(rowsByLabel.values()).sort((left, right) => String(left.label).localeCompare(String(right.label)));
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

function buildStackedBarItems(rows, metricKey, maxValue, width, height, padding, offsetRatio, widthRatio, stackTypes) {
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const slotWidth = chartWidth / Math.max(rows.length, 1);
  const barWidth = Math.max(4, slotWidth * widthRatio);
  const baseY = height - padding.bottom;
  return rows.flatMap((row, index) => {
    const slotX = padding.left + index * slotWidth;
    const x = slotX + slotWidth * offsetRatio - barWidth / 2;
    let stackedValue = 0;
    return stackTypes.flatMap((type) => {
      const value = normalizeChartValue(row.stacks?.[type.value], metricKey);
      if (!value) return [];
      const previousValue = stackedValue;
      stackedValue += value;
      const y = baseY - (stackedValue / (maxValue || 1)) * chartHeight;
      const segmentHeight = ((stackedValue - previousValue) / (maxValue || 1)) * chartHeight;
      return [{
        color: getActivityTypeColor(type.value),
        height: segmentHeight,
        label: row.label,
        labelX: slotX + slotWidth / 2,
        type,
        value,
        width: barWidth,
        x,
        y,
      }];
    });
  });
}

function StatsChart({ rows, metricA, metricB, stackTypes = [], t }) {
  const width = 900;
  const height = 360;
  const padding = { top: 30, right: metricB ? 82 : 42, bottom: 58, left: 64 };
  const chartRows = rows;
  const isStacked = stackTypes.length > 1;

  if (!chartRows.length) {
    return <div className="empty-state compact">{t("No data for the selected variables.")}</div>;
  }

  const maxValueA = Math.max(...chartRows.map((row) => normalizeChartValue(row, metricA)), 1);
  const maxValueB = metricB ? Math.max(...chartRows.map((row) => normalizeChartValue(row, metricB)), 1) : 0;
  const axisTicksA = buildAxisTicks(maxValueA, metricA);
  const barsA = isStacked
    ? buildStackedBarItems(chartRows, metricA, maxValueA, width, height, padding, metricB ? 0.38 : 0.5, metricB ? 0.32 : 0.52, stackTypes)
    : buildBarItems(chartRows, metricA, maxValueA, width, height, padding, metricB ? 0.38 : 0.5, metricB ? 0.32 : 0.52);
  const barsB = metricB
    ? (isStacked
      ? buildStackedBarItems(chartRows, metricB, maxValueB, width, height, padding, 0.62, 0.32, stackTypes)
      : buildBarItems(chartRows, metricB, maxValueB, width, height, padding, 0.62, 0.32))
    : [];
  const xLabels = chartRows.filter((_, index) => index === 0 || index === chartRows.length - 1 || index % Math.ceil(chartRows.length / 6) === 0);
  const metricALabel = t(getStatMetric(metricA).label);
  const metricBLabel = metricB ? t(getStatMetric(metricB).label) : "";

  return (
    <div className="stats-chart-frame">
      <div className="chart-legend-row">
        <span><i className="legend-dot primary" />{metricALabel} · max {formatStatValue(maxValueA, metricA)}</span>
        {metricB ? <span><i className="legend-dot secondary" />{metricBLabel} · max {formatStatValue(maxValueB, metricB)}</span> : null}
      </div>
      {isStacked ? (
        <div className="chart-legend-row stacked">
          {stackTypes.map((type) => (
            <span key={type.value}><i className="legend-dot" style={{ backgroundColor: getActivityTypeColor(type.value) }} />{t(getActivityTypeLabel(type.value))}</span>
          ))}
        </div>
      ) : null}
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
          <rect
            key={`${bar.label}-a-${bar.type?.value || "single"}`}
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={bar.height}
            rx={isStacked ? "0" : "4"}
            className="chart-bar primary"
            style={bar.color ? { fill: bar.color } : undefined}
          >
            <title>{`${bar.label} - ${bar.type ? `${t(getActivityTypeLabel(bar.type.value))} - ` : ""}${metricALabel}: ${formatStatValue(bar.value, metricA)}`}</title>
          </rect>
        ))}
        {barsB.map((bar) => (
          <rect
            key={`${bar.label}-b-${bar.type?.value || "single"}`}
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={bar.height}
            rx={isStacked ? "0" : "4"}
            className="chart-bar secondary"
            style={bar.color ? { fill: bar.color } : undefined}
          >
            <title>{`${bar.label} - ${bar.type ? `${t(getActivityTypeLabel(bar.type.value))} - ` : ""}${metricBLabel}: ${formatStatValue(bar.value, metricB)}`}</title>
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

function PowerDurationChart({ primaryRows, secondaryRows, primaryLabel, secondaryLabel, t }) {
  const width = 900;
  const height = 340;
  const padding = { top: 28, right: 34, bottom: 62, left: 64 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const allRows = [...primaryRows, ...secondaryRows];
  if (!primaryRows.length && !secondaryRows.length) {
    return <div className="empty-state compact">{t("No power curve data for this period.")}</div>;
  }
  const labels = Array.from(new Set(allRows.map((row) => row.label)));
  const maxPower = Math.max(...allRows.map((row) => Number(row.power || 0)), 1);
  const xForIndex = (index) => padding.left + (labels.length <= 1 ? chartWidth / 2 : (index / (labels.length - 1)) * chartWidth);
  const yForPower = (power) => height - padding.bottom - (Number(power || 0) / maxPower) * chartHeight;
  const pathForRows = (rows) =>
    rows
      .map((row) => {
        const index = labels.indexOf(row.label);
        return `${xForIndex(index).toFixed(1)},${yForPower(row.power).toFixed(1)}`;
      })
      .join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => maxPower * ratio);

  return (
    <div className="stats-chart-frame power-duration-chart">
      <div className="chart-legend-row">
        {primaryRows.length ? <span><i className="legend-dot primary" />{primaryLabel} - max {Math.round(Math.max(...primaryRows.map((row) => row.power)))} W</span> : null}
        {secondaryRows.length ? <span><i className="legend-dot secondary" />{secondaryLabel} - max {Math.round(Math.max(...secondaryRows.map((row) => row.power)))} W</span> : null}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t("Power duration curve")}>
        <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} className="chart-axis" />
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} className="chart-axis" />
        {ticks.map((tick) => {
          const y = yForPower(tick);
          return (
            <g key={tick}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} className="chart-grid-line" />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" className="chart-label primary">{Math.round(tick)} W</text>
            </g>
          );
        })}
        {primaryRows.length ? <polyline points={pathForRows(primaryRows)} className="chart-line primary" /> : null}
        {secondaryRows.length ? <polyline points={pathForRows(secondaryRows)} className="chart-line secondary" /> : null}
        {primaryRows.map((row) => {
          const index = labels.indexOf(row.label);
          return (
            <circle key={`primary-${row.label}`} cx={xForIndex(index)} cy={yForPower(row.power)} r="5" className="chart-point primary">
              <title>{`${row.label}: ${Math.round(row.power)} W - ${row.date} ${row.activity}`}</title>
            </circle>
          );
        })}
        {secondaryRows.map((row) => {
          const index = labels.indexOf(row.label);
          return (
            <circle key={`secondary-${row.label}`} cx={xForIndex(index)} cy={yForPower(row.power)} r="4" className="chart-point secondary">
              <title>{`${row.label}: ${Math.round(row.power)} W - ${row.date} ${row.activity}`}</title>
            </circle>
          );
        })}
        {labels.map((label, index) => (
          <text key={label} x={xForIndex(index)} y={height - 24} textAnchor="middle" className="chart-label">
            {label}
          </text>
        ))}
      </svg>
    </div>
  );
}

export default function StatisticsPage() {
  const { language, t } = useTranslation();
  const [allRows, setAllRows] = useState([]);
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
  const [powerPeriod, setPowerPeriod] = useState("ytd");
  const [powerStartDate, setPowerStartDate] = useState(getYearStartIso(today));
  const [powerEndDate, setPowerEndDate] = useState(today);
  const [comparePowerPeriod, setComparePowerPeriod] = useState("none");
  const [comparePowerStartDate, setComparePowerStartDate] = useState(shiftDateIso(getYearStartIso(today), -365));
  const [comparePowerEndDate, setComparePowerEndDate] = useState(shiftDateIso(today, -365));
  const primaryPowerRange = getPowerPeriodRange(powerPeriod, powerStartDate, powerEndDate, today);
  const comparePowerRange = getComparePowerPeriodRange(comparePowerPeriod, comparePowerStartDate, comparePowerEndDate, today, primaryPowerRange);
  const requestStartDate = minDateIso(startDate, primaryPowerRange.start, comparePowerRange?.start);
  const requestEndDate = maxDateIso(endDate, primaryPowerRange.end, comparePowerRange?.end);

  useEffect(() => {
    let mounted = true;
    setStatus("loading");
    setError("");
    getCalendar({ startDate: requestStartDate, endDate: requestEndDate })
      .then((payload) => {
        if (!mounted) return;
        setAllRows(Array.isArray(payload) ? payload : []);
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
  }, [requestStartDate, requestEndDate]);

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

  const rows = useMemo(() => allRows.filter((row) => String(row.date || "") >= startDate && String(row.date || "") <= endDate), [allRows, endDate, startDate]);
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
  const stackActivityTypes = useMemo(
    () => (statsMode === "activities" && !activityType ? availableActivityTypes : []),
    [activityType, availableActivityTypes, statsMode],
  );
  const stackedRows = useMemo(() => {
    if (!stackActivityTypes.length) return [];
    const typedRows = stackActivityTypes.map((type) => {
      const typedDailyRows = buildDailyStats(rows, type.value);
      return [type.value, period === "monthly" ? buildMonthlyStats(typedDailyRows) : typedDailyRows];
    });
    return buildStackedChartRows(chartRows, typedRows);
  }, [chartRows, period, rows, stackActivityTypes]);
  const visibleChartRows = stackActivityTypes.length
    ? stackedRows.filter((row) => rowHasSelectedMetric(row, safeMetricA, safeMetricB))
    : plottedRows;
  const selectedActivityLabel = activityType ? t(getActivityTypeLabel(activityType)) : t("All types");
  const showPowerCurve = statsMode === "activities" && activityType === "velo";
  const primaryPowerCurve = useMemo(
    () => (showPowerCurve ? buildPowerDurationCurve(allRows, { startDate: primaryPowerRange.start, endDate: primaryPowerRange.end }) : []),
    [allRows, primaryPowerRange.end, primaryPowerRange.start, showPowerCurve],
  );
  const comparePowerCurve = useMemo(
    () => (showPowerCurve && comparePowerRange ? buildPowerDurationCurve(allRows, { startDate: comparePowerRange.start, endDate: comparePowerRange.end }) : []),
    [allRows, comparePowerRange?.end, comparePowerRange?.start, showPowerCurve],
  );
  const primaryPowerLabel = `${primaryPowerRange.start} to ${primaryPowerRange.end}`;
  const comparePowerLabel = comparePowerRange ? `${comparePowerRange.start} to ${comparePowerRange.end}` : "";
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
          <span>{t("Rows visible", { count: visibleChartRows.length })}</span>
        </div>
        <StatsChart rows={visibleChartRows} metricA={safeMetricA} metricB={safeMetricB} stackTypes={stackActivityTypes} t={t} />
      </section>

      {showPowerCurve ? (
        <section className="app-panel statistics-chart-panel power-curve-panel">
          <div className="chart-header">
            <div>
              <p className="eyebrow">{t("Cycling")}</p>
              <h2>{t("Power duration curve")}</h2>
              <span className="muted-text">{t("Best average power by duration")}</span>
            </div>
          </div>
          <div className="power-curve-toolbar">
            <label>
              {t("Period")}
              <select value={powerPeriod} onChange={(event) => setPowerPeriod(event.target.value)}>
                <option value="inception">{t("Since inception")}</option>
                <option value="ytd">{t("Year to date")}</option>
                <option value="custom">{t("Custom period")}</option>
              </select>
            </label>
            {powerPeriod === "custom" ? (
              <>
                <label>
                  {t("From")}
                  <input type="date" value={powerStartDate} onChange={(event) => setPowerStartDate(event.target.value)} />
                </label>
                <label>
                  {t("To")}
                  <input type="date" value={powerEndDate} onChange={(event) => setPowerEndDate(event.target.value)} />
                </label>
              </>
            ) : null}
            <label>
              {t("Compare with")}
              <select value={comparePowerPeriod} onChange={(event) => setComparePowerPeriod(event.target.value)}>
                <option value="none">{t("None")}</option>
                <option value="previous_month">{t("1 month ago")}</option>
                <option value="previous_year">{t("1 year ago")}</option>
                <option value="inception">{t("Since inception")}</option>
                <option value="ytd">{t("Year to date")}</option>
                <option value="custom">{t("Custom period")}</option>
              </select>
            </label>
            {comparePowerPeriod === "custom" ? (
              <>
                <label>
                  {t("From")}
                  <input type="date" value={comparePowerStartDate} onChange={(event) => setComparePowerStartDate(event.target.value)} />
                </label>
                <label>
                  {t("To")}
                  <input type="date" value={comparePowerEndDate} onChange={(event) => setComparePowerEndDate(event.target.value)} />
                </label>
              </>
            ) : null}
          </div>
          <PowerDurationChart
            primaryRows={primaryPowerCurve}
            secondaryRows={comparePowerCurve}
            primaryLabel={primaryPowerLabel}
            secondaryLabel={comparePowerLabel}
            t={t}
          />
        </section>
      ) : null}
    </main>
  );
}
