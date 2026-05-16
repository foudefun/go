export const ACTIVITY_TYPES = [
  { value: "", label: "No activity" },
  { value: "course_a_pied", label: "Running" },
  { value: "velo", label: "Cycling" },
  { value: "vtt", label: "MTB" },
  { value: "hockey", label: "Hockey" },
  { value: "escalade", label: "Climbing" },
  { value: "outdoor_climbing", label: "Outdoor Climbing" },
  { value: "musculation", label: "Strength" },
  { value: "yoga", label: "Yoga" },
  { value: "pilates", label: "Pilates" },
];

export function getActivityTypeLabel(value) {
  return ACTIVITY_TYPES.find((item) => item.value === value)?.label || value || "No activity";
}

export function isStrengthActivity(value) {
  return value === "musculation";
}

export function isClimbingActivity(value) {
  return value === "escalade" || value === "outdoor_climbing";
}
