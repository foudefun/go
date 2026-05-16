import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAuditQuery,
  formatAuditDateTime,
  getAuditTargetLabel,
  normalizeAdminSummary,
  normalizeAuditLimit,
} from "./adminTools.js";

test("normalizes audit log limits", () => {
  assert.equal(normalizeAuditLimit("25"), 25);
  assert.equal(normalizeAuditLimit("9999"), 500);
  assert.equal(normalizeAuditLimit("bad"), 100);
});

test("builds audit query strings", () => {
  assert.equal(
    buildAuditQuery({ username: "admin", action: "login", dateFrom: "2026-05-01", dateTo: "2026-05-16", limit: 50 }),
    "username=admin&action=login&date_from=2026-05-01&date_to=2026-05-16&limit=50",
  );
});

test("normalizes admin summary arrays and metrics", () => {
  assert.deepEqual(normalizeAdminSummary({ total_actions_7d: "4", latest_by_user: "bad" }).latest_by_user, []);
  assert.equal(normalizeAdminSummary({ total_actions_7d: "4" }).total_actions_7d, 4);
});

test("formats audit metadata", () => {
  assert.equal(formatAuditDateTime("not-a-date"), "not-a-date");
  assert.equal(getAuditTargetLabel({ target_type: "user", target_key: "admin" }), "user: admin");
});
