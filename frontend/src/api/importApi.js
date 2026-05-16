import { api } from "./client.js";

export function importProgram(payload) {
  return api("/import/program", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function importActivityFile({ file, format = "auto", activityTypeOverride = "", dateOverride = "", title = "", note = "" }) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("format", format);
  formData.append("activity_type_override", activityTypeOverride);
  formData.append("date_override", dateOverride);
  formData.append("title", title);
  formData.append("note", note);

  return api("/import/activity-file", {
    method: "POST",
    body: formData,
  });
}
