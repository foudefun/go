import test from "node:test";
import assert from "node:assert/strict";
import { aggregateMetric, buildDailyStats, buildMonthlyStats, formatStatValue, getAvailableStatisticActivityTypes } from "./statistics.js";

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
                heart_rate: { avg: 145, max: 172 },
                cadence: { avg: 82 },
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
  assert.equal(daily[0].max_hr, 172);
  assert.equal(daily[0].avg_cadence, 82);
  assert.equal(daily[0].speed_kmh, 10.5);
  assert.equal(Number(daily[0].pace_min_km.toFixed(2)), 5.71);
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
          { activity_type: "velo", source_files: [{ metrics: { duration: { seconds: 3600 }, distance: { km: 20 } } }] },
          { activity_type: "course_a_pied", source_files: [{ metrics: { duration: { seconds: 1200 }, distance: { km: 5 } } }] },
        ],
      },
    ],
    "velo",
  );
  assert.equal(daily[0].activity_count, 1);
  assert.equal(daily[0].duration_min, 60);
  assert.equal(daily[0].distance_km, 20);
});

test("filters imported source metrics by parsed activity type", () => {
  const rows = [
    {
      date: "2026-05-01",
      activity_entries: [
        {
          source_files: [
            { parsed: { activity_type: "cycling" }, metrics: { duration: { seconds: 3600 }, distance: { km: 20 } } },
            { parsed: { activity_type: "running" }, metrics: { duration: { seconds: 1200 }, distance: { km: 5 } } },
          ],
        },
      ],
    },
  ];
  const availableTypes = getAvailableStatisticActivityTypes(rows);
  const allDaily = buildDailyStats(rows);
  const cyclingDaily = buildDailyStats(rows, "velo");
  const runningDaily = buildDailyStats(rows, "course_a_pied");

  assert.equal(availableTypes.has("velo"), true);
  assert.equal(availableTypes.has("course_a_pied"), true);
  assert.equal(allDaily[0].duration_min, 80);
  assert.equal(cyclingDaily[0].activity_count, 1);
  assert.equal(cyclingDaily[0].duration_min, 60);
  assert.equal(cyclingDaily[0].distance_km, 20);
  assert.equal(runningDaily[0].duration_min, 20);
  assert.equal(runningDaily[0].distance_km, 5);
});

test("reads legacy imported activity metrics from details text", () => {
  const rows = [
    {
      date: "2026-05-01",
      activity_entries: [
        {
          activity_type: "velo",
          details: "Import FIT: cycling (virtual activity)Fichier: MyWhoosh.fitDurée 01:29:27 | Distance 42.50 km | Puissance moy. 160 W | Puissance max 362 W | FC moy. 0 bpm | FC max 0 bpm | Cadence moy. 73 rpm | Calories 864",
        },
        {
          activity_type: "musculation",
          performed_items: [{ exercise_name: "bench_press", sets: [{ reps: 10, weight: 60 }] }],
        },
      ],
    },
  ];

  const allDaily = buildDailyStats(rows);
  const cyclingDaily = buildDailyStats(rows, "velo");
  const strengthDaily = buildDailyStats(rows, "musculation");

  assert.equal(Math.round(allDaily[0].duration_min), 89);
  assert.equal(Math.round(cyclingDaily[0].duration_min), 89);
  assert.equal(cyclingDaily[0].distance_km, 42.5);
  assert.equal(cyclingDaily[0].avg_power, 160);
  assert.equal(cyclingDaily[0].max_power, 362);
  assert.equal(cyclingDaily[0].avg_cadence, 73);
  assert.equal(cyclingDaily[0].calories, 864);
  assert.equal(strengthDaily[0].duration_min, 0);
});

test("includes indoor cycling performed inside strength activities", () => {
  const rows = [
    {
      date: "2026-05-01",
      activity_entries: [
        {
          activity_type: "musculation",
          performed_items: [
            { exercise_name: "bike_intervals", sets: [{ duration_sec: 600, watts: 160 }] },
            { exercise_name: "bench_press", sets: [{ reps: 10, weight: 60 }] },
          ],
        },
      ],
    },
  ];
  const availableTypes = getAvailableStatisticActivityTypes(rows);
  const daily = buildDailyStats(
    rows,
    "velo",
  );
  assert.equal(availableTypes.has("velo"), true);
  assert.equal(daily[0].activity_count, 1);
  assert.equal(daily[0].duration_min, 10);
  assert.equal(daily[0].sets, 1);
  assert.equal(daily[0].total_reps, 0);
  assert.equal(daily[0].volume_kg, 0);
});
