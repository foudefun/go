export default function LegacySectionPage({ eyebrow, title, description, actionLabel = "Open Legacy Section" }) {
  return (
    <main className="page-shell">
      <section className="module-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
        </div>
        <a className="secondary-action" href="/legacy.html">
          {actionLabel}
        </a>
      </section>
      <section className="app-panel migration-panel">
        <strong>{title}</strong>
        <p>{description}</p>
        <a className="primary-action" href="/legacy.html">
          Continue in Legacy
        </a>
      </section>
    </main>
  );
}
