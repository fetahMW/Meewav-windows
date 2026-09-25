import {
  ArrowDown,
  ArrowDownUp,
  ArrowRight,
  CalendarDays,
  ChevronRight,
  Clock3,
  Clapperboard,
  Database,
  Eye,
  FileText,
  Globe2,
  Heart,
  Info,
  PlayCircle,
  Radio,
  Rocket,
  Shield,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import TremplinGradeProgression from "./TremplinGradeProgression";
import { SCENE_ROUTE } from "../shorts/sceneContract";
import { trackTremplinEvent } from "./tremplinAnalytics";
import MeewavTokenIcon from "./MeewavTokenIcon";
import { TREMPLIN_COPY } from "./tremplinCopy";
import { tremplinArtists } from "./tremplinArtistData";
import {
  TREMPLIN_EDUCATIONAL_SUMMARY_FIXTURE,
} from "./tremplinProductModel";
import "./tremplin-curve-explainer.css";
import "./tremplin-token-education.css";
import "./tremplin-discovery-guide.css";
import "./tremplin-follow-guide.css";
import "./tremplin-token-guide.css";
import "./tremplin-education-surfaces.css";

type EducationalOperation = "buy" | "sell";
const euros = (value: number) => new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(value);

const tokens = (value: number) => new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: value < 10 ? 2 : 1,
  maximumFractionDigits: 2,
}).format(value);

const EDUCATIONAL_CURVE = {
  floorPriceEur: 1.02,
  slopeEurPerToken: 0.002,
  circulatingSupply: 1_200,
  heldTokens: 48,
  buyFeeRate: 0.025,
  resaleFeeRate: 0.035,
} as const;

const curvePrice = (supply: number) => (
  EDUCATIONAL_CURVE.floorPriceEur + EDUCATIONAL_CURVE.slopeEurPerToken * Math.max(0, supply)
);

const curveIntegral = (fromSupply: number, toSupply: number) => {
  const lower = Math.max(0, Math.min(fromSupply, toSupply));
  const upper = Math.max(0, Math.max(fromSupply, toSupply));
  return (
    EDUCATIONAL_CURVE.floorPriceEur * (upper - lower)
    + (EDUCATIONAL_CURVE.slopeEurPerToken / 2) * (upper ** 2 - lower ** 2)
  );
};

const quantityForBudget = (budgetEur: number, supply: number) => {
  const priceNow = curvePrice(supply);
  return Math.max(0, (
    -priceNow
    + Math.sqrt(priceNow ** 2 + 2 * EDUCATIONAL_CURVE.slopeEurPerToken * Math.max(0, budgetEur))
  ) / EDUCATIONAL_CURVE.slopeEurPerToken);
};

const markerPosition = (position: number): CSSProperties => ({
  left: `${position}%`,
  bottom: `${7 + 87 * (position / 100) ** 2.1}%`,
});

