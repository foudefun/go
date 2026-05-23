import { BEASTMAKER_1000_HOLDS, BEASTMAKER_1000_VIEWBOX } from "../boardLayouts/beastmaker1000.js";

function renderArea(area, className, key, extraProps = {}) {
  if (area.shape === "ellipse") {
    return (
      <ellipse
        key={key}
        className={className}
        cx={area.x + area.width / 2}
        cy={area.y + area.height / 2}
        rx={area.width / 2}
        ry={area.height / 2}
        {...extraProps}
      />
    );
  }
  if (area.shape === "path") {
    return <path key={key} className={className} d={area.d} {...extraProps} />;
  }
  if (area.shape === "polygon") {
    return <polygon key={key} className={className} points={area.points} {...extraProps} />;
  }
  return (
    <rect
      key={key}
      className={className}
      x={area.x}
      y={area.y}
      width={area.width}
      height={area.height}
      rx={area.rx || 0}
      ry={area.ry || area.rx || 0}
      {...extraProps}
    />
  );
}

export function BeastmakerHoldShape({ hold, active = false, showLabels = false }) {
  return (
    <g className={active ? "bm1000-hold is-active" : "bm1000-hold"}>
      {renderArea(hold.area, active ? "bm1000-hold-fill active" : "bm1000-hold-fill", hold.slug)}
      {showLabels ? (
        <text
          className="bm1000-hold-label"
          x={(hold.area.x || 0) + (hold.area.width || 0) / 2}
          y={(hold.area.y || 0) + (hold.area.height || 0) / 2 + 4}
          textAnchor="middle"
        >
          {hold.fingerCount ? `${hold.fingerCount}F` : hold.angleDeg ? `${hold.angleDeg}` : "Jug"}
        </text>
      ) : null}
    </g>
  );
}

export default function Beastmaker1000BoardSvg({ activeSlugs = [], showLabels = false, title = "Beastmaker 1000 schematic" }) {
  const active = new Set(activeSlugs);
  return (
    <svg
      className="bm1000-svg"
      viewBox={`0 0 ${BEASTMAKER_1000_VIEWBOX.width} ${BEASTMAKER_1000_VIEWBOX.height}`}
      role="img"
      aria-label={title}
      preserveAspectRatio="xMidYMid meet"
    >
      <title>{title}</title>
      <defs>
        <linearGradient id="bm1000-board" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#d7b98b" />
          <stop offset="1" stopColor="#b68955" />
        </linearGradient>
      </defs>
      <path
        className="bm1000-board"
        d="M72 30 C44 34 26 62 28 104 L38 266 C42 315 80 338 136 334 L864 334 C920 338 958 315 962 266 L972 104 C974 62 956 34 928 30 Z"
      />
      <path className="bm1000-inner-shadow" d="M90 70 C82 94 80 252 92 292 C166 310 834 310 908 292 C920 252 918 94 910 70 Z" />
      {BEASTMAKER_1000_HOLDS.map((hold) => (
        <BeastmakerHoldShape key={hold.slug} hold={hold} active={active.has(hold.slug)} showLabels={showLabels} />
      ))}
    </svg>
  );
}
