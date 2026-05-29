import { useMemo, useState } from "react";
import { useTranslation } from "../../i18n/translations.js";
import {
  CLIMBING_ASCENT_STYLES,
  CLIMBING_ROPE_STYLES,
  createBlankClimbingRoute,
  normalizeClimbingRoute,
  normalizeClimbingRoutes,
} from "../climbingRoutes.js";

function getLabel(options, value) {
  return options.find((item) => item.value === value)?.label || value || "";
}

function routeSummary(route, t) {
  return [
    route.topo_grade,
    route.rope_style ? t(getLabel(CLIMBING_ROPE_STYLES, route.rope_style)) : "",
    route.ascent_style ? t(getLabel(CLIMBING_ASCENT_STYLES, route.ascent_style)) : "",
    route.ascent_style === "with_rests" && route.rest_count !== undefined
      ? t("Rest count summary", { count: route.rest_count })
      : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

export default function ClimbingRouteEditor({ activity, onChange }) {
  const { t } = useTranslation();
  const routes = useMemo(() => normalizeClimbingRoutes(activity?.climbing_routes), [activity?.climbing_routes]);
  const [draft, setDraft] = useState(createBlankClimbingRoute);
  const [editIndex, setEditIndex] = useState(null);

  function emitRoutes(nextRoutes) {
    onChange({ climbing_routes: nextRoutes });
  }

  function resetDraft() {
    setDraft(createBlankClimbingRoute());
    setEditIndex(null);
  }

  function saveDraft() {
    const normalized = normalizeClimbingRoute(draft);
    if (!normalized.name && !normalized.topo_grade && !normalized.rope_style && !normalized.ascent_style && !normalized.notes) {
      return;
    }
    const nextRoutes =
      editIndex === null
        ? [...routes, normalized]
        : routes.map((route, index) => (index === editIndex ? normalized : route));
    emitRoutes(nextRoutes);
    resetDraft();
  }

  function editRoute(route, index) {
    setDraft({ ...createBlankClimbingRoute(), ...route, rest_count: route.rest_count ?? "" });
    setEditIndex(index);
  }

  function deleteRoute(indexToDelete) {
    emitRoutes(routes.filter((_, index) => index !== indexToDelete));
    if (editIndex === indexToDelete) resetDraft();
  }

  const showRestCount = draft.ascent_style === "with_rests";

  return (
    <section className="climbing-route-editor" aria-label={t("Indoor climbing routes")}>
      <header className="strength-editor-header">
        <div>
          <p className="eyebrow">{t("Indoor climbing")}</p>
          <h3>{t("Routes done")}</h3>
        </div>
        <span>{t("Route count", { count: routes.length })}</span>
      </header>

      {routes.length ? (
        <div className="climbing-route-list">
          {routes.map((route, index) => (
            <article className="climbing-route-card" key={`${route.name}-${route.topo_grade}-${index}`}>
              <div>
                <strong>{route.name || t("Unnamed route")}</strong>
                {route.spot ? <span>{route.spot}</span> : null}
              </div>
              <span>{routeSummary(route, t)}</span>
              {route.notes ? <p>{route.notes}</p> : null}
              <div className="compact-actions">
                <button type="button" onClick={() => editRoute(route, index)}>
                  {t("Edit")}
                </button>
                <button type="button" onClick={() => deleteRoute(index)}>
                  {t("Delete")}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state compact">{t("No climbing routes logged yet.")}</div>
      )}

      <div className="strength-builder climbing-route-builder">
        <div className="strength-builder-title">
          <strong>{editIndex === null ? t("Add route") : t("Edit route")}</strong>
          {editIndex !== null ? (
            <button type="button" onClick={resetDraft}>
              {t("Cancel")}
            </button>
          ) : null}
        </div>

        <div className="form-grid">
          <label>
            {t("Route name")}
            <input
              value={draft.name || ""}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder={t("Route name placeholder")}
            />
          </label>
          <label>
            {t("Spot")}
            <input
              value={draft.spot || ""}
              onChange={(event) => setDraft((current) => ({ ...current, spot: event.target.value }))}
              placeholder={t("Wall, sector, gym...")}
            />
          </label>
          <label>
            {t("Climbing mode")}
            <select
              value={draft.rope_style || "lead"}
              onChange={(event) => setDraft((current) => ({ ...current, rope_style: event.target.value }))}
            >
              {CLIMBING_ROPE_STYLES.map((item) => (
                <option key={item.value} value={item.value}>
                  {t(item.label)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("Ascent style")}
            <select
              value={draft.ascent_style || "onsight"}
              onChange={(event) => setDraft((current) => ({ ...current, ascent_style: event.target.value }))}
            >
              {CLIMBING_ASCENT_STYLES.map((item) => (
                <option key={item.value} value={item.value}>
                  {t(item.label)}
                </option>
              ))}
            </select>
          </label>
          {showRestCount ? (
            <label>
              {t("Rests")}
              <input
                type="number"
                min="0"
                step="1"
                value={draft.rest_count ?? ""}
                onChange={(event) => setDraft((current) => ({ ...current, rest_count: event.target.value }))}
                placeholder="0"
              />
            </label>
          ) : null}
          <label>
            {t("Difficulty")}
            <input
              value={draft.topo_grade || ""}
              onChange={(event) => setDraft((current) => ({ ...current, topo_grade: event.target.value }))}
              placeholder={t("6a, 6b+, 7a...")}
            />
          </label>
        </div>

        <label>
          {t("Route notes")}
          <textarea
            value={draft.notes || ""}
            onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
            placeholder={t("Attempts, beta, pump, fear, holds...")}
          />
        </label>

        <button type="button" className="primary-action" onClick={saveDraft}>
          {editIndex === null ? t("Add route to activity") : t("Update route in activity")}
        </button>
      </div>
    </section>
  );
}
