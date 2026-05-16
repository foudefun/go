import {
  WORK_TYPES,
  buildExerciseMap,
  getExerciseDisplayName,
  normalizeOptionalInt,
  normalizeWorkType,
} from "./strengthItems.js";

function trimText(value) {
  return String(value || "").trim();
}

function normalizeEquipmentList(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => trimText(item))
    .filter(Boolean);
}

export function createBlankPlannedItem() {
  return {
    exercise_name: "",
    custom_name: "",
    block: "",
    work_type: "resistance",
    sets: "",
    reps: "",
    duration_min: "",
    duration_sec: "",
    notes: "",
    used_equipment: [],
  };
}

export function normalizePlannedItem(rawItem = {}) {
  const normalized = {
    exercise_name: trimText(rawItem.exercise_name),
    custom_name: trimText(rawItem.custom_name),
    block: trimText(rawItem.block),
    work_type: normalizeWorkType(rawItem.work_type),
    sets: normalizeOptionalInt(rawItem.sets),
    reps: normalizeOptionalInt(rawItem.reps),
    duration_min: normalizeOptionalInt(rawItem.duration_min),
    duration_sec: normalizeOptionalInt(rawItem.duration_sec),
    notes: trimText(rawItem.notes),
    used_equipment: normalizeEquipmentList(rawItem.used_equipment),
  };

  return Object.fromEntries(
    Object.entries(normalized).filter(([, value]) => {
      if (value === "" || value === null) return false;
      if (Array.isArray(value) && !value.length) return false;
      return true;
    }),
  );
}

export function normalizePlannedItems(rawItems = []) {
  return (Array.isArray(rawItems) ? rawItems : [])
    .map(normalizePlannedItem)
    .filter(
      (item) =>
        item.exercise_name ||
        item.custom_name ||
        item.block ||
        item.sets !== undefined ||
        item.reps !== undefined ||
        item.duration_min !== undefined ||
        item.duration_sec !== undefined ||
        item.notes,
    );
}

export function getPlannedItemTitle(item = {}, exerciseMap = new Map()) {
  const exercise = exerciseMap.get(item.exercise_name);
  return item.custom_name || getExerciseDisplayName(exercise) || item.exercise_name || "Planned item";
}

export function formatPlannedItem(item = {}) {
  const parts = [];
  if (item.block) parts.push(item.block);
  if (item.sets !== undefined && item.reps !== undefined) {
    parts.push(`${item.sets} x ${item.reps} reps`);
  } else if (item.sets !== undefined) {
    parts.push(`${item.sets} set${Number(item.sets) === 1 ? "" : "s"}`);
  } else if (item.reps !== undefined) {
    parts.push(`${item.reps} rep${Number(item.reps) === 1 ? "" : "s"}`);
  }
  if (item.duration_min !== undefined) parts.push(`${item.duration_min} min`);
  if (item.duration_sec !== undefined) parts.push(`${item.duration_sec} sec`);

  const workTypeLabel = WORK_TYPES.find((workType) => workType.value === item.work_type)?.label;
  if (workTypeLabel) parts.push(workTypeLabel);

  return parts.join(" - ");
}

export function buildPlannedExerciseMap(exercises = []) {
  return buildExerciseMap(exercises);
}
