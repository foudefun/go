import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listOutdoorRoutes } from "../api/outdoorRoutesApi.js";
import { getOutdoorRouteActivityTypeLabel } from "../domain/outdoorRouteDomain.js";
import { useTranslation } from "../i18n/translations.js";

const ACTIVITY_FILTERS = ["", "alpinism", "ski_touring", "hiking", "outdoor_climbing"];
const COMPLETENESS_FILTERS = ["", "structured", "partial", "draft"];

function formatCode(value) {
  return String(value || "").replaceAll("_", " ");
}

function getCompleteness(item) {
  const objective = item.main_objective || {};
  const hasVariants = Number(item.variant_count || 0) > 0;
  const hasSegments = Number(item.segment_count || 0) > 0;
  const hasLocations = Number(item.location_role_count || 0) > 1;
  const hasDisplayCoordinates = Boolean(objective.latitude && objective.longitude);
  const score = [hasVariants, hasSegments, hasLocations, hasDisplayCoordinates].filter(Boolean).length;
  if (score >= 4) return { level: "structured", label: "Structured", score };
  if (score >= 2) return { level: "partial", label: "Partial", score };
  return { level: "draft", label: "Draft", score };
}

function RouteSummaryCard({ item }) {
  const route = item.route || {};
  const objective = item.main_objective || {};
  const completeness = getCompleteness(item);
  return (
    <Link className="app-panel outdoor-route-card" to={`/outdoor-routes/${route.id}`}>
      <div>
        <div className="route-card-topline">
          <p className="eyebrow">{getOutdoorRouteActivityTypeLabel(route.activity_type)}</p>
          <span className={`route-completeness ${completeness.level}`}>{completeness.label}</span>
        </div>
        <h2>{route.name}</h2>
        <p>{route.description || route.summary || "No description imported yet."}</p>
      </div>
      <div className="route-card-meta">
        <span><strong>{route.difficulty_label || "n/a"}</strong>grade</span>
        <span><strong>{item.variant_count}</strong>variants</span>
        <span><strong>{item.segment_count}</strong>segments</span>
      </div>
      <div className="route-card-footer">
        <span>{objective.name || "No objective"}</span>
        <span>{formatCode(route.route_category)}</span>
      </div>
    </Link>
  );
}

export default function OutdoorRoutesPage() {
  const { t } = useTranslation();
  const [routes, setRoutes] = useState([]);
  const [search, setSearch] = useState("");
  const [activityType, setActivityType] = useState("");
  const [completenessFilter, setCompletenessFilter] = useState("");
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      setStatus("loading");
      setError("");
      listOutdoorRoutes({ search, activityType })
        .then((payload) => {
          if (cancelled) return;
          setRoutes(Array.isArray(payload.routes) ? payload.routes : []);
          setStatus("ready");
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err.message || "Unable to load routes.");
          setStatus("error");
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [search, activityType]);

  const totals = useMemo(
    () => ({
      routes: routes.length,
      variants: routes.reduce((sum, item) => sum + Number(item.variant_count || 0), 0),
      segments: routes.reduce((sum, item) => sum + Number(item.segment_count || 0), 0),
    }),
    [routes],
  );

  const filteredRoutes = useMemo(
    () =>
      completenessFilter
        ? routes.filter((item) => getCompleteness(item).level === completenessFilter)
        : routes,
    [routes, completenessFilter],
  );

  return (
    <main className="page-shell outdoor-routes-page">
      <section className="module-header outdoor-routes-header">
        <div>
          <p className="eyebrow">{t("Outdoor routes")}</p>
          <h1>{t("Route library")}</h1>
          <p className="lede">{t("Browse imported alpine routes, variants, and structured segments.")}</p>
        </div>
      </section>

      <section className="app-panel outdoor-routes-toolbar">
        <label>
          {t("Search")}
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("Route, summit, grade...")}
          />
        </label>
        <label>
          {t("Activity")}
          <select value={activityType} onChange={(event) => setActivityType(event.target.value)}>
            {ACTIVITY_FILTERS.map((value) => (
              <option key={value || "all"} value={value}>
                {value ? getOutdoorRouteActivityTypeLabel(value) : t("All types")}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Completeness")}
          <select value={completenessFilter} onChange={(event) => setCompletenessFilter(event.target.value)}>
            {COMPLETENESS_FILTERS.map((value) => (
              <option key={value || "all"} value={value}>
                {value ? t(value[0].toUpperCase() + value.slice(1)) : t("All statuses")}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="stats-summary-grid route-summary-grid">
        <span><strong>{totals.routes}</strong>{t("Routes")}</span>
        <span><strong>{totals.variants}</strong>{t("Variants")}</span>
        <span><strong>{totals.segments}</strong>{t("Segments")}</span>
        <span><strong>{activityType ? getOutdoorRouteActivityTypeLabel(activityType) : t("All types")}</strong>{t("Activity")}</span>
      </section>

      {status === "error" ? <div className="app-panel empty-state">{error}</div> : null}
      {status === "loading" ? <div className="app-panel empty-state">{t("Loading routes...")}</div> : null}
      {status === "ready" && !filteredRoutes.length ? <div className="app-panel empty-state">{t("No routes match the current filters.")}</div> : null}
      {status === "ready" && filteredRoutes.length ? (
        <section className="outdoor-route-grid">
          {filteredRoutes.map((item) => <RouteSummaryCard key={item.route.id} item={item} />)}
        </section>
      ) : null}
    </main>
  );
}
