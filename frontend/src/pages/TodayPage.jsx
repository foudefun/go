import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getCalendar } from "../api/calendarApi.js";
import { getActivityTypeLabel } from "../domain/activityTypes.js";
import { useTranslation } from "../i18n/translations.js";

function formatLocalDateIso(dateValue) {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dateValue, days) {
  const next = new Date(dateValue);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDateLabel(dateValue, language) {
  return new Date(`${dateValue}T00:00:00`).toLocaleDateString(language === "fr" ? "fr-FR" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function getSessionTitle(row, t) {
  const title = String(row?.planned_title || row?.session_title || row?.title || "").trim();
  if (title) return title;
  const activityTypes = Array.isArray(row?.activity_types) ? row.activity_types : [];
  const activityType = activityTypes[0] || row?.activity_type || "";
  if (activityType) return t(getActivityTypeLabel(activityType));
  return t("Training session");
}

function getSessionMeta(row, t) {
  const parts = [];
  if (row?.target_load !== null && row?.target_load !== undefined) parts.push(`${t("Load")} ${row.target_load}`);
  if (row?.planned_time) parts.push(row.planned_time);
  if (row?.status) parts.push(t(row.status));
  return parts.join(" | ");
}

export default function TodayPage() {
  const { language, t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const todayIso = formatLocalDateIso(new Date());

  useEffect(() => {
    let isMounted = true;
    const startDate = formatLocalDateIso(addDays(new Date(), -2));
    const endDate = formatLocalDateIso(addDays(new Date(), 9));
    setStatus("loading");
    getCalendar({ startDate, endDate })
      .then((payload) => {
        if (!isMounted) return;
        setRows(Array.isArray(payload) ? payload : []);
        setStatus("ready");
      })
      .catch((todayError) => {
        if (!isMounted) return;
        setStatus("error");
        setError(todayError.message);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const todayRow = rows.find((row) => row.date === todayIso);
  const upcomingRows = useMemo(
    () =>
      rows
        .filter((row) => row.date >= todayIso)
        .sort((left, right) => String(left.date || "").localeCompare(String(right.date || "")))
        .slice(0, 5),
    [rows, todayIso],
  );
  const completedThisWindow = rows.filter((row) => row.status === "done" || Number(row.activity_count || 0) > 0).length;
  const plannedThisWindow = rows.filter(
    (row) => row.planned_title || (row.target_load !== null && row.target_load !== undefined),
  ).length;

  return (
    <main className="page-shell today-page">
      <section className="module-header today-hero">
        <div>
          <p className="eyebrow">{t("Today")}</p>
          <h1>{t("Choose the right move")}</h1>
          <p className="lede">{t("Today home lede")}</p>
        </div>
        <Link className="primary-action" to="/plan">
          {t("Open Plan")}
        </Link>
      </section>

      {status === "error" ? <div className="error-banner">{error}</div> : null}

      <section className="today-layout">
        <div className="today-main-stack">
          <section className="app-panel today-card today-focus-card">
            <span>{t("Best next step")}</span>
            <h2>{todayRow ? getSessionTitle(todayRow, t) : t("No fixed session today")}</h2>
            <p>
              {todayRow
                ? getSessionMeta(todayRow, t) || t("Open today to adjust the session details.")
                : t("Pick a time window and choose a useful option for today.")}
            </p>
            <div className="today-action-row">
              <Link className="primary-action" to="/plan">
                {t("Review week")}
              </Link>
              <Link className="secondary-action" to="/log">
                {t("Log activity")}
              </Link>
            </div>
          </section>

          <section className="app-panel today-card">
            <div className="section-heading-row">
              <h2>{t("I have")}</h2>
            </div>
            <div className="today-choice-grid">
              {["30 min", "1 hour", "2+ hours", "Indoors", "Outdoors", "Easy only"].map((choice) => (
                <Link key={choice} to="/plan" className="today-choice">
                  {t(choice)}
                </Link>
              ))}
            </div>
          </section>

          <section className="app-panel today-card">
            <div className="section-heading-row">
              <h2>{t("This week")}</h2>
              <Link to="/plan">{t("Plan")}</Link>
            </div>
            <div className="today-week-strip">
              {upcomingRows.length ? (
                upcomingRows.map((row) => (
                  <Link className="today-week-item" to="/plan" key={row.date}>
                    <span>{formatDateLabel(row.date, language)}</span>
                    <strong>{getSessionTitle(row, t)}</strong>
                    <small>{getSessionMeta(row, t) || t("Flexible")}</small>
                  </Link>
                ))
              ) : (
                <p className="muted-copy">{status === "loading" ? t("Loading your week...") : t("No week plan yet.")}</p>
              )}
            </div>
          </section>
        </div>

        <aside className="today-side-stack">
          <section className="app-panel today-card">
            <span className="today-card-label">{t("Progress signal")}</span>
            <strong className="today-big-number">{completedThisWindow}</strong>
            <p>{t("completed sessions in the visible training window")}</p>
            <Link to="/progress">{t("Open Progress")}</Link>
          </section>

          <section className="app-panel today-card">
            <span className="today-card-label">{t("Plan health")}</span>
            <strong className="today-big-number">{plannedThisWindow}</strong>
            <p>{t("planned touchpoints coming up")}</p>
            <Link to="/plan">{t("Adjust Plan")}</Link>
          </section>

          <section className="app-panel today-card today-link-list">
            <span className="today-card-label">{t("Quick paths")}</span>
            <Link to="/explore">{t("Plan an outdoor objective")}</Link>
            <Link to="/gear">{t("Check gear health")}</Link>
            <Link to="/community">{t("See shared activity")}</Link>
          </section>
        </aside>
      </section>
    </main>
  );
}
