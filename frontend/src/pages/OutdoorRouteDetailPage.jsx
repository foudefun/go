import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { getOutdoorRouteDetails } from "../api/outdoorRoutesApi.js";
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

function DetailMetric({ label, value }) {
  if (!value) return null;
  return (
    <span>
      <strong>{value}</strong>
      {label}
    </span>
  );
}

function LocationRoleList({ roles }) {
  const orderedRoles = roles.filter((role) => role.role !== "main_objective");
  if (!orderedRoles.length) return null;
  return (
    <section className="app-panel route-locations-panel">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">Locations</p>
          <h2>Route points</h2>
        </div>
      </div>
      <ol className="route-location-list">
        {orderedRoles.map((role) => (
          <li key={role.id}>
            <div className="route-location-index">{role.order_index || ""}</div>
            <div>
              <strong>{role.location?.name || "Unknown location"}</strong>
              <span>{formatCode(role.role)} | {formatCode(role.location_entity_type)}</span>
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

function VariantCard({ item }) {
  const variant = item.variant;
  return (
    <article className="app-panel route-variant-card">
      <div className="route-variant-header">
        <div>
          <p className="eyebrow">{formatCode(variant.variant_type)}</p>
          <h3>{variant.name}</h3>
          {variant.description ? <p>{variant.description}</p> : null}
        </div>
        <div className="route-variant-grade">{variant.difficulty_label || "n/a"}</div>
      </div>
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

  useEffect(() => {
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

  const route = details?.route || {};
  const objective = details?.main_objective || {};
  const segmentCount = useMemo(
    () => (details?.variants || []).reduce((count, variant) => count + (variant.segments?.length || 0), 0),
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
        <DetailMetric label="category" value={formatCode(route.route_category)} />
      </section>

      <div className="route-detail-layout">
        <div className="route-variant-stack">
          {(details.variants || []).map((item) => (
            <VariantCard key={item.variant.id} item={item} />
          ))}
        </div>
        <LocationRoleList roles={details.location_roles || []} />
      </div>
    </main>
  );
}
