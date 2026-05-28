import { useEffect, useCallback, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  deleteOutdoorRouteVariant,
  getOutdoorRouteDetails,
  importOutdoorRouteGeometry,
  previewOutdoorRouteGeometry,
} from "../api/outdoorRoutesApi.js";
import { getOutdoorRouteActivityTypeLabel } from "../domain/outdoorRouteDomain.js";
import { useTranslation } from "../i18n/translations.js";

function formatNumber(value, unit = "") {
  if (value === null || value === undefined || value === "") return "";
  return `${value}${unit}`;
}

function formatMinutes(value) {
  if (!value) return "";
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  if (!hours) return `${minutes} min`;
  if (!minutes) return `${hours} h`;
  return `${hours} h ${minutes}`;
}

function formatCode(value) {
  return String(value || "").replaceAll("_", " ");
}

function buildMapLink(location) {
  const params = new URLSearchParams({
    kind: location.location_entity_type,
    id: String(location.id),
  });
  return `/outdoor-map?${params.toString()}`;
}

function DetailMetric({ label, value }) {
  if (!value) return null;
  return (
    <span>
      <strong>{value}</strong>
      {label}
    </span>
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

function RouteGeometryImportPanel({ routeId, onImported, t }) {
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [variantName, setVariantName] = useState("");
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  async function handlePreview() {
    if (!file) {
      setStatus("error");
      setMessage(t("Choose a GPX, GeoJSON, or KML file to preview."));
      return;
    }
    setStatus("previewing");
    setMessage("");
    try {
      const payload = await previewOutdoorRouteGeometry(file);
      setPreview(payload);
      setStatus("previewed");
    } catch (err) {
      setPreview(null);
      setStatus("error");
      setMessage(err.message || t("Unable to preview route geometry."));
    }
  }

  async function handleSave() {
    if (!file || !preview) {
      setStatus("error");
      setMessage(t("Preview the track before saving it."));
      return;
    }
    setStatus("saving");
    setMessage("");
    try {
      const payload = await importOutdoorRouteGeometry(routeId, { file, variantName });
      setStatus("saved");
      setMessage(
        t("Imported route geometry: {points} points, {distance} km.", {
          points: payload.point_count || 0,
          distance: payload.distance_km || "-",
        }),
      );
      setFile(null);
      setVariantName("");
      setPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onImported();
    } catch (err) {
      setStatus("error");
      setMessage(err.message || t("Unable to import route geometry."));
    }
  }

  return (
    <section className="app-panel route-detail-import-panel">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">{t("Route geometry")}</p>
          <h2>{t("Import GPS track")}</h2>
        </div>
      </div>
      <div className="route-detail-import-controls">
        <label>
          {t("Variant name")}
          <input value={variantName} onChange={(event) => setVariantName(event.target.value)} placeholder={t("Optional track name")} />
        </label>
        <label>
          {t("Track file")}
          <input
            ref={fileInputRef}
            type="file"
            accept=".gpx,.geojson,.json,.kml,.xml,application/gpx+xml,application/geo+json,application/vnd.google-earth.kml+xml"
            onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              setPreview(null);
              setStatus("idle");
              setMessage("");
            }}
          />
        </label>
        <div className="route-geometry-actions">
          <button type="button" onClick={handlePreview} disabled={!file || status === "previewing" || status === "saving"}>
            {status === "previewing" ? t("Previewing...") : t("Preview file")}
          </button>
          <button type="button" className="primary-action" onClick={handleSave} disabled={!file || !preview || status === "saving"}>
            {status === "saving" ? t("Importing...") : t("Save geometry")}
          </button>
        </div>
      </div>
      <RouteGeometryPreview preview={preview} />
      {message ? <span className={`route-import-status ${status === "error" ? "error" : "ready"}`}>{message}</span> : null}
    </section>
  );
}

