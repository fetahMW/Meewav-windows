import MeewavSelect from "../../../components/shared/MeewavSelect";
import { useRoomVotingPolicy } from "../voting/useRoomVotingPolicy";
import { canCastRoomVote } from "../voting/roomVoting";
import RoomVotePolicyLabel from "../voting/RoomVotePolicyLabel";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Check, X, Download, FileAudio, Headphones, Music2, Radio, Upload, Vote } from "lucide-react";
import type { PlaceRoomState } from "../place/place.types";
import { useRoomTools } from "../tools/useRoomTools";
import { waveSubmissionBarsForDuration, waveSubmissionMaxBars } from "../tools/waveAudioRules";
import { WAVE_LOOP_CATEGORIES } from "../tools/waveLoopCategories";
import type { WaveLoopCategory } from "../tools/roomTools.types";
import { validateWaveAudienceFile } from "../tools/audience/waveAudienceUpload.service";
import { useWaveViewerListening } from "./WaveViewerListening";
import { contributionLabel, demoViewerSnapshot, formatWaveBpm, workshopCompatibility, type WaveViewerSnapshot, type ViewerReference } from "./waveViewerModel";
import { downloadViewerAudio, forgetViewerUpload, getViewerMedia, getViewerSnapshot, submitViewerFile, viewerInfra, viewerProduction } from "./waveViewer.service";

function categoryStyle(category: string): CSSProperties {
  return { "--wave-category": WAVE_LOOP_CATEGORIES.find(item => item.id === category)?.color ?? "#06B6D4" } as CSSProperties;
}
function errorMessage(reason: unknown) {
  const message = reason instanceof Error ? reason.message : "";
  if (message === "wave_import_duration_off_grid") return "Durée incompatible avec la grille du host : utilisez une boucle de 4, 8 ou 16 mesures dans la limite de la catégorie choisie.";
  if (message === "wave_file_size_invalid") return "Le fichier doit être non vide et peser au maximum 25 Mo.";
  if (message === "wave_file_type_invalid") return "Format non pris en charge. Utilisez WAV, MP3, AAC, FLAC ou M4A.";
  if (/wave_|backend|Failed to fetch|fetch failed/i.test(message)) return "L’action n’a pas été confirmée. Votre brouillon est conservé ; réessayez après reconnexion.";
  return message || "Le fichier ne peut pas être lu. Choisissez un autre fichier.";
}

