import test from "node:test";
import assert from "node:assert/strict";
import {
  filterExercises,
  getExerciseCategories,
  getExerciseLabel,
  normalizeExerciseDraft,
  slugifyExerciseName,
} from "./exerciseLibrary.js";

test("builds stable technical exercise names", () => {
  assert.equal(slugifyExerciseName("Developpe incline halteres"), "developpe_incline_halteres");
  assert.equal(slugifyExerciseName("  Bike / Zone 2  "), "bike_zone_2");
});

test("normalizes exercise drafts for API writes", () => {
  assert.deepEqual(
    normalizeExerciseDraft({
      name: " squat ",
      tracking_mode: "unknown",
      weight_unit: "stone",
      images: "bad",
    }),
    {
      name: "squat",
      display_name: "",
      display_name_fr: "",
      display_name_en: "",
      category: "",
      movement_family: "",
      variant_label: "",
      tracking_mode: "reps_weight",
      weight_unit: "kg",
      description: "",
      link: "",
      image: "",
      images: [],
      document: "",
    },
  );
});

test("filters exercises by query, category, and tracking mode", () => {
  const exercises = [
    { name: "squat", display_name: "Back Squat", category: "legs", tracking_mode: "reps_weight" },
    { name: "bike", display_name: "Bike Intervals", category: "conditioning", tracking_mode: "time_watts" },
  ];

  assert.deepEqual(filterExercises(exercises, { query: "bike" }).map((item) => item.name), ["bike"]);
  assert.deepEqual(filterExercises(exercises, { category: "legs" }).map((item) => item.name), ["squat"]);
  assert.deepEqual(filterExercises(exercises, { trackingMode: "time_watts" }).map((item) => item.name), ["bike"]);
});

test("returns display labels and category filters", () => {
  assert.equal(getExerciseLabel({ name: "front_squat" }), "front squat");
  assert.deepEqual(
    getExerciseCategories([{ category: "legs" }, { category: "" }, { category: "pull" }, { category: "legs" }]),
    ["legs", "pull"],
  );
});
