import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { CameraOff, Ellipsis, Radio, WifiOff } from "lucide-react";
import { meewavMediaSession } from "../../scene/mediaSession/mediaSessionCoordinator";
import type { PlaceLiveKitVideoTrack } from "./placeLiveKit.service";
import { writePlaceGuestDrag } from "./placeGuestDrag";
import {
  classifyStageAspectRatio,
  isValidSafeVideoRegion,
  resolveParticipantSource,
  resolveParticipantSources,
  type PlaceParticipantVideoSource,
  type PlaceStageAspectRatio,
  type PlaceStageParticipant,
  type PlaceVideoSourceAudience,
  type SafeVideoRegion,
} from "./placeStageLayoutEngine";

type PlaceStageLayoutTileProps = {
  participant: PlaceStageParticipant;
  sourceId?: string;
  aspectRatio?: PlaceStageAspectRatio;
  formatIndex?: number;
  primary: boolean;
  selected: boolean;
  program: boolean;
  preview: boolean;
  director: boolean;
  canDirectProgram: boolean;
  programMutationPending: boolean;
  muted: boolean;
  playbackVolume?: number;
  renderAudience: PlaceVideoSourceAudience;
  selectionAudience: PlaceVideoSourceAudience;
  cameraEnabledOverride?: boolean;
  liveKitVideoTrack?: PlaceLiveKitVideoTrack;
  /** Read-only feed used inside a room-specific broadcast composition. */
  presentationOnly?: boolean;
  framing?: {
    enabled: boolean;
    locked: boolean;
    maxZoom: number;
    sourceId?: string;
    safeRegion?: SafeVideoRegion;
  };
  onSelect: (participantId: string) => void;
  onPutOnAir: (participantId: string) => void;
  onOpenSolo: (participantId: string) => void;
  onOpenProfile: (profileId: string) => void;
  onSourceChange: (participantId: string, sourceId: string) => void;
  onAspectRatio: (participantId: string, sourceId: string, ratio: PlaceStageAspectRatio) => void;
  dragRoomId?: string;
};

type MediaDimensions = {
  width: number;
  height: number;
};

type SourceMediaDimensions = MediaDimensions & {
  sourceId: string;
};