export default function WaveViewerPanel(props: { room: PlaceRoomState; canEngage: boolean }) {
  return props.room.source === "demo" ? <DemoPanel {...props} /> : <LivePanel {...props} />;
}
function DemoPanel({ room, canEngage }: { room: PlaceRoomState; canEngage: boolean }) {
  const accountId = room.currentUserProfile?.id ?? "anonymous-wave";
  const tools = useRoomTools({ roomType: "wave", roomId: room.id, role: canEngage ? "contributor" : "visitor", accountId, source: "demo" });
  const snapshot = useMemo(() => tools.state?.wave ? demoViewerSnapshot(tools.state.wave, room.id, accountId) : null, [tools.state?.wave, room.id, accountId]);
  const submittedUrls = useRef<string[]>([]);
  useEffect(() => () => submittedUrls.current.forEach(url => URL.revokeObjectURL(url)), []);
  return <ViewerPanel room={room} canEngage={canEngage} snapshot={snapshot} connected={Boolean(snapshot)} submissionHint={category => tools.state?.wave ? `Envoi : 4, 8 ou 16 mesures, dans la limite de ${waveSubmissionMaxBars(tools.state.wave, category as WaveLoopCategory)} mesures pour cette famille à ${formatWaveBpm(tools.state.wave.baseLoop.bpm)} BPM.` : ""} submissionError={(duration, category) => { try { if (!tools.state?.wave) return "La Wave n’est pas prête."; waveSubmissionBarsForDuration(duration, tools.state.wave, category as WaveLoopCategory); return null; } catch (reason) { return errorMessage(reason); } }} refresh={async () => undefined}
    onSubmit={async ({ file, title, category, duration, reference, idempotencyKey }) => {
      if (!tools.state?.wave) throw new Error("La Wave n’est pas prête.");
      const rules = snapshot?.rules;
      if (!rules) throw new Error("Règles indisponibles.");
      const mediaUrl = URL.createObjectURL(file); submittedUrls.current.push(mediaUrl);
      await tools.execute({ type: "wave.submission.add", submission: {
        id: idempotencyKey, contributor: { id: accountId, name: room.currentUserProfile?.displayName ?? "Membre MeeWav", avatarUrl: room.currentUserProfile?.avatarUrl ?? "", role: "Contributeur", microphone: "off", camera: "off" },
        title, instrument: WAVE_LOOP_CATEGORIES.find(item => item.id === category)?.label ?? category, category: category as WaveLoopCategory,
        bpm: rules.bpm, key: rules.key, bars: waveSubmissionBarsForDuration(duration, tools.state.wave, category as WaveLoopCategory),
        durationSeconds: duration, fileName: file.name, fileSize: file.size, mimeType: validateWaveAudienceFile(file), mediaUrl,
        status: "received", lifecycleStatus: "RECEIVED", rightsConfirmed: true, version: 1, privateNotes: reference ? `Référence de travail : ${reference.label}` : "Essai solo", creditPublic: true, versions: [],
      } });
      return "Reçue dans la démonstration locale";
    }} onVote={async (vote, choice) => { await tools.execute({ type: "wave.vote.cast", submissionId: vote.id, accountId, choice: choice === "APPROVE" ? "yes" : "no" }); }} />;
}
function LivePanel({ room, canEngage }: { room: PlaceRoomState; canEngage: boolean }) {
  const [snapshot, setSnapshot] = useState<WaveViewerSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const sessionId = useRef<string | null>(null);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    try {
      const id = sessionId.current ?? (await viewerProduction.resolveSessionForRoom(room.id)).sessionId;
      if (request !== generation.current) return;
      sessionId.current = id;
      const next = await getViewerSnapshot(id);
      if (request !== generation.current) return;
      setSnapshot(current => !current || next.sequence >= current.sequence ? next : current);
      setConnected(true); setError("");
    } catch (reason) { if (request === generation.current) { setConnected(false); setError(errorMessage(reason)); } }
  }, [room.id]);
  useEffect(() => {
    sessionId.current = null; setSnapshot(null); void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 15000);
    const recover = () => { if (!document.hidden) { setConnected(false); void refresh(); } };
    const offline = () => setConnected(false);
    window.addEventListener("online", recover); window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", recover);
    return () => { ++generation.current; clearInterval(timer); window.removeEventListener("online", recover); window.removeEventListener("offline", offline); document.removeEventListener("visibilitychange", recover); };
  }, [refresh]);
  useEffect(() => {
    if (!snapshot?.sessionId) return;
    const stream = viewerInfra.subscribe(snapshot.sessionId, { onSnapshot: () => { void refresh(); }, onEvent: () => { void refresh(); }, onError: () => setConnected(false), onStatus: status => { if (["failed", "recovering", "closed"].includes(status)) setConnected(false); } });
    return () => stream.close();
  }, [snapshot?.sessionId, refresh]);
  return <ViewerPanel room={room} snapshot={snapshot} canEngage={canEngage} connected={connected} error={error} refresh={refresh}
    onSubmit={async (input) => {
      if (!snapshot?.termsVersion) throw new Error("Les conditions de contribution ne sont pas encore disponibles.");
      const result = await submitViewerFile({ ...input, sessionId: snapshot.sessionId, termsVersion: snapshot.termsVersion });
      if (["REJECTED", "PROCESSING_FAILED", "EXPIRED"].includes(result.processing.data.state)) throw new Error("Le traitement du fichier a échoué. Consultez le suivi de votre contribution.");
      await refresh();
      return result.processing.data.state === "READY" ? "Traitement terminé · confirmation de la proposition en cours" : "Traitement du fichier en cours";
    }} onVote={async (vote, choice, key) => {
      if (vote.kind === "CLOSING") await viewerProduction.castClosingVote({ closingVoteId: vote.id, choice, idempotencyKey: key });
      else await viewerProduction.castVote({ roundId: vote.id, choice, idempotencyKey: key });
      await refresh();
    }} />;
}

