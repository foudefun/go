import test from "node:test";
import assert from "node:assert/strict";
import {
  formatPerformedSet,
  getExerciseDisplayName,
  getUniqueExerciseNames,
  normalizePerformedItems,
  normalizePerformedSet,
} from "./strengthItems.js";

test("normalizes reps and weight sets", () => {
  assert.deepEqual(
    normalizePerformedSet({ reps: "8", weight: "42.456", weight_unit: "lb" }, "reps_weight"),
    { reps: 8, weight: 42.46, weight_unit: "lb" },
  );
});

test("normalizes timed watt sets", () => {
  assert.deepEqual(
    normalizePerformedSet({ duration_sec: "90", watts: "220.2" }, "time_watts"),
    { duration_sec: 90, watts: 220.2 },
  );
});

test("normalizes performed items against exercise metadata", () => {
  const exercises = [{ name: "bike_intervals", tracking_mode: "time_watts", weight_unit: "kg" }];
  const items = normalizePerformedItems(
    [
      {
        exercise_name: "bike_intervals",
        custom_name: "Threshold",
        work_mode: "superset",
        work_type: "endurance",
        sets: [{ duration_sec: "300", watts: "250" }],
      },
    ],
    exercises,
  );

  assert.equal(items[0].work_mode, "superset");
  assert.equal(items[0].work_type, "endurance");
  assert.deepEqual(items[0].sets, [{ duration_sec: 300, watts: 250 }]);
});

test("builds unique exercise mirrors for backend calendar summaries", () => {
  assert.deepEqual(
    getUniqueExerciseNames([
      { exercise_name: "squat" },
      { exercise_name: "squat" },
      { exercise_name: "bench" },
      { custom_name: "No library item" },
    ]),
    ["squat", "bench"],
  );
});

test("gets exercise display names in the selected language", () => {
  const exercise = {
    name: "split_squat",
    display_name: "Legacy split squat",
    display_name_fr: "Fente bulgare",
    display_name_en: "Bulgarian split squat",
  };

  assert.equal(getExerciseDisplayName(exercise, "fr"), "Fente bulgare");
  assert.equal(getExerciseDisplayName(exercise, "en"), "Bulgarian split squat");
  assert.equal(
    getExerciseDisplayName({ name: "front_squat", display_name: "Legacy front squat" }, "fr"),
    "Legacy front squat",
  );
});

test("formats set labels for the React editor", () => {
  assert.equal(formatPerformedSet({ reps: 5, weight: 40, weight_unit: "kg" }), "5 reps x 40 kg");
  assert.equal(formatPerformedSet({ duration_sec: 75, watts: 180 }), "1:15 @ 180 W");
});
