import { useEffect, useMemo, useState } from "react";
import { getCalendar } from "../api/calendarApi.js";
import { getActivityTypeLabel } from "../domain/activityTypes.js";
import { useTranslation } from "../i18n/translations.js";
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
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("loading");
  const [activityDate, setActivityDate] = useState(getLocalTodayIso());
  const [modalState, setModalState] = useState(null);

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
            activityType: row.activity_types?.[index] || row.activity_type || "",
          }));
        }),
    [rows],
  );

  function openNewActivity() {
    const date = activityDate || getLocalTodayIso();
    setModalState({
      date,
      createNewOnOpen: true,
      initialActivity: null,
    });
  }

  function openExistingActivity(date) {
    setModalState({ date, createNewOnOpen: false, initialActivity: null });
  }

  return (
    <main className="page-shell">
      <section className="module-header">
        <div>
          <p className="eyebrow">{t("Training")}</p>
          <h1>{t("Activities")}</h1>
        </div>
      </section>
      <section className="calendar-toolbar app-panel activity-toolbar">
        <div className="activity-add-controls">
          <label>
            {t("Date")}
            <input
              type="date"
              value={activityDate}
              onChange={(event) => setActivityDate(event.target.value || getLocalTodayIso())}
            />
          </label>
          <button className="primary-action" type="button" onClick={openNewActivity}>
            {t("+ Activity")}
          </button>
        </div>
      </section>
      {error ? <div className="error-banner">{error}</div> : null}
      {status === "loading" ? <div className="empty-state">{t("Loading activities...")}</div> : null}
      <section className="card-grid">
        {activities.map((activity) => (
          <button className="app-panel activity-card clickable-card" type="button" key={activity.id} onClick={() => openExistingActivity(activity.date)}>
            <span>{activity.date}</span>
            <strong>{activity.title}</strong>
            <small>{activity.types ? activity.types.split(", ").map((type) => t(getActivityTypeLabel(type))).join(", ") : t("Activity")}</small>
          </button>
        ))}
        {!activities.length && status !== "loading" && !error ? (
          <div className="app-panel empty-state">{t("No recent activities loaded.")}</div>
        ) : null}
      </section>
      {modalState ? (
        <DaySessionModal
          date={modalState.date}
          createNewOnOpen={modalState.createNewOnOpen}
          initialActivity={modalState.initialActivity}
          onClose={() => setModalState(null)}
          onSaved={() => loadActivityRows()}
        />
      ) : null}
    </main>
  );
}
