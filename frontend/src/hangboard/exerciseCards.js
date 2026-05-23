import { BEASTMAKER_1000_EXERCISE_PRESCRIPTIONS } from "./exercisePrescriptions.js";

const CARD_BASE = "/assets/hangboard/beastmaker1000/cards";

const FOCUS_TAGS = {
  max_strength: new Set(["max_strength", "strength", "advanced_strength", "advanced_open_hand_strength", "advanced_pocket_strength"]),
  strength_endurance: new Set(["strength_endurance", "base_strength", "beginner_strength", "pocket_strength", "open_hand_strength"]),
  endurance: new Set(["endurance", "warmup", "prehab"]),
  power_endurance: new Set(["power_endurance", "strength_endurance"]),
  maintenance: new Set(["maintenance", "warmup", "prehab", "beginner_strength"]),
};

export const BEASTMAKER_1000_EXERCISE_CARDS = Object.fromEntries(
  BEASTMAKER_1000_EXERCISE_PRESCRIPTIONS.map((item) => [item.id, item.cardImage]),
);

function sameHolds(left = [], right = []) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((slug) => rightSet.has(slug));
}

function scorePrescription(prescription, focus = "", loadMode = "") {
  const tags = new Set(Array.isArray(prescription.focus) ? prescription.focus : []);
  const focusTags = FOCUS_TAGS[focus] || new Set([focus]);
  const focusScore = tags.has(focus) ? 3 : Array.from(focusTags).some((tag) => tags.has(tag)) ? 2 : 0;
  const loadText = String(prescription.protocol?.defaultLoadMode || "");
  const prescriptionId = String(prescription.id || "");
  let loadScore = 0;
  if (loadMode === "assisted") {
    loadScore = loadText.includes("assisted_only") || prescriptionId.includes("assisted") ? 3 : loadText.includes("assisted") ? 1 : 0;
  } else if (loadMode === "added_weight") {
    loadScore = loadText.includes("added_weight") ? 3 : 0;
  } else if (loadMode === "bodyweight") {
    loadScore = loadText.includes("bodyweight") && !loadText.includes("assisted_only") ? 1 : 0;
  }
  return loadScore * 1000 + focusScore * 100 - Number(prescription.difficultyRank || 99);
}

export function findExercisePrescription(exercise = {}, focus = "") {
  if (exercise.prescriptionId) {
    const exact = BEASTMAKER_1000_EXERCISE_PRESCRIPTIONS.find((item) => item.id === exercise.prescriptionId);
    if (exact) return exact;
  }
  const candidates = BEASTMAKER_1000_EXERCISE_PRESCRIPTIONS.filter((item) => sameHolds(item.holdSlugs || [], exercise.holdSlugs || []));
  return candidates.sort((left, right) => scorePrescription(right, focus, exercise.loadMode) - scorePrescription(left, focus, exercise.loadMode))[0] || null;
}

export function getExerciseCardFile(exercise = {}, focus = "") {
  if (exercise.cardImage) return exercise.cardImage;
  return findExercisePrescription(exercise, focus)?.cardImage || "";
}

export function getExerciseCardUrl(exercise = {}, focus = "") {
  const file = getExerciseCardFile(exercise, focus);
  return file ? `${CARD_BASE}/${file}` : "";
}
