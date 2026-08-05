import test from "node:test";
import assert from "node:assert/strict";
import { ACTIVITY_CSV_COLUMNS, buildActivityChartSeries, buildActivityCsv, buildActivityCsvFilename, formatActivityChartValue } from "./activityChart.js";

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

test("exports all activity stream fields and aggregate metrics as CSV", () => {
  const csv = buildActivityCsv({
    title: 'Run, "easy"', activity_type: "course_a_pied", note: "Good\nstride",
    source_files: [{
      label: "Intervals.icu", provider: "Intervals.icu", filename: "run.fit",
      parsed: { started_at: "2026-08-04T07:00:00.000Z" },
      metrics: { duration: { seconds: 60 }, distance: { km: 0.2 }, heart_rate: { avg: 132, max: 145 } },
      series: { points: [
        { t: 0, distance_m: 0, hr: 125, speed_mps: 3.2, altitude_m: 400, lat: 46.2, lon: 6.1 },
        { t: 60, distance_m: 200, hr: 140, speed_mps: 3.4, altitude_m: 405, lat: 46.21, lon: 6.11 },
      ] },
    }],
  });
  const lines = csv.split("\r\n");
  assert.equal(lines[0], ACTIVITY_CSV_COLUMNS.join(","));
  assert.match(lines[1], /^"Run, ""easy""",course_a_pied,"Good/);
  assert.match(lines[2], /2026-08-04T07:01:00\.000Z,140,4\.902,12\.24/);
  assert.match(lines[2], /,60,0\.2,132,145,/);
  assert.equal(buildActivityCsvFilename({ title: "Geneva / Easy Run" }, "2026-08-04"), "2026-08-04-geneva-easy-run.csv");
});
