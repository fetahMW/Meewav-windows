import { MeewavGradeBadge } from "./MeewavGradeBadge";
import { GRADE_BADGES, type GradeLevel } from "./gradeBadges";
import "./GradeBadgeShowcase.css";

const LEVELS: GradeLevel[] = [1, 2, 3, 4, 5, 6];

export function GradeBadgeShowcase() {
  return (
    <section className="mw-grade-showcase">
      <header className="mw-grade-showcase__header">
        <p>Système de badges</p>
        <h1>Progression. Reconnaissance. Prestige.</h1>
        <span>Six niveaux compacts, colorés et reconnaissables en un coup d'oeil.</span>
      </header>

      <div className="mw-grade-showcase__grid">
        {LEVELS.map((level) => {
          const meta = GRADE_BADGES[level];

          return (
            <article key={level} className="mw-grade-showcase__card">
              <MeewavGradeBadge level={level} size="hero" />
              <h2>{meta.title}</h2>
              <strong>{meta.label}</strong>
              <p>{meta.description}</p>
            </article>
          );
        })}
      </div>

      <div className="mw-grade-showcase__integration">
        <span>Exemple pop-up</span>
        <div className="mw-grade-showcase__profile-line">
          <div className="mw-grade-showcase__avatar" />
          <div>
            <h3>NayaVox</h3>
            <p>Rappeur / MC</p>
          </div>
          <MeewavGradeBadge level={4} size="lg" variant="compact-pill" labelMode="label" />
        </div>
      </div>
    </section>
  );
}
