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
    {
      name: "developpe_couche",
      display_name: "Bench Press",
      display_name_fr: "Developpe couche",
      display_name_en: "Bench Press",
      category: "chest, push",
      tracking_mode: "reps_weight",
    },
    { name: "squat", display_name: "Back Squat", display_name_fr: "Squat arriere", category: "legs, glutes", tracking_mode: "reps_weight" },
    { name: "bike", display_name: "Bike Intervals", display_name_en: "Bike Intervals", category: "conditioning", tracking_mode: "time_watts" },
  ];

  assert.deepEqual(filterExercises(exercises, { query: "bike" }).map((item) => item.name), ["bike"]);
  assert.deepEqual(filterExercises(exercises, { query: "bench" }).map((item) => item.name), ["developpe_couche"]);
  assert.deepEqual(filterExercises(exercises, { query: "developpe" }).map((item) => item.name), ["developpe_couche"]);
  assert.deepEqual(filterExercises(exercises, { query: "developpe couche" }).map((item) => item.name), ["developpe_couche"]);
  assert.deepEqual(filterExercises(exercises, { query: "squat arriere" }).map((item) => item.name), ["squat"]);
  assert.deepEqual(filterExercises(exercises, { category: "legs" }).map((item) => item.name), ["squat"]);
  assert.deepEqual(filterExercises(exercises, { trackingMode: "time_watts" }).map((item) => item.name), ["bike"]);
});

test("returns display labels and category filters", () => {
  assert.equal(getExerciseLabel({ name: "front_squat" }), "front squat");
  assert.equal(getExerciseLabel({ display_name: "Squat", display_name_en: "Back Squat", display_name_fr: "Squat arrière" }, "en"), "Back Squat");
  assert.equal(getExerciseLabel({ display_name: "Squat", display_name_en: "Back Squat", display_name_fr: "Squat arrière" }, "fr"), "Squat arrière");
  assert.deepEqual(
    getExerciseCategories([{ category: "legs, glutes" }, { category: "" }, { category: "pull" }, { category: "legs" }]),
    ["glutes", "legs", "pull"],
  );
});
