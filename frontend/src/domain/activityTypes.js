export const ACTIVITY_TYPES = [
  { value: "", label: "No activity", shortLabel: "None", color: "#e5e7eb" },
  { value: "course_a_pied", label: "Running", shortLabel: "Run", color: "#fecaca" },
  { value: "velo", label: "Cycling", shortLabel: "Bike", color: "#bfdbfe" },
  { value: "vtt", label: "MTB", shortLabel: "MTB", color: "#bbf7d0" },
  { value: "hockey", label: "Hockey", shortLabel: "Hockey", color: "#fde68a" },
  { value: "escalade", label: "Climbing", shortLabel: "Climb", color: "#ddd6fe" },
  { value: "outdoor_climbing", label: "Outdoor Climbing", shortLabel: "Outdoor", color: "#fed7aa" },
  { value: "hangboard", label: "Hangboard", shortLabel: "Hangboard", color: "#99f6e4" },
  { value: "musculation", label: "Strength", shortLabel: "Strength", color: "#fdba74" },
  { value: "yoga", label: "Yoga", shortLabel: "Yoga", color: "#fbcfe8" },
  { value: "pilates", label: "Pilates", shortLabel: "Pilates", color: "#c7d2fe" },
];

export function getActivityTypeLabel(value) {
  return ACTIVITY_TYPES.find((item) => item.value === value)?.label || value || "No activity";
}

export function getActivityTypeShortLabel(value) {
  const item = ACTIVITY_TYPES.find((activityType) => activityType.value === value);
  return item?.shortLabel || item?.label || value || "No activity";
}

export function getActivityTypeColor(value) {
  return ACTIVITY_TYPES.find((item) => item.value === value)?.color || "#e5e7eb";
}

export function isStrengthActivity(value) {
  return value === "musculation";
}

export function isClimbingActivity(value) {
  return value === "escalade" || value === "outdoor_climbing" || value === "hangboard";
}
