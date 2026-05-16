import RoutePolylineOverlay from "./RoutePolylineOverlay.jsx";

export default function TopoViewer({ topo, routes, opacity, showNames, showGrades }) {
  if (!topo) {
    return (
      <div className="topo-placeholder">
        <div>
          <strong>Topo viewer</strong>
          <span>Select a sector to load its topo.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="topo-viewer" style={{ aspectRatio: `${topo.width || 4} / ${topo.height || 3}` }}>
      <img src={topo.image_url} alt={topo.title} />
      <RoutePolylineOverlay
        routes={routes}
        opacity={opacity}
        showNames={showNames}
        showGrades={showGrades}
      />
    </div>
  );
}
