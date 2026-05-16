import { api } from "./client.js";

function jsonRequest(path, method, payload) {
  return api(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function getEquipmentBrands() {
  return api("/equipment/brands");
}

export function getCountries() {
  return api("/countries");
}

export function createEquipmentBrand(payload) {
  return jsonRequest("/equipment/brands", "POST", payload);
}

export function updateEquipmentBrand(id, payload) {
  return jsonRequest(`/equipment/brands/${id}`, "PUT", payload);
}

export function deleteEquipmentBrand(id) {
  return api(`/equipment/brands/${id}`, { method: "DELETE" });
}

export function getEquipmentModels() {
  return api("/equipment/models");
}

export function createEquipmentModel(payload) {
  return jsonRequest("/equipment/models", "POST", payload);
}

export function updateEquipmentModel(id, payload) {
  return jsonRequest(`/equipment/models/${id}`, "PUT", payload);
}

export function deleteEquipmentModel(id) {
  return api(`/equipment/models/${id}`, { method: "DELETE" });
}

export function getEquipment() {
  return api("/equipment");
}

export function createEquipment(payload) {
  return jsonRequest("/equipment", "POST", payload);
}

export function updateEquipment(id, payload) {
  return jsonRequest(`/equipment/${id}`, "PUT", payload);
}

export function deleteEquipment(id) {
  return api(`/equipment/${id}`, { method: "DELETE" });
}

export function getMyEquipment() {
  return api("/my-equipment");
}

export function createMyEquipment(payload) {
  return jsonRequest("/my-equipment", "POST", payload);
}

export function updateMyEquipment(id, payload) {
  return jsonRequest(`/my-equipment/${id}`, "PUT", payload);
}

export function deleteMyEquipment(id) {
  return api(`/my-equipment/${id}`, { method: "DELETE" });
}
