import test from "node:test";
import assert from "node:assert/strict";
import { BEASTMAKER_1000_EXERCISE_CARDS, getExerciseCardUrl } from "./exerciseCards.js";
import { BEASTMAKER_1000_HOLD_BY_SLUG } from "./boardLayouts/beastmaker1000.js";
import { BEASTMAKER_1000_EXERCISE_PRESCRIPTIONS } from "./exercisePrescriptions.js";

test("returns Beastmaker 1000 card URLs for known exercise groups", () => {
  assert.equal(
    getExerciseCardUrl({ holdSlugs: ["deep_4_finger_left", "deep_4_finger_right"], loadMode: "bodyweight" }, "strength_endurance"),
    "/assets/hangboard/beastmaker1000/cards/deep_4f_repeater.png",
  );
  assert.equal(
    getExerciseCardUrl({ holdSlugs: ["sloper_35_left", "sloper_35_right"], loadMode: "assisted" }, "max_strength"),
    "/assets/hangboard/beastmaker1000/cards/sloper_35_assisted.png",
  );
});

test("all configured exercise card files are PNGs", () => {
  for (const file of Object.values(BEASTMAKER_1000_EXERCISE_CARDS)) {
    assert.equal(file.endsWith(".png"), true);
  }
});

test("exercise prescriptions reference known Beastmaker 1000 holds", () => {
  assert.equal(BEASTMAKER_1000_EXERCISE_PRESCRIPTIONS.length >= 30, true);
  for (const prescription of BEASTMAKER_1000_EXERCISE_PRESCRIPTIONS) {
    assert.equal(Boolean(prescription.coachingCue), true);
    for (const slug of prescription.holdSlugs) {
      assert.ok(BEASTMAKER_1000_HOLD_BY_SLUG[slug], slug);
    }
  }
});
