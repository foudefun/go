export {
  OUTDOOR_ROUTE_ACTIVITY_ALIASES,
  OUTDOOR_ROUTE_ACTIVITY_TYPES,
  OUTDOOR_ROUTE_CLIMBING_LINK_TYPES,
  getOutdoorRouteActivityType,
  getOutdoorRouteActivityTypeLabel,
  getRouteActivityTypesForSessionActivity,
  getSessionActivityTypesForRouteActivity,
  normalizeOutdoorRouteActivityType,
} from "./activityTypes.js";

export const OUTDOOR_ROUTE_CATEGORIES = [
  "normal_route",
  "summit",
  "traverse",
  "loop",
  "out_and_back",
  "point_to_point",
  "climb",
  "ski_tour",
  "hike",
  "trail",
  "linkup",
  "other",
];

export const OUTDOOR_ROUTE_VISIBILITIES = ["private", "unlisted", "public"];

export const OUTDOOR_ROUTE_STATUSES = ["draft", "published", "archived", "needs_review"];

export const OUTDOOR_ROUTE_RELATIONSHIP_TYPES = [
  "same_objective",
  "summer_version_of",
  "winter_version_of",
  "approach_for",
  "descent_for",
  "alternative_to",
  "extension_of",
  "nearby_route",
];

export const OUTDOOR_ROUTE_VARIANT_TYPES = [
  "standard",
  "normal",
  "alternative_start",
  "alternative_descent",
  "descent",
  "bad_weather",
  "hut_strategy",
  "shortcut",
  "extension",
  "harder",
  "easier",
  "approach_only",
  "descent_only",
  "bailout",
  "other",
];

export const OUTDOOR_ROUTE_SHAPES = [
  "loop",
  "out_and_back",
  "point_to_point",
  "traverse",
  "there_and_back_with_descent_variant",
  "other",
];

export const OUTDOOR_ROUTE_SEGMENT_TYPES = [
  "approach",
  "main_route",
  "descent",
  "bailout",
  "hazard_crossing",
  "linkup",
  "road_walk",
  "transport",
  "skin_track",
  "ski_descent",
  "climbing_section",
  "glacier",
  "glacier_section",
  "ridge",
  "summit_ridge",
  "scramble",
  "other",
];

export const OUTDOOR_ROUTE_LOCATION_ENTITY_TYPES = [
  "summit",
  "trailhead",
  "parking",
  "hut",
  "station",
  "pass",
  "crag",
  "sector",
  "waypoint",
  "other_location",
];

export const OUTDOOR_ROUTE_LOCATION_ROLES = [
  "main_objective",
  "start",
  "end",
  "passes_through",
  "approach_start",
  "descent_end",
  "bailout",
  "nearby",
  "water",
  "crux",
  "transition",
  "ski_depot",
  "belay",
  "anchor",
  "rappel",
];

export const OUTDOOR_ROUTE_COORDINATE_STATUSES = ["exact", "approximate", "area_only", "unknown"];

export const OUTDOOR_ROUTE_TRACK_QUALITY_STATUSES = ["unknown", "poor", "usable", "good", "verified"];

export const OUTDOOR_ROUTE_CANDIDATE_TRACK_STATUSES = [
  "candidate",
  "under_review",
  "accepted",
  "rejected",
  "superseded",
];

export const OUTDOOR_ROUTE_TRACK_TYPES = [
  "primary",
  "alternative",
  "approach",
  "descent",
  "bailout",
  "planned",
  "manually_drawn",
];

export const OUTDOOR_ROUTE_SOURCE_ENTITY_TYPES = [
  "route",
  "route_variant",
  "route_segment",
  "location",
  "route_track",
  "candidate_route_track",
  "hazard_note",
  "condition_report",
];

export const OUTDOOR_ROUTE_SOURCE_TYPES = [
  "guidebook",
  "website",
  "map",
  "user_report",
  "official_agency",
  "hut",
  "club",
  "personal_knowledge",
  "other",
];

export function isOutdoorRouteDomainValue(values, value) {
  return values.includes(String(value || "").trim());
}

// Shape documentation for future API/UI work. These are intentionally JS docs,
// not TypeScript interfaces, because this frontend is currently plain JSX/JS.
export const OUTDOOR_ROUTE_SHAPES_DOC = {
  route: {
    id: "number",
    name: "string",
    slug: "string?",
    activity_type: "ski_touring|hiking|alpinism|outdoor_climbing|trail_running|cycling",
    route_category: "OUTDOOR_ROUTE_CATEGORIES value",
    summary: "string?",
    description: "string?",
    visibility: "private|unlisted|public",
    status: "draft|published|archived|needs_review",
    distance_km: "number?",
    elevation_gain_meters: "number?",
    elevation_loss_meters: "number?",
    min_elevation_meters: "number?",
    max_elevation_meters: "number?",
    estimated_duration_minutes: "number?",
    difficulty_label: "string?",
    username: "users.username",
  },
  routeVariant: {
    id: "number",
    route_id: "number",
    name: "string",
    variant_type: "OUTDOOR_ROUTE_VARIANT_TYPES value",
    route_shape: "OUTDOOR_ROUTE_SHAPES value",
  },
  routeLocationRole: {
    id: "number",
    entity_type: "route|route_variant|route_segment",
    entity_id: "number",
    location_entity_type: "OUTDOOR_ROUTE_LOCATION_ENTITY_TYPES value",
    location_entity_id: "number",
    role: "OUTDOOR_ROUTE_LOCATION_ROLES value",
    order_index: "number?",
  },
  location: {
    id: "number",
    username: "users.username",
    location_entity_type: "summit|trailhead|parking|hut|station|pass|waypoint|other_location",
    name: "string",
    aliases: "string[]?",
    latitude: "number?",
    longitude: "number?",
    elevation_meters: "number?",
    coordinate_status: "exact|approximate|area_only|unknown",
    description: "string?",
    access_notes: "string?",
  },
};