export function TremplinCurveExplainer({ compact = false }: { compact?: boolean }) {
  const chartId = useId().replace(/:/g, "");
  const [operation, setOperation] = useState<EducationalOperation>("buy");
  const [amountEur, setAmountEur] = useState(50);
  const [resaleTokens, setResaleTokens] = useState(12);
  const simulation = useMemo(() => {
    const valueBeforeEur = curvePrice(EDUCATIONAL_CURVE.circulatingSupply);

    if (operation === "buy") {
      const feesEur = amountEur * EDUCATIONAL_CURVE.buyFeeRate;
      const amountAppliedToCurveEur = Math.max(0, amountEur - feesEur);
      const estimatedTokens = quantityForBudget(amountAppliedToCurveEur, EDUCATIONAL_CURVE.circulatingSupply);
      const supplyAfter = EDUCATIONAL_CURVE.circulatingSupply + estimatedTokens;
      return {
        valueBeforeEur,
        valueAfterEur: curvePrice(supplyAfter),
        feesEur,
        estimatedTokens,
        grossEur: amountEur,
        netEur: amountEur,
        resaleShare: 0,
        positionAfter: Math.min(90, 61 + estimatedTokens / 5.8),
      };
    }

    const safeResaleTokens = Math.min(EDUCATIONAL_CURVE.heldTokens, Math.max(0, resaleTokens));
    const supplyAfter = Math.max(0, EDUCATIONAL_CURVE.circulatingSupply - safeResaleTokens);
    const grossEur = curveIntegral(supplyAfter, EDUCATIONAL_CURVE.circulatingSupply);
    const feesEur = grossEur * EDUCATIONAL_CURVE.resaleFeeRate;
    return {
      valueBeforeEur,
      valueAfterEur: curvePrice(supplyAfter),
      feesEur,
      estimatedTokens: safeResaleTokens,
      grossEur,
      netEur: Math.max(0, grossEur - feesEur),
      resaleShare: safeResaleTokens / EDUCATIONAL_CURVE.heldTokens,
      positionAfter: Math.max(35, 61 - safeResaleTokens / 1.85),
    };
  }, [amountEur, operation, resaleTokens]);

  const beforePosition = 61;

  return (
    <section className={`tremplin-curve-explainer is-${operation} ${compact ? "is-compact" : ""}`} aria-labelledby={compact ? undefined : "curve-explainer-title"}>
      <div className="tremplin-curve-explainer__copy">
        <span className="tremplin-kicker">Évolution de la valeur</span>
        <h2 id={compact ? undefined : "curve-explainer-title"}>Comprendre ce qui fait varier la valeur.</h2>
        <p>La valeur dépend des achats et des reventes de jetons selon une formule prédéfinie. Elle ne mesure ni la qualité artistique ni le grade de l’artiste.</p>
        <div className="tremplin-curve-explainer__switch" aria-label="Choisir une opération à simuler">
          <button type="button" className={operation === "buy" ? "is-active" : ""} aria-pressed={operation === "buy"} onClick={() => setOperation("buy")}>Simuler un achat</button>
          <button type="button" className={operation === "sell" ? "is-active" : ""} aria-pressed={operation === "sell"} onClick={() => setOperation("sell")}>Simuler une revente</button>
        </div>
        <label className="tremplin-curve-explainer__range">
          <span>
            <b>{operation === "buy" ? "Montant de l’achat" : "Quantité de jetons revendue"}</b>
            <strong>{operation === "buy" ? euros(amountEur) : `${tokens(resaleTokens)} jetons · ${Math.round((resaleTokens / EDUCATIONAL_CURVE.heldTokens) * 100)} %`}</strong>
          </span>
          {operation === "buy" ? (
            <input aria-label="Montant pédagogique de l’achat en euros" type="range" min="10" max="500" step="5" value={amountEur} onChange={(event) => setAmountEur(Number(event.target.value))} />
          ) : (
            <input aria-label="Quantité pédagogique de jetons revendue" type="range" min="0.5" max={EDUCATIONAL_CURVE.heldTokens} step="0.5" value={resaleTokens} onChange={(event) => setResaleTokens(Number(event.target.value))} />
          )}
          <small>{operation === "buy" ? "Les frais illustratifs sont déduits avant application au mécanisme de calcul." : `Quantité détenue dans cet exemple : ${tokens(EDUCATIONAL_CURVE.heldTokens)} jetons. Aucun euro n’est saisi pour revendre.`}</small>
        </label>
      </div>

      <div className="tremplin-curve-explainer__visual">
        <div className="tremplin-curve-explainer__plot">
          <span className="tremplin-curve-explainer__axis is-y">Valeur d’un jeton</span>
          <svg viewBox="0 0 620 310" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id={`${chartId}-curve-fill`} x1="0" y1="1" x2="1" y2="0">
                <stop offset="0" stopColor="#6650cf" stopOpacity="0.04" />
                <stop offset="1" stopColor="#9980ff" stopOpacity="0.32" />
              </linearGradient>
              <linearGradient id={`${chartId}-curve-line`} x1="0" x2="1"><stop offset="0" stopColor="#6677dc" stopOpacity=".48" /><stop offset=".62" stopColor="#9d80ff" /><stop offset="1" stopColor={operation === "buy" ? "#98edc2" : "#f29caf"} /></linearGradient>
            </defs>
            <path className="tremplin-curve-explainer__grid" d="M24 76H596 M24 143H596 M24 210H596 M24 276H596" />
            <path className="tremplin-curve-explainer__area" d="M24 276 C160 270 250 238 334 194 C434 142 484 78 596 28 L596 290 L24 290 Z" fill={`url(#${chartId}-curve-fill)`} />
            <path className="tremplin-curve-explainer__curve" d="M24 276 C160 270 250 238 334 194 C434 142 484 78 596 28" stroke={`url(#${chartId}-curve-line)`} />
          </svg>
          <span className="tremplin-curve-explainer__marker is-before" style={markerPosition(beforePosition)}><i />Avant</span>
          <span className={`tremplin-curve-explainer__marker is-after is-${operation}`} style={markerPosition(simulation.positionAfter)}><i />Après</span>
          <span className={`tremplin-curve-explainer__direction is-${operation}`}><ArrowDownUp />{operation === "buy" ? "Achat : la valeur peut augmenter" : "Revente : la valeur peut diminuer"}</span>
          <span className="tremplin-curve-explainer__axis is-x">Jetons en circulation</span>
        </div>
        <dl aria-live="polite">
          <div><dt>Valeur avant</dt><dd>{euros(simulation.valueBeforeEur)}</dd></div>
          <div><dt>Valeur estimée après</dt><dd>{euros(simulation.valueAfterEur)}</dd></div>
          <div><dt>{operation === "buy" ? "Jetons estimés" : "Jetons revendus"}</dt><dd>{operation === "buy" ? tokens(simulation.estimatedTokens) : `${tokens(simulation.estimatedTokens)} · ${Math.round(simulation.resaleShare * 100)} %`}</dd></div>
          <div><dt>Frais illustratifs</dt><dd>{euros(simulation.feesEur)}</dd></div>
          <div><dt>{operation === "buy" ? "Montant saisi" : "Net estimé reçu"}</dt><dd>{euros(simulation.netEur)}</dd></div>
        </dl>
        <small><Info /> Simulation pédagogique uniquement. Le serveur recalcule et vérifie chaque opération réelle. Aucun prix ni gain n’est prédit. Taux illustratifs : {operation === "buy" ? "2,5 %" : "3,5 %"}.</small>
      </div>
    </section>
  );
}

