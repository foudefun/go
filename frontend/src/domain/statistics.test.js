import test from "node:test";
import assert from "node:assert/strict";
import { aggregateMetric, buildDailyStats, buildMonthlyStats, formatStatValue } from "./statistics.js";

test("builds daily and monthly stats from calendar activity entries", () => {
  const daily = buildDailyStats([
    {
      date: "2026-05-01",
      activity_entries: [
        {
          source_files: [
            {
              metrics: {
                duration: { seconds: 3600 },
                distance: { km: 10.5 },
                power: { avg: 180, max: 420 },
                heart_rate: { avg: 145 },
                calories: { total: 650 },
              },
            },
          ],
        },
        {
          performed_items: [
            { sets: [{ reps: 10, weight: 40 }, { reps: 8, weight: 45 }] },
          ],
        },
      ],
    },
    {
      date: "2026-05-02",
      activity_entries: [{ source_files: [{ metrics: { duration: { seconds: 1800 }, distance: { km: 5 } } }] }],
    },
  ]);

  assert.equal(daily[0].activity_count, 2);
  assert.equal(daily[0].duration_min, 60);
  assert.equal(daily[0].distance_km, 10.5);
  assert.equal(daily[0].power, 180);
  assert.equal(daily[0].avg_power, 180);
  assert.equal(daily[0].max_power, 420);
  assert.equal(daily[0].avg_hr, 145);
  assert.equal(daily[0].calories, 650);
  assert.equal(daily[0].strength_items, 1);
  assert.equal(daily[0].sets, 2);
  assert.equal(daily[0].total_reps, 18);
  assert.equal(daily[0].volume_kg, 760);

  const monthly = buildMonthlyStats(daily);
  assert.equal(monthly.length, 1);
  assert.equal(monthly[0].activity_count, 3);
  assert.equal(monthly[0].distance_km, 15.5);
});

test("formats and aggregates metric values", () => {
  assert.equal(formatStatValue(42.42, "distance_km"), "42.4 km");
  assert.equal(formatStatValue(92.3, "duration_min"), "92 min");
  assert.equal(aggregateMetric([{ activity_count: 2 }, { activity_count: 3 }], "activity_count"), 5);
  assert.equal(aggregateMetric([{ avg_power: 100 }, { avg_power: 200 }], "avg_power"), 150);
});

test("filters stats by activity type", () => {
  const daily = buildDailyStats(
    [
      {
        date: "2026-05-01",
        activity_entries: [
          { activity_type: "cycling", source_files: [{ metrics: { distance: { km: 20 } } }] },
          { activity_type: "running", source_files: [{ metrics: { distance: { km: 5 } } }] },
        ],
      },
    ],
    "cycling",
  );
  assert.equal(daily[0].activity_count, 1);
  assert.equal(daily[0].distance_km, 20);
});