type SmartFrameStyle = CSSProperties & {
  "--place-smart-zoom": string;
  "--place-smart-translate-x": string;
  "--place-smart-translate-y": string;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Maps source-normalized safe-region coordinates into the actual media
 * rectangle produced by object-fit: contain. The returned translation keeps
 * the complete safe region visible and never exposes more matte than the
 * original contain result. No geometry means no transform.
 */
function resolveSmartFrameStyle({
  safeRegion,
  frame,
  media,
  maxZoom,
}: {
  safeRegion: SafeVideoRegion | undefined;
  frame: MediaDimensions | undefined;
  media: MediaDimensions | undefined;
  maxZoom: number | undefined;
}): SmartFrameStyle | undefined {
  if (!isValidSafeVideoRegion(safeRegion) || safeRegion.confidence < 0.65 || !frame || !media) {
    return undefined;
  }
  if (!Number.isFinite(frame.width)
    || !Number.isFinite(frame.height)
    || !Number.isFinite(media.width)
    || !Number.isFinite(media.height)
    || maxZoom === undefined
    || !Number.isFinite(maxZoom)) {
    return undefined;
  }
  if (frame.width <= 0 || frame.height <= 0 || media.width <= 0 || media.height <= 0) {
    return undefined;
  }

  const zoom = clamp(maxZoom ?? 1, 1, 1.18);
  if (zoom <= 1) return undefined;

  const containScale = Math.min(frame.width / media.width, frame.height / media.height);
  const renderedWidth = media.width * containScale;
  const renderedHeight = media.height * containScale;
  const mediaLeft = (frame.width - renderedWidth) / 2;
  const mediaTop = (frame.height - renderedHeight) / 2;
  const safeLeft = mediaLeft + safeRegion.x * renderedWidth;
  const safeTop = mediaTop + safeRegion.y * renderedHeight;
  const safeRight = safeLeft + safeRegion.width * renderedWidth;
  const safeBottom = safeTop + safeRegion.height * renderedHeight;
  const safeCenterX = (safeLeft + safeRight) / 2;
  const safeCenterY = (safeTop + safeBottom) / 2;

  const contentXBounds = [
    -zoom * mediaLeft,
    frame.width - zoom * (mediaLeft + renderedWidth),
  ];
  const contentYBounds = [
    -zoom * mediaTop,
    frame.height - zoom * (mediaTop + renderedHeight),
  ];
  const minimumX = Math.max(Math.min(...contentXBounds), -zoom * safeLeft);
  const maximumX = Math.min(Math.max(...contentXBounds), frame.width - zoom * safeRight);
  const minimumY = Math.max(Math.min(...contentYBounds), -zoom * safeTop);
  const maximumY = Math.min(Math.max(...contentYBounds), frame.height - zoom * safeBottom);
  if (minimumX > maximumX || minimumY > maximumY) return undefined;

  const translateX = clamp(frame.width / 2 - zoom * safeCenterX, minimumX, maximumX);
  const translateY = clamp(frame.height / 2 - zoom * safeCenterY, minimumY, maximumY);
  return {
    "--place-smart-zoom": String(zoom),
    "--place-smart-translate-x": `${translateX.toFixed(3)}px`,
    "--place-smart-translate-y": `${translateY.toFixed(3)}px`,
  };
}

function NativeMedia({
  source,
  participant,
  muted,
  primary,
  playbackVolume,
  onAspectRatio,
  framing,
  liveKitVideoTrack,
}: {
  source: PlaceParticipantVideoSource;
  participant: PlaceStageParticipant;
  muted: boolean;
  primary: boolean;
  playbackVolume: number;
  onAspectRatio: (ratio: PlaceStageAspectRatio) => void;
  framing?: {
    enabled: boolean;
    locked: boolean;
    maxZoom: number;
    sourceId?: string;
    safeRegion?: SafeVideoRegion;
  };
  liveKitVideoTrack?: PlaceLiveKitVideoTrack;
}) {
  const mediaFrameRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [frameDimensions, setFrameDimensions] = useState<MediaDimensions>();
  const [mediaDimensions, setMediaDimensions] = useState<SourceMediaDimensions>();
  const videoUrl = source.videoUrl;
  // The profile portrait belongs to the compact profile control, never to the
  // video surface. A missing/failed feed gets a neutral media state instead.
  const poster = source.imageUrl === participant.profile.avatarUrl ? undefined : source.imageUrl;
  const isHls = videoUrl?.includes(".m3u8") === true;
  const hasLiveKitVideo = Boolean(liveKitVideoTrack && !liveKitVideoTrack.muted);
  const currentMediaDimensions = mediaDimensions?.sourceId === source.id ? mediaDimensions : undefined;
  const persistedLockedSafeRegion = framing?.locked
    && framing.sourceId === source.id
    && isValidSafeVideoRegion(framing.safeRegion)
    ? framing.safeRegion
    : undefined;
  // A PROGRAM lock is source-specific. A viewer-selected source or a fallback
  // publication must never invent a client-local replacement framing.
  const effectiveSafeRegion = framing?.locked ? persistedLockedSafeRegion : source.safeRegion;
  const smartFrameStyle = useMemo(() => framing?.enabled && !(failed && videoUrl)
    ? resolveSmartFrameStyle({
        safeRegion: effectiveSafeRegion,
        frame: frameDimensions,
        media: currentMediaDimensions,
        maxZoom: framing.maxZoom,
      })
    : undefined, [currentMediaDimensions, effectiveSafeRegion, failed, frameDimensions, framing?.enabled, framing?.maxZoom, videoUrl]);
  const smartFramingActive = Boolean(smartFrameStyle);

  useEffect(() => {
    setFailed(false);
    setMediaDimensions(undefined);
  }, [source.id, videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    const item = liveKitVideoTrack;
    if (!video || !item || item.muted) return;
    item.track.attach(video);
    video.muted = true;
    void video.play().catch(() => undefined);
    return () => {
      item.track.detach(video);
      video.srcObject = null;
    };
  }, [liveKitVideoTrack]);

  useEffect(() => {
    const frame = mediaFrameRef.current;
    if (!frame) return;
    const measure = () => {
      const bounds = frame.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      setFrameDimensions((current) => current?.width === bounds.width && current.height === bounds.height
        ? current
        : { width: bounds.width, height: bounds.height });
    };
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measure);
      observer.observe(frame);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl || hasLiveKitVideo) return;
    let disposed = false;
    let destroyHls: (() => void) | undefined;
    const start = () => void video.play().catch(() => undefined);

    if (isHls && !video.canPlayType("application/vnd.apple.mpegurl")) {
      void import("hls.js").then(({ default: Hls }) => {
        if (disposed || !Hls.isSupported()) return;
        const hls = new Hls({ enableWorker: true, lowLatencyMode: true, backBufferLength: 30 });
        destroyHls = () => hls.destroy();
        hls.loadSource(videoUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, start);
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) setFailed(true);
        });
      });
    } else {
      if (isHls) video.src = videoUrl;
      start();
    }

    return () => {
      disposed = true;
      destroyHls?.();
    };
  }, [hasLiveKitVideo, isHls, videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || (!videoUrl && !hasLiveKitVideo)) return;
    const resumeMutedReturn = () => {
      if (document.visibilityState !== "visible" || !video.muted || !video.paused || video.ended) return;
      void video.play().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", resumeMutedReturn);
    window.addEventListener("focus", resumeMutedReturn);
    return () => {
      document.removeEventListener("visibilitychange", resumeMutedReturn);
      window.removeEventListener("focus", resumeMutedReturn);
    };
  }, [hasLiveKitVideo, videoUrl]);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = muted;
    videoRef.current.volume = Math.min(1, Math.max(0, playbackVolume));
  }, [muted, playbackVolume]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || muted || !videoUrl || hasLiveKitVideo) return;
    void video.play().catch(() => undefined);
    const lease = meewavMediaSession.claim({
      source: "room",
      id: `place-room-${participant.id}`,
      mediaId: videoUrl,
      label: participant.profile.displayName,
      pause: () => video.pause(),
    });
    return () => {
      lease.release({ pause: false, reason: "route_change" });
    };
  }, [hasLiveKitVideo, muted, participant.id, participant.profile.displayName, videoUrl]);

  const reportMediaDimensions = (width: number, height: number) => {
    const ratio = classifyStageAspectRatio(width, height);
    if (!ratio) return;
    setMediaDimensions((current) => current?.sourceId === source.id && current.width === width && current.height === height
      ? current
      : { sourceId: source.id, width, height });
    onAspectRatio(ratio);
  };

  return (
    <div
      ref={mediaFrameRef}
      className={`place-camera__media-frame${smartFramingActive ? " is-smart-framed" : ""}`}
      style={smartFrameStyle}
    >
      {!hasLiveKitVideo && (!videoUrl || failed) ? poster ? (
        <img
          className="place-camera__media"
          src={poster}
          alt=""
          onLoad={(event) => reportMediaDimensions(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
        />
      ) : (
        <div className="place-camera__media-unavailable" role="img" aria-label={`Vidéo de ${participant.profile.displayName} indisponible`}>
          <CameraOff aria-hidden="true" />
          <span>Vidéo indisponible</span>
        </div>
      ) : (
        <video
          ref={videoRef}
          className="place-camera__media"
          src={hasLiveKitVideo || isHls ? undefined : videoUrl}
          poster={poster}
          autoPlay
          muted={muted}
          loop
          playsInline
          preload={primary ? "metadata" : "none"}
          onCanPlay={(event) => {
            const video = event.currentTarget;
            if (video.muted && video.paused && !video.ended) void video.play().catch(() => undefined);
          }}
          onError={() => setFailed(true)}
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            reportMediaDimensions(video.videoWidth, video.videoHeight);
          }}
          onResize={(event) => {
            const video = event.currentTarget;
            reportMediaDimensions(video.videoWidth, video.videoHeight);
          }}
        />
      )}
    </div>
  );
}

