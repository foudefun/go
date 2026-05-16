import { api } from "./client.js";

export function getCalendar({ daysBack = 14, daysForward = 21, startDate = "", endDate = "" } = {}) {
  const params = new URLSearchParams();
  if (startDate || endDate) {
    params.set("start_date", startDate);
    params.set("end_date", endDate);
  } else {
    params.set("days_back", String(daysBack));
    params.set("days_forward", String(daysForward));
  }
  return api(`/calendar?${params.toString()}`);
}
