import test from "node:test";
import assert from "node:assert/strict";
import {
  buildImportAiPrompt,
  detectActivityFileFormat,
  detectProgramImportFormat,
  summarizeProgramImport,
} from "./importTools.js";

test("detects program import formats from content and filename", () => {
  assert.equal(detectProgramImportFormat('{"planned_sessions":[]}', "program.json"), "json");
  assert.equal(detectProgramImportFormat("date,exercise_name\n2026-05-20,squat", "plan.csv"), "schedule_csv");
  assert.equal(detectProgramImportFormat("name,display_name\nsquat,Squat", "exercises.csv"), "exercises_csv");
});

test("detects activity file formats", () => {
  assert.equal(detectActivityFileFormat("ride.fit"), "fit");
  assert.equal(detectActivityFileFormat("route.TCX"), "tcx");
  assert.equal(detectActivityFileFormat("walk.gpx"), "gpx");
  assert.equal(detectActivityFileFormat("upload.bin"), "auto");
});

test("summarizes program import counts", () => {
  assert.deepEqual(
    summarizeProgramImport({ imported_sessions: "2", created_exercises: 1, updated_exercises: null }),
    { imported_sessions: 2, created_exercises: 1, updated_exercises: 0 },
  );
});

test("builds AI prompt with importer schema", () => {
  const prompt = buildImportAiPrompt();
  assert.match(prompt, /planned_sessions/);
  assert.match(prompt, /snake_case/);
});
