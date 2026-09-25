import { Eye, FileAudio, FileImage, FileVideo, FolderOpen, Headphones, Image as ImageIcon, LockKeyhole, Pause, Play, Radio, RotateCcw, Rocket, Square, Trash2, Upload, Video, Volume2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { decodeAudioWaveform, dequantizeWaveformPeaks, quantizeWaveformPeaks, type WaveformPeak } from "../audio/previewWaveform";
import { removeLogePreviewMedia, requestLogePreviewMediaUrl, uploadLogePreviewMedia, validateLogePreviewMediaFile } from "../audio/logePreviewMedia.service";
import { normalizeLogePreviewTransport } from "../roomTools.service";
import type { LogeState, RoomToolsCommand } from "../roomTools.types";
import { ToolNotice } from "./RoomToolPanelPrimitives";
import "./loge-preview-live.css";

const DEMO_MEDIA_URL = "/media/preprofile-demo/hazy-after-hours.mp3";
const DEMO_MEDIA_NAME = "eclipse-premix-v7.wav";
type MediaKind = "audio" | "video" | "image";
const MEDIA_ACCEPT: Record<MediaKind, string> = {
  audio: "audio/*",
  video: "video/mp4,video/webm",
  image: "image/jpeg,image/png,image/webp",
};
const ALL_MEDIA_ACCEPT = Object.values(MEDIA_ACCEPT).join(",");
type SessionMedia = { file: File; mediaName: string; mediaPath: string | null; mediaKind: MediaKind };
const SESSION_MEDIA = new Map<string, SessionMedia>();

function mediaKindFor(name: string, stored?: MediaKind): MediaKind {
  if (stored) return stored;
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "mp4" || extension === "webm") return "video";
  if (["jpg", "jpeg", "png", "webp"].includes(extension ?? "")) return "image";
  return "audio";
}

function formatTime(value: number) {
  const safe = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function reducePeaks(peaks: readonly WaveformPeak[], count = 128) {
  if (peaks.length <= count) return [...peaks];
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor(index * peaks.length / count);
    const end = Math.max(start + 1, Math.floor((index + 1) * peaks.length / count));
    let min = 0;
    let max = 0;
    for (let cursor = start; cursor < end; cursor += 1) {
      min = Math.min(min, peaks[cursor]?.min ?? 0);
      max = Math.max(max, peaks[cursor]?.max ?? 0);
    }
    return { min, max };
  });
}

function MediaIcon({ kind }: { kind: MediaKind }) {
  if (kind === "video") return <FileVideo />;
  if (kind === "image") return <FileImage />;
  return <FileAudio />;
}

