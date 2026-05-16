import { useEffect, useMemo, useState } from "react";
import { getCalendar } from "../api/calendarApi.js";

export default function ActivitiesPage() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    getCalendar({ daysBack: 45, daysForward: 7 })
      .then((payload) => {
        if (isMounted) setRows(Array.isArray(payload) ? payload : []);
      })
      .catch((activityError) => {
        if (isMounted) setError(activityError.message);
      });
    return () => {
      isMounted = false;
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
            load: row.actual_load,
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
        <a className="secondary-action" href="/legacy.html">
          Add Activity
        </a>
      </section>
      {error ? <div className="error-banner">{error}</div> : null}
      <section className="card-grid">
        {activities.map((activity) => (
          <article className="app-panel activity-card" key={activity.id}>
            <span>{activity.date}</span>
            <strong>{activity.title}</strong>
            <small>{activity.types || "Activity"} - {activity.load || 0} kg</small>
          </article>
        ))}
        {!activities.length && !error ? <div className="app-panel empty-state">No recent activities loaded.</div> : null}
      </section>
    </main>
  );
}
