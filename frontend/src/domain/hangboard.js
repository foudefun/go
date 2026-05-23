export const HANGBOARD_LEVELS = ["5C", "6A", "6B", "6C", "7A", "7B", "7C"];

export const HANGBOARD_FOCUSES = [
  { value: "max_strength", label: "Max strength" },
  { value: "strength_endurance", label: "Strength endurance" },
  { value: "endurance", label: "Endurance" },
  { value: "power_endurance", label: "Power endurance" },
  { value: "maintenance", label: "Maintenance" },
];

export const HANGBOARD_LENGTHS = [
  { value: "short", label: "Short" },
  { value: "normal", label: "Normal" },
  { value: "hard", label: "Hard" },
];

export const HANGBOARD_LOAD_MODES = [
  { value: "bodyweight", label: "Bodyweight" },
  { value: "assisted", label: "Assisted" },
  { value: "added_weight", label: "Added weight" },
];

export function formatFocus(value = "") {
  return HANGBOARD_FOCUSES.find((item) => item.value === value)?.label || String(value).replaceAll("_", " ");
}

export function formatDuration(seconds = 0) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = Math.round(safeSeconds % 60);
  if (!minutes) return `${remainder}s`;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function getHangSteps(workout = {}) {
  return Array.isArray(workout.steps) ? workout.steps.filter((step) => step.type === "hang") : [];
}

export function getStepHoldSlugs(step = {}) {
  return Array.isArray(step.holdSlugs) ? step.holdSlugs : [];
}

export function buildCompletionLog(workout, repStatus, averageRpe, painScore, notes = "") {
  const hangSteps = getHangSteps(workout);
  const failedReps = hangSteps.filter((_, index) => repStatus[index] === "failed").length;
  return {
    completedReps: Math.max(0, hangSteps.length - failedReps),
    failedReps,
    averageRpe: Math.max(0, Math.min(10, Number(averageRpe) || 0)),
    painScore: Math.max(0, Math.min(10, Number(painScore) || 0)),
    notes: String(notes || "").trim(),
  };
}
