import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CloudUpload,
  FileCheck2,
  FileText,
  Gauge,
  Headphones,
  Info,
  Landmark,
  LockKeyhole,
  Music2,
  Radio,
  ReceiptText,
  RefreshCcw,
  Scale,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import MeewavTokenIcon from "./MeewavTokenIcon";
import TremplinDemoBanner from "./TremplinDemoBanner";
import { TREMPLIN_ROLE_PROFILES } from "./tremplinRoleData";
import "./tremplin-token-workspace.css";

type WorkspaceMode = "application" | "dashboard";
type DashboardTab = "overview" | "transactions" | "distributions" | "compliance";
type TokenPeriod = "24 h" | "7 j" | "30 j" | "3 mois" | "1 an" | "Tout";

export type TremplinTokenWorkspaceProps = {
  mode: WorkspaceMode;
  hostName?: string;
  portraitUrl?: string;
  onClose?: () => void;
  onApplicationSubmitted?: () => void;
};

type ApplicationStep = {
  id: number;
  label: string;
  shortLabel: string;
  description: string;
  icon: LucideIcon;
};

type ApplicationDraft = {
  stageName: string;
  city: string;
  disciplines: string;
  biography: string;
  publicLinks: string;
  rightsConfirmed: boolean;
  rulesAccepted: boolean;
  riskAccepted: boolean;
  communicationAccepted: boolean;
};

type ApplicationAdmissionStatus = "Brouillon" | "Vérification en cours";

type ApplicationStepValidation = {
  valid: boolean;
  message: string;
};

const APPLICATION_STEPS: readonly ApplicationStep[] = [
  { id: 1, label: "Ton profil", shortLabel: "Profil", description: "Vérifie les informations déjà remplies pour toi", icon: BadgeCheck },
  { id: 2, label: "Tes créations", shortLabel: "Créations", description: "Choisis deux contenus représentatifs de ton travail", icon: Music2 },
  { id: 3, label: "Tes accords", shortLabel: "Accords", description: "Confirme tes droits et les trois règles essentielles", icon: LockKeyhole },
  { id: 4, label: "Récapitulatif", shortLabel: "Récap.", description: "Relis ta demande avant de l’envoyer", icon: ShieldCheck },
] as const;

const DASHBOARD_TABS: readonly { id: DashboardTab; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Vue d’ensemble", icon: BarChart3 },
  { id: "transactions", label: "Achats & ventes", icon: Activity },
  { id: "distributions", label: "Distributions", icon: Landmark },
  { id: "compliance", label: "Conformité", icon: ShieldCheck },
];

function validateApplicationStep(step: number, draft: ApplicationDraft, uploaded: ReadonlySet<string>): ApplicationStepValidation {
  switch (step) {
    case 1: {
      const requiredFields = [draft.stageName, draft.city, draft.disciplines, draft.publicLinks];
      if (requiredFields.some((value) => !value.trim())) {
        return { valid: false, message: "Vérifie ton nom, ta discipline, ta ville et ton lien public." };
      }
      if (draft.biography.trim().length < 80) {
        return { valid: false, message: "Présente ton univers en quelques phrases simples." };
      }
      return { valid: true, message: "Ton profil est prêt." };
    }
    case 2: {
      const proofCount = ["performance", "track", "video", "credit", "concert", "collaboration"].filter((id) => uploaded.has(id)).length;
      if (proofCount < 2) return { valid: false, message: "Choisis au moins deux contenus représentatifs de ton travail." };
      return { valid: true, message: `${proofCount} contenus sont prêts.` };
    }
    case 3:
      if (!uploaded.has("rights")) return { valid: false, message: "Ajoute ou relie ton attestation de droits." };
      if (!draft.rightsConfirmed) return { valid: false, message: "Confirme que tu détiens les droits nécessaires." };
      if (!draft.rulesAccepted || !draft.riskAccepted || !draft.communicationAccepted) {
        return { valid: false, message: "Confirme les trois règles simples avant de continuer." };
      }
      return { valid: true, message: "Tes accords sont confirmés." };
    case 4: {
      const firstInvalidStep = APPLICATION_STEPS.slice(0, 3).find(({ id }) => !validateApplicationStep(id, draft, uploaded).valid);
      if (firstInvalidStep) return { valid: false, message: `Reviens à l’étape « ${firstInvalidStep.label} » pour la compléter.` };
      return { valid: true, message: "Ta demande est prête à être envoyée." };
    }
    default:
      return { valid: false, message: "Étape inconnue." };
  }
}

const INITIAL_DRAFT: ApplicationDraft = {
  stageName: "FETAh",
  city: "Paris",
  disciplines: "Beatmaker · Producteur · Host",
  biography: "Je construis des morceaux afro-house et urbains à partir de prises live, de textures électroniques et de collaborations nées sur Meewav.",
  publicLinks: "meewav.com/fetah · soundcloud.com/fetah",
  rightsConfirmed: true,
  rulesAccepted: false,
  riskAccepted: false,
  communicationAccepted: false,
};

const PERIOD_VALUES: Record<TokenPeriod, readonly number[]> = {
  "24 h": [3.3, 3.34, 3.32, 3.38, 3.39, 3.41, 3.42],
  "7 j": [3.11, 3.16, 3.14, 3.23, 3.29, 3.37, 3.42],
  "30 j": [2.94, 3.03, 2.98, 3.12, 3.2, 3.31, 3.42],
  "3 mois": [2.42, 2.6, 2.54, 2.83, 3.03, 3.18, 3.42],
  "1 an": [1.12, 1.44, 1.72, 2.08, 2.51, 2.98, 3.42],
  Tout: [0.82, 1.03, 1.28, 1.78, 2.31, 2.87, 3.42],
};

