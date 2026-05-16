import { useEffect, useMemo, useState } from "react";
import { getCalendar } from "../api/calendarApi.js";
import {
  getActivityTypeColor,
  getActivityTypeLabel,
  getActivityTypeShortLabel,
} from "../domain/activityTypes.js";
import DaySessionModal from "../sessions/components/DaySessionModal.jsx";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatLocalDateIso(dateValue) {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getLocalTodayIso() {
  return formatLocalDateIso(new Date());
}

function addDays(dateValue, days) {
  const next = new Date(dateValue);
  next.setDate(next.getDate() + days);
  return next;
}

function getMonthDate(monthValue, day = 1) {
  const [year, month] = monthValue.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getMonthGridRange(monthValue) {
  const first = getMonthDate(monthValue, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const startOffset = (first.getDay() + 6) % 7;
  const endOffset = 6 - ((last.getDay() + 6) % 7);
  const start = addDays(first, -startOffset);
  const end = addDays(last, endOffset);
  return {
    startDate: formatLocalDateIso(start),
    endDate: formatLocalDateIso(end),
  };
}

function shiftMonth(monthValue, delta) {
  const base = getMonthDate(monthValue, 1);
  base.setMonth(base.getMonth() + delta);
  return formatLocalDateIso(base).slice(0, 7);
}

function getMonthLabel(monthValue) {
  return getMonthDate(monthValue, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

function getMonthGridDays(monthValue, rowsByDate) {
  const { startDate, endDate } = getMonthGridRange(monthValue);
  const days = [];
  let cursor = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  while (cursor <= end) {
    const date = formatLocalDateIso(cursor);
    days.push({
      date,
      row: rowsByDate.get(date),
      inMonth: date.slice(0, 7) === monthValue,
    });
    cursor = addDays(cursor, 1);
  }
  return days;
}

function formatActivityTypes(row) {
  const values = Array.isArray(row.activity_types) ? row.activity_types : [];
  if (values.length) return values.map(getActivityTypeLabel).join(", ");
  return getActivityTypeLabel(row.activity_type);
}

function getActivityEntries(row) {
  const explicitEntries = Array.isArray(row?.activity_entries) ? row.activity_entries : [];
  if (explicitEntries.length) {
    return explicitEntries
      .map((entry) => ({
        activity_type: String(entry.activity_type || "").trim(),
        summary: String(entry.summary || "").trim(),
      }))
      .filter((entry) => entry.activity_type || entry.summary);
  }

  const activityTypes = Array.isArray(row?.activity_types) ? row.activity_types : [];
  const summaries = Array.isArray(row?.activity_summaries) ? row.activity_summaries : [];
  return activityTypes.map((activityType, index) => ({
    activity_type: activityType,
    summary: summaries[index] || "",
  }));
}

function hasTarget(row) {
  return row?.target_load !== null && row?.target_load !== undefined;
}

function ActivityBadge({ entry, compact = false }) {
  const activityType = entry.activity_type;
  const label = compact ? getActivityTypeShortLabel(activityType) : getActivityTypeLabel(activityType);
  return (
    <span className={compact ? "activity-type-badge compact" : "activity-type-badge"} style={{ backgroundColor: getActivityTypeColor(activityType) }}>
      {label}
    </span>
  );
}

export default function CalendarPage() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(getLocalTodayIso().slice(0, 7));
  const [calendarView, setCalendarView] = useState("month");

  function loadCalendarRows() {
    let isMounted = true;
    setStatus("loading");
    const range = getMonthGridRange(calendarMonth);
    getCalendar(range)
      .then((payload) => {
        if (!isMounted) return;
        setRows(Array.isArray(payload) ? payload : []);
        setStatus("ready");
      })
      .catch((calendarError) => {
        if (!isMounted) return;
        setStatus("error");
        setError(calendarError.message);
      });
    return () => {
      isMounted = false;
    };
  }

  useEffect(() => {
    return loadCalendarRows();
  }, [calendarMonth]);

  const todayIso = getLocalTodayIso();
  const today = rows.find((row) => row.date === todayIso);
  const rowsByDate = useMemo(() => new Map(rows.map((row) => [row.date, row])), [rows]);
  const monthDays = useMemo(() => getMonthGridDays(calendarMonth, rowsByDate), [calendarMonth, rowsByDate]);
  const completedCount = useMemo(
    () => rows.filter((row) => row.status === "done" || Number(row.activity_count || 0) > 0).length,
    [rows],
  );

  return (
    <main className="page-shell">
      <section className="module-header">
        <div>
          <p className="eyebrow">Training</p>
          <h1>Calendar</h1>
        </div>
        <button className="secondary-action" type="button" onClick={() => setSelectedDate(todayIso)}>
          Open Today
        </button>
      </section>

      <section className="calendar-toolbar app-panel">
        <div className="month-controls">
          <button type="button" onClick={() => setCalendarMonth((month) => shiftMonth(month, -1))}>
            Previous
          </button>
          <label>
            Month
            <input
              type="month"
              value={calendarMonth}
              onChange={(event) => setCalendarMonth(event.target.value || getLocalTodayIso().slice(0, 7))}
            />
          </label>
          <button type="button" onClick={() => setCalendarMonth(getLocalTodayIso().slice(0, 7))}>
            Today
          </button>
          <button type="button" onClick={() => setCalendarMonth((month) => shiftMonth(month, 1))}>
            Next
          </button>
        </div>
        <div className="view-switch">
          <button
            type="button"
            className={calendarView === "month" ? "active" : ""}
            onClick={() => setCalendarView("month")}
          >
            Month
          </button>
          <button
            type="button"
            className={calendarView === "list" ? "active" : ""}
            onClick={() => setCalendarView("list")}
          >
            List
          </button>
        </div>
      </section>

      <section className="summary-grid">
        <div className="app-panel metric-card">
          <span>Today</span>
          <strong>{today?.date || todayIso}</strong>
          <small>{today ? formatActivityTypes(today) : "No entry loaded"}</small>
        </div>
        <div className="app-panel metric-card">
          <span>Displayed Month</span>
          <strong>{getMonthLabel(calendarMonth)}</strong>
          <small>{completedCount} visible day(s) with activity</small>
        </div>
        <div className="app-panel metric-card">
          <span>Current Target</span>
          <strong>{hasTarget(today) ? `${today.target_load} kg` : "-"}</strong>
          <small>{today?.target_pct_bw ? `${today.target_pct_bw}% bodyweight` : "Target ended"}</small>
        </div>
      </section>

      <section className="app-panel calendar-panel">
        {status === "loading" ? <div className="empty-state">Loading calendar...</div> : null}
        {status === "error" ? <div className="error-banner">{error}</div> : null}
        {status === "ready" && calendarView === "month" ? (
          <div className="month-calendar" aria-label={`${getMonthLabel(calendarMonth)} calendar`}>
            {WEEKDAY_LABELS.map((label) => (
              <div className="month-weekday" key={label}>
                {label}
              </div>
            ))}
            {monthDays.map(({ date, row, inMonth }) => {
              const activityEntries = getActivityEntries(row);
              const summaries = activityEntries.map((entry) => entry.summary).filter(Boolean);
              return (
                <button
                  className={`month-day${inMonth ? "" : " outside"}${date === todayIso ? " today" : ""}`}
                  type="button"
                  key={date}
                  onClick={() => setSelectedDate(date)}
                >
                  <span className="month-day-number">{Number(date.slice(8, 10))}</span>
                  {row ? (
                    <>
                      {hasTarget(row) ? <span className="month-day-target">{row.target_load} kg target</span> : null}
                      {activityEntries.length ? (
                        <span className="month-day-activity-list">
                          {activityEntries.slice(0, 3).map((entry, index) => (
                            <ActivityBadge entry={entry} compact key={`${date}-${entry.activity_type}-${index}`} />
                          ))}
                        </span>
                      ) : null}
                      {summaries.length ? (
                        <span className="month-day-summary-list">
                          {summaries.slice(0, 2).map((summary, index) => (
                            <span className="month-day-summary" key={`${date}-${summary}-${index}`}>
                              {summary}
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="month-day-target">No data</span>
                  )}
                </button>
              );
            })}
          </div>
        ) : null}
        {status === "ready" && calendarView === "list" ? (
          <div className="react-table" role="table" aria-label="Calendar">
            <div className="react-table-row header" role="row">
              <div>Date</div>
              <div>Activities</div>
              <div>Target</div>
              <div>Status</div>
            </div>
            {rows.map((row) => (
              <button className="react-table-row clickable-row" type="button" role="row" key={row.date} onClick={() => setSelectedDate(row.date)}>
                <div>
                  <strong>{row.date}</strong>
                  <small>Day {row.rehab_day}</small>
                </div>
                <div>
                  <strong className="calendar-list-badges">
                    {getActivityEntries(row).length
                      ? getActivityEntries(row).map((entry, index) => (
                          <ActivityBadge entry={entry} key={`${row.date}-${entry.activity_type}-${index}`} />
                        ))
                      : formatActivityTypes(row)}
                  </strong>
                  <small>{(row.activity_summaries || []).join(" | ") || row.activity_details || "-"}</small>
                </div>
                <div>{hasTarget(row) ? `${row.target_load} kg` : "-"}</div>
                <div>{row.status || "todo"}</div>
              </button>
            ))}
          </div>
        ) : null}
      </section>
      {selectedDate ? (
        <DaySessionModal
          date={selectedDate}
          onClose={() => setSelectedDate("")}
          onSaved={() => {
            loadCalendarRows();
          }}
        />
      ) : null}
    </main>
  );
}
