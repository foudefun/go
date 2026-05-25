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