const TRANSACTIONS = [
  { id: "MW-72A9", date: "18 juil. · 21:42", kind: "Achat", amount: "48,00 €", tokens: "14,08 FETAH", average: "3,41 €", fees: "1,20 €", status: "Confirmé" },
  { id: "MW-72A3", date: "18 juil. · 18:05", kind: "Vente", amount: "24,12 €", tokens: "7,12 FETAH", average: "3,39 €", fees: "0,84 €", status: "Confirmé" },
  { id: "MW-719F", date: "18 juil. · 15:21", kind: "Achat", amount: "100,00 €", tokens: "29,58 FETAH", average: "3,38 €", fees: "2,50 €", status: "Confirmé" },
  { id: "MW-7188", date: "18 juil. · 10:17", kind: "Achat", amount: "25,00 €", tokens: "7,44 FETAH", average: "3,36 €", fees: "0,63 €", status: "Vérifié" },
] as const;

const DISTRIBUTIONS = [
  { date: "15 juil. 2026", label: "Distribution mensuelle", gross: "1 284,00 €", fees: "128,40 €", net: "1 155,60 €", status: "Versé" },
  { date: "15 juin 2026", label: "Distribution mensuelle", gross: "986,00 €", fees: "98,60 €", net: "887,40 €", status: "Versé" },
  { date: "15 mai 2026", label: "Distribution mensuelle", gross: "742,00 €", fees: "74,20 €", net: "667,80 €", status: "Versé" },
] as const;

const COMPLIANCE_ITEMS = [
  { label: "Identité du titulaire", detail: "Exemple de contrôle d’identité", state: "Démo" },
  { label: "Droits sur les contenus", detail: "Justificatifs à récupérer depuis le serveur", state: "À connecter" },
  { label: "Communication publique", detail: "Charte et signalements à connecter", state: "À connecter" },
  { label: "Coordonnées bancaires", detail: "État bancaire à récupérer depuis le serveur", state: "À connecter" },
] as const;

function formatEuro(value: number, decimals = 2) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <section className={`ttw-card ${className}`}>{children}</section>;
}

