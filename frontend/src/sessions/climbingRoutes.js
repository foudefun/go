export const CLIMBING_ROPE_STYLES = [
  { value: "lead", label: "Lead" },
  { value: "second", label: "Second" },
  { value: "auto_belay", label: "Auto belay" },
];

export const CLIMBING_ASCENT_STYLES = [
  { value: "onsight", label: "On sight" },
  { value: "redpoint", label: "Redpoint" },
  { value: "with_rests", label: "With rests" },
];

const ROPE_STYLE_VALUES = new Set(CLIMBING_ROPE_STYLES.map((item) => item.value));
const ASCENT_STYLE_VALUES = new Set(CLIMBING_ASCENT_STYLES.map((item) => item.value));

const ASCENT_STYLE_ALIASES = {
  a_vue: "onsight",
  "a vue": "onsight",
  onsight: "onsight",
  on_sight: "onsight",
  "on sight": "onsight",
  enchainee: "redpoint",
  enchaînée: "redpoint",
  redpoint: "redpoint",
  red_point: "redpoint",
  "red point": "redpoint",
  repos: "with_rests",
  rests: "with_rests",
  with_rests: "with_rests",
  "with rests": "with_rests",
};

export function normalizeClimbingRopeStyle(value) {
  const normalized = String(value || "").trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  return ROPE_STYLE_VALUES.has(normalized) ? normalized : "";
}

export function normalizeClimbingAscentStyle(value) {
  const normalized = String(value || "").trim().toLowerCase().replaceAll("-", "_");
  return ASCENT_STYLE_ALIASES[normalized] || (ASCENT_STYLE_VALUES.has(normalized) ? normalized : "");
}

export function normalizeOptionalClimbingInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return null;
  const integerValue = Math.trunc(numberValue);
  return integerValue >= 0 ? integerValue : null;
}

export function normalizeClimbingRoute(rawRoute = {}) {
  const ascentStyle = normalizeClimbingAscentStyle(rawRoute.ascent_style);
  const restCount = normalizeOptionalClimbingInt(rawRoute.rest_count);
  const normalized = {
    spot: String(rawRoute.spot || "").trim(),
    name: String(rawRoute.name || "").trim(),
    topo_grade: String(rawRoute.topo_grade || rawRoute.difficulty || "").trim(),
    felt_grade: String(rawRoute.felt_grade || "").trim(),
    own_grade: String(rawRoute.own_grade || "").trim(),
    rope_style: normalizeClimbingRopeStyle(rawRoute.rope_style),
    ascent_style: ascentStyle,
    rest_count: ascentStyle === "with_rests" && restCount !== null ? restCount : null,
    notes: String(rawRoute.notes || "").trim(),
  };

  return Object.fromEntries(
    Object.entries(normalized).filter(([, value]) => value !== "" && value !== null && value !== undefined),
  );
}

export function normalizeClimbingRoutes(rawRoutes = []) {
  return (Array.isArray(rawRoutes) ? rawRoutes : [])
    .map(normalizeClimbingRoute)
    .filter((route) => route.name || route.topo_grade || route.rope_style || route.ascent_style || route.notes);
}

export function createBlankClimbingRoute() {
  return {
    spot: "",
    name: "",
    topo_grade: "",
    rope_style: "lead",
    ascent_style: "onsight",
    rest_count: "",
    notes: "",
  };
}
