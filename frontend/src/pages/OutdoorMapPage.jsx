import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getOutdoorMap } from "../api/outdoorRoutesApi.js";
import { getOutdoorRouteActivityTypeLabel } from "../domain/outdoorRouteDomain.js";
import { useTranslation } from "../i18n/translations.js";

const LOCATION_FILTERS = [
  "summit",
  "hut",
  "trailhead",
  "parking",
  "station",
  "pass",
  "waypoint",
  "other_location",
];
const ACTIVITY_FILTERS = ["", "alpinism", "ski_touring", "hiking", "outdoor_climbing"];

function formatCode(value) {
  return String(value || "").replaceAll("_", " ");
}

function isStructuredRoute(item) {
  return Number(item.variant_count || 0) > 0 && Number(item.segment_count || 0) > 0;
}

function projectPoint(latitude, longitude, bounds) {
  const minLat = Number(bounds.min_latitude ?? latitude);
  const maxLat = Number(bounds.max_latitude ?? latitude);
  const minLon = Number(bounds.min_longitude ?? longitude);
  const maxLon = Number(bounds.max_longitude ?? longitude);
  const latSpan = Math.max(0.001, maxLat - minLat);
  const lonSpan = Math.max(0.001, maxLon - minLon);
  const padding = 42;
  const width = 1000 - padding * 2;
  const height = 620 - padding * 2;
  return {
    x: padding + ((longitude - minLon) / lonSpan) * width,
    y: padding + (1 - (latitude - minLat) / latSpan) * height,
  };
}

function OutdoorMapCanvas({ locations, routes, bounds, selectedId, onSelect }) {
  const routePoints = routes.map((item) => ({
    id: `route-${item.route.id}`,
    kind: "route",
    label: item.route.name,
    activityType: item.route.activity_type,
    difficulty: item.route.difficulty_label,
    routeId: item.route.id,
    ...projectPoint(item.main_objective.latitude, item.main_objective.longitude, bounds),
  }));
  const locationPoints = locations.map((item) => ({
    id: `location-${item.location.location_entity_type}-${item.location.id}`,
    kind: item.location.location_entity_type,
    label: item.location.name,
    elevation: item.location.elevation_meters,
    routeRoleCount: item.route_role_count,
    ...projectPoint(item.location.latitude, item.location.longitude, bounds),
  }));

  return (
    <svg className="outdoor-map-canvas" viewBox="0 0 1000 620" role="img" aria-label="Outdoor route map">
      <rect x="0" y="0" width="1000" height="620" rx="8" />
      <g className="map-grid">
        {[140, 260, 380, 500, 620, 740, 860].map((x) => <line key={`x-${x}`} x1={x} x2={x} y1="42" y2="578" />)}
        {[120, 220, 320, 420, 520].map((y) => <line key={`y-${y}`} x1="42" x2="958" y1={y} y2={y} />)}
      </g>
      <g>
        {locationPoints.map((point) => (
          <g
            key={point.id}
            className="map-svg-button"
            onClick={() => onSelect(point)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") onSelect(point);
            }}
            role="button"
            tabIndex="0"
            aria-label={point.label}
          >
            <title>{point.label}</title>
            <circle className={`map-point location ${point.kind} ${selectedId === point.id ? "selected" : ""}`} cx={point.x} cy={point.y} r={point.kind === "summit" ? 7 : 5} />
            {selectedId === point.id ? <text x={point.x + 10} y={point.y - 8}>{point.label}</text> : null}
          </g>
        ))}
        {routePoints.map((point) => (
          <g
            key={point.id}
            className="map-svg-button"
            onClick={() => onSelect(point)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") onSelect(point);
            }}
            role="button"
            tabIndex="0"
            aria-label={point.label}
          >
            <title>{point.label}</title>
            <circle className={`map-point route ${point.activityType} ${selectedId === point.id ? "selected" : ""}`} cx={point.x} cy={point.y} r="10" />
            {selectedId === point.id ? <text x={point.x + 12} y={point.y + 4}>{point.difficulty || formatCode(point.activityType)}</text> : null}
          </g>
        ))}
      </g>
    </svg>
  );
}

