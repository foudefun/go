import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { importOutdoorRouteGeometry, listOutdoorRoutes, previewOutdoorRouteGeometry } from "../api/outdoorRoutesApi.js";
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

function buildTrackPreviewShape(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return "";
  const width = 280;
  const height = 120;
  const padding = 12;
  const longitudes = coordinates.map((point) => point[0]);
  const latitudes = coordinates.map((point) => point[1]);
  const minLon = Math.min(...longitudes);
  const maxLon = Math.max(...longitudes);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const lonSpan = maxLon - minLon || 1;
  const latSpan = maxLat - minLat || 1;
  const points = coordinates.map(([longitude, latitude]) => {
      const x = padding + ((longitude - minLon) / lonSpan) * (width - padding * 2);
      const y = height - padding - ((latitude - minLat) / latSpan) * (height - padding * 2);
      return [x, y];
    });
  return {
    path: points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" "),
    start: points[0],
    end: points[points.length - 1],
  };
}

function RouteGeometryPreview({ preview }) {
  const geometry = preview?.geometry || {};
  const coordinates = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
  const shape = buildTrackPreviewShape(coordinates);
  if (!preview || !shape.path) return null;
  const first = coordinates[0] || [];
  const last = coordinates[coordinates.length - 1] || [];
  return (
    <div className="route-geometry-preview">
      <svg viewBox="0 0 280 120" role="img" aria-label="Route geometry preview">
        <path d={shape.path} />
        <circle cx={shape.start[0]} cy={shape.start[1]} r="4" className="track-start-dot" />
        <circle cx={shape.end[0]} cy={shape.end[1]} r="4" className="track-end-dot" />
      </svg>
      <div className="route-geometry-preview-meta">
        <span><strong>{preview.point_count}</strong>points</span>
        <span><strong>{preview.distance_km || "-"}</strong>km</span>
        <span><strong>{preview.min_elevation_meters ?? "-"}</strong>min m</span>
        <span><strong>{preview.max_elevation_meters ?? "-"}</strong>max m</span>
      </div>
      <small>
        {first.length >= 2 ? `${first[1].toFixed(5)}, ${first[0].toFixed(5)}` : "-"}{" -> "}
        {last.length >= 2 ? `${last[1].toFixed(5)}, ${last[0].toFixed(5)}` : "-"}
      </small>
    </div>
  );
}

export default function OutdoorRoutesPage() {
  const { t } = useTranslation();
  const fileInputRef = useRef(null);
  const [routes, setRoutes] = useState([]);
  const [search, setSearch] = useState("");
  const [activityType, setActivityType] = useState("");
  const [completenessFilter, setCompletenessFilter] = useState("");
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);
  const [geometryRouteId, setGeometryRouteId] = useState("");
  const [geometryFile, setGeometryFile] = useState(null);
  const [geometryVariantName, setGeometryVariantName] = useState("");
  const [geometryImportStatus, setGeometryImportStatus] = useState("idle");
  const [geometryImportMessage, setGeometryImportMessage] = useState("");
  const [geometryPreview, setGeometryPreview] = useState(null);
  const [geometryPreviewStatus, setGeometryPreviewStatus] = useState("idle");

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
  }, [search, activityType, refreshToken]);

  const totals = useMemo(
    () => ({
      routes: routes.length,
      variants: routes.reduce((sum, item) => sum + Number(item.variant_count || 0), 0),
      segments: routes.reduce((sum, item) => sum + Number(item.segment_count || 0), 0),
    }),
    [routes],
  );

  useEffect(() => {
    if (!geometryRouteId && routes.length) {
      setGeometryRouteId(String(routes[0].route?.id || ""));
    }
  }, [geometryRouteId, routes]);

  const filteredRoutes = useMemo(
    () =>
      completenessFilter
        ? routes.filter((item) => getCompleteness(item).level === completenessFilter)
        : routes,
    [routes, completenessFilter],
  );

  async function handleImportGeometry() {
    if (!geometryRouteId || !geometryFile) {
      setGeometryImportStatus("error");
      setGeometryImportMessage(t("Choose a route and a GPX, GeoJSON, or KML file."));
      return;
    }
    setGeometryImportStatus("importing");
    setGeometryImportMessage("");
    try {
      const payload = await importOutdoorRouteGeometry(geometryRouteId, {
        file: geometryFile,
        variantName: geometryVariantName,
      });
      setGeometryImportStatus("ready");
      setGeometryImportMessage(
        t("Imported route geometry: {points} points, {distance} km.", {
          points: payload.point_count || 0,
          distance: payload.distance_km || "-",
        }),
      );
      setGeometryFile(null);
      setGeometryVariantName("");
      setGeometryPreview(null);
      setGeometryPreviewStatus("idle");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setRefreshToken((value) => value + 1);
    } catch (err) {
      setGeometryImportStatus("error");
      setGeometryImportMessage(err.message || t("Unable to import route geometry."));
    }
  }

  async function handlePreviewGeometry() {
    if (!geometryFile) {
      setGeometryPreviewStatus("error");
      setGeometryImportMessage(t("Choose a GPX, GeoJSON, or KML file to preview."));
      return;
    }
    setGeometryPreviewStatus("loading");
    setGeometryImportMessage("");
    try {
      const payload = await previewOutdoorRouteGeometry(geometryFile);
      setGeometryPreview(payload);
      setGeometryPreviewStatus("ready");
    } catch (err) {
      setGeometryPreview(null);
      setGeometryPreviewStatus("error");
      setGeometryImportMessage(err.message || t("Unable to preview route geometry."));
    }
  }

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

      <section className="app-panel route-geometry-import-panel">
        <div>
          <p className="eyebrow">{t("Route geometry")}</p>
          <h2>{t("Import GPS track")}</h2>
        </div>
        <label>
          {t("Target route")}
          <select value={geometryRouteId} onChange={(event) => setGeometryRouteId(event.target.value)}>
            {routes.map((item) => (
              <option key={item.route.id} value={item.route.id}>
                {item.route.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Variant name")}
          <input
            value={geometryVariantName}
            onChange={(event) => setGeometryVariantName(event.target.value)}
            placeholder={t("Optional track name")}
          />
        </label>
        <label>
          {t("Track file")}
          <input
            ref={fileInputRef}
            type="file"
            accept=".gpx,.geojson,.json,.kml,.xml,application/gpx+xml,application/geo+json,application/vnd.google-earth.kml+xml"
            onChange={(event) => {
              setGeometryFile(event.target.files?.[0] || null);
              setGeometryPreview(null);
              setGeometryPreviewStatus("idle");
              setGeometryImportMessage("");
            }}
          />
        </label>
        <div className="route-geometry-actions">
          <button type="button" onClick={handlePreviewGeometry} disabled={geometryPreviewStatus === "loading" || !geometryFile}>
            {geometryPreviewStatus === "loading" ? t("Previewing...") : t("Preview file")}
          </button>
          <button type="button" className="primary-action" onClick={handleImportGeometry} disabled={geometryImportStatus === "importing" || !routes.length || !geometryFile || !geometryPreview}>
            {geometryImportStatus === "importing" ? t("Importing...") : t("Save geometry")}
          </button>
        </div>
        <RouteGeometryPreview preview={geometryPreview} />
        {geometryImportMessage ? (
          <span className={`route-import-status ${geometryImportStatus === "error" || geometryPreviewStatus === "error" ? "error" : geometryImportStatus}`}>
            {geometryImportMessage}
          </span>
        ) : null}
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
