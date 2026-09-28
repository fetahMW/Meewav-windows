import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowRight, ShieldCheck, Sparkles } from "lucide-react";
import { MeewavGradeBadge } from "../grades/MeewavGradeBadge";
import { getGradeBadgeMeta } from "../grades/gradeBadges";
import { TREMPLIN_GRADE_EXPERIENCE } from "./tremplinProductModel";
import "./tremplin-public-home.css";
import "./tremplin-public-home-compact.css";
import "./tremplin-public-home-gateway.css";
import "./tremplin-grades-prestige.css";
import "./tremplin-grades-open.css";

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


export function TremplinGradeCard({ level, active = true, standalone = false, noteId, onActivate, polished = false, showcased = false, illuminated = false }: { level: GradeLevel; active?: boolean; standalone?: boolean; noteId?: string; onActivate?: () => void; polished?: boolean; showcased?: boolean; illuminated?: boolean }) {
  return (
            <article
              tabIndex={onActivate ? 0 : undefined}
              role={onActivate ? "button" : undefined}
              aria-pressed={onActivate ? active : undefined}
              
              className={`tremplin-gateway__grade-card ${active ? "is-active" : ""} ${standalone ? "is-standalone" : ""} ${illuminated ? "is-illuminated" : ""} ${showcased ? "is-showcased" : ""} ${showcased && level === 6 ? "is-showcase-finale" : ""}`}
              style={{ "--grade-index": level - 1, "--grade-light": getGradeBadgeMeta(level).mainColor, "--grade-soft": getGradeBadgeMeta(level).softColor } as CSSProperties}
              aria-controls={onActivate ? noteId : undefined}
              aria-label={"Niveau " + level + ", " + TREMPLIN_GRADE_EXPERIENCE[level].title + ". " + LEVEL_GUIDANCE[level].cardLabel}
              onMouseEnter={onActivate}
              onFocus={onActivate}
              onClick={onActivate}
              onKeyDown={onActivate ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onActivate();
                }
              } : undefined}
            >
              {polished && <span className="tremplin-grade-card__sheen" aria-hidden="true" />}
              {polished && level === 6 && <span className="tremplin-grade-card__waves" aria-hidden="true"><i /><i /><i /></span>}
              {polished && <span className="tremplin-grade-card__tour-note" aria-hidden="true">
                <small>Niveau {level}</small><strong>{LEVEL_GUIDANCE[level].cardLabel}</strong>
              </span>}
              <span className="tremplin-public-home__level-stage">Niveau {level}</span>
              <MeewavGradeBadge className="tremplin-public-home__level-badge" level={level} size="hero" variant="icon" />
              <strong>{TREMPLIN_GRADE_EXPERIENCE[level].title}</strong>
              <span className="tremplin-gateway__grade-description">{GRADE_DESCRIPTIONS[level]}</span>
              {!polished && <span className="tremplin-gateway__grade-caption" aria-hidden={!active}>{LEVEL_GUIDANCE[level].cardLabel}</span>}
            </article>
  );
}

export default function TremplinGradeProgression({ id = "niveaux", onUnderstandGrades, children, landing = false }: { id?: string; onUnderstandGrades?: () => void; children?: ReactNode; landing?: boolean }) {
  const [activeGradeLevel, setActiveGradeLevel] = useState<GradeLevel>(landing ? 3 : 4);
  const sectionRef = useRef<HTMLElement>(null);
  const [entered, setEntered] = useState(false);
  const [sectionVisible, setSectionVisible] = useState(false);
  const [showcaseLevel, setShowcaseLevel] = useState<GradeLevel | 0>(0);
  const [allowMotion, setAllowMotion] = useState(false);
  useEffect(() => {
    if (!landing) return;
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setAllowMotion(!preference?.matches && !document.hidden);
    syncMotion();
    preference?.addEventListener("change", syncMotion);
    document.addEventListener("visibilitychange", syncMotion);
    return () => {
      preference?.removeEventListener("change", syncMotion);
      document.removeEventListener("visibilitychange", syncMotion);
    };
  }, [landing]);
  const showcaseRunning = landing && sectionVisible && allowMotion;
  useEffect(() => {
    if (!showcaseRunning) return;
    const timer = window.setTimeout(() => setShowcaseLevel(level => (level === 6 ? 0 : level + 1) as GradeLevel | 0), showcaseLevel === 0 ? 700 : showcaseLevel === 6 ? 5000 : 2000);
    return () => window.clearTimeout(timer);
  }, [showcaseRunning, showcaseLevel]);
  useEffect(() => {
    const section = sectionRef.current;
    if (!landing || !section || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      setSectionVisible(entry.isIntersecting);
      if (entry.isIntersecting) setEntered(true);
    }, { threshold: 0.08 });
    observer.observe(section);
    return () => observer.disconnect();
  }, [landing]);
  const activeGradeGuidance = LEVEL_GUIDANCE[activeGradeLevel];
  const activeGradeMeta = getGradeBadgeMeta(activeGradeLevel);
  const titleId = id + "-title";
  const noteId = id + "-note";
  return (
<section
        id={id}
        ref={sectionRef}
        className={`tremplin-public-home__section tremplin-public-home__levels tremplin-gateway__levels${landing ? " tremplin-grades-open" : ""}${landing && entered ? " has-entered" : ""}`}
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
        <div className="tremplin-public-home__level-track" role="group" aria-label={landing ? "Les six niveaux MeeWav" : "Explorer les six niveaux MeeWav"}>
          <div className="tremplin-gateway__prestige-bridges" aria-hidden="true">{[1, 2, 3, 4, 5].map(index => <i key={index} style={{ "--bridge-index": index } as CSSProperties} />)}</div>
          {GRADE_LEVELS.map((level) => (
            <TremplinGradeCard polished={landing} showcased={showcaseRunning && showcaseLevel === level} illuminated={landing && showcaseLevel >= level} key={level} level={level} active={!landing && level === activeGradeLevel} noteId={noteId} onActivate={landing ? undefined : () => setActiveGradeLevel(level)} />
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
