import { useEffect, useMemo, useState } from "react";
import { getCalendar } from "../api/calendarApi.js";
import { ACTIVITY_TYPES, getActivityTypeLabel } from "../domain/activityTypes.js";
import { useTranslation } from "../i18n/translations.js";
import {
  STAT_METRICS,
  aggregateMetric,
  buildDailyStats,
  buildMonthlyStats,
  formatStatValue,
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

function buildLinePoints(rows, metricKey, minValue, maxValue, width, height, padding) {
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const range = maxValue - minValue || 1;
  return rows.map((row, index) => {
    const x = padding.left + (rows.length <= 1 ? chartWidth / 2 : (index / (rows.length - 1)) * chartWidth);
    const y = padding.top + chartHeight - ((normalizeChartValue(row, metricKey) - minValue) / range) * chartHeight;
    return { x, y, value: normalizeChartValue(row, metricKey), label: row.label };
  });
}

function buildAreaPath(points, height, padding) {
  if (!points.length) return "";
  const baseY = height - padding.bottom;
  return `${points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ")} L ${points.at(-1).x} ${baseY} L ${points[0].x} ${baseY} Z`;
}

function StatsChart({ rows, metricA, metricB, t }) {
  const width = 900;
  const height = 360;
  const padding = { top: 30, right: 42, bottom: 58, left: 64 };
  const visibleRows = rows.filter((row) => normalizeChartValue(row, metricA) > 0 || (metricB && normalizeChartValue(row, metricB) > 0));
  const chartRows = visibleRows.length ? visibleRows : rows;
  const maxValueA = Math.max(...chartRows.map((row) => normalizeChartValue(row, metricA)), 1);
  const maxValueB = metricB ? Math.max(...chartRows.map((row) => normalizeChartValue(row, metricB)), 1) : 0;
  const minValue = 0;
  const pointsA = buildLinePoints(chartRows, metricA, minValue, maxValueA, width, height, padding);
  const pointsB = metricB ? buildLinePoints(chartRows, metricB, minValue, maxValueB, width, height, padding) : [];
  const pathA = pointsA.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const pathB = pointsB.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const areaA = buildAreaPath(pointsA, height, padding);
  const xLabels = chartRows.filter((_, index) => index === 0 || index === chartRows.length - 1 || index % Math.ceil(chartRows.length / 6) === 0);
  const shouldShowPoint = (index) => chartRows.length <= 36 || index === 0 || index === chartRows.length - 1 || index % Math.ceil(chartRows.length / 20) === 0;
  const metricALabel = t(getStatMetric(metricA).label);
  const metricBLabel = metricB ? t(getStatMetric(metricB).label) : "";

  if (!chartRows.length) {
    return <div className="empty-state compact">{t("No statistics for this period.")}</div>;
  }

  return (
    <div className="stats-chart-frame">
      <div className="chart-legend-row">
        <span><i className="legend-dot primary" />{metricALabel} · max {formatStatValue(maxValueA, metricA)}</span>
        {metricB ? <span><i className="legend-dot secondary" />{metricBLabel} · max {formatStatValue(maxValueB, metricB)}</span> : null}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t("Statistics chart")}>
        <defs>
          <linearGradient id="primaryChartFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#0f766e" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#0f766e" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} className="chart-axis" />
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} className="chart-axis" />
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padding.top + (height - padding.top - padding.bottom) * ratio;
          const valueA = maxValueA * (1 - ratio);
          const valueB = maxValueB * (1 - ratio);
          return (
            <g key={ratio}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} className="chart-grid-line" />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" className="chart-label primary">{formatStatValue(valueA, metricA)}</text>
              {metricB ? <text x={width - padding.right + 8} y={y + 4} textAnchor="start" className="chart-label secondary">{formatStatValue(valueB, metricB)}</text> : null}
            </g>
          );
        })}
        {areaA ? <path d={areaA} className="chart-area primary" /> : null}
        {pathA ? <path d={pathA} className="chart-line primary" /> : null}
        {pathB ? <path d={pathB} className="chart-line secondary" /> : null}
        {pointsA.map((point, index) => shouldShowPoint(index) && (
          <circle key={`${point.label}-a`} cx={point.x} cy={point.y} r="4" className="chart-point primary">
            <title>{`${point.label} · ${metricALabel}: ${formatStatValue(point.value, metricA)}`}</title>
          </circle>
        ))}
        {pointsB.map((point, index) => shouldShowPoint(index) && (
          <circle key={`${point.label}-b`} cx={point.x} cy={point.y} r="4" className="chart-point secondary">
            <title>{`${point.label} · ${metricBLabel}: ${formatStatValue(point.value, metricB)}`}</title>
          </circle>
        ))}
        {xLabels.map((row) => {
          const point = pointsA.find((item) => item.label === row.label) || pointsB.find((item) => item.label === row.label);
          return point ? (
            <text key={row.label} x={point.x} y={height - 18} textAnchor="middle" className="chart-label">
              {row.label}
            </text>
          ) : null;
        })}
      </svg>
    </div>
  );
}

export default function StatisticsPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("daily");
  const [metricA, setMetricA] = useState("duration_min");
  const [metricB, setMetricB] = useState("distance_km");
  const [activityType, setActivityType] = useState("");
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

  const availableActivityTypes = useMemo(() => {
    const values = new Set(
      (Array.isArray(rows) ? rows : [])
        .flatMap((row) => row.activity_types || (row.activity_type ? [row.activity_type] : []))
        .filter(Boolean),
    );
    return ACTIVITY_TYPES.filter((type) => values.has(type.value));
  }, [rows]);
  const dailyRows = useMemo(() => buildDailyStats(rows, activityType), [rows, activityType]);
  const monthlyRows = useMemo(() => buildMonthlyStats(dailyRows), [dailyRows]);
  const chartRows = period === "monthly" ? monthlyRows : dailyRows;
  const summaryRows = [
    { metric: metricA, value: aggregateMetric(chartRows, metricA) },
    metricB ? { metric: metricB, value: aggregateMetric(chartRows, metricB) } : null,
  ].filter(Boolean);

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
          {t("View")}
          <select value={period} onChange={(event) => setPeriod(event.target.value)}>
            <option value="daily">{t("Daily")}</option>
            <option value="monthly">{t("Monthly")}</option>
          </select>
        </label>
        <label>
          {t("Activity Type")}
          <select value={activityType} onChange={(event) => setActivityType(event.target.value)}>
            <option value="">{t("All types")}</option>
            {availableActivityTypes.map((type) => (
              <option value={type.value} key={type.value}>
                {t(getActivityTypeLabel(type.value))}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Variable 1")}
          <select value={metricA} onChange={(event) => setMetricA(event.target.value)}>
            {STAT_METRICS.map((metric) => (
              <option value={metric.key} key={metric.key}>{t(metric.label)}</option>
            ))}
          </select>
        </label>
        <label>
          {t("Variable 2")}
          <select value={metricB} onChange={(event) => setMetricB(event.target.value)}>
            <option value="">{t("None")}</option>
            {STAT_METRICS.map((metric) => (
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
            <h2>{t(getStatMetric(metricA).label)}{metricB ? ` / ${t(getStatMetric(metricB).label)}` : ""}</h2>
          </div>
          <span>{t("Rows visible", { count: chartRows.length })}</span>
        </div>
        <StatsChart rows={chartRows} metricA={metricA} metricB={metricB} t={t} />
      </section>
    </main>
  );
}
