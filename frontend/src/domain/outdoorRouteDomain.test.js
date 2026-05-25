import test from "node:test";
import assert from "node:assert/strict";
import {
  OUTDOOR_ROUTE_CANDIDATE_TRACK_STATUSES,
  OUTDOOR_ROUTE_CATEGORIES,
  OUTDOOR_ROUTE_COORDINATE_STATUSES,
  OUTDOOR_ROUTE_LOCATION_ENTITY_TYPES,
  OUTDOOR_ROUTE_LOCATION_ROLES,
  OUTDOOR_ROUTE_RELATIONSHIP_TYPES,
  OUTDOOR_ROUTE_SEGMENT_TYPES,
  OUTDOOR_ROUTE_SHAPES_DOC,
  OUTDOOR_ROUTE_STATUSES,
  OUTDOOR_ROUTE_TRACK_QUALITY_STATUSES,
  OUTDOOR_ROUTE_VARIANT_TYPES,
  OUTDOOR_ROUTE_VISIBILITIES,
  isOutdoorRouteDomainValue,
} from "./outdoorRouteDomain.js";

test("defines core outdoor route constants", () => {
  assert.equal(OUTDOOR_ROUTE_CATEGORIES.includes("normal_route"), true);
  assert.equal(OUTDOOR_ROUTE_CATEGORIES.includes("ski_tour"), true);
  assert.equal(OUTDOOR_ROUTE_RELATIONSHIP_TYPES.includes("same_objective"), true);
  assert.equal(OUTDOOR_ROUTE_VARIANT_TYPES.includes("standard"), true);
  assert.equal(OUTDOOR_ROUTE_VARIANT_TYPES.includes("hut_strategy"), true);
  assert.equal(OUTDOOR_ROUTE_VARIANT_TYPES.includes("alternative_route"), true);
  assert.equal(OUTDOOR_ROUTE_SEGMENT_TYPES.includes("hazard_crossing"), true);
  assert.equal(OUTDOOR_ROUTE_SEGMENT_TYPES.includes("summit_ridge"), true);
  assert.deepEqual(OUTDOOR_ROUTE_VISIBILITIES, ["private", "unlisted", "public"]);
  assert.deepEqual(OUTDOOR_ROUTE_STATUSES, ["draft", "published", "archived", "needs_review"]);
});

test("defines location and track vocabulary", () => {
  assert.equal(OUTDOOR_ROUTE_LOCATION_ENTITY_TYPES.includes("summit"), true);
  assert.equal(OUTDOOR_ROUTE_LOCATION_ENTITY_TYPES.includes("trailhead"), true);
  assert.equal(OUTDOOR_ROUTE_LOCATION_ROLES.includes("main_objective"), true);
  assert.deepEqual(OUTDOOR_ROUTE_COORDINATE_STATUSES, ["exact", "approximate", "area_only", "unknown"]);
  assert.deepEqual(OUTDOOR_ROUTE_TRACK_QUALITY_STATUSES, ["unknown", "poor", "usable", "good", "verified"]);
  assert.equal(OUTDOOR_ROUTE_CANDIDATE_TRACK_STATUSES.includes("under_review"), true);
});

test("validates values against a domain list", () => {
  assert.equal(isOutdoorRouteDomainValue(OUTDOOR_ROUTE_VISIBILITIES, "private"), true);
  assert.equal(isOutdoorRouteDomainValue(OUTDOOR_ROUTE_VISIBILITIES, "team_only"), false);
});

test("keeps JS shape documentation for route schema planning", () => {
  assert.equal(OUTDOOR_ROUTE_SHAPES_DOC.route.username, "users.username");
  assert.equal(OUTDOOR_ROUTE_SHAPES_DOC.routeLocationRole.role, "OUTDOOR_ROUTE_LOCATION_ROLES value");
  assert.equal(OUTDOOR_ROUTE_SHAPES_DOC.location.coordinate_status, "exact|approximate|area_only|unknown");
});
