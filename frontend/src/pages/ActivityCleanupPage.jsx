import { useEffect, useMemo, useState } from "react";
import { getActivityCleanupDuplicates, mergeActivityCleanupDuplicates } from "../api/activityCleanupApi.js";
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

function getActivityScore(activity) {
  return (
    Number(activity.source_count || 0) * 5
    + (activity.title ? 2 : 0)
    + (activity.details ? 2 : 0)
    + (Number(activity.distance_km || 0) > 0 ? 1 : 0)
    + (Number(activity.duration_seconds || 0) > 0 ? 1 : 0)
  );
}

function getRecommendedKeeper(activities) {
  return [...activities].sort((first, second) => getActivityScore(second) - getActivityScore(first))[0]?.id || "";
}

function DuplicateGroup({ group, onOpen, onMerge, mergeStatus, t }) {
  const activities = Array.isArray(group.activities) ? group.activities : [];
  const recommendedKeeper = useMemo(() => getRecommendedKeeper(activities), [activities]);
  const [keeperId, setKeeperId] = useState(recommendedKeeper);
  const [selectedIds, setSelectedIds] = useState(() => new Set(activities.map((activity) => activity.id)));

  useEffect(() => {
    setKeeperId(recommendedKeeper);
    setSelectedIds(new Set(activities.map((activity) => activity.id)));
  }, [group.key, recommendedKeeper, activities]);

  const keeper = activities.find((activity) => activity.id === keeperId) || activities[0];
  const sourceActivities = activities.filter((activity) => selectedIds.has(activity.id) && activity.id !== keeper?.id);
  const canMerge = keeper && sourceActivities.length > 0 && mergeStatus !== "loading";

  function toggleSelected(activityId) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(activityId)) {
        next.delete(activityId);
      } else {
        next.add(activityId);
      }
      return next;
    });
  }

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
        {activities.map((activity) => (
          <article className="duplicate-activity-row" key={activity.id}>
            <div className="duplicate-activity-selectors">
              <label>
                <input
                  type="radio"
                  checked={keeper?.id === activity.id}
                  onChange={() => {
                    setKeeperId(activity.id);
                    setSelectedIds((current) => new Set([...current, activity.id]));
                  }}
                />
                {t("Keep")}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={keeper?.id === activity.id || selectedIds.has(activity.id)}
                  disabled={keeper?.id === activity.id}
                  onChange={() => toggleSelected(activity.id)}
                />
                {keeper?.id === activity.id ? t("Target") : t("Merge")}
              </label>
            </div>
            <div className="duplicate-activity-body">
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
            </div>
            <button type="button" className="secondary-action" onClick={() => onOpen(activity)}>
              {t("Open activity")}
            </button>
          </article>
        ))}
      </div>
      <div className="duplicate-merge-preview">
        <div>
          <span>{t("Merge preview")}</span>
          <strong>
            {keeper ? t("Merge into activity", { title: keeper.title }) : t("Choose target activity")}
          </strong>
          <small>{t("Selected duplicate count", { count: sourceActivities.length })}</small>
        </div>
        <button
          type="button"
          onClick={() => onMerge({ keeper, sources: sourceActivities })}
          disabled={!canMerge}
        >
          {mergeStatus === "loading" ? t("Merging...") : t("Merge selected duplicates")}
        </button>
      </div>
    </section>
  );
}

export default function ActivityCleanupPage() {
  const { t } = useTranslation();
  const [payload, setPayload] = useState({ activities_scanned: 0, duplicate_groups: [] });
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [mergeStatus, setMergeStatus] = useState("idle");
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

  function handleMergeSelection({ keeper, sources }) {
    if (!keeper || !sources.length) {
      return;
    }
    setMergeStatus("loading");
    setError("");
    setSuccess("");
    mergeActivityCleanupDuplicates({
      keeper: { date: keeper.date, index: keeper.index },
      sources: sources.map((activity) => ({ date: activity.date, index: activity.index })),
    })
      .then((result) => {
        setSuccess(t("Merged duplicate count", { count: result.merged_count || sources.length }));
        setMergeStatus("idle");
        loadRows();
      })
      .catch((mergeError) => {
        setError(mergeError.message);
        setMergeStatus("error");
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
      {success ? <div className="success-banner">{success}</div> : null}

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
          <h2>{t("Controlled merge")}</h2>
          <p>{t("Choose the activity to keep, select duplicates, then merge them into one clean activity.")}</p>
        </div>
      </section>

      <section className="duplicate-cleanup-list">
        {duplicateGroups.map((group) => (
          <DuplicateGroup
            group={group}
            key={group.key}
            mergeStatus={mergeStatus}
            onMerge={handleMergeSelection}
            onOpen={setModalActivity}
            t={t}
          />
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
