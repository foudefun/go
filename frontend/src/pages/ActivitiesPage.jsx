import { useEffect, useMemo, useState } from "react";
import { getCalendar } from "../api/calendarApi.js";
import { ACTIVITY_TYPES, getActivityTypeLabel } from "../domain/activityTypes.js";
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
  const [draft, setDraft] = useState({
    date: getLocalTodayIso(),
    activity_type: "velo",
    title: "",
    activity_details: "",
  });
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

  function updateDraft(patch) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function openNewActivity() {
    const date = draft.date || getLocalTodayIso();
    setModalState({
      date,
      createNewOnOpen: true,
      initialActivity: {
        activity_type: draft.activity_type || "",
        title: draft.title || "",
        activity_details: draft.activity_details || "",
      },
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
      <section className="app-panel activity-create-panel">
        <div>
          <p className="eyebrow">{t("New activity")}</p>
          <h2>{t("Create activity")}</h2>
        </div>
        <div className="activity-create-grid">
          <label>
            {t("Date")}
            <input
              type="date"
              value={draft.date}
              onChange={(event) => updateDraft({ date: event.target.value || getLocalTodayIso() })}
            />
          </label>
          <label>
            {t("Activity Type")}
            <select value={draft.activity_type} onChange={(event) => updateDraft({ activity_type: event.target.value })}>
              <option value="">{t("Choose type")}</option>
              {ACTIVITY_TYPES.filter((activityType) => activityType.value).map((activityType) => (
                <option key={activityType.value} value={activityType.value}>
                  {t(activityType.label)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("Title")}
            <input
              value={draft.title}
              onChange={(event) => updateDraft({ title: event.target.value })}
              placeholder={t("Morning ride, climbing session, match...")}
            />
          </label>
          <label>
            {t("Details")}
            <input
              value={draft.activity_details}
              onChange={(event) => updateDraft({ activity_details: event.target.value })}
              placeholder={t("Duration, zone, location, quick summary...")}
            />
          </label>
          <button className="primary-action" type="button" onClick={openNewActivity}>
            {t("Create activity")}
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
