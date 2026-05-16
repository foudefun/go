import test from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  buildTargetPreview,
  getTargetForDate,
  normalizeConfigDraft,
  normalizePositiveFloat,
} from "./settingsConfig.js";

test("normalizes settings config with positive integer bounds", () => {
  assert.deepEqual(
    normalizeConfigDraft({
      start_date: "2026-05-01",
      start_load: "20",
      increment: "0",
      weight: "bad",
      shoe_size: "42.7",
      increment_every_days: "-4",
      sport_after_days: "10.9",
    }),
    {
      start_date: "2026-05-01",
      start_load: 20,
      increment: 1,
      weight: 75,
      shoe_size: 42.7,
      increment_every_days: 1,
      sport_after_days: 10,
    },
  );
});

test("normalizes decimal shoe size context", () => {
  assert.equal(normalizePositiveFloat("43.46", 42), 43.5);
  assert.equal(normalizePositiveFloat("bad", 42), 42);
});

test("computes target load for a rehab date", () => {
  assert.deepEqual(
    getTargetForDate(
      {
        start_date: "2026-05-01",
        start_load: 10,
        increment: 5,
        weight: 80,
        increment_every_days: 2,
        sport_after_days: 7,
      },
      "2026-05-05",
    ),
    {
      date: "2026-05-05",
      rehab_day: 5,
      target_load: 20,
      target_pct_bw: 25,
      sport_allowed: false,
    },
  );
});

test("builds a stable target preview", () => {
  const rows = buildTargetPreview(
    {
      start_date: "2026-05-01",
      start_load: 10,
      increment: 5,
      weight: 80,
      increment_every_days: 2,
      sport_after_days: 7,
    },
    "2026-05-05",
  );
  assert.equal(rows.length, 4);
  assert.equal(rows[0].date, "2026-05-05");
  assert.equal(addDays("2026-05-05", 7), "2026-05-12");
});
