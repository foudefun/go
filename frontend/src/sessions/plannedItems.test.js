import test from "node:test";
import assert from "node:assert/strict";
import {
  formatPlannedItem,
  getPlannedItemTitle,
  normalizePlannedItem,
  normalizePlannedItems,
} from "./plannedItems.js";

test("normalizes planned item numeric fields and trims text", () => {
  assert.deepEqual(
    normalizePlannedItem({
      exercise_name: " squat ",
      custom_name: " Heavy ",
      block: " A ",
      work_type: "force",
      sets: "4",
      reps: "5",
      duration_min: "",
      duration_sec: "-1",
      notes: " controlled ",
      used_equipment: [" barbell ", "", "rack"],
    }),
    {
      exercise_name: "squat",
      custom_name: "Heavy",
      block: "A",
      work_type: "force",
      sets: 4,
      reps: 5,
      notes: "controlled",
      used_equipment: ["barbell", "rack"],
    },
  );
});

test("drops empty planned items", () => {
  assert.deepEqual(
    normalizePlannedItems([
      { exercise_name: "", sets: "" },
      { custom_name: "Mobility", duration_min: "12" },
    ]),
    [{ custom_name: "Mobility", work_type: "resistance", duration_min: 12 }],
  );
});

test("gets planned item labels from library metadata", () => {
  const exerciseMap = new Map([["goblet_squat", { name: "goblet_squat", display_name: "Goblet squat" }]]);
  assert.equal(getPlannedItemTitle({ exercise_name: "goblet_squat" }, exerciseMap), "Goblet squat");
  assert.equal(getPlannedItemTitle({ custom_name: "Outdoor stairs" }, exerciseMap), "Outdoor stairs");
});

test("formats compact planned item summaries", () => {
  assert.equal(
    formatPlannedItem({ block: "A", work_type: "endurance", sets: 3, reps: 12, duration_min: 8 }),
    "A - 3 x 12 reps - 8 min - Endurance",
  );
});