export default function OutdoorMapPage() {
  const { t } = useTranslation();
  const [payload, setPayload] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [locationTypes, setLocationTypes] = useState(new Set(["summit", "hut", "trailhead", "station", "pass", "waypoint"]));
  const [showRoutes, setShowRoutes] = useState(true);
  const [activityType, setActivityType] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [structuredOnly, setStructuredOnly] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError("");
    getOutdoorMap()
      .then((data) => {
        if (cancelled) return;
        setPayload(data);
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || "Unable to load outdoor map.");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const allRoutes = payload?.routes || [];
  const allLocations = payload?.locations || [];
  const difficultyOptions = useMemo(
    () => Array.from(new Set(allRoutes.map((item) => item.route.difficulty_label).filter(Boolean))).sort(),
    [allRoutes],
  );
  const filteredRoutes = useMemo(
    () =>
      allRoutes.filter((item) => {
        if (!showRoutes) return false;
        if (activityType && item.route.activity_type !== activityType) return false;
        if (difficulty && item.route.difficulty_label !== difficulty) return false;
        if (structuredOnly && !isStructuredRoute(item)) return false;
        return true;
      }),
    [activityType, allRoutes, difficulty, showRoutes, structuredOnly],
  );
  const filteredLocations = useMemo(
    () => allLocations.filter((item) => locationTypes.has(item.location.location_entity_type)),
    [allLocations, locationTypes],
  );

  function toggleLocationType(type) {
    setLocationTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  return (
    <main className="page-shell outdoor-map-page">
      <section className="module-header outdoor-map-header">
        <div>
          <p className="eyebrow">{t("Outdoor map")}</p>
          <h1>{t("Summits and routes")}</h1>
        </div>
      </section>

      <section className="app-panel outdoor-map-filters">
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
          {t("Difficulty")}
          <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
            <option value="">{t("All grades")}</option>
            {difficultyOptions.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={showRoutes} onChange={(event) => setShowRoutes(event.target.checked)} />
          {t("Routes")}
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={structuredOnly} onChange={(event) => setStructuredOnly(event.target.checked)} />
          {t("Structured only")}
        </label>
        <div className="location-filter-set">
          {LOCATION_FILTERS.map((type) => (
            <button
              type="button"
              key={type}
              className={locationTypes.has(type) ? "active" : ""}
              onClick={() => toggleLocationType(type)}
            >
              {formatCode(type)}
            </button>
          ))}
        </div>
      </section>

      <section className="stats-summary-grid route-summary-grid">
        <span><strong>{filteredLocations.length}</strong>{t("Places")}</span>
        <span><strong>{filteredRoutes.length}</strong>{t("Routes")}</span>
        <span><strong>{payload?.totals?.locations || 0}</strong>{t("Mapped points")}</span>
        <span><strong>{difficulty || t("All grades")}</strong>{t("Difficulty")}</span>
      </section>

      {status === "loading" ? <div className="app-panel empty-state">{t("Loading map...")}</div> : null}
      {status === "error" ? <div className="app-panel empty-state">{error}</div> : null}
      {status === "ready" ? (
        <section className="outdoor-map-layout">
          <div className="app-panel outdoor-map-panel">
            <OutdoorMapCanvas
              locations={filteredLocations}
              routes={filteredRoutes}
              bounds={payload.bounds || {}}
              selectedId={selectedPoint?.id}
              onSelect={setSelectedPoint}
            />
          </div>
          <aside className="app-panel outdoor-map-selection">
            <p className="eyebrow">{t("Selection")}</p>
            {selectedPoint ? (
              <>
                <h2>{selectedPoint.label}</h2>
                <span>{formatCode(selectedPoint.kind)}</span>
                {selectedPoint.elevation ? <small>{selectedPoint.elevation} m</small> : null}
                {selectedPoint.routeRoleCount ? <small>{selectedPoint.routeRoleCount} {t("route links")}</small> : null}
                {selectedPoint.routeId ? <Link className="button-link" to={`/outdoor-routes/${selectedPoint.routeId}`}>{t("Open route")}</Link> : null}
              </>
            ) : (
              <p>{t("Select a point on the map.")}</p>
            )}
          </aside>
        </section>
      ) : null}
    </main>
  );
}
