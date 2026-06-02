import { useEffect, useMemo, useState } from "react";
import { getActivityCleanupDuplicates } from "../api/activityCleanupApi.js";
import { getActivityTypeLabel } from "../domain/activityTypes.js";
import { useTranslation } from "../i18n/translations.js";
import DaySessionModal from "../sessions/components/DaySessionModal.jsx";

function getActivityMetrics(activity) {
  const distanceKm = Number(activity.distance_km || 0);
  const durationSeconds = Number(activity.duration_seconds || 0);
  return [
    distanceKm ? `${distanceKm.toFixed(2)} km` : "",
    durationSeconds ? `${Math.round(durationSeconds / 60)} min` : "",
  ].filter(Boolean);
}

function DuplicateGroup({ group, onOpen, t }) {
  return (
    <section className="app-panel duplicate-group">
      <div className="duplicate-group-header">
        <div>
          <p className="eyebrow">{t("Possible duplicate")}</p>
          <h2>{t(group.reason)}</h2>
        </div>
        <span>{t("Activity count", { count: group.activities.length })}</span>
      </div>
      <div className="duplicate-activity-list">
        {group.activities.map((activity) => (
          <article className="duplicate-activity-row" key={activity.id}>
            <div>
              <strong>{activity.title}</strong>
              <span>
                {activity.date} - {t(getActivityTypeLabel(activity.activity_type))}
              </span>
              {activity.details ? <small>{activity.details}</small> : null}
            </div>
            <div className="duplicate-activity-meta">
              {getActivityMetrics(activity).map((metric) => <span key={metric}>{metric}</span>)}
              {activity.source_count ? <span>{t("Source count", { count: activity.source_count })}</span> : null}
            </div>
            <button type="button" className="secondary-action" onClick={() => onOpen(activity)}>
              {t("Open activity")}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function ActivityCleanupPage() {
  const { t } = useTranslation();
  const [payload, setPayload] = useState({ activities_scanned: 0, duplicate_groups: [] });
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [modalActivity, setModalActivity] = useState(null);

  function loadRows() {
    setStatus("loading");
    setError("");
    getActivityCleanupDuplicates()
      .then((nextPayload) => {
        setPayload(nextPayload && typeof nextPayload === "object" ? nextPayload : { activities_scanned: 0, duplicate_groups: [] });
        setStatus("ready");
      })
      .catch((loadError) => {
        setError(loadError.message);
        setStatus("error");
      });
  }

  useEffect(() => {
    loadRows();
  }, []);

  const duplicateGroups = useMemo(() => (Array.isArray(payload.duplicate_groups) ? payload.duplicate_groups : []), [payload]);

  return (
    <main className="page-shell">
      <section className="module-header">
        <div>
          <p className="eyebrow">{t("Data cleanup")}</p>
          <h1>{t("Activity cleanup")}</h1>
        </div>
        <button type="button" onClick={loadRows} disabled={status === "loading"}>
          {t("Refresh")}
        </button>
      </section>

      {status === "loading" ? <div className="app-panel empty-state">{t("Loading activities...")}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}

      <section className="summary-grid">
        <article className="app-panel metric-card">
          <span>{t("Activities scanned")}</span>
          <strong>{Number(payload.activities_scanned || 0)}</strong>
        </article>
        <article className="app-panel metric-card">
          <span>{t("Possible duplicate groups")}</span>
          <strong>{duplicateGroups.length}</strong>
        </article>
      </section>

      <section className="app-panel admin-shortcuts">
        <div>
          <p className="eyebrow">{t("Review first")}</p>
          <h2>{t("No automatic deletion")}</h2>
          <p>{t("Open each candidate, then merge or delete manually from the activity editor.")}</p>
        </div>
      </section>

      <section className="duplicate-cleanup-list">
        {duplicateGroups.map((group) => (
          <DuplicateGroup group={group} key={group.key} onOpen={setModalActivity} t={t} />
        ))}
        {status !== "loading" && !duplicateGroups.length && !error ? (
          <div className="app-panel empty-state">{t("No possible duplicates found.")}</div>
        ) : null}
      </section>

      {modalActivity ? (
        <DaySessionModal
          date={modalActivity.date}
          initialActivityIndex={modalActivity.index}
          onClose={() => setModalActivity(null)}
          onSaved={loadRows}
        />
      ) : null}
    </main>
  );
}
