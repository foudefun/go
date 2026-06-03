export const ACTIVITY_TYPES = [
  { value: "", label: "No activity", shortLabel: "None", color: "#e5e7eb" },
  { value: "course_a_pied", label: "Running", shortLabel: "Run", color: "#B7791F" },
  { value: "velo", label: "Cycling", shortLabel: "Bike", color: "#2563EB" },
  { value: "vtt", label: "MTB", shortLabel: "MTB", color: "#16A34A" },
  { value: "ski_touring", label: "Ski touring", shortLabel: "Ski", color: "#2563EB" },
  { value: "alpine_ski", label: "Alpine ski", shortLabel: "Alpine", color: "#818CF8" },
  { value: "snowboarding", label: "Snowboarding", shortLabel: "Snow", color: "#A78BFA" },
  { value: "hiking", label: "Hiking", shortLabel: "Hike", color: "#65A30D" },
  { value: "alpinism", label: "Alpinism", shortLabel: "Alpine", color: "#9A5B36" },
  { value: "surfing", label: "Surfing", shortLabel: "Surf", color: "#0891B2" },
  { value: "hockey", label: "Hockey", shortLabel: "Hockey", color: "#DB2777" },
  { value: "escalade", label: "Climbing", shortLabel: "Climb", color: "#A78BFA" },
  { value: "indoor_climbing", label: "Indoor climbing", shortLabel: "Indoor", color: "#9A5B36" },
  { value: "outdoor_climbing", label: "Outdoor Climbing", shortLabel: "Outdoor", color: "#B7791F" },
  { value: "hangboard", label: "Hangboard", shortLabel: "Hangboard", color: "#0F766E" },
  { value: "musculation", label: "Strength", shortLabel: "Strength", color: "#B7791F" },
  { value: "yoga", label: "Yoga", shortLabel: "Yoga", color: "#A78BFA" },
  { value: "pilates", label: "Pilates", shortLabel: "Pilates", color: "#818CF8" },
  { value: "other", label: "Other", shortLabel: "Other", color: "#64748B" },
];

export const OUTDOOR_ROUTE_ACTIVITY_TYPES = [
  {
    value: "ski_touring",
    label: "Ski touring",
    shortLabel: "Ski",
    sessionActivityTypes: ["ski_touring"],
    isActive: true,
  },
  {
    value: "hiking",
    label: "Hiking",
    shortLabel: "Hike",
    sessionActivityTypes: ["hiking"],
    isActive: true,
  },
  {
    value: "alpinism",
    label: "Alpinism",
    shortLabel: "Alpine",
    sessionActivityTypes: ["alpinism"],
    isActive: true,
  },
  {
    value: "outdoor_climbing",
    label: "Outdoor Climbing",
    shortLabel: "Climb",
    sessionActivityTypes: ["outdoor_climbing", "escalade"],
    isActive: true,
  },
  {
    value: "trail_running",
    label: "Trail running",
    shortLabel: "Trail",
    sessionActivityTypes: ["course_a_pied"],
    isActive: false,
  },
  {
    value: "cycling",
    label: "Cycling",
    shortLabel: "Bike",
    sessionActivityTypes: ["velo", "vtt"],
    isActive: false,
  },
];

export const OUTDOOR_ROUTE_ACTIVITY_ALIASES = {
  alpinism: "alpinism",
  alpinisme: "alpinism",
  "alpine climbing": "alpinism",
  mountaineering: "alpinism",
  montagne: "alpinism",
  cycling: "cycling",
  bike: "cycling",
  biking: "cycling",
  velo: "cycling",
  "vélo": "cycling",
  vtt: "cycling",
  mtb: "cycling",
  hiking: "hiking",
  hike: "hiking",
  randonnee: "hiking",
  "randonnée": "hiking",
  walking: "hiking",
  "outdoor climbing": "outdoor_climbing",
  outdoor_climbing: "outdoor_climbing",
  climbing: "outdoor_climbing",
  escalade: "outdoor_climbing",
  "escalade outdoor": "outdoor_climbing",
  "sport climbing": "outdoor_climbing",
  "ski touring": "ski_touring",
  ski_touring: "ski_touring",
  skitouring: "ski_touring",
  ski: "ski_touring",
  "ski de randonnee": "ski_touring",
  "ski de randonnée": "ski_touring",
  ski_de_randonnee: "ski_touring",
  "ski_de_randonnée": "ski_touring",
  "trail running": "trail_running",
  trail_running: "trail_running",
  trail: "trail_running",
};

export const OUTDOOR_ROUTE_CLIMBING_LINK_TYPES = [
  { value: "primary_topo", label: "Primary topo" },
  { value: "related_topo", label: "Related topo" },
  { value: "approach_topo", label: "Approach topo" },
  { value: "descent_topo", label: "Descent topo" },
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
  return value === "escalade" || value === "indoor_climbing" || value === "outdoor_climbing" || value === "hangboard";
}

export function normalizeOutdoorRouteActivityType(value) {
  const normalized = String(value || "").trim().toLowerCase().replaceAll("-", "_");
  if (!normalized) return "";
  return OUTDOOR_ROUTE_ACTIVITY_ALIASES[normalized] || "";
}

export function getOutdoorRouteActivityType(value) {
  const normalized = normalizeOutdoorRouteActivityType(value);
  return OUTDOOR_ROUTE_ACTIVITY_TYPES.find((item) => item.value === normalized) || null;
}

export function getOutdoorRouteActivityTypeLabel(value) {
  return getOutdoorRouteActivityType(value)?.label || value || "No activity";
}

export function getSessionActivityTypesForRouteActivity(value) {
  return getOutdoorRouteActivityType(value)?.sessionActivityTypes || [];
}

export function getRouteActivityTypesForSessionActivity(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return [];
  return OUTDOOR_ROUTE_ACTIVITY_TYPES.filter((item) => item.sessionActivityTypes.includes(normalized)).map((item) => item.value);
}