type SubmitInput = { file: File; title: string; category: string; duration: number; reference: ViewerReference | null; idempotencyKey: string };
type PanelProps = { submissionHint?: (category: string) => string; submissionError?: (duration: number, category: string) => string | null; room: PlaceRoomState; canEngage: boolean; snapshot: WaveViewerSnapshot | null; connected: boolean; error?: string; refresh: () => Promise<void>; onSubmit: (input: SubmitInput) => Promise<string>; onVote: (vote: NonNullable<WaveViewerSnapshot["vote"]>, choice: "APPROVE" | "CONTINUE", key: string) => Promise<void> };
export function ViewerPanel({ submissionHint, submissionError, room, snapshot, canEngage, connected, error, refresh, onSubmit, onVote }: PanelProps) {
  const {policy} = useRoomVotingPolicy(room.id, room.source);
  const voterId = room.currentUserProfile?.id ?? "";
  const canVote = canCastRoomVote(policy, voterId);
  const audio = useWaveViewerListening();
  const inputRef = useRef<HTMLInputElement>(null);
  const workshopRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [reference, setReference] = useState<ViewerReference | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("drums");
  const [rights, setRights] = useState(false);
  const [referenceVolume, setReferenceVolume] = useState(.7);
  const [loopVolume, setLoopVolume] = useState(.7);
  const [auditionMode, setAuditionMode] = useState<"solo" | "beat">("solo");
  const [localError, setLocalError] = useState("");
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);
  const [decoding, setDecoding] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [voteRecorded, setVoteRecorded] = useState<string | null>(null);
  const submitLock = useRef(false);
  const uploadKey = useRef(crypto.randomUUID());
  const frozenSubmission = useRef<SubmitInput | null>(null);
  const decodeGeneration = useRef(0);
  const referenceCache = useRef<{ id: string; buffer: AudioBuffer } | null>(null);
  const voteKeys = useRef(new Map<string, string>());
  const [now, setNow] = useState(Date.now());
  const serverOffset = useMemo(() => snapshot ? Date.parse(snapshot.serverNow) - Date.now() : 0, [snapshot]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => () => { ++decodeGeneration.current; forgetViewerUpload(uploadKey.current); }, []);
  useEffect(() => { if (!reference && !file && snapshot?.reference) setReference(snapshot.reference); }, [snapshot?.reference, file, reference]);
  const rules = snapshot?.rules ?? null;
  const journey = room.participants.find(item => item.profile.id === room.currentUserProfile?.id);
  const preparingStage = Boolean(journey && ["accepted", "ready", "backstage", "onstage"].includes(journey.status));
  const compatibility = buffer ? workshopCompatibility(buffer.duration, reference?.rules ?? rules) : null;
  const currentCompatibility = buffer ? { error: submissionError ? submissionError(buffer.duration, category) : workshopCompatibility(buffer.duration, rules).error } : null;
  const vote = snapshot?.vote;
  const voteOpen = vote?.status === "OPEN" && now + serverOffset >= Date.parse(vote.opensAt) && now + serverOffset < Date.parse(vote.closesAt);
  const comparisonReady = vote?.kind !== "REPLACEMENT" || (vote.options.some(item => item.id === "A") && vote.options.some(item => item.id === "WITH_BEAT"));
  const chosenCategory = snapshot?.categories.find(item => item.id === category);
  const blockReason = !canEngage ? "Connexion nécessaire pour envoyer une boucle." : !connected ? "Synchronisation nécessaire avant l’envoi." : !snapshot?.submissionsOpen ? "Soumissions fermées. Vous pouvez continuer votre essai." : !chosenCategory?.open ? "Catégorie fermée ou complète." : !chosenCategory.permitted ? "Aucun droit de soumission disponible pour cette catégorie." : !snapshot.termsVersion ? "Conditions de contribution en préparation." : currentCompatibility?.error ?? null;
  const importFile = async (next: File) => {
    if (!audio || submitLock.current || frozenSubmission.current) return;
    const request = ++decodeGeneration.current;
    setDecoding(true); setLocalError("");
    audio.returnLive();
    try {
      validateWaveAudienceFile(next);
      const decoded = await audio.engine.decode(await next.arrayBuffer());
      if (request !== decodeGeneration.current) return;
      if (!decoded.duration || !Number.isFinite(decoded.duration)) throw new Error("Fichier audio non lisible.");
      setFile(next); setBuffer(decoded); setTitle(next.name.replace(/\.[^.]+$/, "")); setSubmitted(false); setProgress(""); setRights(false);
      if (!reference) setReference(snapshot?.reference ?? null);
      uploadKey.current = crypto.randomUUID();
    } catch (reason) { if (request === decodeGeneration.current) setLocalError(errorMessage(reason)); }
    finally { if (request === decodeGeneration.current) setDecoding(false); }
  };
  const listen = (mode: "solo" | "beat") => {
    if (!audio || !buffer || preparingStage) return;
    setAuditionMode(mode);
    void audio.start("workshop", mode === "solo" ? "Ma boucle · Solo" : `Ma boucle avec ${reference?.label}`, async () => {
      if (mode === "solo") return { buffers: [buffer], volumes: [loopVolume], loop: false };
      if (!reference || compatibility?.error) throw new Error(compatibility?.error ?? "Référence en préparation.");
      if (referenceCache.current?.id !== reference.id) {
        const url = reference.url ?? await getViewerMedia(snapshot!.sessionId, "reference", reference.id);
        const decoded = await audio.engine.load(url);
        const [numerator, denominator] = reference.rules.signature.split("/").map(Number);
        const cycleSeconds = 60 / reference.rules.bpm * numerator * 4 / denominator * reference.rules.cycleBars;
        if (Math.abs(decoded.duration - reference.durationSeconds) > .001 || Math.abs(decoded.duration - cycleSeconds) > 1 / 44100) throw new Error("La référence n’a pas une durée exacte de cycle. Essai synchronisé indisponible.");
        referenceCache.current = { id: reference.id, buffer: decoded };
      }
      return { buffers: [buffer, referenceCache.current.buffer], volumes: [loopVolume, referenceVolume], loop: true };
    });
  };
  const send = async () => {
    if (!file || !buffer || !title.trim() || !rights || submitLock.current || submitted || (!frozenSubmission.current && blockReason)) return;
    submitLock.current = true; setBusy(true); setLocalError(""); setProgress("Envoi en cours…");
    // Reuse the exact request after uncertain network outcomes, including context.
    const input = frozenSubmission.current ?? { file, title: title.trim(), category, duration: buffer.duration, reference, idempotencyKey: uploadKey.current };
    frozenSubmission.current = input;
    try { setProgress(await onSubmit(input)); setSubmitted(true); }
    catch (reason) { setLocalError(errorMessage(reason)); setProgress("Envoi non confirmé · réessayer la même proposition"); }
    finally { submitLock.current = false; setBusy(false); }
  };
  const playVote = (option: NonNullable<typeof vote>["options"][number]) => {
    if (!audio || !vote || !snapshot) return;
    void audio.start("vote", option.label, async () => {
      const url = option.url ?? await getViewerMedia(snapshot.sessionId, vote.kind === "CLOSING" ? "closing" : "vote", vote.id, option.id);
      return { buffers: [await audio.engine.load(url)], volumes: [1], loop: false };
    });
  };
  const cast = async (choice: "APPROVE" | "CONTINUE") => {
    if (!canEngage || !canVote || !connected || !vote || submitLock.current || !voteOpen || !vote.eligible || !comparisonReady || vote.choice || voteRecorded === vote.id) return;
    submitLock.current = true; setBusy(true); setLocalError("");
    const key = voteKeys.current.get(vote.id) ?? crypto.randomUUID(); voteKeys.current.set(vote.id, key);
    try { await onVote(vote, choice, key); setVoteRecorded(vote.id); }
    catch (reason) { setLocalError(errorMessage(reason)); }
    finally { submitLock.current = false; setBusy(false); }
  };
  const chooseReference = () => {
    audio?.returnLive(); referenceCache.current = null; setReference(snapshot?.reference ?? null);
  };
  const clearDraft = () => {
    audio?.returnLive(); ++decodeGeneration.current;
    forgetViewerUpload(uploadKey.current); uploadKey.current = crypto.randomUUID();
    frozenSubmission.current = null;
    setFile(null); setBuffer(null); setRights(false); setTitle(""); setProgress(""); setSubmitted(false);
  };
  const download = async () => {
    if (!reference || !snapshot) return;
    try {
      const url = reference.url ?? await getViewerMedia(snapshot.sessionId, "reference", reference.id);
      await downloadViewerAudio(url, `${snapshot.title}-v${reference.revision}-${formatWaveBpm(reference.rules.bpm)}BPM-${reference.rules.cycleBars}mesures`);
    } catch (reason) { setLocalError(errorMessage(reason)); }
  };
  const downloadLayer = async (layer: NonNullable<WaveViewerSnapshot>["layers"][number]) => {
    if (!snapshot) return;
    try {
      const url = layer.url ?? await getViewerMedia(snapshot.sessionId, "layer", layer.id);
      await downloadViewerAudio(url, layer.title);
    } catch (reason) { setLocalError(errorMessage(reason)); }
  };
  const [simulationOpen, setSimulationOpen] = useState(false);
  const [simulationChoice, setSimulationChoice] = useState<string | null>(null);
  const [simulationDeadline, setSimulationDeadline] = useState(0);
  const [simulationListen, setSimulationListen] = useState<string | null>(null);
  const [simulationTick, setSimulationTick] = useState(Date.now());
  const simulationSeconds = Math.max(0, Math.ceil((simulationDeadline - simulationTick) / 1000));
  const simulationFinished = simulationSeconds === 0;
  const simulationElapsed = 10 - simulationSeconds;
  const simulatedYes = 28 + simulationElapsed * 7 + (simulationChoice === "Validée" ? 1 : 0);
  const simulatedNo = 12 + simulationElapsed * 3 + (simulationChoice === "Refusée" ? 1 : 0);
  const simulationPercent = Math.round(simulatedYes / (simulatedYes + simulatedNo) * 100);
  const restartSimulation = () => { setSimulationChoice(null); const start = Date.now(); setSimulationTick(start); setSimulationDeadline(start + 10000); };
  useEffect(() => {
    if (!simulationOpen || simulationFinished) return;
    const timer = setInterval(() => setSimulationTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [simulationOpen, simulationFinished]);
  const listenSimulation = (withMix: boolean) => {
    if (!audio) return;
    setSimulationListen(withMix ? "Avec le mix du host" : "Solo");
    void audio.start("vote", withMix ? "Simulation · Avec le mix du host" : "Simulation · Solo", async () => {
      const candidate = await audio.engine.load("/audio/rooms/wave-demo/drums-groove-foundation.mp3");
      if (!withMix) return { buffers: [candidate], volumes: [1], loop: true };
      if (!reference || !snapshot) throw new Error("Le mix du host est en préparation.");
      const mix = await audio.engine.load(reference.url ?? await getViewerMedia(snapshot.sessionId, "reference", reference.id));
      return { buffers: [candidate, mix], volumes: [.7, .8], loop: true };
    });
  };
  const closeSimulation = () => { setSimulationOpen(false); if (simulationListen) audio?.returnLive(); setSimulationListen(null); };
  const simulationRef = useRef<HTMLDivElement>(null);
  const panelRootRef = useRef<HTMLDivElement>(null);
  const [voteHost, setVoteHost] = useState<HTMLElement | null>(null);
  const [voteTop, setVoteTop] = useState(0);
  useEffect(() => {
    const host = panelRootRef.current?.closest<HTMLElement>(".place-studio-panel");
    const bar = host?.querySelector<HTMLElement>(".place-studio-panel__bar");
    if (!host || !bar) return;
    setVoteHost(host);
    const update = () => setVoteTop(bar.offsetTop + bar.offsetHeight + 20);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host); observer.observe(bar);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const show = () => { restartSimulation(); setSimulationOpen(true); };
    window.addEventListener("wave-preview-vote-ready", show);
    return () => window.removeEventListener("wave-preview-vote-ready", show);
  }, []);
  useEffect(() => { if (simulationOpen) simulationRef.current?.focus({ preventScroll: true }); }, [simulationOpen, simulationFinished]);
  const openWorkshop = () => { setOpen(true); requestAnimationFrame(() => workshopRef.current?.scrollIntoView({ block: "nearest" })); };
  return <div className="wave-viewer-panel" ref={panelRootRef}>
    {simulationOpen && room.source === "demo" && voteHost ? createPortal(<div className="wave-viewer-panel wave-vote-console-overlay" style={{ top: voteTop }}><div className="wave-vote-preview" role="dialog" aria-label="Simulation de vote" aria-modal="false" tabIndex={-1} ref={simulationRef} onKeyDown={event => { if (event.key === "Escape") closeSimulation(); }}>
      <header><span>VOTE COLLECTIF · SIMULATION</span><button aria-label="Fermer le vote" onClick={closeSimulation}>×</button></header>
      <div className="wave-vote-preview__clock" role="timer" aria-label="Temps restant">{simulationFinished ? "Vote terminé" : `00:${String(simulationSeconds).padStart(2, "0")}`}</div><Vote aria-hidden="true" /><h2>On garde cette direction ?</h2><p>Une nouvelle boucle pour faire évoluer le Beat.</p>
      <div className="wave-vote-preview__track"><Music2 /><span><strong>{reference?.label ?? "Proposition de boucle"}</strong><small>{rules ? `${formatWaveBpm(rules.bpm)} BPM · ${rules.cycleBars} mesures` : "Aperçu de présentation"}</small></span></div>
      <div className="wave-viewer-actions" aria-label="Écouter la proposition"><button disabled={!audio || audio.loading} aria-pressed={simulationListen === "Solo"} onClick={() => listenSimulation(false)}><Headphones />Solo</button><button disabled={!audio || audio.loading || !reference} aria-pressed={simulationListen === "Avec le mix du host"} onClick={() => listenSimulation(true)}><Music2 />Avec le mix du host</button>{simulationListen ? <button onClick={() => { audio?.returnLive(); setSimulationListen(null); }}>Arrêter l’écoute</button> : null}</div>
      <p>Proposition audio de démonstration · public simulé.</p>
      <div className="wave-viewer-actions wave-vote-decisions"><button className="wave-vote-decision is-approve" disabled={!!simulationChoice || simulationFinished} onClick={() => setSimulationChoice("Validée")}><Check aria-hidden="true" />Valider</button><button className="wave-vote-decision is-reject" disabled={!!simulationChoice || simulationFinished} onClick={() => setSimulationChoice("Refusée")}><X aria-hidden="true" />Refuser</button></div>
      <p role="status">{simulationChoice ? `Votre choix : ${simulationChoice}` : "À vous de choisir"}</p>
      <section className="wave-vote-preview__results" aria-label="Résultats du public simulé"><strong>{simulationFinished ? "Résultat final" : "Résultats en direct"} · {simulatedYes + simulatedNo} votes</strong><div className="wave-vote-preview__result-bar"><i style={{width: `${simulationPercent}%`}} /></div><div><span>Valider · {simulationPercent}% ({simulatedYes})</span><span>Refuser · {100 - simulationPercent}% ({simulatedNo})</span></div></section>
      <div className="wave-vote-preview__replay"><button style={{ visibility: simulationFinished ? "visible" : "hidden" }} disabled={!simulationFinished} onClick={restartSimulation}>Rejouer · 10 secondes</button></div>
    </div></div>, voteHost) : null}
    <section className="wave-viewer-display" aria-label="La Wave maintenant">
      <div className="wave-viewer-entry-actions"><button type="button" className="is-primary wave-hifi-action" aria-label="Préparer et soumettre ma boucle" onClick={openWorkshop}><Upload />Soumettre ma boucle</button>{reference?.downloadable ? <button type="button" className="wave-hifi-action" onClick={() => void download()}><Download />Télécharger la référence</button> : null}</div>
      <div className="wave-viewer-eyebrow"><Radio />{room.source === "demo" ? "DÉMONSTRATION LOCALE" : connected ? "LA WAVE EN DIRECT" : "SYNCHRONISATION"}</div>
      <h2>{snapshot?.title || room.title}</h2>
      <p className="wave-viewer-display__state">{room.status === "ended" || ["CLOSED", "ENDED", "CANCELLED"].includes(snapshot?.status ?? "") ? "Wave terminée" : ["PAUSED", "INTERMISSION"].includes(snapshot?.status ?? "") ? "Wave en pause" : snapshot?.pendingActivation ? "Boucle validée — intégration en préparation" : snapshot?.programSource === "HOST_DAW" ? "Production du host en direct" : snapshot?.activeRevision ? `Beat collectif · version ${snapshot.activeRevision}` : "Construction en cours"}</p>
      <p>{snapshot?.categories.some(item => item.priority) ? `Le maître de la Wave recherche : ${snapshot.categories.filter(item => item.priority).map(item => item.label).join(", ")}.` : "Suivez la création et préparez votre prochaine contribution."}</p>
      {rules ? <><div className="wave-viewer-rules-line">{formatWaveBpm(rules.bpm)} BPM · {rules.key} · Cycle de {rules.cycleBars} mesures</div><details><summary>Règles</summary><p>Tempo officiel : {formatWaveBpm(rules.bpm)} BPM · Signature {rules.signature}.</p><p>Longueurs autorisées : {rules.acceptedBars.join(", ")} mesures. Répétition : {rules.repeatPolicy === "REPEAT_TO_CYCLE" ? "jusqu’à la fin du cycle" : "non précisée"}.</p><p>Aucun changement automatique de tempo ou de tonalité. Les voix suivent les règles publiées.</p></details></> : <p>Règles musicales en préparation. L’écoute solo reste disponible.</p>}
      {error ? <p role="status">{error} <button type="button" onClick={() => void refresh()}>Réessayer</button></p> : null}
    </section>
    <section className={`wave-viewer-collective${voteOpen ? " is-open" : ""}`} aria-label="Action collective">
      {vote ? <><RoomVotePolicyLabel roomId={room.id} source={room.source} accountId={voterId}/><div className="wave-viewer-eyebrow"><Vote />{vote.kind === "REPLACEMENT" ? "DUEL DE REMPLACEMENT" : vote.kind === "CLOSING" ? "VOTE DE CLÔTURE" : "PROPOSITION DU HOST"}</div><h3>{vote.title}</h3><p>{vote.credit} · Version {vote.candidateVersion}</p><p role="status">{voteOpen ? "Un vote est ouvert." : vote.status === "LISTENING" ? "Écoutez la proposition avant l’ouverture du vote." : vote.approved === true ? "Décision officielle : proposition validée" : vote.approved === false ? "Proposition non retenue" : "Vote fermé"}</p>
        {voteOpen ? <small>Clôture dans {Math.max(0, Math.ceil((Date.parse(vote.closesAt) - now - serverOffset) / 1000))} s</small> : null}
        <div className="wave-viewer-actions">{vote.options.map(option => <button type="button" key={option.id} disabled={!connected || audio?.loading} onClick={() => playVote(option)}><Headphones />{audio?.mode === "workshop" ? `Écouter et voter · ${option.label}` : option.label}</button>)}</div>
        {!vote.options.length ? <p>Aperçu officiel en préparation.</p> : null}
        {!comparisonReady ? <p role="status">Comparaison A/B officielle en préparation. Les deux options doivent partager le même contexte musical avant de voter.</p> : null}
        <div className="wave-viewer-actions"><button type="button" disabled={!canEngage || !canVote || !connected || !voteOpen || !vote.eligible || !comparisonReady || busy || Boolean(vote.choice) || voteRecorded === vote.id} onClick={() => void cast("APPROVE")}>{vote.kind === "REPLACEMENT" ? "B · Choisir la proposition" : "Valider"}</button><button type="button" disabled={!canEngage || !canVote || !connected || !voteOpen || !vote.eligible || !comparisonReady || busy || Boolean(vote.choice) || voteRecorded === vote.id} onClick={() => void cast("CONTINUE")}>{vote.kind === "REPLACEMENT" ? "A · Conserver la piste" : "Continuer"}</button></div>
        <p>{vote.choice || voteRecorded === vote.id ? "Vote enregistré par le serveur." : !canEngage ? "Connexion nécessaire pour voter." : !canVote ? "Ce vote est réservé au jury." : !vote.eligible ? "Votre éligibilité à cette manche attend la confirmation du serveur après l’audition officielle." : "Une voix par compte · résultat officiel à la clôture."}</p>
        {audio?.mode === "vote" && file ? <button type="button" onClick={() => { audio.returnLive(); openWorkshop(); }}>Revenir à mon atelier</button> : null}
      </> : <><h3>À vous d’imaginer la suite</h3><p>Testez votre idée en privé avant de la proposer au maître de la Wave.</p><button type="button" className="is-primary wave-hifi-action" onClick={openWorkshop}>Tester ma boucle</button></>}
    </section>
    <section className="wave-viewer-workshop" ref={workshopRef} aria-label="Mon atelier privé">
      <button type="button" className="wave-viewer-workshop__toggle" aria-expanded={open} onClick={() => setOpen(!open)}><Headphones /><span>Mon atelier<small>{file?.name ?? "Votre espace de préécoute privé"}</small></span><b>{open ? "−" : "+"}</b></button>
      <div hidden={!open}>
        <p>Vos essais restent dans ce navigateur. Le fichier devra être sélectionné à nouveau après rechargement.</p>
        {preparingStage ? <p role="status">Votre brouillon est conservé pendant la préparation sur scène. Utilisez un casque avant d’activer votre micro.</p> : null}
        <div className="wave-viewer-reference"><Music2 /><span><strong>Référence du Beat</strong><small>{reference?.label ?? "Référence en préparation"}</small></span>{reference?.downloadable ? <button type="button" onClick={() => void download()} title="Télécharger la référence du Beat" aria-label="Télécharger la référence du Beat"><Download />Télécharger</button> : null}</div>
        {snapshot?.reference && snapshot.reference.id !== reference?.id ? <p className="wave-viewer-notice" role="status">Le Beat a évolué. Votre référence est conservée.<button type="button" disabled={Boolean(frozenSubmission.current)} onClick={chooseReference}>Tester avec la nouvelle version</button></p> : null}
        <button type="button" className="wave-viewer-import" disabled={decoding || busy || Boolean(frozenSubmission.current)} onClick={() => inputRef.current?.click()}><FileAudio /><span><strong>{file ? "Remplacer ma boucle" : "Importer ma boucle"}</strong><small>{decoding ? "Lecture du fichier…" : file?.name ?? "WAV, MP3, AAC, FLAC, M4A · 25 Mo max"}</small></span><Upload /></button>
        <input type="file" ref={inputRef} hidden accept=".wav,.mp3,.aac,.flac,.m4a" onChange={event => { const next = event.target.files?.[0]; event.target.value = ""; if (next) void importFile(next); }} />
        {file && buffer ? <><p>{buffer.duration.toFixed(2)} s · {buffer.numberOfChannels} {buffer.numberOfChannels > 1 ? "canaux" : "canal"} · {Math.round(buffer.sampleRate / 1000)} kHz</p><p>{compatibility?.error ? `Préécoute avec le Beat : ${compatibility.error}` : "Durée compatible avec la grille. Tempo et tonalité non analysés localement."}</p>
          <div className="wave-viewer-actions"><button type="button" disabled={audio?.loading || preparingStage} onClick={() => listen("solo")}>Solo</button><button type="button" disabled={!reference || Boolean(compatibility?.error) || audio?.loading || preparingStage} onClick={() => listen("beat")}>Avec le Beat</button>{audio?.mode === "workshop" ? <button type="button" onClick={audio.pause}>Pause</button> : null}</div>
          <label>Volume référence<input aria-label="Volume référence" type="range" min="0" max="1" step=".01" value={referenceVolume} onChange={event => { const value = Number(event.target.value); setReferenceVolume(value); if (audio?.mode === "workshop" && auditionMode === "beat") audio.engine.setVolume(1, value); }} /></label>
          <label>Volume ma boucle<input aria-label="Volume ma boucle" type="range" min="0" max="1" step=".01" value={loopVolume} onChange={event => { const value = Number(event.target.value); setLoopVolume(value); if (audio?.mode === "workshop") audio.engine.setVolume(0, value); }} /></label>
          {audio?.voiceAvailable ? <label className="wave-viewer-check"><input type="checkbox" checked={audio.keepVoice} onChange={event => audio.setKeepVoice(event.target.checked)} />Garder la voix du host pendant mon essai</label> : <p>Le son du live est coupé pendant votre écoute privée.</p>}
          <label>Titre<input maxLength={80} value={title} disabled={Boolean(frozenSubmission.current)} onChange={event => setTitle(event.target.value)} /></label>
          <label>Famille<MeewavSelect value={category} disabled={Boolean(frozenSubmission.current)} onChange={event => setCategory(event.target.value)}>{WAVE_LOOP_CATEGORIES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</MeewavSelect></label>
          {submissionHint ? <p>{submissionHint(category)}</p> : null}
          <label className="wave-viewer-check"><input type="checkbox" required checked={rights} disabled={Boolean(frozenSubmission.current)} onChange={event => setRights(event.target.checked)} />Je possède les droits nécessaires sur cette boucle et j’autorise son traitement, sa présentation dans cette Wave, ainsi que son téléchargement et son utilisation par les autres utilisateurs.</label>
          {blockReason && !submitted ? <p role="status">{blockReason}</p> : null}
          <button type="button" className="is-primary wave-hifi-action" disabled={busy || submitted || !rights || !title.trim() || (!frozenSubmission.current && Boolean(blockReason))} onClick={() => void send()}>{busy ? "Envoi en cours…" : submitted ? "Proposition transmise" : frozenSubmission.current ? "Réessayer l’envoi" : "Soumettre ma boucle"}</button>
          <p>Seul votre fichier original sera soumis. Les volumes de préécoute ne modifient pas le fichier.</p>
          {!frozenSubmission.current || submitted ? <><button type="button" onClick={clearDraft}>Retirer le brouillon</button>{submitted ? <p>Ce retrait local conserve votre proposition chez le host.</p> : null}</> : <p>Cette version est figée pour l’envoi. Aucune substitution silencieuse.</p>}
        </> : null}
        {progress ? <p role="status">{progress}</p> : null}
      </div>
    </section>
    {localError ? <p role="alert" className="wave-viewer-error">{localError}</p> : null}
    {snapshot?.contributions.length ? <section className="wave-viewer-contributions"><h3>Ma contribution</h3>{snapshot.contributions.map(item => <article key={item.id} style={categoryStyle(item.category)}><Music2 /><div><strong>{item.title}</strong><small>Version {item.version} · {contributionLabel(item)}</small>{item.reason ? <p>{item.reason}</p> : null}</div></article>)}</section> : null}
    <section className="wave-viewer-beat"><header><h3>Beat collectif</h3><span>{snapshot?.layers.length ?? 0} couche{snapshot?.layers.length === 1 ? "" : "s"}</span></header>{snapshot?.layers.map(layer => <article key={layer.id} style={categoryStyle(layer.category)}><Music2 /><div><strong>{layer.title}</strong><small>{layer.credit} · {WAVE_LOOP_CATEGORIES.find(item => item.id === layer.category)?.label ?? "Base"}</small></div><span>{room.source === "demo" ? "Démo" : "Intégrée"}</span>{layer.downloadable && (room.source !== "demo" || layer.url) ? <button type="button" aria-label={layer.isBase ? "Télécharger la boucle de base" : `Télécharger ${layer.title}`} title="Télécharger pour utiliser cette boucle" onClick={() => void downloadLayer(layer)}><Download /></button> : null}</article>)}{!snapshot?.layers.length ? <p>Les couches apparaîtront après confirmation de leur activation.</p> : null}</section>
  </div>;
}