export default function PlaceStageLayoutTile({
  participant,
  sourceId,
  aspectRatio,
  formatIndex = 1,
  primary,
  selected,
  program,
  preview,
  director,
  canDirectProgram,
  programMutationPending,
  muted,
  playbackVolume = 1,
  renderAudience,
  selectionAudience,
  cameraEnabledOverride,
  liveKitVideoTrack,
  presentationOnly = false,
  framing,
  onSelect,
  onPutOnAir,
  onOpenSolo,
  onOpenProfile,
  onSourceChange,
  onAspectRatio,
  dragRoomId,
}: PlaceStageLayoutTileProps) {
  const selectableSources = useMemo(
    () => resolveParticipantSources(participant, selectionAudience),
    [participant, selectionAudience],
  );
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const actionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const declaredSource = resolveParticipantSource(participant, sourceId, renderAudience);
  const source = declaredSource ?? (liveKitVideoTrack && !liveKitVideoTrack.muted ? {
    id: `livekit-camera:${liveKitVideoTrack.publicationSid}`,
    type: "front_camera" as const,
    aspectRatio: aspectRatio ?? "16:9",
    transport: "rtc" as const,
    publicationSid: liveKitVideoTrack.publicationSid,
    active: true,
    programEligible: true,
    viewerSelectable: true,
    authorization: "publication" as const,
    preferredForDesktop: true,
  } : undefined);
  const sourceMenuAvailable = selectableSources.length > 1
    || (selectableSources.length === 1 && selectableSources[0]?.id !== source?.id);
  const cameraEnabled = cameraEnabledOverride ?? participant.isCameraEnabled;
  const networkUnstable = source?.transport === "rtc" && participant.latencyMs >= 180;

  const actionMenuAvailable = !presentationOnly && (director || sourceMenuAvailable);

  useEffect(() => {
    setActionMenuOpen(false);
  }, [participant.id, presentationOnly]);

  useEffect(() => {
    if (!actionMenuOpen) return undefined;
    const closeFromOutside = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (actionMenuRef.current?.contains(target) || actionTriggerRef.current?.contains(target)) return;
      setActionMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeFromOutside, true);
    return () => document.removeEventListener("pointerdown", closeFromOutside, true);
  }, [actionMenuOpen]);

  const toggleActionMenu = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (director) onSelect(participant.id);
    setActionMenuOpen((open) => !open);
  };

  useEffect(() => {
    if (!actionMenuOpen) return;
    const frame = window.requestAnimationFrame(() => {
      actionMenuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [actionMenuOpen]);

  const sourceLabel = (candidate: PlaceParticipantVideoSource) => {
    if (candidate.type === "desktop_composite") return "Composition desktop";
    if (candidate.type === "portrait_composite") return "Composition Short";
    if (candidate.type === "front_camera") return "Caméra avant";
    if (candidate.type === "rear_camera") return "Caméra arrière";
    return "Partage d’écran";
  };

  return (
    <article
      className={`place-camera place-stage-layout__tile${primary ? " place-camera--primary is-primary" : ""}${selected ? " is-selected" : ""}${participant.isSpeaking ? " is-speaking" : ""}${cameraEnabled ? "" : " is-camera-off"}${actionMenuOpen ? " is-action-menu-open" : ""}${presentationOnly ? " is-presentation-only" : ""}`}
      data-aspect={aspectRatio ?? source?.aspectRatio ?? "16:9"}
      data-format={(aspectRatio ?? source?.aspectRatio) === "9:16" ? "short" : "normal"}
      data-format-index={formatIndex}
      style={{ viewTransitionName: `place-stage-${participant.id.replace(/[^a-zA-Z0-9_-]/g, "-")}` } as CSSProperties}
      tabIndex={presentationOnly ? -1 : 0}
      role="region"
      draggable={Boolean(dragRoomId && participant.status === "onstage")}
      onDragStart={(event) => {
        if (!dragRoomId || participant.status !== "onstage") return;
        writePlaceGuestDrag(event.dataTransfer, { roomId: dragRoomId, participantId: participant.id, origin: "onstage" });
      }}
      aria-label={presentationOnly
        ? `Retour vidéo de ${participant.profile.displayName}`
        : `${primary ? "Participant principal" : "Participant secondaire"} ${participant.profile.displayName}. ${director ? "Entrée pour sélectionner cette vidéo." : "Entrée pour l’agrandir pour moi."}`}
      onClick={() => { if (!presentationOnly) onSelect(participant.id); }}
      onDoubleClick={(event) => {
        if (presentationOnly) return;
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest("button, a, [role='menu'], [role^='menuitem']")) return;
        onOpenSolo(participant.id);
      }}
      onKeyDown={(event) => {
        if (presentationOnly) return;
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(participant.id);
        }
      }}
    >
      {cameraEnabled && source ? (
        <NativeMedia
          source={source}
          participant={participant}
          muted={muted}
          primary={primary}
          playbackVolume={playbackVolume}
          framing={framing}
          liveKitVideoTrack={liveKitVideoTrack}
          onAspectRatio={(ratio) => onAspectRatio(participant.id, source.id, ratio)}
        />
      ) : (
        <div className="place-stage-layout__camera-off">
          <img src={participant.profile.avatarUrl} alt="" />
          {participant.isMicrophoneEnabled ? <span aria-hidden="true"><i /><i /><i /><i /><i /></span> : null}
          <small><CameraOff aria-hidden="true" /> {cameraEnabled ? "Source vidéo indisponible" : `Caméra coupée${participant.isMicrophoneEnabled ? "" : " · micro coupé"}`}</small>
        </div>
      )}

      {!presentationOnly ? <div className="place-camera__wash" aria-hidden="true" /> : null}
      {!presentationOnly && (program || preview || networkUnstable) ? (
        <header className="place-camera__topline">
          {program || preview ? <span className={`place-camera__signal${program ? " is-program" : " is-preview"}`}>{program ? "À L’ANTENNE" : "APERÇU"}</span> : <span />}
          {networkUnstable ? <span className="is-unstable"><WifiOff aria-hidden="true" /> Connexion faible</span> : null}
        </header>
      ) : null}

      {!presentationOnly ? <button
        type="button"
        className="place-stage-layout__profile"
        onClick={(event) => { event.stopPropagation(); onOpenProfile(participant.profile.id); }}
        aria-label={`Voir le profil de ${participant.profile.displayName}`}
        title={participant.profile.displayName}
      >
        <img src={participant.profile.avatarUrl} alt="" />
        <span>{participant.profile.displayName}</span>
      </button> : null}

      {actionMenuAvailable ? (
        <div className="place-stage-layout__tile-actions">
          <button
            ref={actionTriggerRef}
            type="button"
            onClick={toggleActionMenu}
            aria-label={director ? `Ouvrir la réalisation pour ${participant.profile.displayName}` : `Choisir la source de ${participant.profile.displayName}`}
            aria-expanded={actionMenuOpen}
            aria-haspopup="menu"
            title={director ? "Réalisation" : "Changer de source"}
          >
            {director ? <Radio aria-hidden="true" /> : <Ellipsis aria-hidden="true" />}
          </button>
        </div>
      ) : null}

      {!presentationOnly && actionMenuOpen ? (
        <div
          ref={actionMenuRef}
          className="place-stage-layout__action-menu"
          role="menu"
          aria-label={`Actions pour ${participant.profile.displayName}`}
          onClick={(event) => event.stopPropagation()}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setActionMenuOpen(false);
          }}
          onKeyDown={(event) => {
            const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
            const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
            if (event.key === "Escape") {
              event.preventDefault();
              setActionMenuOpen(false);
              actionTriggerRef.current?.focus();
              return;
            }
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || items.length === 0) return;
            event.preventDefault();
            const nextIndex = event.key === "Home"
              ? 0
              : event.key === "End"
                ? items.length - 1
                : event.key === "ArrowDown"
                  ? (currentIndex + 1 + items.length) % items.length
                  : (currentIndex - 1 + items.length) % items.length;
            items[nextIndex]?.focus();
          }}
        >
          <header>
            <img src={participant.profile.avatarUrl} alt="" />
            <span><strong>{participant.profile.displayName}</strong><small>{program ? "À L’ANTENNE" : "PRÊT À DIFFUSER"}</small></span>
          </header>
          {director ? (
            <button
              type="button"
              role="menuitem"
              className={`place-stage-layout__on-air-action${program ? " is-program" : ""}`}
              disabled={program || !canDirectProgram || programMutationPending}
              onClick={() => {
                onPutOnAir(participant.id);
                setActionMenuOpen(false);
              }}
            >
              <Radio aria-hidden="true" />
              <span>{program ? "Actuellement à l’antenne" : programMutationPending ? "Mise à l’antenne…" : canDirectProgram ? "Mettre à l’antenne" : "Réalisation indisponible"}</span>
            </button>
          ) : null}
          {sourceMenuAvailable ? <small className="place-stage-layout__action-menu-label">SOURCE VIDÉO</small> : null}
          {sourceMenuAvailable ? selectableSources.map((candidate) => (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={candidate.id === source?.id}
                className={candidate.id === source?.id ? "is-active" : ""}
                key={candidate.id}
                onClick={() => { onSourceChange(participant.id, candidate.id); setActionMenuOpen(false); }}
              >
                <span>{sourceLabel(candidate)}</span><small>{candidate.aspectRatio === "9:16" ? "Short" : "Normal"}</small>
              </button>
            )) : null}
        </div>
      ) : null}
    </article>
  );
}
