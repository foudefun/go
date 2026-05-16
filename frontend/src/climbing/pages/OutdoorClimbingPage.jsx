import { useEffect, useMemo, useState } from "react";
import {
  getClimbingAreas,
  getClimbingCrags,
  getClimbingSectors,
  getSectorTopoBundle,
} from "../../api/climbingApi.js";
import TopoViewer from "../components/TopoViewer.jsx";

export default function OutdoorClimbingPage() {
  const [areas, setAreas] = useState([]);
  const [crags, setCrags] = useState([]);
  const [sectors, setSectors] = useState([]);
  const [bundle, setBundle] = useState(null);
  const [selectedAreaId, setSelectedAreaId] = useState("");
  const [selectedCragId, setSelectedCragId] = useState("");
  const [selectedSectorId, setSelectedSectorId] = useState("");
  const [status, setStatus] = useState("loading areas");
  const [message, setMessage] = useState("");
  const [routeSearch, setRouteSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [styleFilter, setStyleFilter] = useState("");
  const [opacity, setOpacity] = useState(0.82);
  const [showNames, setShowNames] = useState(true);
  const [showGrades, setShowGrades] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setStatus("loading areas");
    getClimbingAreas()
      .then((payload) => {
        if (!isMounted) return;
        const nextAreas = Array.isArray(payload) ? payload : [];
        setAreas(nextAreas);
        setSelectedAreaId(nextAreas[0]?.id ? String(nextAreas[0].id) : "");
        setStatus("ready");
      })
      .catch((error) => {
        if (!isMounted) return;
        setStatus("error");
        setMessage(error.message);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedAreaId) {
      setCrags([]);
      setSelectedCragId("");
      return;
    }
    let isMounted = true;
    setStatus("loading crags");
    getClimbingCrags(selectedAreaId)
      .then((payload) => {
        if (!isMounted) return;
        const nextCrags = Array.isArray(payload) ? payload : [];
        setCrags(nextCrags);
        setSelectedCragId(nextCrags[0]?.id ? String(nextCrags[0].id) : "");
        setStatus("ready");
      })
      .catch((error) => {
        if (!isMounted) return;
        setCrags([]);
        setSelectedCragId("");
        setStatus("error");
        setMessage(error.message);
      });
    return () => {
      isMounted = false;
    };
  }, [selectedAreaId]);

  useEffect(() => {
    if (!selectedCragId) {
      setSectors([]);
      setSelectedSectorId("");
      return;
    }
    let isMounted = true;
    setStatus("loading sectors");
    getClimbingSectors(selectedCragId)
      .then((payload) => {
        if (!isMounted) return;
        const nextSectors = Array.isArray(payload) ? payload : [];
        setSectors(nextSectors);
        setSelectedSectorId(nextSectors[0]?.id ? String(nextSectors[0].id) : "");
        setStatus("ready");
      })
      .catch((error) => {
        if (!isMounted) return;
        setSectors([]);
        setSelectedSectorId("");
        setStatus("error");
        setMessage(error.message);
      });
    return () => {
      isMounted = false;
    };
  }, [selectedCragId]);

  useEffect(() => {
    if (!selectedSectorId) {
      setBundle(null);
      return;
    }
    let isMounted = true;
    setStatus("loading topo");
    getSectorTopoBundle(selectedSectorId)
      .then((payload) => {
        if (!isMounted) return;
        setBundle(payload);
        setStatus("ready");
      })
      .catch((error) => {
        if (!isMounted) return;
        setBundle(null);
        setStatus("error");
        setMessage(error.message);
      });
    return () => {
      isMounted = false;
    };
  }, [selectedSectorId]);

  const topo = bundle?.topo_images?.[0] || null;
  const allRoutes = bundle?.routes || [];
  const grades = useMemo(
    () => Array.from(new Set(allRoutes.map((route) => route.grade).filter(Boolean))),
    [allRoutes],
  );
  const styles = useMemo(
    () => Array.from(new Set(allRoutes.map((route) => route.style).filter(Boolean))),
    [allRoutes],
  );
  const visibleRoutes = useMemo(() => {
    const search = routeSearch.trim().toLowerCase();
    return allRoutes.filter((route) => {
      const matchesSearch = !search || `${route.name} ${route.grade} ${route.style}`.toLowerCase().includes(search);
      const matchesGrade = !gradeFilter || route.grade === gradeFilter;
      const matchesStyle = !styleFilter || route.style === styleFilter;
      return matchesSearch && matchesGrade && matchesStyle;
    });
  }, [allRoutes, gradeFilter, routeSearch, styleFilter]);

  const isBusy = status.startsWith("loading");

  return (
    <main className="page-shell climbing-shell">
      <section className="module-header">
        <div>
          <p className="eyebrow">Outdoor Climbing</p>
          <h1>Topo Overlay</h1>
        </div>
      </section>

      <section className="climbing-workspace">
        <aside className="app-panel selection-panel">
          <h2>Sector</h2>
          <label>
            Area
            <select
              disabled={isBusy || areas.length === 0}
              value={selectedAreaId}
              onChange={(event) => setSelectedAreaId(event.target.value)}
            >
              {areas.length ? (
                areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))
              ) : (
                <option>No areas loaded</option>
              )}
            </select>
          </label>
          <label>
            Crag
            <select
              disabled={isBusy || crags.length === 0}
              value={selectedCragId}
              onChange={(event) => setSelectedCragId(event.target.value)}
            >
              {crags.length ? (
                crags.map((crag) => (
                  <option key={crag.id} value={crag.id}>
                    {crag.name}
                  </option>
                ))
              ) : (
                <option>Select an area first</option>
              )}
            </select>
          </label>
          <label>
            Sector
            <select
              disabled={isBusy || sectors.length === 0}
              value={selectedSectorId}
              onChange={(event) => setSelectedSectorId(event.target.value)}
            >
              {sectors.length ? (
                sectors.map((sector) => (
                  <option key={sector.id} value={sector.id}>
                    {sector.name}
                  </option>
                ))
              ) : (
                <option>Select a crag first</option>
              )}
            </select>
          </label>

          <div className="panel-divider" />

          <label>
            Route search
            <input
              value={routeSearch}
              onChange={(event) => setRouteSearch(event.target.value)}
              placeholder="Name, grade, style"
            />
          </label>
          <label>
            Grade
            <select value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)}>
              <option value="">All grades</option>
              {grades.map((grade) => (
                <option key={grade} value={grade}>
                  {grade}
                </option>
              ))}
            </select>
          </label>
          <label>
            Style
            <select value={styleFilter} onChange={(event) => setStyleFilter(event.target.value)}>
              <option value="">All styles</option>
              {styles.map((style) => (
                <option key={style} value={style}>
                  {style}
                </option>
              ))}
            </select>
          </label>
          <label>
            Overlay opacity
            <input
              type="range"
              min="0.2"
              max="1"
              step="0.05"
              value={opacity}
              onChange={(event) => setOpacity(Number(event.target.value))}
            />
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={showNames}
              onChange={(event) => setShowNames(event.target.checked)}
            />
            Show names
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={showGrades}
              onChange={(event) => setShowGrades(event.target.checked)}
            />
            Show grades
          </label>
        </aside>

        <section className="app-panel topo-panel">
          {status === "error" ? (
            <div className="topo-placeholder">
              <div>
                <strong>Topo viewer</strong>
                <span>No climbing data available yet.</span>
                {message ? <small className="visually-muted">Backend response: {message}</small> : null}
              </div>
            </div>
          ) : (
            <TopoViewer
              topo={topo}
              routes={visibleRoutes}
              opacity={opacity}
              showNames={showNames}
              showGrades={showGrades}
            />
          )}
          <div className="route-drawer">
            <div>
              <strong>{visibleRoutes.length}</strong> of {allRoutes.length} routes visible
            </div>
            <div className="route-list">
              {visibleRoutes.map((route) => (
                <div className="route-list-item" key={route.id}>
                  <span className="route-color" style={{ background: route.color || "#f97316" }} />
                  <div>
                    <strong>{route.name}</strong>
                    <span>
                      {route.grade} - {route.style}
                      {route.length_m ? ` - ${route.length_m} m` : ""}
                      {route.danger_flag ? " - caution" : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
