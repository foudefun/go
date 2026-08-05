import test from "node:test";
import assert from "node:assert/strict";
import { buildActivityChartSeries, formatActivityChartValue } from "./activityChart.js";

test("builds heart rate, pace, power, cadence and altitude chart series", () => {
  const points = Array.from({ length: 5 }, (_, index) => ({
    t: index * 30,
    distance_m: index * 100,
    hr: 130 + index,
    power: 200 + index * 5,
    cadence: 80 + index,
    altitude_m: 400 + index * 2,
  }));
  const result = buildActivityChartSeries({ source_files: [{ series: { points } }] });
  assert.deepEqual(result.map((series) => series.key), ["heart_rate", "pace", "power", "cadence", "altitude"]);
  assert.equal(formatActivityChartValue("pace", result[1].points[1].value), "5:00 /km");
});

test("uses direct speed for pace when distance is unavailable", () => {
  const result = buildActivityChartSeries({
    source_files: [{ series: { points: [{ t: 0, speed_mps: 3 }, { t: 5, speed_mps: 4 }] } }],
  });
  assert.equal(result[0].key, "pace");
  assert.equal(formatActivityChartValue("pace", result[0].points[0].value), "5:33 /km");
});