function LocationRoleList({ roles, t }) {
  const orderedRoles = [...roles].sort((left, right) => {
    if (left.role === "main_objective" && right.role !== "main_objective") return -1;
    if (right.role === "main_objective" && left.role !== "main_objective") return 1;
    if (left.order_index == null && right.order_index != null) return 1;
    if (right.order_index == null && left.order_index != null) return -1;
    return Number(left.order_index || 0) - Number(right.order_index || 0);
  });
  if (!orderedRoles.length) return null;
  return (
    <section className="app-panel route-locations-panel">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">{t("Locations")}</p>
          <h2>{t("Linked places")}</h2>
        </div>
      </div>
      <ol className="route-location-list">
        {orderedRoles.map((role) => (
          <li key={role.id}>
            <div className="route-location-index">{role.role === "main_objective" ? "★" : role.order_index || ""}</div>
            <div>
              <strong>{role.location?.name || "Unknown location"}</strong>
              <span>{formatCode(role.role)} | {formatCode(role.location_entity_type)}</span>
              {role.location?.elevation_meters ? <small>{role.location.elevation_meters} m</small> : null}
              {role.location?.latitude != null && role.location?.longitude != null ? (
                <Link className="table-action-link" to={buildMapLink(role.location)}>
                  {t("View on map")}
                </Link>
              ) : null}
              {role.notes ? <small>{role.notes}</small> : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function SegmentList({ segments }) {
  if (!segments.length) return <div className="empty-state compact">No segments imported yet.</div>;
  return (
    <ol className="route-segment-list">
      {segments.map(({ segment }) => (
        <li key={segment.id}>
          <div className="route-segment-order">{segment.order_index}</div>
          <div>
            <div className="route-segment-heading">
              <strong>{segment.name}</strong>
              <span>{formatCode(segment.segment_type)}</span>
            </div>
            {segment.description ? <p>{segment.description}</p> : null}
            <div className="route-segment-meta">
              <DetailMetric label="grade" value={segment.difficulty_label} />
              <DetailMetric label="duration" value={formatMinutes(segment.estimated_duration_minutes)} />
              <DetailMetric label="distance" value={formatNumber(segment.distance_km, " km")} />
              <DetailMetric label="gain" value={formatNumber(segment.elevation_gain_meters, " m")} />
            </div>
            {segment.notes ? <small>{segment.notes}</small> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function VariantCard({ item, routeId, onDeleted, t }) {
  const variant = item.variant;
  const hasGeometry = Array.isArray(variant.geometry?.coordinates) && variant.geometry.coordinates.length >= 2;
  const canDelete = variant.variant_type === "imported_track" || variant.route_shape === "gps_track";
  const [deleteStatus, setDeleteStatus] = useState("idle");

  async function handleDelete() {
    if (!window.confirm(t("Delete this imported GPS track?"))) return;
    setDeleteStatus("deleting");
    try {
      await deleteOutdoorRouteVariant(routeId, variant.id);
      onDeleted();
    } catch (err) {
      setDeleteStatus("error");
    }
  }

  return (
    <article className="app-panel route-variant-card">
      <div className="route-variant-header">
        <div>
          <p className="eyebrow">{formatCode(variant.variant_type)}</p>
          <h3>{variant.name}</h3>
          {variant.description ? <p>{variant.description}</p> : null}
        </div>
        <div className="route-variant-badges">
          {hasGeometry ? <span className="route-geometry-badge">{formatCode(variant.route_shape || "gps_track")}</span> : null}
          <div className="route-variant-grade">{variant.difficulty_label || "n/a"}</div>
          {canDelete ? (
            <button type="button" className="table-action-link route-variant-delete" onClick={handleDelete} disabled={deleteStatus === "deleting"}>
              {deleteStatus === "deleting" ? t("Deleting...") : t("Delete track")}
            </button>
          ) : null}
        </div>
      </div>
      {deleteStatus === "error" ? <div className="inline-error">{t("Unable to delete route geometry.")}</div> : null}
      <div className="stats-summary-grid compact">
        <DetailMetric label="duration" value={formatMinutes(variant.estimated_duration_minutes)} />
        <DetailMetric label="distance" value={formatNumber(variant.distance_km, " km")} />
        <DetailMetric label="gain" value={formatNumber(variant.elevation_gain_meters, " m")} />
        <DetailMetric label="shape" value={formatCode(variant.route_shape)} />
      </div>
      <SegmentList segments={item.segments || []} />
    </article>
  );
}

export default function OutdoorRouteDetailPage() {
  const { routeId = "1" } = useParams();
  const { t } = useTranslation();
  const [details, setDetails] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  const loadDetails = useCallback(() => {
    let cancelled = false;
    setStatus("loading");
    setError("");
    getOutdoorRouteDetails(routeId)
      .then((payload) => {
        if (cancelled) return;
        setDetails(payload);
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || "Unable to load route.");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [routeId]);

  useEffect(() => loadDetails(), [loadDetails]);

  const route = details?.route || {};
  const objective = details?.main_objective || {};
  const segmentCount = useMemo(
    () => (details?.variants || []).reduce((count, variant) => count + (variant.segments?.length || 0), 0),
    [details],
  );
  const gpsVariantCount = useMemo(
    () => (details?.variants || []).filter((item) => (item.variant?.geometry?.coordinates || []).length >= 2).length,
    [details],
  );

  if (status === "loading") {
    return (
      <main className="page-shell outdoor-route-page">
        <div className="app-panel empty-state">Loading route...</div>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="page-shell outdoor-route-page">
        <div className="app-panel empty-state">{error}</div>
      </main>
    );
  }

  return (
    <main className="page-shell outdoor-route-page">
      <section className="route-detail-header">
        <div>
          <p className="eyebrow">{getOutdoorRouteActivityTypeLabel(route.activity_type)}</p>
          <h1>{route.name}</h1>
          <p className="lede">{route.description || route.summary || t("No route description imported yet.")}</p>
        </div>
        <div className="route-objective-panel">
          <span>Main objective</span>
          <strong>{objective.name || "No objective"}</strong>
          <small>
            {formatNumber(objective.elevation_meters, " m")}
            {objective.coordinate_status ? ` | ${formatCode(objective.coordinate_status)}` : ""}
          </small>
        </div>
      </section>

      <section className="stats-summary-grid route-summary-grid">
        <DetailMetric label="grade" value={route.difficulty_label} />
        <DetailMetric label="variants" value={details.variants?.length} />
        <DetailMetric label="segments" value={segmentCount} />
        <DetailMetric label="GPS tracks" value={gpsVariantCount} />
        <DetailMetric label="category" value={formatCode(route.route_category)} />
      </section>

      <div className="route-detail-layout">
        <div className="route-variant-stack">
          <RouteGeometryImportPanel routeId={routeId} onImported={loadDetails} t={t} />
          {(details.variants || []).map((item) => (
            <VariantCard key={item.variant.id} item={item} routeId={routeId} onDeleted={loadDetails} t={t} />
          ))}
        </div>
        <LocationRoleList roles={details.location_roles || []} t={t} />
      </div>
    </main>
  );
}
