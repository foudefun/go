import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
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
const MAP_STYLE = {
  version: 8,
  sources: {
    cartoVoyager: {
      type: "raster",
      tiles: ["/api/map-tiles/cartovoyager/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "(c) OpenStreetMap contributors (c) CARTO",
    },
  },
  layers: [
    {
      id: "cartoVoyager",
      type: "raster",
      source: "cartoVoyager",
    },
  ],
};

function formatCode(value) {
  return String(value || "").replaceAll("_", " ");
}

function isStructuredRoute(item) {
  return Number(item.variant_count || 0) > 0 && Number(item.segment_count || 0) > 0;
}

function getMarkerClass(point) {
  if (point.kind === "route") return `outdoor-map-marker route ${point.activityType || ""}`;
  return `outdoor-map-marker location ${point.kind || ""}`;
}

function getMarkerText(point) {
  if (point.kind === "parking") return "P";
  if (point.kind === "hut") return "hut";
  return "";
}

function OutdoorMapCanvas({ locations, routes, selectedId, onSelect }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [mapError, setMapError] = useState("");
  const points = useMemo(() => {
    const routePoints = routes.map((item) => ({
      id: `route-${item.route.id}`,
      kind: "route",
      label: item.route.name,
      activityType: item.route.activity_type,
      difficulty: item.route.difficulty_label,
      routeId: item.route.id,
      latitude: item.main_objective.latitude,
      longitude: item.main_objective.longitude,
    }));
    const locationPoints = locations.map((item) => ({
      id: `location-${item.location.location_entity_type}-${item.location.id}`,
      kind: item.location.location_entity_type,
      label: item.location.name,
      elevation: item.location.elevation_meters,
      routeRoleCount: item.route_role_count,
      latitude: item.location.latitude,
      longitude: item.location.longitude,
    }));
    return [...routePoints, ...locationPoints].filter((point) => point.latitude != null && point.longitude != null);
  }, [locations, routes]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [7.55, 46.05],
      zoom: 6.3,
      attributionControl: { compact: true },
    });
    mapRef.current.once("load", () => mapRef.current?.resize());
    mapRef.current.on("error", (event) => {
      setMapError(event?.error?.message || "Map tiles could not be loaded.");
    });
    mapRef.current.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = points.map((point) => {
      const markerElement = document.createElement("button");
      markerElement.type = "button";
      markerElement.className = getMarkerClass(point);
      markerElement.textContent = getMarkerText(point);
      markerElement.title = point.label;
      markerElement.setAttribute("aria-label", point.label);
      markerElement.dataset.pointId = point.id;
      markerElement.style.zIndex = point.kind === "route" ? "1" : "2";
      if (point.kind === "summit") markerElement.style.zIndex = "3";
      markerElement.addEventListener("click", () => onSelect(point));
      return new maplibregl.Marker({ element: markerElement, anchor: "center" })
        .setLngLat([Number(point.longitude), Number(point.latitude)])
        .addTo(map);
    });
    if (points.length) {
      const bounds = points.reduce(
        (current, point) => current.extend([Number(point.longitude), Number(point.latitude)]),
        new maplibregl.LngLatBounds(
          [Number(points[0].longitude), Number(points[0].latitude)],
          [Number(points[0].longitude), Number(points[0].latitude)],
        ),
      );
      map.fitBounds(bounds, { padding: 48, maxZoom: 9, duration: 0 });
    }
  }, [onSelect, points]);

  useEffect(() => {
    markersRef.current.forEach((marker) => {
      const element = marker.getElement();
      element.classList.toggle("selected", element.dataset.pointId === selectedId);
    });
  }, [selectedId]);

  return (
    <div className="outdoor-map-frame">
      <div ref={containerRef} className="outdoor-map-canvas" role="region" aria-label="Outdoor route map" />
      {mapError ? <div className="outdoor-map-error">{mapError}</div> : null}
    </div>
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

