import { useEffect, useMemo, useState } from "react";
import { getCalendar } from "../api/calendarApi.js";
import DaySessionModal from "../sessions/components/DaySessionModal.jsx";

function formatLocalDateIso(dateValue) {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getLocalTodayIso() {
  return formatLocalDateIso(new Date());
}

export default function ActivitiesPage() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("loading");
  const [activityDate, setActivityDate] = useState(getLocalTodayIso());
  const [selectedDate, setSelectedDate] = useState("");

  function loadActivityRows({ mountedRef } = {}) {
    setStatus("loading");
    setError("");
    getCalendar({ daysBack: 45, daysForward: 7 })
      .then((payload) => {
        if (mountedRef && !mountedRef.current) return;
        setRows(Array.isArray(payload) ? payload : []);
        setStatus("ready");
      })
      .catch((activityError) => {
        if (mountedRef && !mountedRef.current) return;
        setError(activityError.message);
        setStatus("error");
      });
  }

  useEffect(() => {
    const mountedRef = { current: true };
    loadActivityRows({ mountedRef });
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const activities = useMemo(
    () =>
      rows
        .filter((row) => Number(row.activity_count || 0) > 0 || (row.activity_summaries || []).length)
        .flatMap((row) => {
          const summaries = row.activity_summaries?.length ? row.activity_summaries : [row.activity_details || row.activity_type || "Activity"];
          return summaries.map((summary, index) => ({
            id: `${row.date}-${index}`,
            date: row.date,
            title: summary,
            types: row.activity_types?.length ? row.activity_types.join(", ") : row.activity_type,
          }));
        }),
    [rows],
  );

  return (
    <main className="page-shell">
      <section className="module-header">
        <div>
          <p className="eyebrow">Training</p>
          <h1>Activities</h1>
        </div>
        <div className="activity-add-controls">
          <label>
            Date
            <input
              type="date"
              value={activityDate}
              onChange={(event) => setActivityDate(event.target.value || getLocalTodayIso())}
            />
          </label>
          <button
            className="primary-action"
            type="button"
            onClick={() => setSelectedDate(activityDate || getLocalTodayIso())}
          >
            Add Activity
          </button>
        </div>
      </section>
      {error ? <div className="error-banner">{error}</div> : null}
      {status === "loading" ? <div className="empty-state">Loading activities...</div> : null}
      <section className="card-grid">
        {activities.map((activity) => (
          <article className="app-panel activity-card" key={activity.id}>
            <span>{activity.date}</span>
            <strong>{activity.title}</strong>
            <small>{activity.types || "Activity"}</small>
          </article>
        ))}
        {!activities.length && status !== "loading" && !error ? (
          <div className="app-panel empty-state">No recent activities loaded.</div>
        ) : null}
      </section>
      {selectedDate ? (
        <DaySessionModal
          date={selectedDate}
          createNewOnOpen
          onClose={() => setSelectedDate("")}
          onSaved={() => loadActivityRows()}
        />
      ) : null}
    </main>
  );
}
