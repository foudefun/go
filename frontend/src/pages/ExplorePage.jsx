import { Link } from "react-router-dom";
import { useTranslation } from "../i18n/translations.js";

const exploreCards = [
  {
    to: "/outdoor-map",
    eyebrowKey: "Map",
    titleKey: "Find an outdoor objective",
    bodyKey: "Explore map copy",
  },
  {
    to: "/outdoor-routes",
    eyebrowKey: "Routes",
    titleKey: "Compare saved routes",
    bodyKey: "Explore routes copy",
  },
  {
    to: "/outdoor-climbing",
    eyebrowKey: "Climbing",
    titleKey: "Plan a climbing session",
    bodyKey: "Explore climbing copy",
  },
];

export default function ExplorePage() {
  const { t } = useTranslation();

  return (
    <main className="page-shell explore-page">
      <section className="module-header">
        <div>
          <p className="eyebrow">{t("Explore")}</p>
          <h1>{t("Plan the next objective")}</h1>
          <p className="lede">{t("Explore home lede")}</p>
        </div>
      </section>

      <section className="explore-grid">
        {exploreCards.map((card) => (
          <Link className="app-panel explore-card" to={card.to} key={card.to}>
            <span>{t(card.eyebrowKey)}</span>
            <strong>{t(card.titleKey)}</strong>
            <p>{t(card.bodyKey)}</p>
          </Link>
        ))}
      </section>

      <section className="app-panel today-card">
        <div className="section-heading-row">
          <h2>{t("Planning flow")}</h2>
        </div>
        <div className="planning-flow">
          {["Choose activity", "Compare options", "Save trip", "Add to plan", "Prepare gear"].map((step) => (
            <span key={step}>{t(step)}</span>
          ))}
        </div>
      </section>
    </main>
  );
}
