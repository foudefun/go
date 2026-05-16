import { api } from "./client.js";

export function getClimbingAreas() {
  return api("/v1/climbing/areas");
}

export function getClimbingCrags(areaId) {
  return api(`/v1/climbing/areas/${areaId}/crags`);
}

export function getClimbingSectors(cragId) {
  return api(`/v1/climbing/crags/${cragId}/sectors`);
}

export function getSectorTopoBundle(sectorId) {
  return api(`/v1/climbing/sectors/${sectorId}/topo`);
}

export function saveSectorCalibration(sectorId, payload) {
  return api(`/v1/climbing/sectors/${sectorId}/calibrations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
