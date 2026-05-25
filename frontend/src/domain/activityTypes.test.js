import test from "node:test";
import assert from "node:assert/strict";
import {
  OUTDOOR_ROUTE_CLIMBING_LINK_TYPES,
  getRouteActivityTypesForSessionActivity,
  getSessionActivityTypesForRouteActivity,
  normalizeOutdoorRouteActivityType,
} from "./activityTypes.js";

test("normalizes outdoor route activity aliases", () => {
  assert.equal(normalizeOutdoorRouteActivityType("ski touring"), "ski_touring");
  assert.equal(normalizeOutdoorRouteActivityType("ski-de-randonnee"), "ski_touring");
  assert.equal(normalizeOutdoorRouteActivityType("randonnée"), "hiking");
  assert.equal(normalizeOutdoorRouteActivityType("mountaineering"), "alpinism");
  assert.equal(normalizeOutdoorRouteActivityType("MTB"), "cycling");
});

test("maps route activities to existing session activity types", () => {
  assert.deepEqual(getSessionActivityTypesForRouteActivity("outdoor_climbing"), ["outdoor_climbing", "escalade"]);
  assert.deepEqual(getSessionActivityTypesForRouteActivity("hiking"), ["hiking"]);
  assert.deepEqual(getSessionActivityTypesForRouteActivity("ski_touring"), ["ski_touring"]);
});

test("maps existing session activity types back to possible route activity types", () => {
  assert.deepEqual(getRouteActivityTypesForSessionActivity("vtt"), ["cycling"]);
  assert.deepEqual(getRouteActivityTypesForSessionActivity("alpinism"), ["alpinism"]);
  assert.deepEqual(getRouteActivityTypesForSessionActivity("outdoor_climbing"), ["outdoor_climbing"]);
  assert.deepEqual(getRouteActivityTypesForSessionActivity("hangboard"), []);
});

test("defines the climbing topo bridge link types", () => {
  assert.deepEqual(
    OUTDOOR_ROUTE_CLIMBING_LINK_TYPES.map((item) => item.value),
    ["primary_topo", "related_topo", "approach_topo", "descent_topo"],
  );
});