const DISCOVERY_CHANNELS = [
  {
    id: "rooms",
    icon: Radio,
    title: "Les 6 Rooms",
    detail: "Six espaces en direct pour voir les artistes jouer, créer et échanger.",
    action: "Voir les prochaines Rooms",
    route: "/rooms",
  },
  {
    id: "scene",
    icon: Clapperboard,
    title: "La Scène",
    detail: "Un flux 100 % musique pour découvrir leurs créations et leurs performances.",
    action: "Explorer La Scène",
    route: SCENE_ROUTE,
  },
  {
    id: "globe",
    icon: Globe2,
    title: "Le Globe",
    detail: "Une carte pour trouver des artistes près de toi ou ailleurs.",
    action: "Ouvrir le Globe",
    route: "/globe",
  },
] as const;

const TOKEN_EDUCATION_DETAILS = [
  {
    id: "purchase",
    title: "Ce que tu achètes réellement",
    copy: "Tu achètes des jetons numériques associés à un artiste. Il ne s’agit pas d’un don classique. Une partie du montant est destinée à l’artiste et la répartition complète est visible avant la confirmation.",
  },
  {
    id: "value",
    title: "Comment la valeur évolue",
    copy: "La valeur dépend des achats et des reventes effectués sur MeeWav. Elle peut monter ou baisser. Une hausse passée ne garantit aucune hausse future.",
  },
  {
    id: "resale",
    title: "Comment fonctionne la revente",
    copy: "Les jetons peuvent être proposés à la revente selon les règles du service. Des délais ou des frais supplémentaires peuvent s’appliquer et la revente peut ne pas être immédiate.",
  },
  {
    id: "rights",
    title: "Ce que le jeton ne donne pas",
    copy: "Le jeton ne donne aucun droit sur l’artiste, son image, ses chansons, ses œuvres ou ses droits d’auteur. Aucun résultat financier n’est garanti.",
  },
] as const;

type TokenEducationDetailId = (typeof TOKEN_EDUCATION_DETAILS)[number]["id"];
const MEEWAV_ECOSYSTEM_VIDEO_SRC = "/media/tremplin/ecosysteme-meewav.mp4";

