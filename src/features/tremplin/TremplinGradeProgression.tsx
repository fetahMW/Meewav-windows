import { useState, type CSSProperties, type ReactNode } from "react";
import { ArrowRight, ShieldCheck, Sparkles } from "lucide-react";
import { MeewavGradeBadge } from "../grades/MeewavGradeBadge";
import { getGradeBadgeMeta } from "../grades/gradeBadges";
import { TREMPLIN_GRADE_EXPERIENCE } from "./tremplinProductModel";
import "./tremplin-public-home.css";
import "./tremplin-public-home-compact.css";
import "./tremplin-public-home-gateway.css";
import "./tremplin-grades-prestige.css";

const GRADE_DESCRIPTIONS = {
  1: "Les premiers pas sur la scène.",
  2: "Un talent qui se révèle.",
  3: "Une identité qui se précise.",
  4: "Un artiste qui s’impose.",
  5: "Une référence dans son univers.",
  6: "Une empreinte durable.",
} as const;

const GRADE_LEVELS = [1, 2, 3, 4, 5, 6] as const;
type GradeLevel = (typeof GRADE_LEVELS)[number];

const LEVEL_GUIDANCE: Readonly<Record<GradeLevel, {
  cardLabel: string;
  headline: string;
  detail: string;
}>> = {
  1: {
    cardLabel: "Parcours en construction",
    headline: "Le profil pose ses premiers repères.",
    detail: "Identité, présentation et premières créations permettent de commencer à comprendre le parcours.",
  },
  2: {
    cardLabel: "Activité structurée",
    headline: "La demande de jeton devient possible.",
    detail: "Le niveau 2 permet de déposer une demande. MeeWav doit encore la vérifier et peut la refuser.",
  },
  3: {
    cardLabel: "Parcours confirmé",
    headline: "Les étapes du parcours sont documentées.",
    detail: "Publications, collaborations et projets terminés rendent l’activité plus lisible.",
  },
  4: {
    cardLabel: "Parcours professionnel",
    headline: "Le parcours professionnel est structuré.",
    detail: "Crédits, réalisations et activité régulière permettent de situer la maturité du parcours.",
  },
  5: {
    cardLabel: "Parcours de référence",
    headline: "L’expérience s’inscrit dans la durée.",
    detail: "Les œuvres, la transmission et les accomplissements documentés consolident le parcours.",
  },
  6: {
    cardLabel: "Reconnaissance durable",
    headline: "Un parcours majeur peut être reconnu directement.",
    detail: "L’expérience acquise hors de MeeWav peut être reconnue après vérification des crédits et réalisations.",
  },
} as const;


export function TremplinGradeCard({ level, active = true, standalone = false, noteId, onActivate }: { level: GradeLevel; active?: boolean; standalone?: boolean; noteId?: string; onActivate?: () => void }) {
  return (
            <article
              tabIndex={onActivate ? 0 : undefined}
              
              className={`tremplin-gateway__grade-card ${active ? "is-active" : ""} ${standalone ? "is-standalone" : ""}`}
              style={{ "--grade-light": getGradeBadgeMeta(level).mainColor, "--grade-soft": getGradeBadgeMeta(level).softColor } as CSSProperties}
              aria-controls={noteId}
              aria-label={"Niveau " + level + ", " + TREMPLIN_GRADE_EXPERIENCE[level].title + ". " + LEVEL_GUIDANCE[level].cardLabel}
              onMouseEnter={onActivate}
              onFocus={onActivate}
            >
              <span className="tremplin-public-home__level-stage">Niveau {level}</span>
              <MeewavGradeBadge className="tremplin-public-home__level-badge" level={level} size="hero" variant="icon" />
              <strong>{TREMPLIN_GRADE_EXPERIENCE[level].title}</strong>
              <span className="tremplin-gateway__grade-description">{GRADE_DESCRIPTIONS[level]}</span>
              <span className="tremplin-gateway__grade-caption" aria-hidden={!active}>{LEVEL_GUIDANCE[level].cardLabel}</span>
            </article>
  );
}

export default function TremplinGradeProgression({ id = "niveaux", onUnderstandGrades, children }: { id?: string; onUnderstandGrades?: () => void; children?: ReactNode }) {
  const [activeGradeLevel, setActiveGradeLevel] = useState<GradeLevel>(4);
  const activeGradeGuidance = LEVEL_GUIDANCE[activeGradeLevel];
  const activeGradeMeta = getGradeBadgeMeta(activeGradeLevel);
  const titleId = id + "-title";
  const noteId = id + "-note";
  return (
<section
        id={id}
        className="tremplin-public-home__section tremplin-public-home__levels tremplin-gateway__levels"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{
          "--tph-active-grade-main": activeGradeMeta.mainColor,
          "--tph-active-grade-soft": activeGradeMeta.softColor,
          "--tph-active-grade-dark": activeGradeMeta.darkColor,
        } as CSSProperties}
      >
        <div className="tremplin-gateway__progression-header">
          <header className="tremplin-public-home__section-heading tremplin-public-home__levels-heading">
            <span className="tremplin-public-home__levels-kicker"><i aria-hidden="true"><Sparkles /></i> Comprendre le parcours</span>
            <h2 id={titleId}>Six grades pour situer<br /><span>le talent et son évolution.</span></h2>
            <p>Le grade reflète le niveau global atteint par l’artiste dans l’infrastructure MeeWav. Il tient compte de son talent, de la qualité de ses créations, de sa régularité, de ses collaborations, de ses accomplissements et de son audience authentique.</p>
            <small className="tremplin-public-home__levels-clarification">Le grade ne fixe pas automatiquement le prix du jeton et ne garantit pas le succès futur.</small>
            {onUnderstandGrades ? <button type="button" className="tremplin-public-home__levels-recognition" onClick={onUnderstandGrades}>Comment un grade est-il attribué&nbsp;? <ArrowRight aria-hidden="true" /></button> : null}
          </header>
          <div className="tremplin-gateway__grade-art" aria-hidden="true" />
        </div>
        <div className="tremplin-public-home__level-track" role="group" aria-label="Explorer les six niveaux MeeWav">
          <div className="tremplin-gateway__prestige-bridges" aria-hidden="true">{[1, 2, 3, 4, 5].map(index => <i key={index} style={{ "--bridge-index": index } as CSSProperties} />)}</div>
          {GRADE_LEVELS.map((level) => (
            <TremplinGradeCard key={level} level={level} active={level === activeGradeLevel} noteId={noteId} onActivate={() => setActiveGradeLevel(level)} />
          ))}
        </div>
        <div id={noteId} className="tremplin-public-home__level-note" role="status" aria-live="polite" aria-atomic="true">
          <i aria-hidden="true"><ShieldCheck /></i>
          <p><strong>{activeGradeGuidance.headline}</strong><span>{activeGradeGuidance.detail}</span></p>
          <span className="tremplin-gateway__grade-principles">Transparent · Équitable · Évolutif</span>
        </div>
        {children}
      </section>
  );
}
