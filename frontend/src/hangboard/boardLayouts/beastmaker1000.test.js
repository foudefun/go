import test from "node:test";
import assert from "node:assert/strict";
import {
  BEASTMAKER_1000_HOLD_BY_SLUG,
  BEASTMAKER_1000_HOLDS,
  BEASTMAKER_1000_HOLD_GROUPS,
  getValidBeastmaker1000HoldSlugs,
} from "./beastmaker1000.js";

test("beastmaker 1000 hold slugs are unique", () => {
  const slugs = BEASTMAKER_1000_HOLDS.map((hold) => hold.slug);
  assert.equal(slugs.length, new Set(slugs).size);
});

test("very deep 4-finger pocket is one center hold", () => {
  assert.equal(BEASTMAKER_1000_HOLD_BY_SLUG.very_deep_4_finger_center.side, "center");
  assert.equal(BEASTMAKER_1000_HOLD_BY_SLUG.very_deep_4_finger_center.supportsBothHands, true);
  assert.equal(Boolean(BEASTMAKER_1000_HOLD_BY_SLUG.very_deep_4_finger_left), false);
  assert.equal(Boolean(BEASTMAKER_1000_HOLD_BY_SLUG.very_deep_4_finger_right), false);
});

test("all hold groups reference known hold slugs", () => {
  for (const slugs of Object.values(BEASTMAKER_1000_HOLD_GROUPS)) {
    for (const slug of slugs) {
      assert.ok(BEASTMAKER_1000_HOLD_BY_SLUG[slug], slug);
    }
  }
});

test("unknown hold slugs are ignored safely", () => {
  assert.deepEqual(getValidBeastmaker1000HoldSlugs(["jug_left", "not_real"]), ["jug_left"]);
});
