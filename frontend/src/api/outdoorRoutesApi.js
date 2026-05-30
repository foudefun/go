import { api } from "./client.js";

export function listOutdoorRoutes({ search = "", activityType = "", hasPitches = false } = {}) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (activityType) params.set("activity_type", activityType);
  if (hasPitches) params.set("has_pitches", "true");
  const query = params.toString();
  return api(`/outdoor-routes${query ? `?${query}` : ""}`);
}

export function getOutdoorRouteDetails(routeId) {
  return api(`/outdoor-routes/${routeId}/details`);
}

export function extractOutdoorRoutePitches(routeId, { replaceExisting = false } = {}) {
  return api(`/outdoor-routes/${routeId}/pitches/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ replace_existing: replaceExisting }),
  });
}

export function updateOutdoorRouteSegment(routeId, segmentId, payload) {
  return api(`/outdoor-routes/${routeId}/segments/${segmentId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function createOutdoorRouteSegment(routeId, variantId, payload) {
  return api(`/outdoor-routes/${routeId}/variants/${variantId}/segments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function deleteOutdoorRouteSegment(routeId, segmentId) {
  return api(`/outdoor-routes/${routeId}/segments/${segmentId}`, {
    method: "DELETE",
  });
}

export function importOutdoorRouteGeometry(routeId, { file, variantName = "" }) {
  const formData = new FormData();
  formData.append("file", file);
  if (variantName) formData.append("variant_name", variantName);
  return api(`/outdoor-routes/${routeId}/geometry-import`, {
    method: "POST",
    body: formData,
  });
}

export function previewOutdoorRouteGeometry(file) {
  const formData = new FormData();
  formData.append("file", file);
  return api("/outdoor-routes/geometry-preview", {
    method: "POST",
    body: formData,
  });
}

export function deleteOutdoorRouteVariant(routeId, variantId) {
  return api(`/outdoor-routes/${routeId}/variants/${variantId}`, {
    method: "DELETE",
  });
}

export function getOutdoorMap() {
  return api("/outdoor-map");
}

export function getOutdoorDataAudit() {
  return api("/outdoor-data-audit");
}
