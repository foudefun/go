import Beastmaker1000BoardSvg from "./Beastmaker1000BoardSvg.jsx";
import { BEASTMAKER_1000_HOLD_BY_SLUG, getValidBeastmaker1000HoldSlugs } from "../boardLayouts/beastmaker1000.js";

function normalizeBoardSlug(boardSlug = "beastmaker_1000") {
  return String(boardSlug || "").replaceAll("-", "_");
}

export function resolveHighlightedHoldSlugs(slugs = []) {
  const valid = getValidBeastmaker1000HoldSlugs(slugs);
  if (import.meta.env?.DEV) {
    for (const slug of Array.isArray(slugs) ? slugs : []) {
      if (!BEASTMAKER_1000_HOLD_BY_SLUG[slug]) {
        console.warn(`Unknown Beastmaker 1000 hold slug ignored: ${slug}`);
      }
    }
  }
  return valid;
}

export default function HangboardDiagram({
  boardSlug = "beastmaker_1000",
  highlightedHoldSlugs = [],
  mode = "preview",
  showLabels = false,
  title = "Beastmaker 1000",
  subtitle = "",
}) {
  const normalizedBoardSlug = normalizeBoardSlug(boardSlug);
  const activeSlugs = resolveHighlightedHoldSlugs(highlightedHoldSlugs);
  if (normalizedBoardSlug !== "beastmaker_1000") {
    return <div className="empty-state compact">Unsupported board</div>;
  }

  return (
    <figure className={`hangboard-diagram ${mode}`}>
      <Beastmaker1000BoardSvg activeSlugs={activeSlugs} showLabels={showLabels} title={title} />
      <figcaption>
        <strong>{title}</strong>
        {subtitle ? <span>{subtitle}</span> : null}
      </figcaption>
    </figure>
  );
}