function WorkspaceIdentity({ hostName, portraitUrl, eyebrow }: { hostName: string; portraitUrl: string; eyebrow: string }) {
  return (
    <div className="ttw-identity">
      <span className="ttw-identity__portrait"><img src={portraitUrl} alt={`Portrait de ${hostName}`} /></span>
      <span>
        <small>{eyebrow}</small>
        <strong>{hostName} <BadgeCheck aria-label="Profil vérifié" /></strong>
        <em>Host · Beatmaker · Paris</em>
      </span>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="ttw-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function ApplicationStepper({ activeStep, completed, onStep }: { activeStep: number; completed: ReadonlySet<number>; onStep: (step: number) => void }) {
  return (
    <nav className="ttw-creator-steps" aria-label="Demande de jeton de talent en trois étapes puis un récapitulatif">
      <ol>
        {APPLICATION_STEPS.map(({ id, shortLabel, icon: Icon }) => (
          <li key={id} className={activeStep === id ? "is-active" : completed.has(id) ? "is-complete" : ""}>
            <button type="button" onClick={() => onStep(id)} aria-current={activeStep === id ? "step" : undefined}>
              <span>{completed.has(id) ? <Check /> : <Icon />}</span>
              <span><small>0{id}</small><strong>{shortLabel}</strong></span>
            </button>
          </li>
        ))}
      </ol>
      <i aria-hidden="true"><b style={{ width: `${((activeStep - 1) / (APPLICATION_STEPS.length - 1)) * 100}%` }} /></i>
    </nav>
  );
}

function EligibilityPanel({ draft, setDraft, hostName, portraitUrl }: { draft: ApplicationDraft; setDraft: (next: ApplicationDraft) => void; hostName: string; portraitUrl: string }) {
  const currentRoleIsListed = TREMPLIN_ROLE_PROFILES.some(({ label }) => label === draft.disciplines);
  return (
    <div className="ttw-creator-panel">
      <div className="ttw-creator-profile-import">
        <WorkspaceIdentity hostName={hostName} portraitUrl={portraitUrl} eyebrow="Profil de démonstration relié" />
        <span><CheckCircle2 /><strong>Exemple · niveau 2 admissible</strong><small>Éligible à une demande dans cette démonstration.</small></span>
      </div>
      <div className="ttw-creator-question">
        <span className="ttw-kicker">Étape 1 · déjà préremplie</span>
        <h3>Vérifie simplement ton profil.</h3>
        <p>Corrige uniquement ce qui a changé. Le public verra ces informations avant tout jeton.</p>
      </div>
      <div className="ttw-form-row">
        <Field label="Nom public"><input autoComplete="organization" value={draft.stageName} onChange={(event) => setDraft({ ...draft, stageName: event.target.value })} /></Field>
        <Field label="Métier principal">
          <select value={draft.disciplines} onChange={(event) => setDraft({ ...draft, disciplines: event.target.value })}>
            {!currentRoleIsListed && <option value={draft.disciplines}>{draft.disciplines}</option>}
            {TREMPLIN_ROLE_PROFILES.map((role) => <option key={role.id} value={role.label}>{role.label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Ville"><input autoComplete="address-level2" value={draft.city} onChange={(event) => setDraft({ ...draft, city: event.target.value })} /></Field>
      <Field label="Présente ton univers simplement" hint={`${draft.biography.trim().length}/520 caractères · explique ce qui te rend reconnaissable.`}><textarea rows={3} maxLength={520} value={draft.biography} onChange={(event) => setDraft({ ...draft, biography: event.target.value })} /></Field>
      <Field label="Un lien pour t’écouter ou te voir" hint="Profil MeeWav, plateforme d’écoute, site ou réseau public."><input inputMode="url" value={draft.publicLinks} onChange={(event) => setDraft({ ...draft, publicLinks: event.target.value })} /></Field>
    </div>
  );
}

function EvidencePanel({ uploaded, onUpload }: { uploaded: ReadonlySet<string>; onUpload: (id: string) => void }) {
  const proofs = [
    { id: "performance", title: "Performance", detail: "Live, répétition ou session" },
    { id: "track", title: "Morceau", detail: "Démo, titre ou composition" },
    { id: "video", title: "Vidéo", detail: "Clip, session ou captation" },
    { id: "credit", title: "Crédit", detail: "Sortie ou contribution vérifiable" },
    { id: "concert", title: "Concert", detail: "Affiche, billet ou programmation" },
    { id: "collaboration", title: "Collaboration", detail: "Projet mené avec un autre artiste" },
  ] as const;
  const proofCount = proofs.filter(({ id }) => uploaded.has(id)).length;
  return (
    <div className="ttw-creator-panel">
      <div className="ttw-creator-question">
        <span className="ttw-kicker">Étape 2 · deux choix suffisent</span>
        <h3>Quelles créations représentent le mieux ton travail ?</h3>
        <p>Choisis au moins deux contenus. Tu n’as rien d’autre à expliquer ici.</p>
      </div>
      <div className="ttw-upload-grid" aria-label={`${proofCount} preuves reliées`}>
        {proofs.map(({ id, title, detail }) => (
          <button key={id} type="button" className={uploaded.has(id) ? "is-uploaded" : ""} onClick={() => onUpload(id)}>
            {uploaded.has(id) ? <FileCheck2 /> : <CloudUpload />}
            <span><strong>{title}</strong><small>{uploaded.has(id) ? "Preuve reliée au dossier" : detail}</small></span>
            <em>{uploaded.has(id) ? "Remplacer" : "Ajouter"}</em>
          </button>
        ))}
      </div>
      <div className="ttw-creator-proofstrip">
        <span><Headphones /><strong>{proofCount}</strong><small>preuves reliées</small></span>
        <span><Radio /><strong>14</strong><small>Rooms vérifiables</small></span>
        <span><UsersRound /><strong>8</strong><small>collaborations reliées</small></span>
      </div>
      <div className="ttw-info-callout"><ShieldCheck /><p>MeeWav vérifiera simplement que ces contenus sont bien les tiens et qu’ils sont authentiques.</p></div>
    </div>
  );
}

function RightsPanel({ draft, setDraft, uploaded, onUpload }: { draft: ApplicationDraft; setDraft: (next: ApplicationDraft) => void; uploaded: ReadonlySet<string>; onUpload: (id: string) => void }) {
  const files = [
    { id: "rights", title: "Attestation de droits", detail: "Un seul document · PDF, 10 Mo maximum" },
  ] as const;
  return (
    <div className="ttw-panel-stack">
      <div className="ttw-upload-grid">
        {files.map((file) => (
          <button type="button" key={file.id} className={uploaded.has(file.id) ? "is-uploaded" : ""} onClick={() => onUpload(file.id)}>
            {uploaded.has(file.id) ? <FileCheck2 /> : <CloudUpload />}
            <span><strong>{file.title}</strong><small>{uploaded.has(file.id) ? "Document ajouté à la maquette" : file.detail}</small></span>
            <em>{uploaded.has(file.id) ? "Remplacer" : "Ajouter"}</em>
          </button>
        ))}
      </div>
      <label className="ttw-consent"><input type="checkbox" checked={draft.rightsConfirmed} onChange={(event) => setDraft({ ...draft, rightsConfirmed: event.target.checked })} /><span><Check /></span><p><strong>Je confirme détenir les droits nécessaires.</strong><small>Les contenus fournis peuvent être présentés dans le Tremplin et ne portent pas atteinte aux droits d’un tiers.</small></p></label>
      <div className="ttw-warning-callout"><AlertTriangle /><p>Le jeton ne donne aucun droit automatique sur ton catalogue, tes royalties ou ta propriété intellectuelle. Tout droit différent nécessiterait un accord distinct et explicite.</p></div>
    </div>
  );
}

function RulesPanel({ draft, setDraft }: { draft: ApplicationDraft; setDraft: (next: ApplicationDraft) => void }) {
  const rules = [
    { key: "rulesAccepted" as const, title: "Le jeton ne mesure pas ma valeur artistique.", detail: "Mon travail artistique reste toujours présenté en premier." },
    { key: "riskAccepted" as const, title: "Je ne promets pas de gain.", detail: "La valeur du jeton peut monter ou descendre." },
    { key: "communicationAccepted" as const, title: "Je communique sans pression.", detail: "Je ne pousse personne à acheter ou à agir en groupe." },
  ];
  return (
    <div className="ttw-panel-stack">
      <div className="ttw-rules-intro"><Scale /><div><span className="ttw-kicker">Trois règles simples</span><h3>Lis et confirme.</h3><p>Pas de jargon : ces règles protègent ton public et ton travail.</p></div></div>
      <div className="ttw-consent-list">
        {rules.map((rule) => <label className="ttw-consent" key={rule.key}><input type="checkbox" checked={draft[rule.key]} onChange={(event) => setDraft({ ...draft, [rule.key]: event.target.checked })} /><span><Check /></span><p><strong>{rule.title}</strong><small>{rule.detail}</small></p></label>)}
      </div>
    </div>
  );
}

function VerificationPanel({ draft, uploaded, admissionStatus }: { draft: ApplicationDraft; uploaded: ReadonlySet<string>; admissionStatus: ApplicationAdmissionStatus }) {
  const proofCount = ["performance", "track", "video", "credit", "concert", "collaboration"].filter((id) => uploaded.has(id)).length;
  const checks = [
    ["Ton profil", `${draft.stageName} · ${draft.disciplines}`, validateApplicationStep(1, draft, uploaded).valid],
    ["Tes créations", `${proofCount} contenus choisis`, validateApplicationStep(2, draft, uploaded).valid],
    ["Tes accords", "Droits et règles confirmés", validateApplicationStep(3, draft, uploaded).valid],
  ] as const;
  const readyCount = checks.filter((item) => item[2]).length;
  return (
    <div className="ttw-panel-stack">
      {admissionStatus === "Vérification en cours" ? (
        <div className="ttw-creator-sent" role="status"><span><Check /></span><div><small>Simulation terminée</small><h3>Ta demande de démonstration est prête.</h3><p>Aucune demande réelle n’a été envoyée. En production, le serveur enregistrera le dossier avant toute étude humaine.</p></div></div>
      ) : (
        <div className="ttw-verification-hero"><span><ShieldCheck /></span><div><span className="ttw-kicker">Récapitulatif</span><h3>{readyCount === 3 ? "Tout est prêt. Tu peux envoyer." : `${readyCount} éléments sur 3 sont prêts.`}</h3><p>Après l’envoi, une personne de l’équipe vérifie le dossier. Rien n’est publié automatiquement.</p></div></div>
      )}
      <div className="ttw-review-grid">{checks.map(([label, state, ready]) => <article key={label} className={ready ? "is-ready" : ""}><span>{ready ? <Check /> : <Clock3 />}</span><div><strong>{label}</strong><small>{state}</small></div></article>)}</div>
      <div className="ttw-info-callout"><Info /><p><strong>La suite est simple :</strong> MeeWav vérifie, te contacte si nécessaire, puis t’envoie une décision claire.</p></div>
    </div>
  );
}

function IdentityRightsPanel({ draft, setDraft, uploaded, onUpload }: { draft: ApplicationDraft; setDraft: (next: ApplicationDraft) => void; uploaded: ReadonlySet<string>; onUpload: (id: string) => void }) {
  return (
    <div className="ttw-panel-stack">
      <div className="ttw-creator-question">
        <span className="ttw-kicker">Étape 3 · dernière confirmation</span>
        <h3>Confirme tes droits et les règles.</h3>
        <p>Une attestation et trois cases. Ces informations restent privées.</p>
      </div>
      <RightsPanel draft={draft} setDraft={setDraft} uploaded={uploaded} onUpload={onUpload} />
      <RulesPanel draft={draft} setDraft={setDraft} />
    </div>
  );
}

function ApplicationPanel({ step, draft, setDraft, uploaded, onUpload, hostName, portraitUrl, admissionStatus }: { step: number; draft: ApplicationDraft; setDraft: (next: ApplicationDraft) => void; uploaded: ReadonlySet<string>; onUpload: (id: string) => void; hostName: string; portraitUrl: string; admissionStatus: ApplicationAdmissionStatus }) {
  if (step === 1) return <EligibilityPanel draft={draft} setDraft={setDraft} hostName={hostName} portraitUrl={portraitUrl} />;
  if (step === 2) return <EvidencePanel uploaded={uploaded} onUpload={onUpload} />;
  if (step === 3) return <IdentityRightsPanel draft={draft} setDraft={setDraft} uploaded={uploaded} onUpload={onUpload} />;
  return <VerificationPanel draft={draft} uploaded={uploaded} admissionStatus={admissionStatus} />;
}

function CreatorLivePreview({ step, draft, portraitUrl, uploaded }: { step: number; draft: ApplicationDraft; portraitUrl: string; uploaded: ReadonlySet<string> }) {
  const proofCount = ["performance", "track", "video", "credit", "concert", "collaboration"].filter((id) => uploaded.has(id)).length;
  const rulesReady = [draft.rulesAccepted, draft.riskAccepted, draft.communicationAccepted].filter(Boolean).length;
  const profileReady = validateApplicationStep(1, draft, uploaded).valid;
  const agreementsReady = validateApplicationStep(3, draft, uploaded).valid;
  const previewStates = [
    ["Profil", draft.stageName || "Ton nom public", `${draft.disciplines} · ${draft.city}`],
    ["Créations", `${proofCount} contenus choisis`, "Deux choix suffisent"],
    ["Accords", agreementsReady ? "Tout est confirmé" : `${rulesReady}/3 règles confirmées`, "Droits et règles restent privés"],
    ["Récapitulatif", "Une dernière relecture", "Puis MeeWav prend le relais"],
  ] as const;
  const [label, title, detail] = previewStates[step - 1];

  return (
    <aside className="ttw-creator-preview" aria-label="Repère de progression de la demande">
      <header><span><i aria-hidden="true" /> Repère en direct</span><em>{step >= 3 ? "Privé" : "Dossier artiste"}</em></header>
      {step === 1 ? (
        <article className="ttw-creator-preview__profile">
          <div><img src={portraitUrl} alt="" /><span>{draft.disciplines || "Ton métier"}</span></div>
          <small>Tremplin MeeWav · {draft.city || "Ta ville"}</small>
          <h3>{draft.stageName || "Ton nom public"}</h3>
          <p>{draft.biography || "Ton univers apparaîtra ici."}</p>
          <footer><span><UsersRound /> 2 418 abonnés</span><strong>Voir son profil</strong></footer>
        </article>
      ) : (
        <article className="ttw-creator-preview__review">
          <span className="ttw-creator-preview__shield">{step === 2 ? <Headphones /> : <ShieldCheck />}</span>
          <small>Étape {step} sur 4 · {label}</small>
          <h3>{title}</h3>
          <p>{detail}. Rien n’est publié sans vérification.</p>
          <div>
            <span className={profileReady ? "is-ready" : ""}>{profileReady ? <Check /> : <Clock3 />}<strong>Profil</strong><small>{profileReady ? "Prêt" : "À vérifier"}</small></span>
            <span className={proofCount >= 2 ? "is-ready" : ""}>{proofCount >= 2 ? <Check /> : <Clock3 />}<strong>Créations</strong><small>{proofCount}/2 contenus</small></span>
            <span className={agreementsReady ? "is-ready" : ""}>{agreementsReady ? <Check /> : <Clock3 />}<strong>Accords</strong><small>{agreementsReady ? "Confirmés" : `${rulesReady}/3 règles`}</small></span>
          </div>
        </article>
      )}
      <footer className="ttw-creator-preview__privacy"><LockKeyhole /><span><strong>Rien n’est publié maintenant.</strong><small>Tu gardes la main jusqu’à la validation finale.</small></span></footer>
    </aside>
  );
}

function ApplicationWorkspace({ hostName, portraitUrl, onClose, onSubmitted }: { hostName: string; portraitUrl: string; onClose?: () => void; onSubmitted?: () => void }) {
  const [activeStep, setActiveStep] = useState(1);
  const [completed, setCompleted] = useState<Set<number>>(() => new Set());
  const [uploaded, setUploaded] = useState<Set<string>>(() => new Set());
  const [draft, setDraft] = useState(INITIAL_DRAFT);
  const [statusMessage, setStatusMessage] = useState("Brouillon de démonstration · non sauvegardé");
  const [showValidation, setShowValidation] = useState(false);
  const [admissionStatus, setAdmissionStatus] = useState<ApplicationAdmissionStatus>("Brouillon");
  const validationRef = useRef<HTMLDivElement>(null);
  const step = APPLICATION_STEPS[activeStep - 1];
  const hasEditedDraft = uploaded.size > 0 || completed.size > 0 || JSON.stringify(draft) !== JSON.stringify(INITIAL_DRAFT);
  const stepValidation = useMemo(() => validateApplicationStep(activeStep, draft, uploaded), [activeStep, draft, uploaded]);
  const effectiveCompleted = useMemo(() => {
    if (admissionStatus === "Vérification en cours") return new Set(APPLICATION_STEPS.map(({ id }) => id));
    return new Set([...completed].filter((id) => validateApplicationStep(id, draft, uploaded).valid));
  }, [admissionStatus, completed, draft, uploaded]);

  const moveTo = (next: number) => {
    const maximumStep = admissionStatus === "Vérification en cours" ? APPLICATION_STEPS.length : Math.min(APPLICATION_STEPS.length, Math.max(activeStep, completed.size + 1));
    setActiveStep(Math.max(1, Math.min(maximumStep, next)));
    setShowValidation(false);
    setStatusMessage("Brouillon de démonstration · non sauvegardé");
  };

  const goForward = () => {
    const validation = validateApplicationStep(activeStep, draft, uploaded);
    if (!validation.valid) {
      setShowValidation(true);
      setStatusMessage(validation.message);
      requestAnimationFrame(() => validationRef.current?.focus());
      return;
    }
    setCompleted((current) => new Set(current).add(activeStep));
    setShowValidation(false);
    if (activeStep < APPLICATION_STEPS.length) {
      setActiveStep(activeStep + 1);
      setStatusMessage("Étape prête dans cette démonstration");
    }
  };

  const upload = (id: string) => {
    setUploaded((current) => new Set(current).add(id));
    setStatusMessage("Exemple relié au brouillon de démonstration");
  };

  const submit = () => {
    const validation = validateApplicationStep(4, draft, uploaded);
    if (!validation.valid) {
      const firstInvalidStep = APPLICATION_STEPS.slice(0, 3).find(({ id }) => !validateApplicationStep(id, draft, uploaded).valid);
      setShowValidation(true);
      setStatusMessage(validation.message);
      if (firstInvalidStep) setActiveStep(firstInvalidStep.id);
      requestAnimationFrame(() => validationRef.current?.focus());
      return;
    }
    setCompleted(new Set(APPLICATION_STEPS.map(({ id }) => id)));
    setAdmissionStatus("Vérification en cours");
    setActiveStep(4);
    setShowValidation(false);
    setStatusMessage("Simulation terminée · aucune demande réelle envoyée");
    onSubmitted?.();
  };
  const StepIcon = step.icon;
  const nextLabels = ["Choisir mes contenus", "Confirmer mes accords", "Voir le récapitulatif"] as const;
  const requestClose = () => {
    if (admissionStatus === "Brouillon" && hasEditedDraft && !window.confirm("Quitter cette démonstration ? Le brouillon n’est pas sauvegardé.")) return;
    onClose?.();
  };

  return (
    <section className="tremplin-token-workspace is-application">
      <TremplinDemoBanner compact context="application" />
      <header className="ttw-topbar ttw-creator-topbar">
        {onClose && <button type="button" className="ttw-close" onClick={requestClose} aria-label="Quitter la candidature et revenir au Tremplin"><ArrowLeft /><span>Quitter</span></button>}
        <WorkspaceIdentity hostName={hostName} portraitUrl={portraitUrl} eyebrow="Mon espace artiste" />
        <div className="ttw-topbar__title"><span className="ttw-kicker">Tremplin MeeWav</span><strong>Demander mon jeton de talent</strong><small>Trois étapes simples, puis un récapitulatif.</small></div>
        <span className={`ttw-chip ${admissionStatus === "Vérification en cours" ? "is-positive" : "is-progress"}`} aria-label={admissionStatus === "Vérification en cours" ? "Simulation de demande terminée" : "Brouillon de démonstration non sauvegardé"}>{admissionStatus === "Vérification en cours" ? <ShieldCheck /> : <CheckCircle2 />} {admissionStatus === "Vérification en cours" ? "Simulation terminée" : "Brouillon démo"}</span>
      </header>
      <main className="ttw-creator-shell">
        <section className="ttw-creator-hero">
          <div>
            <span className="ttw-kicker"><MeewavTokenIcon /> Candidature guidée</span>
            <h1>Prépare puis relis ta demande.</h1>
            <p>Vérifie ton profil, choisis deux créations, confirme tes accords puis relis le dossier avant l’étude humaine.</p>
          </div>
          <div className="ttw-creator-hero__trust">
            <span><Clock3 /><strong>Environ 3 min</strong><small>Tu pourras tout modifier</small></span>
            <span><LockKeyhole /><strong>Brouillon de démonstration</strong><small>Non sauvegardé</small></span>
            <span><ShieldCheck /><strong>Relecture humaine</strong><small>Identité et droits vérifiés</small></span>
          </div>
        </section>
        <ApplicationStepper activeStep={activeStep} completed={effectiveCompleted} onStep={moveTo} />
        <section className="ttw-creator-stage">
          <header className="ttw-creator-stage__heading">
            <span><StepIcon /></span>
            <div><small>Étape {step.id} sur {APPLICATION_STEPS.length}</small><h2>{step.label}</h2><p>{step.description}.</p></div>
          </header>
          <div className="ttw-creator-stage__body">
            <div className="ttw-creator-form">
              <ApplicationPanel step={activeStep} draft={draft} setDraft={setDraft} uploaded={uploaded} onUpload={upload} hostName={hostName} portraitUrl={portraitUrl} admissionStatus={admissionStatus} />
              {admissionStatus !== "Vérification en cours" && showValidation && !stepValidation.valid && (
                <div ref={validationRef} className="ttw-validation-notice" role="alert" id="ttw-step-validation" tabIndex={-1}>
                  <AlertTriangle />
                  <span><strong>Il manque juste un détail</strong><small>{stepValidation.message}</small></span>
                </div>
              )}
            </div>
            <CreatorLivePreview step={activeStep} draft={draft} portraitUrl={portraitUrl} uploaded={uploaded} />
          </div>
          <footer className="ttw-creator-actions">
            <button type="button" className="ttw-button is-secondary" disabled={activeStep === 1 || admissionStatus === "Vérification en cours"} onClick={() => moveTo(activeStep - 1)}><ArrowLeft /> Retour</button>
            <span><CheckCircle2 /> {statusMessage}</span>
            {activeStep === 4 && admissionStatus === "Brouillon" ? (
              <button type="button" className="ttw-button is-primary" onClick={submit} aria-describedby={showValidation && !stepValidation.valid ? "ttw-step-validation" : undefined}>Simuler l’envoi de la demande <ShieldCheck /></button>
            ) : activeStep === 4 ? (
              <button type="button" className="ttw-button is-primary" onClick={onClose}>Fermer et suivre dans mon espace <Check /></button>
            ) : (
              <button type="button" className="ttw-button is-primary" onClick={goForward} aria-describedby={showValidation && !stepValidation.valid ? "ttw-step-validation" : undefined}>{nextLabels[activeStep - 1]} <ArrowRight /></button>
            )}
          </footer>
        </section>
      </main>
      <div className="ttw-live-region" role="status" aria-live="polite">{statusMessage}</div>
    </section>
  );
}

function TokenValueChart({ period, onPeriod }: { period: TokenPeriod; onPeriod: (period: TokenPeriod) => void }) {
  const chartId = useId().replace(/:/g, "");
  const values = PERIOD_VALUES[period];
  const minimum = Math.min(...values) * 0.94;
  const maximum = Math.max(...values) * 1.04;
  const points = values.map((value, index) => {
    const x = 18 + (index / (values.length - 1)) * 464;
    const y = 164 - ((value - minimum) / (maximum - minimum)) * 126;
    return { x, y, value };
  });
  const path = points.slice(0, -1).reduce((line, point, index) => {
    const next = points[index + 1];
    const span = next.x - point.x;
    return `${line} C${point.x + span * 0.4} ${point.y} ${next.x - span * 0.4} ${next.y} ${next.x} ${next.y}`;
  }, `M${points[0].x} ${points[0].y}`);
  const area = `${path} L482 176 L18 176 Z`;
  const change = ((values[values.length - 1] - values[0]) / values[0]) * 100;
  const lastPoint = points[points.length - 1];

  return (
    <Card className="ttw-value-card">
      <header>
        <div><span className="ttw-kicker">Historique de valeur</span><h3>Valeur actuelle du jeton</h3><p>Une ligne simple, distincte des statistiques artistiques.</p></div>
        <div className="ttw-periods" aria-label="Période du graphique">{(Object.keys(PERIOD_VALUES) as TokenPeriod[]).map((item) => <button type="button" key={item} className={item === period ? "is-active" : ""} aria-pressed={item === period} onClick={() => onPeriod(item)}>{item}</button>)}</div>
      </header>
      <div className="ttw-value-summary"><strong>{formatEuro(values[values.length - 1])}</strong><span><i /> +{Math.abs(change).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % · {period}</span></div>
      <div className="ttw-chart-wrap">
        <svg viewBox="0 0 500 190" role="img" aria-label={`La valeur du jeton FETAH passe de ${formatEuro(values[0])} à ${formatEuro(values[values.length - 1])} sur ${period}. Elle peut monter ou descendre.`}>
          <defs>
            <linearGradient id={`${chartId}-area`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8c63ff" stopOpacity=".31" /><stop offset="1" stopColor="#8c63ff" stopOpacity="0" /></linearGradient>
            <linearGradient id={`${chartId}-line`} x1="0" y1="0" x2="1" y2="0"><stop stopColor="#6b7cff" stopOpacity=".52" /><stop offset=".7" stopColor="#9b74ff" /><stop offset="1" stopColor="#93edc0" /></linearGradient>
          </defs>
          {[42, 86, 130, 174].map((y) => <line key={y} x1="18" y1={y} x2="482" y2={y} className="ttw-chart-grid" />)}
          <line className="ttw-chart-baseline" x1="18" x2="482" y1={points[0].y} y2={points[0].y} />
          <path d={area} fill={`url(#${chartId}-area)`} />
          <path d={path} className="ttw-chart-line" stroke={`url(#${chartId}-line)`} />
          {points.map(({ x, y, value }, index) => <g key={`${x}-${y}`} className={`ttw-chart-point ${index === points.length - 1 ? "is-current" : ""}`}><circle cx={x} cy={y} r={index === points.length - 1 ? 5 : 3} /><title>{formatEuro(value)}</title></g>)}
          {lastPoint ? <circle className="ttw-chart-halo" cx={lastPoint.x} cy={lastPoint.y} r="11" /> : null}
        </svg>
      </div>
      <div className="ttw-chart-caption"><Info /><p><strong>Lecture de la période :</strong> la valeur termine au-dessus de son point de départ. Elle peut continuer à évoluer à la hausse comme à la baisse et dépend exclusivement des achats et des ventes.</p></div>
    </Card>
  );
}

function DashboardOverview({ period, setPeriod }: { period: TokenPeriod; setPeriod: (period: TokenPeriod) => void }) {
  return (
    <div className="ttw-dashboard-grid">
      <TokenValueChart period={period} onPeriod={setPeriod} />
      <Card className="ttw-token-snapshot">
        <header><span className="ttw-token-mark"><MeewavTokenIcon title="Jeton Meewav" /></span><div><span className="ttw-kicker">Exemple de jeton de talent</span><h3>FETAh <em>FETAH</em></h3></div><span className="ttw-chip is-progress"><i /> Démo</span></header>
        <div className="ttw-snapshot-price"><small>Valeur actuelle</small><strong>3,42 €</strong><span>Stable aujourd’hui</span></div>
        <div className="ttw-snapshot-grid">
          <span><small>En circulation</small><strong>486 240</strong><em>jetons</em></span>
          <span><small>Détenteurs</small><strong>1 847</strong><em>comptes vérifiés</em></span>
          <span><small>Achats · 30 j</small><strong>38 420 €</strong><em>612 opérations</em></span>
          <span><small>Ventes · 30 j</small><strong>21 806 €</strong><em>347 opérations</em></span>
        </div>
        <div className="ttw-curve-lock"><LockKeyhole /><p><strong>Mécanisme de calcul de la valeur administré par MeeWav</strong><small>Configuration de démonstration · lecture seule pour l’artiste</small></p><span>Démo</span></div>
      </Card>
      <div className="ttw-kpi-row">
        <Card><MeewavTokenIcon title="Jeton Meewav" /><span><small>Destiné à l’artiste · juillet</small><strong>1 284,00 €</strong><em>Prochaine distribution le 15 août</em></span></Card>
        <Card><UsersRound /><span><small>Communauté active · 30 j</small><strong>2 418</strong><em>+186 membres sur la période</em></span></Card>
        <Card><Radio /><span><small>Rooms à venir</small><strong>3</strong><em>Prochaine : vendredi, 21 h 30</em></span></Card>
        <Card><ShieldCheck /><span><small>Exemple de contrôle</small><strong>À connecter</strong><em>Aucune vérification réelle dans cette démo</em></span></Card>
      </div>
      <Card className="ttw-community-panel">
        <header><div><span className="ttw-kicker">Activité communautaire</span><h3>Ta musique crée le lien.</h3></div><button type="button">Voir le profil <ChevronRight /></button></header>
        <div className="ttw-community-bars">
          {[{ label: "Écoutes fidèles", value: 82, detail: "18,4 k" }, { label: "Présence en Room", value: 68, detail: "1 286" }, { label: "Interactions", value: 74, detail: "2 904" }, { label: "Publications suivies", value: 61, detail: "4 120" }].map((item) => <article key={item.label}><span><strong>{item.label}</strong><em>{item.detail}</em></span><i><b style={{ width: `${item.value}%` }} /></i></article>)}
        </div>
        <p className="ttw-separation-note"><Info /> Ces indicateurs décrivent l’activité artistique et communautaire. Ils ne déterminent pas automatiquement la valeur du jeton.</p>
      </Card>
      <Card className="ttw-room-panel">
        <header><span className="ttw-kicker">Agenda de démonstration</span><h3>Retrouver la communauté</h3></header>
        <article><span className="ttw-room-date"><Radio /><small>Démo</small></span><div><strong>Session live · Wave District</strong><small>Date et inscriptions à connecter</small></div><button type="button">Voir l’exemple</button></article>
        <article><span className="ttw-room-date"><Radio /><small>Démo</small></span><div><strong>Écoute privée · Mix final</strong><small>Date et communauté à connecter</small></div><button type="button">Voir l’exemple</button></article>
      </Card>
      <Card className="ttw-alert-panel">
        <header><span className="ttw-kicker">Alertes et documents</span><h3>Deux actions recommandées</h3></header>
        <article><span className="is-warning"><AlertTriangle /></span><div><strong>Coordonnées bancaires</strong><small>Une révision annuelle sera demandée dans 41 jours.</small></div><button type="button">Vérifier</button></article>
        <article><span><ReceiptText /></span><div><strong>Relevé de distribution · juillet</strong><small>PDF disponible · 184 Ko</small></div><button type="button">Consulter</button></article>
      </Card>
    </div>
  );
}

function TransactionsView() {
  return (
    <div className="ttw-dashboard-single">
      <Card className="ttw-table-card">
        <header><div><span className="ttw-kicker">Exemple de registre</span><h3>Achats et reventes simulés</h3><p>Ces fixtures illustrent le futur contrat serveur ; elles ne représentent aucune opération réelle.</p></div><button type="button"><RefreshCcw /> Rejouer la démo</button></header>
        <div className="ttw-table-scroll"><table><thead><tr><th>Date</th><th>Opération</th><th>Montant</th><th>Jetons</th><th>Prix moyen</th><th>Frais</th><th>Statut</th><th>Identifiant</th></tr></thead><tbody>{TRANSACTIONS.map((item) => <tr key={item.id}><td data-label="Date">{item.date}</td><td data-label="Opération"><span className={`ttw-operation is-${item.kind === "Achat" ? "buy" : "sell"}`}>{item.kind}</span></td><td data-label="Montant">{item.amount}</td><td data-label="Jetons">{item.tokens}</td><td data-label="Prix moyen">{item.average}</td><td data-label="Frais">{item.fees}</td><td data-label="Statut"><span className="ttw-table-status"><Check /> {item.status}</span></td><td data-label="Identifiant"><code>{item.id}</code></td></tr>)}</tbody></table></div>
      </Card>
      <div className="ttw-finance-summary">
        <Card><span className="ttw-icon-bubble"><Activity /></span><div><small>Volume total · 30 j</small><strong>60 226,00 €</strong><p>959 opérations confirmées.</p></div></Card>
        <Card><span className="ttw-icon-bubble"><Scale /></span><div><small>Part maximale constatée</small><strong>2,18 %</strong><p>La limite serveur reste fixée à 5 %.</p></div></Card>
        <Card><span className="ttw-icon-bubble"><ShieldCheck /></span><div><small>Contrôles serveur</small><strong>À connecter</strong><p>Aucun contrôle réel n’est exécuté dans cette démo.</p></div></Card>
      </div>
    </div>
  );
}

function DistributionsView() {
  return (
    <div className="ttw-distribution-layout">
      <Card className="ttw-distribution-total"><span className="ttw-icon-bubble"><Landmark /></span><div><span className="ttw-kicker">Exemple de montant destiné à l’artiste</span><strong>3 332,00 €</strong><p>Données fictives servant uniquement à valider la présentation.</p></div><span className="ttw-chip is-progress"><Info /> Démo</span></Card>
      <Card className="ttw-distribution-list">
        <header><div><span className="ttw-kicker">Historique simulé</span><h3>Exemples de distributions</h3></div><button type="button"><FileText /> Voir un exemple</button></header>
        {DISTRIBUTIONS.map((item) => <article key={item.date}><span className="ttw-timeline-dot"><Check /></span><div><small>{item.date}</small><strong>{item.label}</strong><em>Brut {item.gross} · frais {item.fees}</em></div><span><small>Net versé</small><strong>{item.net}</strong><em>{item.status}</em></span></article>)}
      </Card>
      <Card className="ttw-distribution-explainer"><Info /><div><h3>Une répartition lisible, avant chaque opération.</h3><p>Les frais d’achat, de revente, techniques, la commission MeeWav et la part éventuellement destinée à l’artiste proviennent du service sécurisé. Cet écran les affiche sans les recalculer.</p></div></Card>
    </div>
  );
}

function ComplianceView() {
  return (
    <div className="ttw-compliance-layout">
      <Card className="ttw-compliance-head"><span><ShieldCheck /></span><div><span className="ttw-kicker">Aperçu de démonstration</span><h3>Les statuts réels restent à connecter.</h3><p>Cette vue illustre les contrôles attendus sans certifier un jeton, une opération ni un document.</p></div><span className="ttw-chip is-progress"><i /> Non contractuel</span></Card>
      <Card className="ttw-compliance-checks">{COMPLIANCE_ITEMS.map((item) => <article key={item.label} className="is-watch"><span><Clock3 /></span><div><strong>{item.label}</strong><small>{item.detail}</small></div><em>{item.state}</em></article>)}</Card>
      <Card className="ttw-policy-card">
        <header><span className="ttw-kicker">Paramètres protégés</span><h3>La courbe n’est pas pilotée par l’artiste.</h3></header>
        <div>
          <article><LockKeyhole /><span><strong>Mécanisme de calcul de la valeur</strong><small>Configuration attendue depuis le serveur</small></span><em>Démo</em></article>
          <article><Gauge /><span><strong>Limite de détention</strong><small>5 % maximum, contrôlés à chaque opération</small></span><em>Contrôle automatique</em></article>
          <article><ShieldCheck /><span><strong>Protection contre les robots</strong><small>Fréquence, automatisation et comportements suspects</small></span><em>À connecter</em></article>
          <article><Scale /><span><strong>Vente à découvert</strong><small>Blocage attendu si les jetons ne sont pas détenus</small></span><em>À connecter</em></article>
        </div>
      </Card>
      <Card className="ttw-documents-card"><header><div><span className="ttw-kicker">Documents de démonstration</span><h3>Exemples du futur référentiel</h3></div></header>{["Charte de communication", "Résumé des risques", "Paramètres du mécanisme · exemple", "Exemple de relevé de contrôle"].map((item) => <button type="button" key={item}><FileText /><span><strong>{item}</strong><small>Exemple non vérifié</small></span><ChevronRight /></button>)}</Card>
    </div>
  );
}

function DashboardWorkspace({ hostName, portraitUrl, onClose }: { hostName: string; portraitUrl: string; onClose?: () => void }) {
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [period, setPeriod] = useState<TokenPeriod>("30 j");
  const indicatorStyle = useMemo(() => ({ "--ttw-tab-index": DASHBOARD_TABS.findIndex((item) => item.id === activeTab) } as CSSProperties), [activeTab]);

  return (
    <section className="tremplin-token-workspace is-dashboard">
      <TremplinDemoBanner context="fixtures" />
      <header className="ttw-topbar">
        <WorkspaceIdentity hostName={hostName} portraitUrl={portraitUrl} eyebrow="Tableau de bord artiste" />
        <nav className="ttw-dashboard-tabs" aria-label="Tableau de bord du jeton" style={indicatorStyle}>
          <i aria-hidden="true" />
          {DASHBOARD_TABS.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={activeTab === id ? "is-active" : ""} aria-label={label} title={label} aria-current={activeTab === id ? "page" : undefined} onClick={() => setActiveTab(id)}><Icon /> <span>{label}</span></button>)}
        </nav>
        <span className="ttw-chip is-progress"><i /> Tableau de bord démo</span>
        {onClose && <button type="button" className="ttw-close" onClick={onClose} aria-label="Fermer le tableau de bord">×</button>}
      </header>
      <main className="ttw-dashboard-main">
        <header className="ttw-dashboard-heading">
          <div><span className="ttw-kicker"><MeewavTokenIcon aria-hidden="true" /> FETAH · Jeton de talent</span><h2>{activeTab === "overview" ? "Pilote ta présence, pas la courbe." : DASHBOARD_TABS.find((item) => item.id === activeTab)?.label}</h2><p>{activeTab === "overview" ? "Suis la communauté, les opérations et les distributions avec des données transparentes." : "Toutes les données utiles, dans un environnement lisible et fortement encadré."}</p></div>
          <div className="ttw-last-update"><Clock3 /><span><small>Dernière mise à jour</small><strong>Il y a 18 secondes</strong></span></div>
        </header>
        {activeTab === "overview" && <DashboardOverview period={period} setPeriod={setPeriod} />}
        {activeTab === "transactions" && <TransactionsView />}
        {activeTab === "distributions" && <DistributionsView />}
        {activeTab === "compliance" && <ComplianceView />}
      </main>
    </section>
  );
}

export default function TremplinTokenWorkspace({
  mode,
  hostName = "FETAh",
  portraitUrl = "/assets/orbit/founder-puff.png",
  onClose,
  onApplicationSubmitted,
}: TremplinTokenWorkspaceProps) {
  if (mode === "application") {
    return <ApplicationWorkspace hostName={hostName} portraitUrl={portraitUrl} onClose={onClose} onSubmitted={onApplicationSubmitted} />;
  }
  return <DashboardWorkspace hostName={hostName} portraitUrl={portraitUrl} onClose={onClose} />;
}
