import { Badge } from "../components/app/shared";

export function About() {
  return (
    <div className="view-stack">
      <div className="view-heading">
        <div>
          <span className="eyebrow">About</span>
          <h1>Cavoti Bar</h1>
        </div>
        <Badge variant="outline">Baseline</Badge>
      </div>
      <section className="surface-section about-section">
        <img src="./cavoti-logo.png" alt="" />
        <div>
          <h2>Private usage at a glance</h2>
          <p>
            Cavoti Bar reads aggregate plan and usage data through an authenticated Cavoti browser profile. Credentials never enter the
            renderer.
          </p>
        </div>
        <div className="about-meta">
          <span>Built for Cavoti</span>
          <span>Local WebView2 session</span>
        </div>
      </section>
    </div>
  );
}
