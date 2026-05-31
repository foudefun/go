import { Link } from "react-router-dom";
import { useTranslation } from "../i18n/translations.js";

export default function CommunityPage() {
  const { t } = useTranslation();

  return (
    <main className="page-shell">
      <section className="module-header">
        <div>
          <p className="eyebrow">{t("Community")}</p>
          <h1>{t("Shared inspiration")}</h1>
          <p className="lede">{t("Community home lede")}</p>
        </div>
      </section>
      <section className="app-panel today-card empty-state">
        <h2>{t("Community is a future layer")}</h2>
        <p>{t("Community empty copy")}</p>
        <Link className="secondary-action" to="/log">
          {t("Open Log")}
        </Link>
      </section>
    </main>
  );
}