type TremplinTokenEducationProps = {
  onDiscover: () => void;
  onHome: () => void;
  onOpenRoute: (route: string) => void;
};

export default function TremplinTokenEducation({
  onDiscover,
  onHome,
  onOpenRoute,
}: TremplinTokenEducationProps) {
  const [videoOpen, setVideoOpen] = useState(false);
  const [followDemo, setFollowDemo] = useState(false);
  const [tokenSummaryOpen, setTokenSummaryOpen] = useState(false);
  const [tokenRulesOpen, setTokenRulesOpen] = useState(false);
  const [openTokenDetail, setOpenTokenDetail] = useState<TokenEducationDetailId | null>(null);
  const videoTriggerRef = useRef<HTMLButtonElement>(null);
  const videoCloseRef = useRef<HTMLButtonElement>(null);
  const videoDialogRef = useRef<HTMLElement>(null);
  const tokenRulesTriggerRef = useRef<HTMLButtonElement>(null);
  const tokenRulesCloseRef = useRef<HTMLButtonElement>(null);
  const tokenRulesDialogRef = useRef<HTMLElement>(null);
  const featuredArtist = tremplinArtists[0];

  const openTokenRules = () => {
    setOpenTokenDetail(null);
    setTokenRulesOpen(true);
  };

  useEffect(() => {
    if (!videoOpen) return undefined;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousBodyOverflow = document.body.style.overflow;
    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setVideoOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(videoDialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], video[controls], summary, [tabindex]:not([tabindex="-1"])') ?? [])];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.body.style.overflow = "hidden";
    videoCloseRef.current?.focus();
    window.addEventListener("keydown", handleDialogKeys);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener("keydown", handleDialogKeys);
      previouslyFocused?.focus();
    };
  }, [videoOpen]);

  useEffect(() => {
    if (!tokenRulesOpen) return undefined;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousBodyOverflow = document.body.style.overflow;
    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setTokenRulesOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(tokenRulesDialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], summary, [tabindex]:not([tabindex="-1"])') ?? [])];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.body.style.overflow = "hidden";
    tokenRulesCloseRef.current?.focus();
    window.addEventListener("keydown", handleDialogKeys);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener("keydown", handleDialogKeys);
      previouslyFocused?.focus();
    };
  }, [tokenRulesOpen]);

  return (
    <div className="tremplin-how">
      <header className="tremplin-how__hero">
        <span className="tremplin-how__kicker">LE TREMPLIN, SIMPLEMENT</span>
        <h1>Découvre les artistes. Suis leur actualité gratuitement. <strong>L’achat de jetons de talent reste toujours facultatif.</strong></h1>
        <p>Voici comment fonctionne le Tremplin, dans l’ordre.</p>
        <div className="tremplin-how__hero-actions">
          <a href="#tremplin-discovery">Comprendre en 3 étapes <ArrowDown aria-hidden="true" /></a>
          <button ref={videoTriggerRef} type="button" data-tremplin-video-cta onClick={() => setVideoOpen(true)}><PlayCircle aria-hidden="true" /> Voir la vidéo · 1 min 40</button>
        </div>
        <p className="tremplin-how__hero-note"><ShieldCheck aria-hidden="true" /> {TREMPLIN_COPY.freeAccess}</p>
      </header>

      <section id="tremplin-discovery" className="tremplin-how__section is-discovery" aria-labelledby="tremplin-discovery-title" tabIndex={-1}>
        <header className="tremplin-how__section-heading">
          <span>1</span>
          <div><small>JE DÉCOUVRE</small><h2 id="tremplin-discovery-title">Où découvre-t-on les <em>artistes&nbsp;?</em></h2><p>Tu peux les rencontrer dans les Rooms, sur La Scène et dans le Globe. Le Tremplin rassemble ensuite leur profil, leurs créations, leurs prochaines activités et les étapes de leur parcours.</p></div>
        </header>
        <div className="tremplin-how__discovery-art" aria-hidden="true" />
        <div className="tremplin-how__channels">
          {DISCOVERY_CHANNELS.map(({ id, title, detail, action, route }) => (
            <article key={id} className={`is-${id}`}>
              <div className="tremplin-how__channel-art" aria-hidden="true" />
              <h3>{title}</h3>
              <p>{detail}</p>
              <button type="button" onClick={() => onOpenRoute(route)}>{action} <ArrowRight aria-hidden="true" /></button>
            </article>
          ))}
        </div>
        <footer className="tremplin-how__discovery-signature" aria-hidden="true"><span>Talents d’aujourd’hui<br />Icônes de demain</span><span>Explorer · Soutenir · Vibrer · Grandir</span></footer>
      </section>

      <section id="tremplin-follow" className="tremplin-how__section is-follow" aria-labelledby="tremplin-follow-title" tabIndex={-1}>
        <header className="tremplin-how__section-heading">
          <span>2</span>
          <div><small>JE SUIS LEUR ACTUALITÉ</small><h2 id="tremplin-follow-title">Suivre un artiste est <em>gratuit.</em></h2><p>Aucun jeton n’est nécessaire.</p></div>
        </header>
        <div className="tremplin-how__follow-art" aria-hidden="true" />
        <div className="tremplin-how__follow-card">
          <span className="tremplin-how__follow-heart"><Heart aria-hidden="true" /></span>
          <div className="tremplin-how__follow-copy">
            <h3>Un artiste te plaît&nbsp;?</h3>
            <p>Ouvre son profil et appuie sur «&nbsp;Suivre gratuitement&nbsp;».<br />Tu retrouveras tout dans Mes artistes.</p>
            <button type="button" className={followDemo ? "is-followed" : ""} aria-pressed={followDemo} onClick={() => setFollowDemo((value) => !value)}><Heart aria-hidden="true" /><span>{followDemo ? "Artiste suivi ✓" : "Suivre gratuitement"}</span><ArrowRight aria-hidden="true" /></button>
            <small role="status">{followDemo ? "Tu retrouveras ses vidéos, ses Rooms et ses actualités dans Mes artistes." : "Soutiens sans contrainte. Reste libre. Découvre plus."}</small>
          </div>
          <ul aria-label="Ce que tu peux suivre gratuitement">
            <li><button type="button" onClick={() => onOpenRoute(SCENE_ROUTE)}><Clapperboard aria-hidden="true" /><span>Nouvelles vidéos</span><ArrowRight aria-hidden="true" /></button></li>
            <li><button type="button" onClick={() => onOpenRoute("/rooms")}><Radio aria-hidden="true" /><span>Prochaines Rooms</span><ArrowRight aria-hidden="true" /></button></li>
            <li><button type="button" onClick={() => onOpenRoute("/tremplin/mes-artistes")}><CalendarDays aria-hidden="true" /><span>Actualités</span><ArrowRight aria-hidden="true" /></button></li>
          </ul>
        </div>
      </section>

      <TremplinGradeProgression id="tremplin-grades">
        <details className="tremplin-how__grade-method"><summary>Comment un grade est-il attribué ?</summary>
        <aside className="tremplin-how__prior-career"><strong>Reconnaissance du parcours antérieur</strong><p>Un artiste déjà professionnel peut être positionné directement au niveau correspondant à sa carrière après vérification de son parcours antérieur. L’évaluation peut prendre en compte son identité, ses crédits, ses œuvres, ses représentations et ses collaborations.</p><small>À partir du niveau 2, l’artiste peut déposer une demande de jeton de talent. MeeWav peut l’accepter ou la refuser après vérification.</small></aside>
        </details>
      </TremplinGradeProgression>

      <section id="tremplin-token-mw" className="tremplin-how__section is-token" aria-labelledby="tremplin-token-mw-title" tabIndex={-1}>
        <div className="tremplin-how__mw-essential">
          <div className="tremplin-how__mw-artist-art" aria-hidden="true" />
          <header className="tremplin-how__mw-heading">
            <span aria-hidden="true">3</span>
            <div>
              <small className="tremplin-how__mw-kicker">LES JETONS DE TALENT, SIMPLEMENT</small>
              <h2 id="tremplin-token-mw-title">Le jeton de talent, <em>simplement.</em></h2>
              <p><strong>Une façon payante et facultative de donner de la force à un projet.</strong><span>Tu découvres d’abord gratuitement l’artiste et son parcours.</span></p>
            </div>
          </header>

          <div className="tremplin-how__mw-main">
            <div className="tremplin-how__mw-visual">
              <div className="tremplin-how__mw-coin-art" role="img" aria-label="Jeton de talent MeeWav en verre violet, posé sur la roche" />
              <span className="tremplin-how__mw-verified"><ShieldCheck aria-hidden="true" /> Lié à un artiste vérifié</span>
            </div>

            <div className="tremplin-how__mw-explanation">
              <ol className="tremplin-how__mw-timeline">
                <li><span>1</span><div><strong>Tu choisis ton montant</strong><p>Dans les limites affichées.</p></div></li>
                <li><span>2</span><div><strong>Tu vois le récapitulatif</strong><p>Jetons estimés, frais, part artiste et total.</p></div></li>
                <li><span>3</span><div><strong>Tu confirmes ou tu annules</strong><p>Rien n’est acheté avant ta confirmation.</p></div></li>
              </ol>
              <div className="tremplin-how__mw-assurances" aria-label="Repères essentiels des jetons de talent">
                <span><Rocket aria-hidden="true" />Facultatif</span><span><Eye aria-hidden="true" />Part de l’artiste visible</span><span><Shield aria-hidden="true" />Aucun gain garanti</span>
              </div>
              <p className="tremplin-how__mw-risk-note">La valeur peut varier et la revente peut ne pas être immédiate.</p>
            </div>
          </div>
        </div>

        <section className="tremplin-how__mw-before" aria-labelledby="tremplin-mw-before-title">
          <header>
            <div>
              <small>AVANT DE CONFIRMER</small>
              <h3 id="tremplin-mw-before-title">Avant de confirmer, tu vois tout.</h3>
              <p>Le montant, les jetons estimés, les frais, la part de l’artiste et les conditions de revente sont affichés avant l’achat.</p>
            </div>
            <button type="button" aria-expanded={tokenSummaryOpen} aria-controls="tremplin-mw-summary-example" onClick={() => setTokenSummaryOpen((value) => !value)}>Voir un exemple de récapitulatif <ArrowRight aria-hidden="true" /></button>
          </header>
          <ul aria-label="Informations visibles avant confirmation"><li><FileText aria-hidden="true" /> Montant</li><li><Database aria-hidden="true" /> Jetons estimés</li><li><Info aria-hidden="true" /> Frais</li><li><UserRound aria-hidden="true" /> Part artiste</li><li><Clock3 aria-hidden="true" /> Revente</li></ul>
          {tokenSummaryOpen ? (
            <div id="tremplin-mw-summary-example" className="tremplin-how__mw-summary-example" role="region" aria-label="Exemple pédagogique de récapitulatif">
              <span>Exemple pédagogique — aucune transaction n’est effectuée.</span>
              <dl>
                <div><dt>Montant choisi</dt><dd>{euros(TREMPLIN_EDUCATIONAL_SUMMARY_FIXTURE.amountCents / 100)}</dd></div>
                <div><dt>Jetons estimés</dt><dd>{new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(TREMPLIN_EDUCATIONAL_SUMMARY_FIXTURE.estimatedTokenHundredths / 100)} jetons</dd></div>
                <div><dt>Frais</dt><dd>{euros(TREMPLIN_EDUCATIONAL_SUMMARY_FIXTURE.feesCents / 100)}</dd></div>
                <div><dt>Part destinée à l’artiste</dt><dd>{euros(TREMPLIN_EDUCATIONAL_SUMMARY_FIXTURE.artistShareCents / 100)}</dd></div>
                <div><dt>Total débité</dt><dd>{euros(TREMPLIN_EDUCATIONAL_SUMMARY_FIXTURE.totalDebitCents / 100)}</dd></div>
                <div><dt>Revente</dt><dd>{TREMPLIN_EDUCATIONAL_SUMMARY_FIXTURE.resaleLabel}</dd></div>
              </dl>
            </div>
          ) : null}
        </section>

        <section className="tremplin-how__mw-conclusion" aria-labelledby="tremplin-mw-conclusion-title">
          <div>
            <small>TU CONNAIS MAINTENANT L’ESSENTIEL</small>
            <h3 id="tremplin-mw-conclusion-title">La musique d’abord. La force, seulement si tu le souhaites.</h3>
            <p>Découvre les artistes gratuitement et suis ceux qui te plaisent. Si tu veux donner de la force à un projet, tu peux ensuite acheter ses jetons de talent.</p>
          </div>
          <footer className="tremplin-how__mw-conclusion-actions">
            <div>
              <button type="button" className="is-primary" onClick={() => { trackTremplinEvent("how_it_works_completed"); onDiscover(); }}>Découvrir les artistes <ArrowRight aria-hidden="true" /></button>
              <button type="button" className="is-secondary" onClick={() => { trackTremplinEvent("how_it_works_completed"); onHome(); }}>Retour à l’accueil</button>
            </div>
            <button ref={tokenRulesTriggerRef} type="button" className="is-tertiary" aria-haspopup="dialog" aria-expanded={tokenRulesOpen} onClick={openTokenRules}>Consulter les règles détaillées <ChevronRight aria-hidden="true" /></button>
          </footer>
        </section>

      </section>

      {tokenRulesOpen ? (
        <div className="tremplin-how__rules-backdrop" role="presentation" onClick={() => setTokenRulesOpen(false)}>
          <section ref={tokenRulesDialogRef} className="tremplin-how__rules-dialog" role="dialog" aria-modal="true" aria-labelledby="tremplin-mw-rules-title" onClick={(event) => event.stopPropagation()}>
            <header>
              <div><span className="tremplin-how__kicker">RÈGLES DÉTAILLÉES</span><h2 id="tremplin-mw-rules-title">Comprendre les jetons de talent.</h2><p>Les informations essentielles restent visibles avant chaque opération.</p></div>
              <button ref={tokenRulesCloseRef} type="button" aria-label="Fermer les règles détaillées" onClick={() => setTokenRulesOpen(false)}><X aria-hidden="true" /></button>
            </header>
            <div className="tremplin-how__mw-details" aria-label="Détails des jetons de talent">
              {TOKEN_EDUCATION_DETAILS.map((detail) => {
                const isOpen = openTokenDetail === detail.id;
                const triggerId = `tremplin-mw-detail-${detail.id}-trigger`;
                const panelId = `tremplin-mw-detail-${detail.id}-panel`;
                return <section key={detail.id}><h3><button id={triggerId} type="button" aria-expanded={isOpen} aria-controls={panelId} onClick={() => setOpenTokenDetail(isOpen ? null : detail.id)}><span>{detail.title}</span><ChevronRight aria-hidden="true" /></button></h3>{isOpen ? <div id={panelId} role="region" aria-labelledby={triggerId}><p>{detail.copy}</p></div> : null}</section>;
              })}
            </div>
          </section>
        </div>
      ) : null}

      {videoOpen ? (
        <div className="tremplin-how__video-backdrop" role="presentation">
          <section ref={videoDialogRef} className="tremplin-how__video-dialog" role="dialog" aria-modal="true" aria-labelledby="tremplin-how-video-title">
            <header>
              <div><span className="tremplin-how__kicker">MEEWAV EN VIDÉO</span><h2 id="tremplin-how-video-title">Découvre l’écosystème MeeWav.</h2></div>
              <button ref={videoCloseRef} type="button" className="tremplin-how__video-close" aria-label="Fermer la présentation vidéo" onClick={() => setVideoOpen(false)}><X aria-hidden="true" /></button>
            </header>
            <video
              data-tremplin-video-slot
              controls
              preload="metadata"
              playsInline
              aria-label="Vidéo de présentation de l’écosystème MeeWav"
              poster={featuredArtist?.artwork}
            >
              <source src={MEEWAV_ECOSYSTEM_VIDEO_SRC} type="video/mp4" />
              Ton navigateur ne peut pas lire cette vidéo.
            </video>
            <details className="tremplin-how__video-transcript">
              <summary>Lire le résumé en texte</summary>
              <p>Tu découvres les artistes dans les six Rooms, sur La Scène et dans le Globe. Le Tremplin rassemble leur profil et leur parcours. Tu peux les suivre gratuitement. Certains artistes vérifiés disposent aussi d’un jeton de talent achetable et revendable. Une partie du montant, les frais, les conditions de revente et les risques sont affichés avant confirmation. Le prix peut baisser et tu peux perdre de l’argent.</p>
            </details>
          </section>
        </div>
      ) : null}
    </div>
  );
}
