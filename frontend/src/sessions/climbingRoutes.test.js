import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeClimbingAscentStyle,
  normalizeClimbingRoute,
  normalizeClimbingRoutes,
  normalizeClimbingRopeStyle,
} from "./climbingRoutes.js";

test("normalizes indoor climbing route fields", () => {
  assert.equal(normalizeClimbingRopeStyle("auto belay"), "auto_belay");
  assert.equal(normalizeClimbingAscentStyle("a vue"), "onsight");
  assert.equal(normalizeClimbingAscentStyle("repos"), "with_rests");

  assert.deepEqual(
    normalizeClimbingRoute({
      name: "Blue slab",
      difficulty: "6a+",
      rope_style: "lead",
      ascent_style: "with rests",
      rest_count: "2",
      notes: "Fell low",
    }),
    {
      name: "Blue slab",
      topo_grade: "6a+",
      rope_style: "lead",
      ascent_style: "with_rests",
      rest_count: 2,
      notes: "Fell low",
    },
  );
});

test("keeps only route rows with useful content", () => {
  assert.deepEqual(normalizeClimbingRoutes([{}, { topo_grade: "5c", ascent_style: "redpoint" }]), [
    { topo_grade: "5c", ascent_style: "redpoint" },
  ]);
});
