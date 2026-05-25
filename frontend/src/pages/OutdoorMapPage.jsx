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
const ALTITUDE_MIN = 0;
const ALTITUDE_MAX = 5000;
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
const ROUTE_LINE_SOURCE_ID = "outdoor-route-lines";
const ROUTE_LINE_LAYER_ID = "outdoor-route-lines";

function formatCode(value) {
  return String(value || "").replaceAll("_", " ");
}

function isStructuredRoute(item) {
  return Number(item.variant_count || 0) > 0 && Number(item.segment_count || 0) > 0;
}

function getMarkerClass(point) {
  return `outdoor-map-marker location ${point.kind || ""}`;
}

function getMarkerText(point) {
  if (point.kind === "parking") return "P";
  if (point.kind === "hut") return "hut";
  return "";
}

function formatCoordinate(value) {
  return Number(value).toFixed(5);
}

function formatElevationRange(minimum, maximum, t) {
  if (minimum === ALTITUDE_MIN && maximum === ALTITUDE_MAX) return t("All altitudes");
  return `${minimum}-${maximum} m`;
}

function buildRouteLineFeatureCollection(routeLines) {
  return {
    type: "FeatureCollection",
    features: routeLines.map((line) => ({
      type: "Feature",
      properties: {
        routeId: line.routeId,
        name: line.name,
        activityType: line.activityType,
        difficultyLabel: line.difficultyLabel,
        selected: line.selected,
      },
      geometry: {
        type: "LineString",
        coordinates: line.coordinates,
      },
    })),
  };
}

function syncRouteLines(map, routeLines) {
  if (!map.isStyleLoaded()) return false;
  const data = buildRouteLineFeatureCollection(routeLines);
  const source = map.getSource(ROUTE_LINE_SOURCE_ID);
  if (source) {
    source.setData(data);
  } else {
    map.addSource(ROUTE_LINE_SOURCE_ID, {
      type: "geojson",
      data,
    });
  }
  if (!map.getLayer(ROUTE_LINE_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_LINE_LAYER_ID,
      type: "line",
      source: ROUTE_LINE_SOURCE_ID,
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": ["case", ["boolean", ["get", "selected"], false], "#dc2626", "#0f766e"],
        "line-width": ["case", ["boolean", ["get", "selected"], false], 4.5, 2.5],
        "line-opacity": 0.78,
        "line-dasharray": [1.2, 1.2],
      },
    });
  }
  return true;
}

