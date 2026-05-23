import test from "node:test";
import assert from "node:assert/strict";
import { buildCompletionLog, formatDuration, getHangSteps } from "./hangboard.js";

test("formats hangboard durations", () => {
  assert.equal(formatDuration(7), "7s");
  assert.equal(formatDuration(187), "3:07");
});

test("builds completion logs from failed hang statuses", () => {
  const workout = {
    steps: [
      { type: "hang" },
      { type: "rest" },
      { type: "hang" },
      { type: "hang" },
    ],
  };
  assert.equal(getHangSteps(workout).length, 3);
  assert.deepEqual(buildCompletionLog(workout, { 1: "failed" }, 7, 1), {
    completedReps: 2,
    failedReps: 1,
    averageRpe: 7,
    painScore: 1,
    notes: "",
  });
});