export default function LogePreviewPanel({ roomId, source, loge, disabled, execute }: {
  roomId: string;
  source: "demo" | "live";
  loge: LogeState;
  disabled: boolean;
  execute: (command: RoomToolsCommand) => Promise<unknown>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const requestGenerationRef = useRef(0);
  const signedUrlTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaReady, setMediaReady] = useState(false);
  const [privatePreview, setPrivatePreview] = useState(false);
  const [localPlaying, setLocalPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(loge.preview.durationSeconds ?? 0);
  const [volume, setVolume] = useState(loge.preview.volume ?? .85);
  const [peaks, setPeaks] = useState<WaveformPeak[]>(() => dequantizeWaveformPeaks(loge.preview.waveformPeaks));
  const [busyMedia, setBusyMedia] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transport = normalizeLogePreviewTransport(loge.preview);
  const kind = mediaKindFor(loge.preview.mediaName, loge.preview.mediaKind);
  const hasMedia = Boolean(loge.preview.mediaName.trim());
  const isLive = transport.transportStatus === "playing" || transport.transportStatus === "paused";
  const isPlayingLive = transport.transportStatus === "playing";
  const isFinished = transport.transportStatus === "finished";
  const ready = hasMedia && !busyMedia && (kind === "image" || mediaReady || Boolean(mediaUrl) || Boolean(loge.preview.mediaPath));
  const expectedMedia = useMemo(() => ({ mediaName: loge.preview.mediaName, mediaPath: loge.preview.mediaPath }), [loge.preview.mediaName, loge.preview.mediaPath]);
  const progress = duration > 0 ? Math.min(100, Math.max(0, currentTime / duration * 100)) : 0;
  const displayPeaks = useMemo(() => reducePeaks(peaks), [peaks]);

  const clearObjectUrl = useCallback(() => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }, []);

  const clearSignedUrlTimer = useCallback(() => {
    if (signedUrlTimerRef.current) clearTimeout(signedUrlTimerRef.current);
    signedUrlTimerRef.current = null;
  }, []);

  const clearResolvedSignedMedia = useCallback(() => {
    requestGenerationRef.current += 1;
    clearSignedUrlTimer();
    const media = mediaRef.current;
    if (media) {
      media.pause();
      media.removeAttribute("src");
      media.load();
    }
    setMediaUrl("");
    setPrivatePreview(false);
    setLocalPlaying(false);
  }, [clearSignedUrlTimer]);

  useEffect(() => () => {
    clearObjectUrl();
    clearSignedUrlTimer();
  }, [clearObjectUrl, clearSignedUrlTimer]);
  useEffect(() => {
    requestGenerationRef.current += 1;
    clearSignedUrlTimer();
    mediaRef.current?.pause();
    setLocalPlaying(false);
    setPrivatePreview(false);
    setCurrentTime(0);
    setMediaReady(false);
    setError(null);
    clearObjectUrl();
    setMediaUrl("");
    if (!hasMedia) return;
    const session = SESSION_MEDIA.get(roomId);
    if (session && session.mediaName === loge.preview.mediaName && session.mediaPath === loge.preview.mediaPath) {
      const url = URL.createObjectURL(session.file);
      objectUrlRef.current = url;
      setMediaUrl(url);
      setMediaReady(session.mediaKind === "image");
      if (source === "live") SESSION_MEDIA.delete(roomId);
    } else if (source === "demo" && loge.preview.mediaName === DEMO_MEDIA_NAME && loge.preview.mediaPath === null) {
      setMediaUrl(DEMO_MEDIA_URL);
    }
  }, [clearObjectUrl, clearSignedUrlTimer, hasMedia, loge.preview.mediaName, loge.preview.mediaPath, roomId, source]);

  useEffect(() => {
    setDuration(loge.preview.durationSeconds ?? 0);
    setPeaks(dequantizeWaveformPeaks(loge.preview.waveformPeaks));
  }, [loge.preview.durationSeconds, loge.preview.mediaName, loge.preview.mediaPath, loge.preview.waveformPeaks]);

  useEffect(() => {
    const nextVolume = Math.max(0, Math.min(1, loge.preview.volume ?? .85));
    setVolume(nextVolume);
    if (mediaRef.current) mediaRef.current.volume = nextVolume;
  }, [loge.preview.volume]);

  const resolveMediaUrl = async () => {
    if (mediaUrl) return mediaUrl;
    if (source === "demo" && loge.preview.mediaName === DEMO_MEDIA_NAME) {
      setMediaUrl(DEMO_MEDIA_URL);
      return DEMO_MEDIA_URL;
    }
    if (source !== "live" || !loge.preview.mediaPath) return "";
    const generation = requestGenerationRef.current;
    const access = await requestLogePreviewMediaUrl(roomId);
    if (generation !== requestGenerationRef.current) return "";
    setMediaUrl(access.signedUrl);
    clearSignedUrlTimer();
    const expiresIn = Math.max(0, Date.parse(access.expiresAt) - Date.now());
    signedUrlTimerRef.current = setTimeout(() => {
      if (generation !== requestGenerationRef.current) return;
      clearResolvedSignedMedia();
    }, Math.min(expiresIn, 2_147_483_647));
    return access.signedUrl;
  };

  const importMedia = async (file: File) => {
    const previous = expectedMedia;
    let uploadedPath: string | null = null;
    setBusyMedia(true);
    setError(null);
    mediaRef.current?.pause();
    try {
      const contract = validateLogePreviewMediaFile(file);
      const analysis = contract.kind === "audio" ? await file.arrayBuffer().then((data) => decodeAudioWaveform(data, 512)) : null;
      uploadedPath = source === "live" ? await uploadLogePreviewMedia({ roomId, file }) : null;
      await execute({ type: "loge.preview.patch", expectedMedia: previous, patch: {
        mediaName: file.name,
        mediaPath: uploadedPath,
        mediaKind: contract.kind,
        replayIncluded: false,
        liveOnly: true,
        expiresAt: null,
        durationSeconds: analysis?.durationSeconds ?? null,
        channels: analysis?.channels ?? null,
        sampleRate: analysis?.sampleRate ?? null,
        waveformPeaks: analysis ? quantizeWaveformPeaks(analysis.peaks) : [],
      } });
      SESSION_MEDIA.set(roomId, { file, mediaName: file.name, mediaPath: uploadedPath, mediaKind: contract.kind });
      clearObjectUrl();
      const objectUrl = URL.createObjectURL(file);
      objectUrlRef.current = objectUrl;
      setMediaUrl(objectUrl);
      setMediaReady(contract.kind === "image");
      setPrivatePreview(false);
      setPeaks(analysis?.peaks ? [...analysis.peaks] : []);
      setDuration(analysis?.durationSeconds ?? 0);
      if (source === "live" && previous.mediaPath && previous.mediaPath !== uploadedPath) void removeLogePreviewMedia(previous.mediaPath).catch(() => undefined);
    } catch {
      if (uploadedPath) void removeLogePreviewMedia(uploadedPath).catch(() => undefined);
      setError("Ce contenu n’a pas pu être préparé pour La Loge.");
    } finally {
      setBusyMedia(false);
    }
  };

  const removeMedia = async () => {
    const previous = expectedMedia;
    setBusyMedia(true);
    try {
      if (isLive && transport.sessionId) await execute({ type: "loge.preview.stop", expectedMedia, sessionId: transport.sessionId });
      await execute({ type: "loge.preview.patch", expectedMedia, patch: { mediaName: "", mediaPath: null, mediaKind: undefined } });
      mediaRef.current?.pause();
      clearObjectUrl();
      setMediaUrl("");
      setPeaks([]);
      setDuration(0);
      setCurrentTime(0);
      setPrivatePreview(false);
      if (source === "live" && previous.mediaPath) void removeLogePreviewMedia(previous.mediaPath).catch(() => undefined);
    } catch {
      setError("Le contenu n’a pas pu être retiré.");
    } finally {
      setBusyMedia(false);
    }
  };

  const openPrivatePreview = async () => {
    setError(null);
    try {
      const url = await resolveMediaUrl();
      if (!url) throw new Error("media_missing");
      setPrivatePreview(true);
      if (kind !== "image") requestAnimationFrame(() => {
        const element = mediaRef.current;
        if (!element) return;
        element.src = url;
        element.volume = volume;
        void element.play().then(() => setLocalPlaying(true)).catch(() => setLocalPlaying(false));
      });
    } catch {
      setError("La prévisualisation privée n’est pas disponible.");
    }
  };

  const launch = async () => {
    if (!ready) return;
    setError(null);
    try {
      const url = await resolveMediaUrl();
      if (!url) throw new Error("media_missing");
      const sessionId = `preview:${crypto.randomUUID()}`;
      setPrivatePreview(true);
      setCurrentTime(0);
      await execute({ type: "loge.preview.launch", expectedMedia, sessionId, positionSeconds: 0, volume });
      if (kind !== "image") {
        const element = mediaRef.current;
        if (element) {
          try {
            element.src = url;
            element.currentTime = 0;
            element.volume = volume;
            void element.play().then(() => setLocalPlaying(true)).catch(() => setLocalPlaying(false));
          } catch {
            setLocalPlaying(false);
          }
        }
      }
    } catch {
      mediaRef.current?.pause();
      setLocalPlaying(false);
      setError("Le lancement dans La Loge a échoué.");
    }
  };

  const pauseOrResume = async () => {
    if (!transport.sessionId) return;
    try {
      if (isPlayingLive) {
        await execute({ type: "loge.preview.pause", expectedMedia, sessionId: transport.sessionId });
        mediaRef.current?.pause();
        setLocalPlaying(false);
      } else {
        await execute({ type: "loge.preview.resume", expectedMedia, sessionId: transport.sessionId });
        void mediaRef.current?.play().then(() => setLocalPlaying(kind !== "image")).catch(() => setLocalPlaying(false));
      }
    } catch {
      setError("La commande n’a pas pu être synchronisée.");
    }
  };

  const restart = async () => {
    if (!transport.sessionId) return;
    try {
      await execute({ type: "loge.preview.restart", expectedMedia, sessionId: transport.sessionId });
    } catch {
      setError("Le retour au début a échoué.");
      return;
    }
    if (mediaRef.current) mediaRef.current.currentTime = 0;
    setCurrentTime(0);
  };

  const stop = async () => {
    if (!transport.sessionId) return;
    try {
      await execute({ type: "loge.preview.stop", expectedMedia, sessionId: transport.sessionId });
    } catch {
      setError("L’arrêt n’a pas pu être synchronisé.");
      return;
    }
    mediaRef.current?.pause();
    if (mediaRef.current) mediaRef.current.currentTime = 0;
    setCurrentTime(0);
    setLocalPlaying(false);
  };

  const changeVolume = (next: number) => {
    const safe = Math.max(0, Math.min(1, next));
    setVolume(safe);
    if (mediaRef.current) mediaRef.current.volume = safe;
    if (transport.sessionId && isLive) void execute({ type: "loge.preview.volume", expectedMedia, sessionId: transport.sessionId, volume: safe }).catch(() => undefined);
  };

  const seek = (next: number) => {
    if (!mediaRef.current || isLive) return;
    mediaRef.current.currentTime = next;
    setCurrentTime(next);
  };

  const openMediaPicker = (nextKind?: MediaKind) => {
    const input = inputRef.current;
    if (!input) return;
    input.accept = nextKind ? MEDIA_ACCEPT[nextKind] : ALL_MEDIA_ACCEPT;
    input.click();
  };

  const status = isLive ? (isPlayingLive ? "En diffusion" : "En pause") : isFinished ? "Avant-première terminée" : busyMedia ? "Préparation…" : ready ? "Prêt à lancer" : "Aucun contenu";
  const statusClass = isLive ? "is-live" : ready ? "is-ready" : "is-empty";
  const extension = loge.preview.mediaName.split(".").pop()?.toUpperCase() ?? "";

  return <div className="room-tool-panel is-loge-preview loge-preview-live">
    <header className="loge-preview-live__heading"><span><strong>Avant-première</strong><small>Fais découvrir un contenu à ta Loge avant tout le monde.</small></span><b className={statusClass}><i />{status}</b></header>
    {!loge.legendaryHost ? <ToolNotice tone="warning">Seul un profil légendaire peut lancer une avant-première.</ToolNotice> : null}
    <section className="loge-preview-live__workspace">
      <ol className="loge-preview-live__steps" aria-label="Parcours Avant-première">
        <li className={hasMedia ? "is-done" : "is-active"}><b>1</b><span>Choisis un contenu</span></li>
        <li className={privatePreview ? "is-done" : hasMedia ? "is-active" : ""}><b>2</b><span>Prévisualise en privé</span></li>
        <li className={isLive ? "is-active" : ""}><b>3</b><span>Lance dans La Loge</span></li>
      </ol>
      <div className="loge-preview-live__content">
        <aside className="loge-preview-live__selection"><small>CONTENU SÉLECTIONNÉ</small>
          <div className="loge-preview-live__kind-tabs">
            <button type="button" className={kind === "audio" && hasMedia ? "is-active" : ""} disabled={disabled || busyMedia} onClick={() => openMediaPicker("audio")}><Headphones />Audio</button>
            <button type="button" className={kind === "video" && hasMedia ? "is-active" : ""} disabled={disabled || busyMedia} onClick={() => openMediaPicker("video")}><Video />Vidéo</button>
            <button type="button" className={kind === "image" && hasMedia ? "is-active" : ""} disabled={disabled || busyMedia} onClick={() => openMediaPicker("image")}><ImageIcon />Image</button>
          </div>
          <div className={`loge-preview-live__file${hasMedia ? " has-media" : " is-empty"}`}><i>{hasMedia ? <MediaIcon kind={kind} /> : <Upload />}</i><span><strong>{loge.preview.mediaName || "Choisis un contenu exclusif"}</strong><small>{hasMedia ? "Visible uniquement pour les membres de La Loge" : "Audio, vidéo ou image · 25 Mo max"}</small>{hasMedia ? <em>{extension}{duration > 0 ? ` · ${formatTime(duration)}` : ""} · Privé</em> : null}</span></div>
          <div className="loge-preview-live__file-actions"><button type="button" disabled={disabled || busyMedia} onClick={() => openMediaPicker()}><Upload />{hasMedia ? "Remplacer" : "Ajouter"}</button><button type="button" disabled={disabled || busyMedia} onClick={() => openMediaPicker()}><FolderOpen />Mes médias</button></div>
        </aside>
        <div className="loge-preview-live__private"><small><LockKeyhole /> PRÉVISUALISATION PRIVÉE</small>
          <div className={`loge-preview-live__stage is-${kind}${privatePreview ? " is-open" : ""}`}>
            {!hasMedia ? <div className="loge-preview-live__empty"><Eye /><strong>Ton contenu apparaîtra ici</strong><span>La prévisualisation reste privée.</span></div> : kind === "image" ? <>{privatePreview && mediaUrl ? <img src={mediaUrl} alt={`Prévisualisation de ${loge.preview.mediaName}`} onError={() => { if (source === "live" && !objectUrlRef.current) clearResolvedSignedMedia(); }} /> : null}<button type="button" className="loge-preview-live__big-play" aria-label="Afficher la prévisualisation privée" onClick={() => void openPrivatePreview()}><Eye /></button></> : kind === "video" ? <><video ref={(node) => { mediaRef.current = node; }} src={privatePreview ? mediaUrl : undefined} playsInline preload="metadata" onLoadedMetadata={(event) => { setDuration(event.currentTarget.duration); setMediaReady(true); if (Math.abs((loge.preview.durationSeconds ?? 0) - event.currentTarget.duration) > .05) void execute({ type: "loge.preview.patch", expectedMedia, patch: { durationSeconds: event.currentTarget.duration } }); }} onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} onPlay={() => setLocalPlaying(true)} onPause={() => setLocalPlaying(false)} onError={() => { if (source === "live" && !objectUrlRef.current) clearResolvedSignedMedia(); }} onEnded={() => { setLocalPlaying(false); if (transport.sessionId && isLive) void execute({ type: "loge.preview.finish", expectedMedia, sessionId: transport.sessionId }); }} />{!privatePreview || !localPlaying ? <button type="button" className="loge-preview-live__big-play" aria-label="Lire la prévisualisation privée" onClick={() => void openPrivatePreview()}><Play /></button> : null}</> : <><audio ref={(node) => { mediaRef.current = node; }} src={privatePreview ? mediaUrl : undefined} preload="metadata" onLoadedMetadata={(event) => { setDuration(event.currentTarget.duration); setMediaReady(true); }} onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} onPlay={() => setLocalPlaying(true)} onPause={() => setLocalPlaying(false)} onError={() => { if (source === "live" && !objectUrlRef.current) clearResolvedSignedMedia(); }} onEnded={() => { setLocalPlaying(false); if (transport.sessionId && isLive) void execute({ type: "loge.preview.finish", expectedMedia, sessionId: transport.sessionId }); }} /><div className="loge-preview-live__audio-visual"><Headphones /><Waveform peaks={displayPeaks} progress={progress} /></div><button type="button" className="loge-preview-live__big-play" aria-label={localPlaying ? "Mettre la prévisualisation privée en pause" : "Lire la prévisualisation privée"} onClick={() => localPlaying ? mediaRef.current?.pause() : void openPrivatePreview()}>{localPlaying ? <Pause /> : <Play />}</button></>}
            {kind !== "image" && hasMedia ? <div className="loge-preview-live__timeline"><input type="range" min="0" max={duration || 0} step=".01" value={Math.min(currentTime, duration || 0)} disabled={isLive || duration <= 0} aria-label="Position de prévisualisation" style={{ background: `linear-gradient(90deg,#a957ff 0 ${progress}%,#4b4d5b ${progress}% 100%)` }} onChange={(event) => seek(Number(event.currentTarget.value))} /><span><time>{formatTime(currentTime)}</time><b>{formatTime(duration)}</b></span></div> : null}
          </div>
        </div>
      </div>
      {isLive ? <div className="loge-preview-live__controls"><button type="button" className="is-primary" disabled={disabled} onClick={() => void pauseOrResume()}>{isPlayingLive ? <Pause /> : <Play />}{isPlayingLive ? "Pause" : "Reprendre"}</button><button type="button" disabled={disabled} onClick={() => void restart()}><RotateCcw />Revenir au début</button><label><Volume2 /><span>Volume</span><input type="range" min="0" max="1" step=".01" value={volume} onChange={(event) => changeVolume(Number(event.currentTarget.value))} /><output>{Math.round(volume * 100)} %</output></label><button type="button" className="is-danger" disabled={disabled} onClick={() => void stop()}><Square />Arrêter</button></div> : <div className="loge-preview-live__launch"><button type="button" disabled={disabled || !hasMedia} onClick={() => void openPrivatePreview()}><Eye />Prévisualiser</button><button type="button" className="is-primary" disabled={disabled || !ready} onClick={() => void launch()}><Rocket />{isFinished ? "Relancer dans La Loge" : "Lancer dans La Loge"}</button><button type="button" disabled={disabled || !hasMedia} onClick={() => void removeMedia()}><Trash2 />Retirer</button></div>}
    </section>
    <section className="loge-preview-live__explain"><span><Upload /><b>Ajoute un contenu</b><small>Choisis un audio, une vidéo ou une image.</small></span><span><Eye /><b>Prévisualise en privé</b><small>Regarde ton contenu en avant-première.</small></span><span><Radio /><b>Diffuse-le à ta Loge</b><small>Lance le live en exclusivité.</small></span></section>
    <p className="loge-preview-live__privacy"><LockKeyhole /> Ton contenu est diffusé en exclusivité aux membres de La Loge.</p>
    {error ? <ToolNotice tone="warning">{error}</ToolNotice> : null}
    <input ref={inputRef} type="file" hidden accept={ALL_MEDIA_ACCEPT} onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void importMedia(file); event.currentTarget.value = ""; }} />
  </div>;
}

function Waveform({ peaks, progress }: { peaks: readonly WaveformPeak[]; progress: number }) {
  if (!peaks.length) return <span className="loge-preview-live__wave-empty">ANALYSE DE LA FORME D’ONDE</span>;
  return <svg className="loge-preview-live__wave" viewBox="0 0 192 56" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="loge-live-wave-played" gradientUnits="userSpaceOnUse" x1="0" x2="192"><stop stopColor="#d86cff" /><stop offset=".48" stopColor="#9147ff" /><stop offset="1" stopColor="#4c80ff" /></linearGradient></defs>{peaks.map((peak, index) => { const x = peaks.length === 1 ? 96 : 1.5 + index * 189 / (peaks.length - 1); const played = progress > 0 && index / peaks.length < progress / 100; return <line key={index} className={played ? "is-played" : "is-pending"} x1={x} x2={x} y1={28 - peak.max * 23} y2={28 - peak.min * 23} />; })}</svg>;
}
