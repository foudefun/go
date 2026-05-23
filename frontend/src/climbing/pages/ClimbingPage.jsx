import { Link } from "react-router-dom";
import { useTranslation } from "../../i18n/translations.js";

export default function ClimbingPage() {
  const { t } = useTranslation();

  return (
    <main className="page-shell">
      <section className="module-header">
        <div>
          <p className="eyebrow">{t("Training")}</p>
          <h1>{t("Climbing")}</h1>
        </div>
      </section>

      <section className="climbing-choice-grid">
        <Link className="app-panel climbing-choice-card" to="/outdoor-climbing">
          <span>{t("Outdoor Climbing")}</span>
          <strong>{t("Topo Overlay")}</strong>
          <small>{t("Routes, sectors, topo images, and calibration.")}</small>
        </Link>
        <Link className="app-panel climbing-choice-card" to="/hangboard">
          <span>{t("Hangboard")}</span>
          <strong>{t("Workout setup")}</strong>
          <small>{t("Generate, perform, and log Beastmaker-style sessions.")}</small>
        </Link>
      </section>
    </main>
  );
}
