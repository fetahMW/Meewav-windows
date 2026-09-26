import { getDesktopApplicationMode } from "../../../runtime/applicationMode";
import RoomLaunchConfirmation from "./RoomLaunchConfirmation";
import GreenHouse from "../place/GreenHouse";
import { useEffect, useRef, useState, type RefObject } from "react";
import { ArrowRight, Check, ChevronLeft, Save, Trophy, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth";
import {
  cloneCageConfiguration, createCageDemoSession, DEFAULT_CAGE_LAUNCH, readCageLaunchDraft,
  readCageLaunchTemplates, saveCageLaunchTemplate, validateCageLaunch,
  type CageLaunchConfiguration,
} from "./cageLaunch";
import { launchCageLive } from "./cageLaunch.service";
import "./cage-launch.css";
import "./desktop-launch.css";
import { useRuntime } from '../../../runtime/RuntimeProvider';
import RoomProductionPreparation, { type RoomProductionReadiness } from '../place/RoomProductionPreparation';
import { readRoomProductionSetup, saveRoomProductionSetup, type RoomProductionSetup } from '../place/roomProductionSetup';

type Props = { onClose: () => void; closeRef: RefObject<HTMLButtonElement | null>; fromProfile?: boolean; onBack?: () => void };
const rosterLabels = {
  prepared: "Roster préparé", "first-eligible": "Premiers inscrits éligibles",
  manual: "Sélection manuelle", random: "Tirage parmi les présents",
} as const;
const formatLabels = { tournament: "Tournoi à élimination", championship: "Championnat · classement", "open-mic": "Open Mic libre · passages individuels", "open-mic-battle": "Open Mic Battle · le gagnant reste" } as const;
const formatDescriptions = {
  tournament: "Un tableau à élimination : chaque confrontation qualifie un gagnant vers le tour suivant, jusqu’à la finale.",
  championship: "Un calendrier de rencontres et un classement par victoires. Tous les participants conservent leurs rencontres ; les ex æquo restent visibles.",
  "open-mic-battle": "Deux artistes s’affrontent. Le gagnant reste sur scène, le perdant sort et le challenger suivant monte.",
  "open-mic": "Un ordre de passage, un artiste à la fois. Chaque performance est individuelle, sans adversaire ni élimination.",
} as const;
const openMicFeedbackLabels = { appreciation: "Appréciation sans classement", scored: "Note du public avec classement", none: "Sans vote ni classement" } as const;

export default function CageLaunchDialog({ onClose, closeRef, fromProfile = false, onBack }: Props) {
  const navigate = useNavigate();
  const desktopStudio = useRuntime().canPrepareHostRoom;
  const studioStep = desktopStudio ? 1 : -1;
  const rulesStep = desktopStudio ? 0 : 1;
  const summaryStep = desktopStudio ? -1 : 2;
  const greenStep = desktopStudio ? 2 : 3;
  const [studioSetup, setStudioSetup] = useState<RoomProductionSetup | null>(null);
  const [studioReadiness, setStudioReadiness] = useState<RoomProductionReadiness>({ video: false, microphone: false, music: false, pending: false });
  const [publicRoom, setPublicRoom] = useState(true);
  const [studioSaved, setStudioSaved] = useState(false);
  const [networkAvailable, setNetworkAvailable] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setNetworkAvailable(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  const { user } = useAuth();
  const preview = getDesktopApplicationMode() === "demo" || (getDesktopApplicationMode() !== "live" && import.meta.env.DEV && (import.meta.env.VITE_ROOMS_WORKSPACE_PREVIEW === "true" || !user));
  const studioBlocked = desktopStudio && publicRoom && !preview && (!studioReadiness.video || (!studioReadiness.microphone && !studioReadiness.music) || studioReadiness.pending || !networkAvailable);
  const scope = user?.id ?? "demo";
  const [templates, setTemplates] = useState(() => readCageLaunchTemplates(scope));
  const [configuration, setConfiguration] = useState<CageLaunchConfiguration>(() => (
    (fromProfile ? readCageLaunchDraft(scope) : null) ?? cloneCageConfiguration(DEFAULT_CAGE_LAUNCH)
  ));
  const [step, setStep] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const requestId = useRef<string | null>(null);
  const submitting = useRef(false);
  const patch = (change: Partial<CageLaunchConfiguration>) => {
    setConfiguration((current) => ({ ...current, ...change }));
    requestId.current = null;
    setError(null);
    setSaved(false);
    setStudioSaved(false);
  };
  const patchRules = (change: Partial<CageLaunchConfiguration["rules"]>) => patch({ rules: { ...configuration.rules, ...change } });
  const selectFormat = (format: CageLaunchConfiguration["format"]) => {
    const names = { tournament: "Tournoi La Cage", championship: "Championnat La Cage", "open-mic": "Open Mic libre La Cage", "open-mic-battle": "Open Mic Battle La Cage" };
    patch({ format,
      ...(!configuration.templateId && Object.values(names).includes(configuration.title) ? { title: names[format] } : {}),
      rules: { ...configuration.rules, allowByes: format === "tournament" && configuration.rules.allowByes,
        ...(format === "open-mic" ? { performanceMode: "successive" as const, rounds: 1 } : {}),
      },
    });
  };
  const next = () => {
    const validation = step === 0 && !desktopStudio
      ? !configuration.title.trim()
        ? "Donne un nom à cette compétition."
        : configuration.title.trim().length > 100
          ? "Le titre est limité à 100 caractères."
          : !Number.isInteger(configuration.participantCount) || configuration.participantCount < (configuration.format === "open-mic" ? 1 : 2) || configuration.participantCount > 64
            ? `Choisis un format de ${configuration.format === "open-mic" ? 1 : 2} à 64 participants.`
            : null
      : step === studioStep ? null : validateCageLaunch(configuration);
    if (validation) { setError(validation); return; }
    setStep((current) => Math.min(greenStep, current + 1));
  };
  const save = () => {
    const validation = validateCageLaunch(configuration);
    if (validation) { setError(validation); return; }
    try {
      const entry = saveCageLaunchTemplate(scope, configuration);
      patch({ templateId: entry.id });
      setTemplates(readCageLaunchTemplates(scope));
      setSaved(true);
    } catch { setError("Le modèle n’a pas pu être enregistré sur cet appareil."); }
  };
  const launch = async () => {
    if (submitting.current) return;
    const validation = validateCageLaunch(configuration);
    if (validation) { setError(validation); return; }
    if (studioBlocked) { setError('Vérifie les sources vidéo et audio dans OBS MiWave, ainsi que ta connexion.'); return; }
    if (desktopStudio && !publicRoom) {
      try {
        const entry = saveCageLaunchTemplate(scope, configuration);
        if (studioSetup) saveRoomProductionSetup(entry.id, studioSetup);
        setTemplates(readCageLaunchTemplates(scope));
        setStudioSaved(true);
      } catch { setError('La préparation n’a pas pu être enregistrée sur cet appareil. Elle reste ouverte pour réessayer.'); }
      return;
    }
    submitting.current = true;
    setPending(true);
    setError(null);
    requestId.current ??= crypto.randomUUID();
    try {
      if (preview) {
        const session = createCageDemoSession(configuration);
        if (studioSetup) saveRoomProductionSetup(session.id, studioSetup);
        navigate(`/rooms/cage?cageSession=${encodeURIComponent(session.id)}&demoRole=host`);
      } else {
        if (!user) throw new Error("Connecte-toi pour lancer ta Cage.");
        const session = await launchCageLive(configuration, requestId.current);
        if (studioSetup) saveRoomProductionSetup(session.roomId, studioSetup);
        navigate(`/rooms/cage?room=${encodeURIComponent(session.roomId)}`);
      }
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Le lancement est indisponible. Ta configuration est conservée, tu peux réessayer.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };
  const openMic = configuration.format === "open-mic";
  const tournament = configuration.format === "tournament";
  const organizerLabel = tournament ? "Bracket" : openMic ? "programme" : "calendrier";
  const selectionDescription = configuration.rosterMode === "prepared"
    ? `${configuration.rosterProfileIds.length} profil${configuration.rosterProfileIds.length > 1 ? "s" : ""} dans le modèle. Leur présence et leur éligibilité seront vérifiées avant de préparer le ${organizerLabel}.`
    : "La sélection utilisera la file Invités existante. Seules les personnes inscrites, présentes et éligibles pourront être sélectionnées.";
  const participantCounts = [...new Set([...(openMic ? [1] : []), 2, 4, 8, 12, 16, 24, 32, 64, configuration.participantCount])].sort((a, b) => a - b);
  const bracketSlots = tournament ? 2 ** Math.ceil(Math.log2(configuration.participantCount)) : configuration.participantCount;
  const passageDurations = [...new Set([60, 90, 120, 180, 240, 300, configuration.rules.passageDurationSeconds])].sort((a, b) => a - b);
  const roundCounts = [...new Set([1, 2, 3, 5, configuration.rules.rounds])].sort((a, b) => a - b);

  return <section className={`rooms-home-launch-dialog__panel cage-launch${desktopStudio ? " is-desktop-sequence" : ""}${desktopStudio && step === studioStep ? ' is-studio-step' : ''}`} role="dialog" aria-modal="true" aria-labelledby="rooms-home-launch-title" aria-describedby="rooms-home-launch-description" onKeyDown={(event) => {
    if (event.key !== "Tab") return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]'));
    const first = buttons[0]; const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <header className="cage-launch__header">{onBack ? <button type="button" className="cage-launch__back" aria-label="Changer de room" title="Changer de room" disabled={pending} onClick={onBack}><ChevronLeft /></button> : null}<span className="cage-launch__mark"><Trophy /></span><div><span className="cage-launch__eyebrow">SÉQUENCEUR DE LANCEMENT</span><h2 id="rooms-home-launch-title">Préparer La Cage</h2><p id="rooms-home-launch-description">Le format, les participants et les règles accompagnent ton live.</p></div><button ref={closeRef} type="button" className="cage-launch__close" onClick={onClose} disabled={pending} aria-label="Fermer"><X /></button></header>
    <nav className="cage-launch__steps" aria-label="Étapes de lancement">{(desktopStudio ? ["Préparation", "OBS MiWave", "Lancement"] : ["Compétition", "Règlement", "Résumé", "Green Room"]).map((label, index) => <span key={label} aria-current={step === index ? "step" : undefined} className={step === index ? "is-active" : ""}><i>{step > index ? <Check size={12} /> : index + 1}</i>{label}</span>)}</nav>
    <div className="cage-launch__body">
      {step === 0 ? <>
        <label className="cage-launch__field"><span>Configuration</span><select value={configuration.templateId ?? ""} onChange={(event) => {
          const template = templates.find((item) => item.id === event.target.value);
          setStudioSetup(template ? readRoomProductionSetup(template.id) : null);
          patch(template ? { ...cloneCageConfiguration(template.configuration), templateId: template.id } : { ...cloneCageConfiguration(DEFAULT_CAGE_LAUNCH), templateId: undefined });
        }}><option value="">Créer au lancement</option>{configuration.templateId && !templates.some((item) => item.id === configuration.templateId) ? <option value={configuration.templateId}>Depuis mon profil · {configuration.title}</option> : null}{templates.map((template) => <option key={template.id} value={template.id}>{template.configuration.title}</option>)}</select></label>
        <div className="cage-launch__grid"><label className="cage-launch__field"><span>Nom de la compétition</span><input value={configuration.title} maxLength={100} onChange={(event) => patch({ title: event.target.value })} /></label><label className="cage-launch__field"><span>Discipline</span><input value={configuration.discipline} maxLength={80} onChange={(event) => patch({ discipline: event.target.value })} /></label></div>
        {desktopStudio ? <label className="cage-launch__field"><span>Ouverture</span><select value={publicRoom ? 'public' : 'private'} onChange={event => { setPublicRoom(event.target.value === 'public'); setStudioSaved(false); }}><option value="public">Ouvrir une Room publique</option><option value="private">Conserver ma préparation en privé</option></select></label> : null}
      </> : null}
      {(desktopStudio ? step === rulesStep : step === 0) ? <>
        <div className="cage-launch__grid"><label className="cage-launch__field"><span>Format</span><select value={configuration.format} onChange={(event) => selectFormat(event.target.value as CageLaunchConfiguration["format"])}>{Object.entries(formatLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="cage-launch__field"><span>Participants</span><select value={configuration.participantCount} onChange={(event) => patch({ participantCount: Number(event.target.value) })}>{participantCounts.map((count) => <option key={count} value={count}>{count} participant{count > 1 ? "s" : ""}</option>)}</select></label></div>
        <p className="cage-launch__note">{formatDescriptions[configuration.format]}</p>
        <div className="cage-launch__grid">
          <label className="cage-launch__field"><span>Régie</span><select value={configuration.productionTeam ?? "solo"} onChange={event => patch({ productionTeam: event.target.value as "solo" | "regisseur" })}><option value="solo">Je pilote seul</option><option value="regisseur">Avec un régisseur</option></select></label>
          {configuration.format === "championship" ? <label className="cage-launch__field"><span>Nombre de jours</span><input type="number" min={1} max={31} value={configuration.championshipDays ?? 1} onChange={event => patch({ championshipDays: Number(event.target.value) })} /></label> : null}
        </div>
        {configuration.productionTeam === "regisseur" ? <p className="cage-launch__note">Après l’ouverture, choisis ton contact depuis Régie pour préparer le retour audio privé.</p> : null}
        <label className="cage-launch__field"><span>Sélection du roster</span><select value={configuration.rosterMode} onChange={(event) => patch({ rosterMode: event.target.value as CageLaunchConfiguration["rosterMode"] })}>{Object.entries(rosterLabels).map(([value, label]) => <option key={value} value={value} disabled={value === "prepared" && configuration.rosterProfileIds.length === 0}>{label}</option>)}</select></label>
        <p className="cage-launch__note">{selectionDescription}</p>
      </> : null}
      {step === studioStep ? <RoomProductionPreparation
        roomId="launch:cage" liveRoom={false} onAir={false} publicationStatus="disconnected"
        stage="launch" initialSetup={studioSetup} onSetupChange={setStudioSetup} onReadinessChange={setStudioReadiness}
        onStart={() => undefined} onStop={() => undefined}
      /> : step === rulesStep ? <>
        {openMic ? <>
          <p className="cage-launch__note">Chaque artiste dispose d’un passage individuel. La régie prépare le prochain artiste pendant le passage en cours.</p>
          <label className="cage-launch__field"><span>Après chaque passage</span><select value={configuration.rules.openMicFeedback ?? ""} onChange={(event) => patchRules({ openMicFeedback: event.target.value as NonNullable<CageLaunchConfiguration["rules"]["openMicFeedback"]> })}><option value="" disabled>Choisir le retour du public</option>{Object.entries(openMicFeedbackLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          {configuration.rules.openMicFeedback === "appreciation" ? <p className="cage-launch__note">Chaque viewer peut envoyer un soutien au passage. Aucun classement n’est calculé.</p> : configuration.rules.openMicFeedback === "scored" ? <p className="cage-launch__note">Chaque viewer attribue une note de 1 à 5. Le classement indique la moyenne et le nombre de notes ; les ex æquo sont conservés.</p> : configuration.rules.openMicFeedback === "none" ? <p className="cage-launch__note">À la fin du passage, la régie prépare la suite sans vote ni classement.</p> : null}
        </> : <div className="cage-launch__grid"><label className="cage-launch__field"><span>Performances</span><select value={configuration.rules.performanceMode} onChange={(event) => patchRules({ performanceMode: event.target.value as CageLaunchConfiguration["rules"]["performanceMode"] })}><option value="successive">Passages successifs</option><option value="alternating">Performances alternées</option><option value="simultaneous">Duel simultané</option></select></label><label className="cage-launch__field"><span>Manches par rencontre</span><select value={configuration.rules.rounds} onChange={(event) => patchRules({ rounds: Number(event.target.value) })}>{roundCounts.map((count) => <option key={count} value={count}>{count} manche{count > 1 ? "s" : ""}</option>)}</select></label></div>}
        <div className="cage-launch__grid">
          <label className="cage-launch__field"><span>Durée d’un passage</span><select value={configuration.rules.passageDurationSeconds} onChange={(event) => patchRules({ passageDurationSeconds: Number(event.target.value) })}>{passageDurations.map((seconds) => <option key={seconds} value={seconds}>{seconds} secondes</option>)}</select></label>
          {!openMic || (configuration.rules.openMicFeedback && configuration.rules.openMicFeedback !== "none") ? <label className="cage-launch__field"><span>{openMic ? "Durée du retour public" : "Durée du vote"}</span><select value={configuration.rules.votingDurationSeconds} onChange={(event) => patchRules({ votingDurationSeconds: Number(event.target.value) })}>{[30, 45, 60, 90, 120].map((seconds) => <option key={seconds} value={seconds}>{seconds} secondes</option>)}</select></label> : null}
        </div>
        {!openMic ? <><div className="cage-launch__grid"><label className="cage-launch__field"><span>Qui vote ?</span><select value={configuration.rules.votingMode} onChange={(event) => patchRules({ votingMode: event.target.value as CageLaunchConfiguration["rules"]["votingMode"] })}><option value="public">Le public</option><option value="jury">Le jury</option><option value="mixed">Public et jury · 50 / 50</option></select></label><label className="cage-launch__field"><span>Égalité dans une rencontre</span><select value={configuration.rules.tieBreak} onChange={(event) => patchRules({ tieBreak: event.target.value as CageLaunchConfiguration["rules"]["tieBreak"] })}><option value="sudden-death">Manche décisive</option><option value="replay">Rejouer la rencontre</option></select></label></div>{configuration.rules.votingMode !== "public" ? <p className="cage-launch__note">Choisis ensuite 1 à 4 jurés parmi les invités en coulisses, avant le premier match.</p> : null}</> : null}
        <details className="launch-advanced"><summary>Règles avancées <span>Absences, remplacements et places libres</span></summary>
        <div className="cage-launch__grid"><label className="cage-launch__field"><span>Délai de reconnexion</span><select value={configuration.rules.disconnectGraceSeconds} onChange={(event) => patchRules({ disconnectGraceSeconds: Number(event.target.value) })}>{[30, 60, 90, 120, 180].map((seconds) => <option key={seconds} value={seconds}>{seconds} secondes</option>)}</select></label><label className="cage-launch__field"><span>Délai pour un absent</span><select value={configuration.rules.noShowGraceSeconds} onChange={(event) => patchRules({ noShowGraceSeconds: Number(event.target.value) })}>{[30, 60, 90, 120, 180].map((seconds) => <option key={seconds} value={seconds}>{seconds} secondes</option>)}</select></label></div>
        <div className="cage-launch__permissions">{([
          ["allowByes", "Autoriser les BYE", "Une place libre peut qualifier directement son adversaire."],
          ["allowReplacement", "Autoriser les remplaçants", "Uniquement parmi les personnes présentes, éligibles et prêtes."],
          ["allowFormatReduction", "Autoriser une réduction du format", "Le host devra toujours confirmer le changement."],
        ] as const).filter(([key]) => key === "allowByes" ? tournament : key === "allowFormatReduction" ? !openMic : true).map(([key, label, detail]) => <label key={key}><input type="checkbox" checked={configuration.rules[key]} onChange={(event) => patchRules({ [key]: event.target.checked })} /><span><strong>{label}</strong><small>{detail}</small></span></label>)}</div>
        </details>
      </> : step === summaryStep ? <>
        <div className="cage-launch__summary"><Trophy /><span>PRÊT À OUVRIR</span><h3>{configuration.title}</h3><p>{formatLabels[configuration.format]} · {configuration.participantCount} participants</p></div>
        <dl className="cage-launch__recap">
          <div><dt>Roster</dt><dd>{rosterLabels[configuration.rosterMode]}</dd></div>
          <div><dt>{openMic ? "Passage individuel" : "Performances"}</dt><dd>{openMic ? `${configuration.rules.passageDurationSeconds} secondes par artiste` : `${configuration.rules.rounds} manche${configuration.rules.rounds > 1 ? "s" : ""} · ${configuration.rules.passageDurationSeconds} s`}</dd></div>
          {openMic ? <div><dt>Retour public</dt><dd>{configuration.rules.openMicFeedback ? openMicFeedbackLabels[configuration.rules.openMicFeedback] : "À choisir"}{configuration.rules.openMicFeedback && configuration.rules.openMicFeedback !== "none" ? ` · ${configuration.rules.votingDurationSeconds} s` : ""}</dd></div> : <>
            <div><dt>Vote</dt><dd>{configuration.rules.votingMode === "public" ? "Public" : configuration.rules.votingMode === "jury" ? "Jury" : "Public et jury"} · {configuration.rules.votingDurationSeconds} s</dd></div>
            <div><dt>Égalité en rencontre</dt><dd>{configuration.rules.tieBreak === "sudden-death" ? "Sudden Death" : "Rencontre rejouée"}</dd></div>
            {!tournament ? <div><dt>Classement</dt><dd>Victoires · rencontres jouées · ex æquo conservés</dd></div> : null}
          </>}
        </dl>
        <p className="cage-launch__note">{openMic ? "Ton programme récupère ce règlement dès l’ouverture. Tu vérifieras les artistes et leur ordre avant de préparer le premier passage." : tournament ? "Ton Bracket récupère ce règlement dès l’ouverture. Tu vérifieras le roster et verrouilleras le tirage avant de préparer les deux premiers participants." : "Le championnat récupère ce règlement dès l’ouverture. Tu vérifieras les participants et le calendrier avant de préparer la première rencontre."} Le lancement des performances reste sous ton contrôle.</p>
        <button className="cage-launch__save" type="button" onClick={save} disabled={pending || saved}>{saved ? <Check /> : <Save />}{saved ? "Modèle sauvegardé" : "Garder une copie dans mes modèles"}</button>
      </> : step === greenStep ? desktopStudio ? <>
        {studioSaved ? <div role="status"><h3>Ton Studio est prêt</h3><p>La préparation et les sources sont enregistrées sur cet appareil. Aucune Room n’a été publiée.</p></div> : <RoomLaunchConfirmation title={configuration.title} pending={pending} onLaunch={launch} disabled={studioBlocked} buttonLabel={publicRoom ? "Ouvrir La Cage" : "Valider mon Studio"}
          description={!publicRoom ? 'Enregistre le format, les règles et les sources OBS MiWave sans publier de Room.' : preview
            ? 'Ouvre ta Cage de démonstration avec le format, les participants et les règles choisis.'
            : 'Ouvre ta Cage avec le format, les participants et les règles choisis. Le départ de la diffusion reste sous ton contrôle dans la régie.'} >
          <div className="launch-recap" aria-label="Réglages préparés"><strong>{formatLabels[configuration.format]} · {configuration.participantCount} participants</strong><span>{configuration.format === 'championship' ? `${configuration.championshipDays ?? 1} jours · ` : ''}{openMic ? openMicFeedbackLabels[configuration.rules.openMicFeedback ?? 'none'] : `Vote : ${{ public: 'public', jury: 'jury', mixed: 'public et jury' }[configuration.rules.votingMode]}`}</span></div>
          {publicRoom && !preview ? <ul className="room-launch__preflight" aria-label="Vérifications OBS MiWave">
            <li data-ready={studioReadiness.video}><span>Composition vidéo</span><strong>{studioReadiness.video ? 'Prête' : 'À préparer dans OBS MiWave'}</strong></li>
            <li data-ready={studioReadiness.microphone || studioReadiness.music}><span>Entrée audio</span><strong>{studioReadiness.microphone || studioReadiness.music ? 'Prête' : 'À tester dans OBS MiWave'}</strong></li>
            <li data-ready={networkAvailable}><span>Réseau</span><strong>{networkAvailable ? 'Disponible' : 'Hors ligne'}</strong></li>
          </ul> : null}
        </RoomLaunchConfirmation>}
        <button className="cage-launch__save" type="button" onClick={save} disabled={pending || saved}>{saved ? <Check /> : <Save />}{saved ? "Modèle sauvegardé" : "Garder une copie dans mes modèles"}</button>
      </> : <GreenHouse host readyLabel="Ouvrir La Cage" onReady={launch} /> : null}
      {step === rulesStep && bracketSlots > configuration.participantCount ? <p className="cage-launch__note">{configuration.participantCount} participants · tableau de {bracketSlots} places · {bracketSlots - configuration.participantCount} BYE{configuration.rules.allowByes ? " autorisés par le règlement." : " à autoriser dans le règlement pour utiliser ce format."}</p> : null}
      {error ? <p className="cage-launch__error" role="alert">{error}</p> : null}
    </div>
    <footer className="cage-launch__footer"><button type="button" className="cage-launch__secondary" disabled={pending} onClick={() => { setStudioSaved(false); if (step === 0) onClose(); else setStep(current => current - 1); }}>{step > 0 ? <ChevronLeft /> : null}{step > 0 ? "Retour" : "Annuler"}</button>{step < greenStep ? <button type="button" className="cage-launch__primary" onClick={next}>{step === summaryStep ? desktopStudio ? 'Vérifications finales' : "Régler mon matériel" : "Continuer"}<ArrowRight /></button> : null}</footer>
  </section>;
}
