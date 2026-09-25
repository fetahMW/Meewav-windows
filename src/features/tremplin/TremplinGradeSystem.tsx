import {
  CalendarCheck2,
  CircleDashed,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { GRADE_BADGES, getGradeBadgeMeta, type GradeLevel } from "../grades/gradeBadges";
import { MeewavGradeBadge } from "../grades/MeewavGradeBadge";
import type { TremplinArtist } from "./tremplinArtistData";
import { TREMPLIN_GRADE_EXPERIENCE } from "./tremplinProductModel";
import "./tremplin-grade-system.css";

const GRADE_CRITERIA = [
  "Identité et authenticité",
  "Talent et qualité des créations",
  "Expérience artistique",
  "Régularité de l’activité",
  "Accomplissements documentés",
  "Audience authentique",
  "Collaborations vérifiées",
  "Progression professionnelle",
] as const;

const GRADE_LEVELS = [1, 2, 3, 4, 5, 6] as const;

export default function TremplinGradeSystem({ artist }: { artist: TremplinArtist }) {
  const level = artist.gradeLevel as GradeLevel;
  const meta = getGradeBadgeMeta(level);
  const experience = TREMPLIN_GRADE_EXPERIENCE[level];

  return (
    <section className="tremplin-grade-system" aria-labelledby="tremplin-grade-title">
      <header className="tremplin-grade-system__header">
        <div>
          <span className="tremplin-kicker">Grade MeeWav</span>
          <h2 id="tremplin-grade-title">Grade actuel : Niveau {level} — {meta.label}</h2>
          <p>Le grade représente le niveau global atteint par l’artiste dans l’infrastructure MeeWav. Il tient compte de son talent, de la qualité de ses créations, de son expérience, de sa régularité, de ses collaborations, de ses accomplissements, de son audience authentique et de sa progression professionnelle.</p>
          <p>Le grade ne fixe pas automatiquement le prix du jeton et ne garantit pas le succès futur. Un artiste déjà professionnel peut être positionné directement au niveau correspondant à sa carrière après vérification de son parcours antérieur.</p>
        </div>
        <div className="tremplin-grade-system__current">
          <MeewavGradeBadge level={level} size="lg" />
          <span><small>Niveau {level}</small><strong>{meta.label}</strong></span>
        </div>
      </header>

      <div className="tremplin-grade-system__overview">
        <article>
          <span><Sparkles /></span>
          <div><small>Définition du niveau</small><strong>{experience.definition}</strong></div>
        </article>
        <article>
          <span><ShieldCheck /></span>
          <div><small>Parcours antérieur</small><strong>Peut être reconnu après vérification</strong></div>
        </article>
        <article>
          <span><CalendarCheck2 /></span>
          <div><small>Dernière évaluation</small><strong>Détails non publiés dans cette démonstration</strong></div>
        </article>
      </div>

      <div className="tremplin-grade-system__criteria">
        <div>
          <span className="tremplin-kicker">Évaluation transparente</span>
          <h3>Critères examinés lors de l’évaluation</h3>
        </div>
        <ul>
          {GRADE_CRITERIA.map((criterion) => (
              <li key={criterion}>
                <span><CircleDashed /></span>
                <strong>{criterion}</strong>
                <small>Dimension examinée</small>
              </li>
          ))}
        </ul>
      </div>

      <div className="tremplin-grade-system__levels" aria-label="Les six niveaux MeeWav">
        {GRADE_LEVELS.map((gradeLevel) => {
          const grade = GRADE_BADGES[gradeLevel];
          return (
            <span key={gradeLevel} className={gradeLevel === level ? "is-current" : ""}>
              <MeewavGradeBadge level={gradeLevel} size="md" variant="icon" />
              <small>N{gradeLevel}</small>
              <strong>{grade.label}</strong>
            </span>
          );
        })}
      </div>

      <aside className="tremplin-grade-system__eligibility">
        <div>
          <ShieldCheck />
          <span>
            <strong>Le grade situe un niveau, pas un prix</strong>
            <small>{experience.note} Toute évolution de grade résulte d’une nouvelle évaluation et n’est jamais garantie. Les achats de jetons, leur valeur et les achats croisés entre artistes n’entrent jamais dans cette évaluation.</small>
          </span>
        </div>
      </aside>
    </section>
  );
}
