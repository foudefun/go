import { useEffect, useMemo, useState } from "react";
import { getOutdoorDataAudit } from "../api/outdoorRoutesApi.js";
import { useTranslation } from "../i18n/translations.js";

const AUDIT_SECTIONS = [
  ["duplicate_names", "Duplicate names"],
  ["missing_sources", "Missing sources"],
  ["missing_coordinates", "Missing coordinates"],
  ["approximate_coordinates", "Approximate coordinates"],
  ["unknown_coordinates", "Unknown coordinates"],
  ["suspicious_elevations", "Suspicious elevations"],
];

function formatCode(value) {
  return String(value || "").replaceAll("_", " ");
}

function formatCoordinate(value) {
  return value == null ? "" : Number(value).toFixed(5);
}

function flattenSectionRows(sectionKey, sectionValue) {
  if (sectionKey === "duplicate_names") {
    return sectionValue.flatMap((group) =>
      group.records.map((record) => ({
        issue: "duplicate_names",
        duplicate_group: group.name,
        duplicate_count: group.count,
        ...record,
      })),
    );
  }
  return sectionValue.map((record) => ({ issue: sectionKey, ...record }));
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function buildCsv(rows) {
  const columns = [
    "issue",
    "duplicate_group",
    "duplicate_count",
    "location_entity_type",
    "id",
    "name",
    "elevation_meters",
    "latitude",
    "longitude",
    "coordinate_status",
    "source_reference_count",
  ];
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => escapeCsvCell(row[column])).join(",")),
  ].join("\n");
}

function downloadCsv(filename, rows) {
  const blob = new Blob([buildCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function AuditRow({ row }) {
  return (
    <tr>
      <td>{formatCode(row.location_entity_type)}</td>
      <td>{row.name}</td>
      <td>{row.elevation_meters ?? ""}</td>
      <td>{formatCoordinate(row.latitude)}</td>
      <td>{formatCoordinate(row.longitude)}</td>
      <td>{formatCode(row.coordinate_status)}</td>
      <td>{row.source_reference_count}</td>
    </tr>
  );
}

export default function OutdoorDataAuditPage() {
  const { t } = useTranslation();
  const [payload, setPayload] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [sectionKey, setSectionKey] = useState("duplicate_names");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError("");
    getOutdoorDataAudit()
      .then((data) => {
        if (cancelled) return;
        setPayload(data);
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || "Unable to load outdoor data audit.");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = payload?.summary || {};
  const activeSection = payload?.sections?.[sectionKey] || [];
  const rows = useMemo(() => flattenSectionRows(sectionKey, activeSection), [activeSection, sectionKey]);
  const allRows = useMemo(
    () =>
      payload?.sections
        ? Object.entries(payload.sections).flatMap(([key, value]) => flattenSectionRows(key, value))
        : [],
    [payload],
  );

  return (
    <main className="page-shell outdoor-audit-page">
      <section className="module-header outdoor-routes-header">
        <div>
          <p className="eyebrow">{t("Outdoor data")}</p>
          <h1>{t("Data audit")}</h1>
        </div>
      </section>

      {status === "loading" ? <div className="app-panel empty-state">{t("Loading audit...")}</div> : null}
      {status === "error" ? <div className="app-panel empty-state">{error}</div> : null}
      {status === "ready" ? (
        <>
          <section className="stats-summary-grid route-summary-grid outdoor-audit-summary-grid">
            <span><strong>{summary.total_locations || 0}</strong>{t("Locations")}</span>
            <span><strong>{summary.total_summits || 0}</strong>{t("Summits")}</span>
            <span><strong>{summary.summits_4000 || 0}</strong>{t("4000m summits")}</span>
            <span><strong>{summary.duplicate_name_groups || 0}</strong>{t("Duplicate names")}</span>
            <span><strong>{summary.missing_sources || 0}</strong>{t("Missing sources")}</span>
            <span><strong>{summary.missing_coordinates || 0}</strong>{t("Missing coordinates")}</span>
          </section>

          <section className="app-panel outdoor-audit-toolbar">
            <label>
              {t("Audit section")}
              <select value={sectionKey} onChange={(event) => setSectionKey(event.target.value)}>
                {AUDIT_SECTIONS.map(([key, label]) => (
                  <option key={key} value={key}>{t(label)}</option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => downloadCsv(`outdoor-audit-${sectionKey}.csv`, rows)}>
              {t("Export current CSV")}
            </button>
            <button type="button" onClick={() => downloadCsv("outdoor-audit-all.csv", allRows)}>
              {t("Export all CSV")}
            </button>
          </section>

          <section className="app-panel outdoor-audit-table-panel">
            {sectionKey === "duplicate_names" ? (
              <div className="outdoor-audit-groups">
                {activeSection.map((group) => (
                  <div key={`${group.location_entity_type}-${group.name}`} className="outdoor-audit-group">
                    <h2>{group.name}</h2>
                    <small>{formatCode(group.location_entity_type)} | {group.count} {t("records")}</small>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>{t("Type")}</th>
                            <th>{t("Name")}</th>
                            <th>{t("Altitude")}</th>
                            <th>{t("Latitude")}</th>
                            <th>{t("Longitude")}</th>
                            <th>{t("Coordinates")}</th>
                            <th>{t("Sources")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.records.map((row) => <AuditRow key={`${row.location_entity_type}-${row.id}`} row={row} />)}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t("Type")}</th>
                      <th>{t("Name")}</th>
                      <th>{t("Altitude")}</th>
                      <th>{t("Latitude")}</th>
                      <th>{t("Longitude")}</th>
                      <th>{t("Coordinates")}</th>
                      <th>{t("Sources")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => <AuditRow key={`${row.issue}-${row.location_entity_type}-${row.id}`} row={row} />)}
                  </tbody>
                </table>
              </div>
            )}
            {!rows.length ? <p className="empty-state-inline">{t("No records in this audit section.")}</p> : null}
          </section>
        </>
      ) : null}
    </main>
  );
}
