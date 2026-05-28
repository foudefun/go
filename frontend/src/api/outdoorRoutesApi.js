import { api } from "./client.js";

export function listOutdoorRoutes({ search = "", activityType = "" } = {}) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (activityType) params.set("activity_type", activityType);
  const query = params.toString();
  return api(`/outdoor-routes${query ? `?${query}` : ""}`);
}

export function getOutdoorRouteDetails(routeId) {
  return api(`/outdoor-routes/${routeId}/details`);
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

export function getOutdoorMap() {
  return api("/outdoor-map");
}

export function getOutdoorDataAudit() {
  return api("/outdoor-data-audit");
}
