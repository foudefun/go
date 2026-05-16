function buildPolyline(points) {
  return (Array.isArray(points) ? points : [])
    .map((point) => `${Number(point.x || 0)},${Number(point.y || 0)}`)
    .join(" ");
}

function getRouteLabel(route, options) {
  const parts = [];
  if (options.showNames) parts.push(route.name);
  if (options.showGrades && route.grade) parts.push(route.grade);
  return parts.filter(Boolean).join(" ");
}

export default function RoutePolylineOverlay({ routes, opacity, showNames, showGrades }) {
  return (
    <svg className="route-overlay" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
      {(routes || []).map((route) => {
        const points = Array.isArray(route.polyline) ? route.polyline : [];
        if (points.length < 2) return null;
        const labelPoint = points[Math.max(0, Math.floor(points.length * 0.34))];
        const label = getRouteLabel(route, { showNames, showGrades });
        return (
          <g key={route.id || route.name} opacity={opacity}>
            <polyline
              points={buildPolyline(points)}
              fill="none"
              stroke={route.color || "#f97316"}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={route.danger_flag ? 0.012 : 0.009}
              vectorEffect="non-scaling-stroke"
              strokeDasharray={route.danger_flag ? "0.025 0.018" : undefined}
            />
            {label ? (
              <text
                className="route-label"
                x={Number(labelPoint?.x || 0)}
                y={Number(labelPoint?.y || 0)}
                fill={route.color || "#f97316"}
                fontSize={0.034}
              >
                {label}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
