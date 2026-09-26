import MeewavSelect from "../../../../components/shared/MeewavSelect";
import { useWaveTransport, useWaveTransportState } from "../../wave-transport/WaveTransportProvider";
import {
  CircleCheck,
  Download,
  Headphones,
  History,
  Link2,
  LockKeyhole,
  Pause,
  Play,
  ShieldCheck,
  Swords,
  Upload,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { MeewavGradeBadge } from "../../../grades/MeewavGradeBadge";
import type { PlaceRoomState } from "../../place/place.types";
import { uploadWaveAudienceFile, validateWaveAudienceFile } from "../audience/waveAudienceUpload.service";
import { measureWaveAudio } from "../waveAudioRules";
import type { RoomActorRole, RoomToolsCommand, WaveState } from "../roomTools.types";
import { EmptyState, ToolNotice, ToolPanelHeader } from "./RoomToolPanelPrimitives";
import { WaveBottomBar, WaveLoopCard } from "./WaveLoopCard";
import { useWaveMediaUrl } from "./WaveFlutterPrimitives";

type WaveOrchestraPanelProps = {
  wave: WaveState;
  role: RoomActorRole;
  roomId: string;
  source: PlaceRoomState["source"];
  accountId: string;
  disabled: boolean;
  execute: (command: RoomToolsCommand) => Promise<unknown>;
  /** Shared Room mixer music gain (0..1). */
  mixerMusicGain?: number;
  /** Updates the same music channel used by the Room mixer. */
  onMixerMusicGain?: (gain: number) => void;
  host?: Pick<PlaceRoomState["host"], "id" | "displayName" | "avatarUrl">;
  /** Authoritative server-render status. Omitted live callers fail closed. */
  programAudioStatus?: "processing" | "ready" | "failed";
  /** Signed private-audition derivative URLs; never persisted in WaveState. */
  privatePreviewUrlsByLayerId?: Readonly<Record<string, string>>;
};

function formatDuration(seconds?: number) {
  const value = Math.max(0, Math.round(seconds ?? 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

function collectiveContributorGrade(id: string) {
  return (id.split("").reduce((sum, character) => sum + character.charCodeAt(0), 0) % 5) + 1;
}

function collectiveAccent(kind: string, isBase = false) {
  if (isBase) return "#a855f7";
  const normalized = kind.toLocaleLowerCase("fr-FR");
  if (/accord|chord/.test(normalized)) return "#E7BD64";
  if (/bass|basse|808|sub/.test(normalized)) return "#ff8a1e";
  if (/drum|kick|perc|hat|clap|snare/.test(normalized)) return "#22e55b";
  if (/guitar|guitare/.test(normalized)) return "#ec4899";
  if (/voix|vocal|acap|a cappella/.test(normalized)) return "#3b82f6";
  if (/fx|ambiance|texture/.test(normalized)) return "#06b6d4";
  return "#a855f7";
}

function collectiveTypeLabel(kind: string, isBase = false) {
  if (isBase) return "BASE";
  const normalized = kind.toLocaleLowerCase("fr-FR");
  if (/accord|chord/.test(normalized)) return "ACCORDS";
  if (/bass|basse|808|sub/.test(normalized)) return "BASSE";
  if (/guitar|guitare/.test(normalized)) return "GUITARE";
  if (/drum|kick|perc|hat|clap|snare/.test(normalized)) return "DRUMS";
  if (/voix|vocal|acap|a cappella/.test(normalized)) return "ACAPELLA";
  if (/fx|ambiance|texture/.test(normalized)) return "AMBIANCE / FX";
  return "MÉLODIE";
}

function demoCollectiveAudio(kind: string) {
  const normalized = kind.toLocaleLowerCase("fr-FR");
  if (/bass|basse|808|sub/.test(normalized)) return "/audio/rooms/wave-demo/bass-808-reseau.mp3";
  if (/drum|kick|perc|hat|clap|snare/.test(normalized)) return "/audio/rooms/wave-demo/drums-groove-foundation.mp3";
  if (/voix|vocal|acap|a cappella/.test(normalized)) return "/audio/rooms/wave-demo/acapella-never-let-go.mp3";
  return "/audio/rooms/wave-demo/melody-night-drive.mp3";
}

export function WaveLaunchSetup({ role, roomId, source, accountId, disabled, execute }: Omit<WaveOrchestraPanelProps, "wave">) {
  const canConfigure = role === "host" || role === "regisseur";
  const fileRef = useRef<HTMLInputElement>(null);
  const [waveTitle, setWaveTitle] = useState("");
  const [baseTitle, setBaseTitle] = useState("");
  const [kind, setKind] = useState("Drums");
  const [format, setFormat] = useState<4 | 8 | 16 | "long">(8);
  const bars = format === "long" ? 8 : format;
  const [bpm, setBpm] = useState(120);
  const [key, setKey] = useState("Sans tonalité");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  const chooseFile = (next: File | null) => {
    if (!next) { setFile(null); return; }
    try {
      validateWaveAudienceFile(next, "base");
      setFile(next);
      setError("");
      if (!baseTitle) setBaseTitle(next.name.replace(/\.[^.]+$/, ""));
    } catch (reason) {
      setFile(null);
      setError(reason instanceof Error && reason.message === "wave_file_size_invalid" ? "La boucle de départ doit peser 64 Mo maximum." : "Utilisez une boucle WAV, MP3, AAC, FLAC ou M4A.");
    }
  };

  const configure = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || !waveTitle.trim() || !baseTitle.trim() || !kind || !key || bpm < 40 || bpm > 260) return;
    setUploading(true);
    setError("");
    try {
      const mimeType = validateWaveAudienceFile(file, "base");
      const durationSeconds = await measureWaveAudio(file);
      if (format !== "long" && Math.abs(durationSeconds - 60 / bpm * 4 * bars) > .1) throw new Error("La durée ne correspond pas aux mesures choisies. Ajuste le tempo ou choisis Son long.");
      const mediaPath = source === "live" ? await uploadWaveAudienceFile({ roomId, accountId, file }) : undefined;
      const mediaUrl = source === "demo" ? URL.createObjectURL(file) : undefined;
      await execute({
        type: "wave.base.configure",
        waveTitle: waveTitle.trim(),
        baseLoop: {
          title: baseTitle.trim(), kind, bars, bpm, key,
          durationSeconds, format: format === "long" ? "long" : "loop",
          fileName: file.name, fileSize: file.size, mimeType, mediaUrl, mediaPath,
        },
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message.replace(/_/g, " ") : "Le Beat collectif n’a pas pu être initialisé.");
    } finally { setUploading(false); }
  };

  return <div className="room-tool-panel wave-collective is-setup">
    <ToolPanelHeader eyebrow="CONDUCTEUR OFFICIEL" title="Beat collectif" description="Verrouille la boucle de départ avant de recevoir les contributions" status="À CONFIGURER" />
    {!canConfigure ? <EmptyState title="Le host prépare le beat">Les pistes collectives apparaîtront dès que la boucle de départ sera verrouillée.</EmptyState> : <form className="wave-collective-setup" onSubmit={configure}>
      <button type="button" className="wave-collective-setup__drop" onClick={() => fileRef.current?.click()}><Upload /><span><small>BOUCLE DE DÉPART DU HOST</small><strong>{file?.name ?? "Importer la première boucle"}</strong><em>WAV, MP3, AAC, FLAC ou M4A · 64 Mo max.</em></span></button>
      <input ref={fileRef} hidden type="file" accept="audio/wav,audio/mpeg,audio/aac,audio/flac,audio/mp4,audio/x-m4a,.wav,.mp3,.aac,.flac,.m4a" onChange={(event) => chooseFile(event.currentTarget.files?.[0] ?? null)} />
      <div className="wave-collective-setup__grid">
        <label>NOM DE LA WAVE<input maxLength={80} value={waveTitle} onChange={(event) => setWaveTitle(event.currentTarget.value)} placeholder="Midnight Metro" /></label>
        <label>NOM DE LA BOUCLE<input maxLength={80} value={baseTitle} onChange={(event) => setBaseTitle(event.currentTarget.value)} placeholder="Base 01" /></label>
        <label>TYPE<MeewavSelect value={kind} onChange={(event) => setKind(event.currentTarget.value)}><option>Drums</option><option>A cappella</option><option>Mélodie</option><option>Basse</option><option>Ambiance</option><option>Autre</option></MeewavSelect></label>
        <label>FORMAT<MeewavSelect value={format} onChange={(event) => setFormat(event.currentTarget.value === "long" ? "long" : Number(event.currentTarget.value) as 4 | 8 | 16)}><option value={4}>4 mesures</option><option value={8}>8 mesures</option><option value={16}>16 mesures</option><option value="long">Son long · durée entière</option></MeewavSelect></label>
        <label>BPM<input type="number" min={40} max={260} value={bpm} onChange={(event) => setBpm(Number(event.currentTarget.value))} /></label>
        <label>TONALITÉ / GAMME<MeewavSelect value={key} onChange={(event) => setKey(event.currentTarget.value)}><option>Sans tonalité</option><option>Do majeur</option><option>Do mineur</option><option>Ré majeur</option><option>Ré mineur</option><option>Mi majeur</option><option>Mi mineur</option><option>Fa majeur</option><option>Fa mineur</option><option>F# mineur</option><option>Sol majeur</option><option>Sol mineur</option><option>La majeur</option><option>La mineur</option><option>Si majeur</option><option>Si mineur</option></MeewavSelect></label>
      </div>
      <p><LockKeyhole /> Cette base, le BPM et la tonalité deviennent la référence verrouillée de toute la Wave.</p>
      {error ? <ToolNotice tone="warning">{error}</ToolNotice> : null}
      <button type="submit" className="is-primary" disabled={disabled || uploading || !file || !waveTitle.trim() || !baseTitle.trim() || !key || bpm < 40 || bpm > 260}><Play />{uploading ? "PRÉPARATION…" : "CRÉER LE BEAT COLLECTIF"}</button>
    </form>}
  </div>;
}

export default function WaveOrchestraPanel(props: WaveOrchestraPanelProps) {
  const transport = useWaveTransport();
  const transportState = useWaveTransportState();
  const {
    wave, role, source, disabled, execute,
    programAudioStatus, privatePreviewUrlsByLayerId = {}, mixerMusicGain, onMixerMusicGain, host,
  } = props;
  const hasControl = role === "host" || role === "regisseur";
  const authoritativeProgramReady = source === "demo" || programAudioStatus === "ready";
  const configured = source === "live"
    ? Boolean(wave.title && wave.baseLoop.title && wave.layers.length)
    : Boolean(wave.title && wave.baseLoop.title && wave.baseLoop.fileName && (wave.baseLoop.mediaUrl || wave.baseLoop.mediaPath));
  const masterInputRef = useRef<HTMLInputElement>(null);
  const collectiveAudioRefs = useRef(new Map<string, HTMLAudioElement>());
  const collectiveAudioRefCallbacks = useRef(new Map<string, (node: HTMLAudioElement | null) => void>());
  const importedMasterUrlRef = useRef<string | null>(null);
  const previousCollectiveVolumeRef = useRef(72);
  const [masterAsset, setMasterAsset] = useState<{ name: string; url: string } | null>(null);
  const [masterError, setMasterError] = useState("");
  const [collectiveVolume, setCollectiveVolume] = useState(72);
  const [demoPlaying, setDemoPlaying] = useState(wave.playing);
  const [layerVolumes, setLayerVolumes] = useState<Record<string, number>>(() => Object.fromEntries(wave.layers.map((layer) => [layer.id, 82])));
  const [replacementLayerId, setReplacementLayerId] = useState<string | null>(null);
  const [selectedLayerId, setSelectedLayerId] = useState("base");
  const [replacementSubmissionId, setReplacementSubmissionId] = useState("");
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const demoMasterUrl = source === "demo" ? "/media/preprofile-demo/hazy-after-hours.mp3" : undefined;
  const masterUrl = masterAsset?.url ?? demoMasterUrl;
  const authoritativeProgramPlaying = authoritativeProgramReady && wave.playing;
  const collectivePlaying = transport ? Boolean(transportState?.playing) : source === "demo" ? demoPlaying : authoritativeProgramPlaying;
  const orderedLayers = useMemo(() => [...wave.layers].sort((left, right) => {
    const leftIsBase = left.id === "base" || !left.submissionId;
    const rightIsBase = right.id === "base" || !right.submissionId;
    return Number(rightIsBase) - Number(leftIsBase);
  }), [wave.layers]);
  const collectiveMixSignature = orderedLayers.map((layer) => `${layer.id}:${layer.active ? 1 : 0}:${layer.solo ? 1 : 0}:${layer.muted ? 1 : 0}`).join("|");
  const layerVolumeSignature = orderedLayers.map((layer) => `${layer.id}:${layerVolumes[layer.id] ?? 82}`).join("|");
  const audibleLayerIds = useMemo(() => {
    const soloLayerIds = new Set(wave.layers.filter((layer) => layer.active && layer.solo && !layer.muted).map((layer) => layer.id));
    return new Set(wave.layers.filter((layer) => layer.active && !layer.muted && (!soloLayerIds.size || soloLayerIds.has(layer.id))).map((layer) => layer.id));
  }, [wave.layers]);
  const replacementCandidates = useMemo(() => wave.submissions.filter((submission) => submission.status === "analysis"
    && submission.rightsConfirmed
    && !submission.vote?.open
    && !wave.layers.some((layer) => layer.submissionId === submission.id)), [wave.layers, wave.submissions]);

  useEffect(() => {
    if (mixerMusicGain === undefined) return;
    setCollectiveVolume(Math.round(Math.max(0, Math.min(1, mixerMusicGain)) * 100));
  }, [mixerMusicGain]);

  useEffect(() => {
    if (source === "demo") setDemoPlaying(wave.playing);
  }, [source, wave.playing]);

  useEffect(() => {
    setLayerVolumes((current) => {
      const next = { ...current };
      let changed = false;
      wave.layers.forEach((layer) => {
        if (next[layer.id] !== undefined) return;
        next[layer.id] = 82;
        changed = true;
      });
      return changed ? next : current;
    });
  }, [wave.layers]);

  useEffect(() => () => {
    if (importedMasterUrlRef.current) URL.revokeObjectURL(importedMasterUrlRef.current);
    collectiveAudioRefs.current.forEach((audio) => audio.pause());
  }, []);

  useEffect(() => {
    if (transport || source !== "demo") return;
    const audios = [...collectiveAudioRefs.current.entries()];
    const leader = audios.find(([layerId]) => audibleLayerIds.has(layerId))?.[1];
    audios.forEach(([layerId, audio]) => {
      const audible = audibleLayerIds.has(layerId);
      audio.volume = audible ? collectiveVolume / 100 * (layerVolumes[layerId] ?? 82) / 100 : 0;
      audio.loop = true;
      if (!collectivePlaying || !audible) {
        audio.pause();
        return;
      }
      if (leader && audio !== leader && Math.abs(audio.currentTime - leader.currentTime) > 0.08) audio.currentTime = leader.currentTime;
      if (audio.paused) {
        const playRequest = audio.play();
        if (playRequest) void playRequest.catch(() => undefined);
      }
    });
  }, [audibleLayerIds, collectiveMixSignature, collectivePlaying, collectiveVolume, layerVolumeSignature, layerVolumes, source]);

  useEffect(() => {
    if (!collectivePlaying) return;
    const update = () => {
      const leader = [...collectiveAudioRefs.current.entries()].find(([layerId]) => audibleLayerIds.has(layerId))?.[1];
      if (!leader || !Number.isFinite(leader.duration) || leader.duration <= 0) return;
      setPlaybackProgress(Math.min(100, leader.currentTime / leader.duration * 100));
    };
    update();
    const interval = window.setInterval(update, 120);
    return () => window.clearInterval(interval);
  }, [audibleLayerIds, collectivePlaying]);

  if (!configured) return <EmptyState title="Aucune boucle de base">La base sera choisie dans le séquenceur de lancement.</EmptyState>;

  const chooseMasterFile = (file?: File) => {
    if (!file) return;
    try {
      validateWaveAudienceFile(file);
      if (importedMasterUrlRef.current) URL.revokeObjectURL(importedMasterUrlRef.current);
      const url = URL.createObjectURL(file);
      importedMasterUrlRef.current = url;
      setMasterAsset({ name: file.name, url });
      setMasterError("");
    } catch (reason) {
      setMasterError(reason instanceof Error && reason.message === "wave_file_size_invalid" ? "Le master doit peser 25 Mo maximum." : "Importez un master WAV, MP3, AAC, FLAC ou M4A.");
    }
  };

  const downloadMaster = () => {
    if (!masterUrl) return;
    const anchor = document.createElement("a");
    anchor.href = masterUrl;
    anchor.download = masterAsset?.name ?? `${wave.title || "beat-final"}.mp3`;
    anchor.click();
  };

  const openReplacement = (layerId: string) => {
    setReplacementLayerId(layerId);
    setReplacementSubmissionId(replacementCandidates[0]?.id ?? "");
  };

  const launchReplacement = async () => {
    if (!replacementLayerId || !replacementSubmissionId) return;
    await execute({ type: "wave.replacement.open", layerId: replacementLayerId, submissionId: replacementSubmissionId, durationSeconds: 30, listeningMode: "beat" });
    setReplacementLayerId(null);
  };

  const seekCollective = (progress: number) => {
    const normalized = Math.max(0, Math.min(100, progress));
    setPlaybackProgress(normalized);
    collectiveAudioRefs.current.forEach((audio) => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) audio.currentTime = audio.duration * normalized / 100;
    });
  };

  const setMusicVolume = (volume: number) => {
    const normalized = Math.max(0, Math.min(100, volume));
    if (normalized > 0) previousCollectiveVolumeRef.current = normalized;
    setCollectiveVolume(normalized);
    onMixerMusicGain?.(normalized / 100);
  };

  const toggleMusicMute = () => {
    setMusicVolume(collectiveVolume > 0 ? 0 : previousCollectiveVolumeRef.current || 72);
  };

  const toggleCollectivePlayback = async () => {
    const playing = !collectivePlaying;
    if (source === "demo") setDemoPlaying(playing);
    try {
      await execute({ type: "wave.sequence.transport", playing });
    } catch {
      if (source === "demo") setDemoPlaying(!playing);
      setMasterError("Le Beat collectif n’a pas pu démarrer. Réessayez.");
    }
  };

  const collectiveAudioRefFor = (layerId: string) => {
    const existing = collectiveAudioRefCallbacks.current.get(layerId);
    if (existing) return existing;
    let attachedAudio: HTMLAudioElement | null = null;
    const callback = (node: HTMLAudioElement | null) => {
      if (node) {
        attachedAudio = node;
        collectiveAudioRefs.current.set(layerId, node);
      }
      else {
        const detachedAudio = attachedAudio;
        attachedAudio = null;
        detachedAudio?.pause();
        if (detachedAudio) detachedAudio.currentTime = 0;
        if (collectiveAudioRefs.current.get(layerId) === detachedAudio) collectiveAudioRefs.current.delete(layerId);
      }
    };
    collectiveAudioRefCallbacks.current.set(layerId, callback);
    return callback;
  };

  const selectedLayer = orderedLayers.find((layer) => layer.id === selectedLayerId) ?? orderedLayers[0];
  const selectedSubmission = wave.submissions.find((item) => item.id === selectedLayer?.submissionId);
  const selectedIsBase = !selectedLayer?.submissionId;
  const selectedMedia = selectedIsBase ? wave.baseLoop : selectedSubmission;
  const { url: selectedDownloadUrl } = useWaveMediaUrl(selectedMedia?.mediaUrl, selectedMedia?.mediaPath);
  const selectedName = selectedIsBase ? host?.displayName ?? "Host" : selectedSubmission?.contributor.name ?? selectedLayer?.author ?? "";
  const selectedAvatar = selectedIsBase ? host?.avatarUrl : selectedSubmission?.contributor.avatarUrl;
  return <div className="room-tool-panel wave-collective is-conductor wave-sas--premium wave-beat--premium">
    <section className="wave-collective__tracks">
      <header className="wave-collective__section-heading">
        <div className="wave-collective__section-title">
          <strong>Pistes validées<CircleCheck /></strong>
          <small>Le mix officiel de la communauté</small>
        </div>
        <b>{wave.layers.length} / 12 pistes</b>
      </header>

      <input ref={masterInputRef} hidden type="file" accept="audio/wav,audio/mpeg,audio/aac,audio/flac,audio/mp4,audio/x-m4a,.wav,.mp3,.aac,.flac,.m4a" onChange={(event) => chooseMasterFile(event.currentTarget.files?.[0])} />

      {source === "live" && !authoritativeProgramReady ? <ToolNotice tone={programAudioStatus === "failed" ? "warning" : undefined}><ShieldCheck /> {programAudioStatus === "failed" ? "Le rendu programme a échoué. Aucun état audio local n’est substitué." : "Le moteur serveur prépare le rendu officiel. Le transport reste verrouillé jusque-là."}</ToolNotice> : null}

      {masterError ? <ToolNotice tone="warning">{masterError}</ToolNotice> : null}

      <div className="wave-collective__track-list">
        {orderedLayers.map((layer) => {
          const submission = layer.submissionId ? wave.submissions.find((item) => item.id === layer.submissionId) : undefined;
          const instrument = submission?.instrument ?? wave.baseLoop.kind;
          const isBase = layer.id === "base" || !layer.submissionId;
          const accent = collectiveAccent(instrument, isBase);
          const typeLabel = collectiveTypeLabel(instrument, isBase);
          const latestVersion = submission?.versions[submission.versions.length - 1];
          const selectedVersion = submission?.versions.find((version) => version.version === layer.submissionVersion) ?? latestVersion;
          const duration = isBase ? wave.baseLoop.durationSeconds : selectedVersion?.durationSeconds;
          const layerMediaUrl = source === "demo"
            ? submission?.mediaUrl ?? (isBase ? wave.baseLoop.mediaUrl : demoCollectiveAudio(instrument))
            : privatePreviewUrlsByLayerId[layer.id];
          const isAudible = audibleLayerIds.has(layer.id);
          const contributorName = isBase ? host?.displayName ?? "BeatKing" : submission?.contributor.name ?? layer.author;
          const contributorId = isBase ? host?.id ?? "wave-host" : submission?.contributor.id ?? layer.author;
          return <WaveLoopCard key={layer.id} accent={accent} avatarUrl={isBase ? host?.avatarUrl ?? "/images/preprofile/portraits/profile-26.webp" : submission?.contributor.avatarUrl ?? "/images/preprofile/portraits/profile-02.webp"} avatarFallback={contributorName.charAt(0)} title={contributorName} grade={<MeewavGradeBadge className="wave-sas-card__grade" level={collectiveContributorGrade(contributorId)} size="lg" variant="icon" labelMode="none" title={`Badge de ${contributorName}`} />} category={typeLabel} meta={`${Math.round(submission?.bpm ?? wave.baseLoop.bpm)} BPM · ${formatDuration(duration)}`} selected={selectedLayer?.id === layer.id} onSelect={() => setSelectedLayerId(layer.id)} playing={collectivePlaying && isAudible} disabled={disabled || !hasControl || !authoritativeProgramReady} stateClassName={`${layer.muted ? "is-muted" : "is-enabled"}${layer.solo ? " is-solo" : ""}`} onPlay={() => {
            if (transport) { transport.engine.setMode("beat"); if (collectivePlaying) transport.pause(); else transport.play(); }
            else void toggleCollectivePlayback();
          }} quickActions={<>
            <button type="button" className={layer.muted ? "is-active" : ""} aria-label={`Muet ${layer.title}`} aria-pressed={layer.muted} title="Muet" disabled={disabled || !hasControl || !authoritativeProgramReady} onClick={() => void execute({ type: "wave.sequence.layer", layerId: layer.id, patch: { muted: !layer.muted } })}><VolumeX /></button>
            <button type="button" className={layer.solo ? "is-active" : ""} aria-label={`Solo ${layer.title}`} aria-pressed={layer.solo} title="Solo" disabled={disabled || !hasControl || !authoritativeProgramReady} onClick={() => void execute({ type: "wave.sequence.layer", layerId: layer.id, patch: { solo: !layer.solo } })}><Headphones /></button>
          </>}>
            {!transport && source === "demo" && layerMediaUrl ? <audio
              hidden
              ref={collectiveAudioRefFor(layer.id)}
              src={layerMediaUrl}
              preload="metadata"
              loop
            /> : null}
          </WaveLoopCard>;
        })}
      </div>
    </section>

    {selectedLayer ? <WaveBottomBar accent={collectiveAccent(selectedSubmission?.instrument ?? wave.baseLoop.kind, selectedIsBase)} avatarUrl={selectedAvatar} avatarFallback={selectedName.charAt(0)} title={selectedName} category={collectiveTypeLabel(selectedSubmission?.instrument ?? wave.baseLoop.kind, selectedIsBase)} label="Commandes de la piste du Beat">
      <button type="button" aria-label={selectedIsBase ? "Télécharger la boucle de base" : `Télécharger ${selectedLayer.title}`} title="Télécharger pour retravailler dans ton logiciel de musique" disabled={disabled || !hasControl || !selectedDownloadUrl} onClick={() => { const anchor = document.createElement("a"); anchor.href = selectedDownloadUrl!; anchor.download = selectedMedia?.fileName ?? `${selectedLayer.title}.wav`; anchor.click(); }}><Download /></button>
      <button type="button" aria-label={`Duel de remplacement pour ${selectedLayer.title}`} disabled={disabled || !hasControl || selectedIsBase || !replacementCandidates.length} onClick={() => openReplacement(selectedLayer.id)}><Swords /></button>
      <button type="button" aria-label={`Muet ${selectedLayer.title}`} aria-pressed={selectedLayer.muted} disabled={disabled || !hasControl || !authoritativeProgramReady} onClick={() => void execute({ type: "wave.sequence.layer", layerId: selectedLayer.id, patch: { muted: !selectedLayer.muted } })}><VolumeX /></button>
      <button type="button" aria-label={`Solo ${selectedLayer.title}`} aria-pressed={selectedLayer.solo} disabled={disabled || !hasControl || !authoritativeProgramReady} onClick={() => void execute({ type: "wave.sequence.layer", layerId: selectedLayer.id, patch: { solo: !selectedLayer.solo } })}><Headphones /></button>
      <label className="wave-beat-volume"><Volume2 /><input type="range" min={0} max={100} value={layerVolumes[selectedLayer.id] ?? 82} aria-label={`Volume ${selectedLayer.title}`} disabled={disabled || !hasControl || !authoritativeProgramReady} onChange={(event) => { const volume = Number(event.currentTarget.value); setLayerVolumes((current) => ({ ...current, [selectedLayer.id]: volume })); transport?.engine.setLayerGain(selectedLayer.submissionId ?? "base", volume / 100); }} /></label>
    </WaveBottomBar> : null}

    {!transport ? <aside className="wave-collective-player" aria-label="Lecteur du Beat collectif">
      <div className="wave-collective-player__hero">
        <span className="wave-collective-player__mark" aria-hidden="true"><i /><i /><i /></span>
        <span className="wave-collective-player__title"><strong>{wave.title}</strong><span><b>MASTER</b><small>{wave.layers.length} pistes · {wave.baseLoop.bpm} BPM</small></span></span>
        <button type="button" className="wave-collective-player__play" aria-label={collectivePlaying ? "Mettre toutes les pistes en pause" : "Lire toutes les pistes actives"} disabled={disabled || !hasControl || !authoritativeProgramReady} onClick={() => void toggleCollectivePlayback()}>{collectivePlaying ? <Pause /> : <Play />}</button>
        <button type="button" className="wave-collective-player__asset" aria-label="Importer" title={masterAsset ? "Remplacer la production" : "Importer la production"} onClick={() => masterInputRef.current?.click()}><Upload /></button>
        <button type="button" className="wave-collective-player__asset" aria-label="Télécharger" title="Télécharger la production" disabled={!masterUrl} onClick={downloadMaster}><Download /></button>
      </div>
      <div className="wave-collective-player__mix">
        <label className="wave-collective-player__progress"><strong>PROGRESS</strong><span><time>{formatDuration((wave.baseLoop.durationSeconds ?? 15) * playbackProgress / 100)}</time><input type="range" min={0} max={100} step="0.1" value={playbackProgress} aria-label="Progression du Beat collectif" onChange={(event) => seekCollective(Number(event.currentTarget.value))} /><time>{formatDuration(wave.baseLoop.durationSeconds ?? 15)}</time></span></label>
        <label className="wave-collective-player__volume"><strong>MUSIQUE VOLUME</strong><span><button type="button" aria-label={collectiveVolume > 0 ? "Couper tout le Beat collectif" : "Rétablir le Beat collectif"} aria-pressed={collectiveVolume === 0} onClick={toggleMusicMute}>{collectiveVolume > 0 ? <Volume2 /> : <VolumeX />}</button><input type="range" min={0} max={100} value={collectiveVolume} aria-label="Volume musique du Beat collectif" onChange={(event) => setMusicVolume(Number(event.currentTarget.value))} /><time>{collectiveVolume}%</time></span></label>
      </div>
    </aside> : <div className="wave-collective__shared-transport-note">Lecture et progression dans le lecteur global. Les pistes restent synchronisées.</div>}

    {replacementLayerId ? <div className="wave-replacement-modal" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="wave-replacement-title">
        <header><span><Swords /><strong id="wave-replacement-title">Duel de remplacement</strong></span><button type="button" aria-label="Fermer" onClick={() => setReplacementLayerId(null)}><X /></button></header>
        <p>Vous êtes sur le point de remettre cette piste en jeu. Choisissez la boucle qui l’affrontera lors du prochain vote public.</p>
        <label>Boucle candidate<MeewavSelect aria-label="Boucle candidate au remplacement" value={replacementSubmissionId} onChange={(event) => setReplacementSubmissionId(event.currentTarget.value)}>{replacementCandidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.contributor.name} · {candidate.instrument} · {candidate.bpm} BPM</option>)}</MeewavSelect></label>
        <footer><button type="button" onClick={() => setReplacementLayerId(null)}>Annuler</button><button type="button" className="is-primary" disabled={!replacementSubmissionId} onClick={() => void launchReplacement()}><Swords />Soumettre au vote</button></footer>
      </section>
    </div> : null}

    <footer className="wave-collective__footer">
      <details><summary><Link2 />Crédits · {wave.layers.length}</summary><ul>{wave.layers.map((layer) => <li key={layer.id}><span>{layer.title}</span><small>{layer.author}</small></li>)}</ul></details>
      <details><summary><History />Historique</summary><ul>{wave.history.slice(0, 8).map((entry) => <li key={entry}><span>{entry}</span></li>)}</ul></details>
      <span><ShieldCheck />Originaux privés</span>
    </footer>
  </div>;
}