function OutdoorMapCanvas({ locations, routes, selectedId, selectedRouteId, onSelect }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [mapError, setMapError] = useState("");
  const points = useMemo(() => {
    const locationPoints = locations.map((item) => ({
      id: `location-${item.location.location_entity_type}-${item.location.id}`,
      kind: item.location.location_entity_type,
      label: item.location.name,
      elevation: item.location.elevation_meters,
      coordinateStatus: item.location.coordinate_status,
      routeRoleCount: item.route_role_count,
      linkedRoutes: item.linked_routes || [],
      latitude: item.location.latitude,
      longitude: item.location.longitude,
    }));
    return locationPoints.filter((point) => point.latitude != null && point.longitude != null);
  }, [locations]);
  const routeLines = useMemo(
    () =>
      routes
        .map((item) => ({
          routeId: item.route.id,
          name: item.route.name,
          activityType: item.route.activity_type,
          difficultyLabel: item.route.difficulty_label,
          coordinates: item.map_line?.coordinates,
          selected: item.route.id === selectedRouteId,
        }))
        .filter((line) => (
          Array.isArray(line.coordinates)
          && line.coordinates.length >= 2
          && line.coordinates.every((coordinate) => (
            Array.isArray(coordinate)
            && coordinate.length >= 2
            && coordinate[0] != null
            && coordinate[1] != null
          ))
        )),
    [routes, selectedRouteId],
  );

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
    if (!map) return undefined;
    const applyRouteLines = () => syncRouteLines(map, routeLines);
    if (!applyRouteLines()) {
      map.once("load", applyRouteLines);
      return () => map.off("load", applyRouteLines);
    }
    return undefined;
  }, [routeLines]);

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
      markerElement.style.zIndex = point.kind === "summit" ? "3" : "2";
      markerElement.addEventListener("click", () => onSelect(point));
      return new maplibregl.Marker({ element: markerElement, anchor: "center" })
        .setLngLat([Number(point.longitude), Number(point.latitude)])
        .addTo(map);
    });
    const selectedRouteLine = routeLines.find((line) => line.routeId === selectedRouteId);
    const routeLineCoordinates = selectedRouteLine?.coordinates || routeLines.flatMap((line) => line.coordinates);
    const boundsCoordinates = [
      ...(selectedRouteLine ? [] : points.map((point) => [Number(point.longitude), Number(point.latitude)])),
      ...routeLineCoordinates.map((coordinate) => [Number(coordinate[0]), Number(coordinate[1])]),
    ];
    if (boundsCoordinates.length) {
      const bounds = boundsCoordinates.reduce(
        (current, coordinate) => current.extend(coordinate),
        new maplibregl.LngLatBounds(
          boundsCoordinates[0],
          boundsCoordinates[0],
        ),
      );
      map.fitBounds(bounds, { padding: 48, maxZoom: 9, duration: 0 });
    }
  }, [onSelect, points, routeLines, selectedRouteId]);

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
  const [altitudeRange, setAltitudeRange] = useState([ALTITUDE_MIN, ALTITUDE_MAX]);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [selectedRouteId, setSelectedRouteId] = useState(null);

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
  const [minimumElevationValue, maximumElevationValue] = altitudeRange;
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
    () => allLocations.filter((item) => {
      if (!locationTypes.has(item.location.location_entity_type)) return false;
      const elevation = Number(item.location.elevation_meters);
      if (!Number.isFinite(elevation)) return false;
      if (elevation < minimumElevationValue || elevation > maximumElevationValue) return false;
      return true;
    }),
    [allLocations, locationTypes, maximumElevationValue, minimumElevationValue],
  );

  function toggleLocationType(type) {
    setLocationTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function selectPoint(point) {
    setSelectedPoint(point);
    setSelectedRouteId(null);
  }

  function showLinkedRoute(routeId) {
    setSelectedRouteId(routeId);
    setShowRoutes(true);
    setActivityType("");
    setDifficulty("");
    setStructuredOnly(false);
  }

  function updateMinimumAltitude(value) {
    const nextMinimum = Math.min(Number(value), altitudeRange[1]);
    setAltitudeRange([nextMinimum, altitudeRange[1]]);
  }

  function updateMaximumAltitude(value) {
    const nextMaximum = Math.max(Number(value), altitudeRange[0]);
    setAltitudeRange([altitudeRange[0], nextMaximum]);
  }

  const altitudeMinPercent = (minimumElevationValue / ALTITUDE_MAX) * 100;
  const altitudeMaxPercent = (maximumElevationValue / ALTITUDE_MAX) * 100;

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
        <div className="altitude-range-filter">
          <div className="altitude-range-header">
            <span>{t("Altitude")}</span>
            <strong>{minimumElevationValue} m - {maximumElevationValue} m</strong>
          </div>
          <div
            className="altitude-range-slider"
            style={{
              "--altitude-min": `${altitudeMinPercent}%`,
              "--altitude-max": `${altitudeMaxPercent}%`,
            }}
          >
            <input
              type="range"
              min={ALTITUDE_MIN}
              max={ALTITUDE_MAX}
              step="50"
              value={minimumElevationValue}
              aria-label={t("Min altitude")}
              onChange={(event) => updateMinimumAltitude(event.target.value)}
            />
            <input
              type="range"
              min={ALTITUDE_MIN}
              max={ALTITUDE_MAX}
              step="50"
              value={maximumElevationValue}
              aria-label={t("Max altitude")}
              onChange={(event) => updateMaximumAltitude(event.target.value)}
            />
          </div>
          <div className="altitude-range-scale">
            <span>0 m</span>
            <span>5000 m</span>
          </div>
        </div>
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

      <section className="stats-summary-grid route-summary-grid outdoor-map-summary-grid">
        <span><strong>{filteredLocations.length}</strong>{t("Places")}</span>
        <span><strong>{filteredRoutes.length}</strong>{t("Routes")}</span>
        <span><strong>{payload?.totals?.locations || 0}</strong>{t("Mapped points")}</span>
        <span><strong>{difficulty || t("All grades")}</strong>{t("Difficulty")}</span>
        <span><strong>{formatElevationRange(minimumElevationValue, maximumElevationValue, t)}</strong>{t("Altitude")}</span>
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
              selectedRouteId={selectedRouteId}
              onSelect={selectPoint}
            />
          </div>
          <aside className="app-panel outdoor-map-selection">
            <p className="eyebrow">{t("Selection")}</p>
            {selectedPoint ? (
              <>
                <h2>{selectedPoint.label}</h2>
                <span>{formatCode(selectedPoint.kind)}</span>
                {selectedPoint.elevation ? <small>{selectedPoint.elevation} m</small> : null}
                {selectedPoint.latitude != null && selectedPoint.longitude != null ? (
                  <small>{formatCoordinate(selectedPoint.latitude)}, {formatCoordinate(selectedPoint.longitude)}</small>
                ) : null}
                {selectedPoint.coordinateStatus ? <small>{formatCode(selectedPoint.coordinateStatus)} coordinates</small> : null}
                {selectedPoint.routeRoleCount ? <small>{selectedPoint.routeRoleCount} {t("route links")}</small> : null}
                {selectedPoint.linkedRoutes?.length ? (
                  <div className="outdoor-map-linked-routes">
                    {selectedPoint.linkedRoutes.map((item) => (
                      <div
                        key={`${item.route.id}-${item.role}`}
                        className={selectedRouteId === item.route.id ? "selected" : ""}
                      >
                        <Link to={`/outdoor-routes/${item.route.id}`}>{item.route.name}</Link>
                        <small>{formatCode(item.role)}{item.route.difficulty_label ? ` · ${item.route.difficulty_label}` : ""}</small>
                        <button type="button" onClick={() => showLinkedRoute(item.route.id)}>
                          {t("Show on map")}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
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

