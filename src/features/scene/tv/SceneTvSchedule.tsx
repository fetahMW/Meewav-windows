import {
  Bell,
  BellRing,
  Captions,
  Clock3,
  ExternalLink,
  Maximize2,
  Minimize2,
  Pause,
  PictureInPicture2,
  Play,
  Radio,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { MeewavGradeBadge } from "../../grades/MeewavGradeBadge";
import {
  meewavMediaSession,
  type MeeWavMediaSessionLease,
} from "../mediaSession";
import {
  addDaysToDateKey,
  getBroadcastProgramsForDay,
  getBroadcastTimeline,
  getCurrentProgram,
  getFallbackProgram,
  getNextBroadcastProgram,
  getPreviousProgram,
  getProgramRemainingMs,
  getScheduleContinuityIssues,
  resolveProgramSource,
} from "./sceneTvGuide.engine";
import {
  SCENE_TV_GUIDE_FIXTURE,
  SCENE_TV_MAIN_CHANNEL_ID,
} from "./sceneTvGuide.fixtures";
import type {
  SceneTvGuide,
  SceneTvGuideProgram,
  SceneTvProgramFormat,
  SceneTvProgramSource,
  SceneTvSourceFormat,
} from "./sceneTvGuide.models";
import { getSceneTvProgressEvents, trackSceneTv } from "./sceneTvAnalytics";
import {
  readSceneTvReminderIds,
  toggleSceneTvReminder,
  writeSceneTvReminderIds,
} from "./sceneTvReminders";
import { SceneTvMark } from "./SceneTvMark";
import "./scene-tv-schedule.css";

type GuideView = "now" | "tonight" | "tomorrow" | "guide";

export type SceneTvScheduleProps = {
  guide?: SceneTvGuide;
  /** Injected clock for deterministic demos and tests. Real usage follows the system clock. */
  now?: Date;
  onPlayVideo?: (publishedVideoId: string) => void;
  onOpenRoom?: (roomId: string) => void;
  className?: string;
};

const TIME_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

const DAY_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const LONG_DAY_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Europe/Paris",
});

const PROGRAM_FORMAT_LABELS: Record<SceneTvProgramFormat, string> = {
  session: "MeeWav Sessions",
  la_releve: "La Relève",
  carte_blanche: "Carte blanche",
  connexion: "Connexions",
  city_focus: "Une ville, une scène",
  style_focus: "Focus style",
  replay: "Replay sélectionné",
  premiere: "Première",
  meewav_info: "MeeWav Info",
  official_statement: "Déclaration MeeWav",
  documentary_night: "Nuit documentaire",
  best_of: "Best of MeeWav",
  filler: "La Scène en continu",
};

const SOURCE_FORMAT_LABELS: Record<SceneTvSourceFormat, string> = {
  clip: "Clips & performances",
  performance: "Performance",
  session: "MeeWav Sessions",
  "dj-set": "DJ Night",
  freestyle: "Freestyle",
  dance: "Danse",
  cover: "Cover",
  studio: "Dans le studio",
  "behind-the-scenes": "Coulisses",
  interview: "Interview",
  documentary: "Portrait",
  collaboration: "Connexions",
  "room-replay": "Replay sélectionné",
  "meewav-original": "MeeWav Original",
  interstitial: "MeeWav TV",
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatTime(value: string | Date) {
  return TIME_FORMATTER.format(typeof value === "string" ? new Date(value) : value);
}

function formatTimeRange(program: SceneTvGuideProgram) {
  return `${formatTime(program.startsAt)} — ${formatTime(program.endsAt)}`;
}

function formatRemaining(program: SceneTvGuideProgram, now: Date) {
  const remainingMinutes = Math.max(0, Math.ceil((Date.parse(program.endsAt) - now.getTime()) / 60_000));
  if (remainingMinutes < 1) return "moins d’une minute restante";
  if (remainingMinutes < 60) return `${remainingMinutes} min restantes`;
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;
  return minutes > 0 ? `${hours} h ${minutes} restantes` : `${hours} h restante${hours > 1 ? "s" : ""}`;
}

function progressFor(program: SceneTvGuideProgram, now: Date) {
  const start = Date.parse(program.startsAt);
  const end = Date.parse(program.endsAt);
  const duration = Math.max(1, end - start);
  return Math.min(100, Math.max(0, ((now.getTime() - start) / duration) * 100));
}

function dateKey(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatGuideDay(value: string, todayKey: string, tomorrowKey: string) {
  const absoluteLabel = DAY_FORMATTER.format(new Date(`${value}T12:00:00Z`));
  if (value === todayKey) return `Aujourd’hui · ${absoluteLabel}`;
  if (value === tomorrowKey) return `Demain · ${absoluteLabel}`;
  return absoluteLabel;
}

function sourceLabel(source: SceneTvProgramSource) {
  if (source.kind === "room-simulcast") return "Événement en direct";
  if (source.kind === "published-room-replay") return "Replay sélectionné";
  if (source.kind === "meewav-original") return "MeeWav Original";
  return SOURCE_FORMAT_LABELS[source.format] ?? "Programme musical";
}

function ProgramRow({
  program,
  source,
  now,
  reminderActive,
  onToggleReminder,
  onPlayVideo,
  onOpenRoom,
}: {
  program: SceneTvGuideProgram;
  source: SceneTvProgramSource | null;
  now: Date;
  reminderActive: boolean;
  onToggleReminder: (programId: string) => void;
  onPlayVideo?: (publishedVideoId: string) => void;
  onOpenRoom?: (roomId: string) => void;
}) {
  const startsAt = Date.parse(program.startsAt);
  const endsAt = Date.parse(program.endsAt);
  const isCurrent = now.getTime() >= startsAt && now.getTime() < endsAt;
  const isPast = now.getTime() >= endsAt;
  const rowProgress = isCurrent ? progressFor(program, now) : (isPast ? 100 : 0);
  const rowStyle = {
    "--scene-tv-row-progress": `${rowProgress}%`,
  } as CSSProperties;

  return (
    <li
      className={cx(
        "scene-tv-program-row",
        isCurrent && "is-current",
        isPast && "is-past",
        program.isFallback && "is-fallback",
      )}
      aria-label={`${program.title}, ${formatTimeRange(program)}`}
      aria-current={isCurrent ? "true" : undefined}
      data-program-tone={program.format}
      data-fallback={program.isFallback ? "true" : undefined}
      data-starts-at={program.startsAt}
      data-ends-at={program.endsAt}
      style={rowStyle}
    >
      <div className="scene-tv-program-row__time">
        <time dateTime={program.startsAt}>{formatTime(program.startsAt)}</time>
        <span aria-hidden="true">{formatTime(program.endsAt)}</span>
      </div>
      <span className="scene-tv-program-row__poster" aria-hidden="true">
        {source ? <img src={source.thumbnailUrl} alt="" loading="lazy" width="144" height="81" /> : null}
      </span>
      <div className="scene-tv-program-row__copy">
        <small>{program.editorialLabel ?? PROGRAM_FORMAT_LABELS[program.format]}</small>
        <strong>{program.title}</strong>
        <span>
          {source?.artistName ?? "Sélection MeeWav"} · {PROGRAM_FORMAT_LABELS[program.format]}
          {isCurrent ? ` · ${formatRemaining(program, now)}` : ""}
        </span>
      </div>
      <div className="scene-tv-program-row__actions">
        {isCurrent ? <span className="scene-tv-program-row__live"><Radio aria-hidden="true" /> Maintenant</span> : null}
        {isCurrent && source?.kind === "room-simulcast" && source.roomId && onOpenRoom ? (
          <button type="button" onClick={() => {
            trackSceneTv({
              event: "tv_room_simulcast_opened",
              programId: program.id,
              sourceId: source.id,
            });
            onOpenRoom(source.roomId!);
          }}>
            <ExternalLink aria-hidden="true" /> Voir dans Rooms
          </button>
        ) : null}
        {!isPast && !isCurrent ? (
          <button
            type="button"
            className={reminderActive ? "is-active" : ""}
            aria-pressed={reminderActive}
            onClick={() => onToggleReminder(program.id)}
          >
            {reminderActive ? <BellRing aria-hidden="true" /> : <Bell aria-hidden="true" />}
            {reminderActive ? "Rappel activé" : "Me rappeler"}
          </button>
        ) : null}
        {isPast && source && onPlayVideo ? (
          <button type="button" onClick={() => {
            trackSceneTv({
              event: "tv_scene_catchup_opened",
              programId: program.id,
              sourceId: source.id,
            });
            onPlayVideo(source.publishedVideoId);
          }}>
            <RotateCcw aria-hidden="true" /> Revoir dans La Scène
          </button>
        ) : null}
      </div>
      {isCurrent ? <span className="scene-tv-program-row__now-line" aria-hidden="true" /> : null}
    </li>
  );
}

export default function SceneTvSchedule({
  guide = SCENE_TV_GUIDE_FIXTURE,
  now,
  onPlayVideo,
  onOpenRoom,
  className,
}: SceneTvScheduleProps) {
  const titleId = useId();
  const playerInstanceId = useId();
  const playerRef = useRef<HTMLVideoElement>(null);
  const mediaLeaseRef = useRef<MeeWavMediaSessionLease | null>(null);
  const playerFrameRef = useRef<HTMLDivElement>(null);
  const guideRef = useRef<HTMLElement>(null);
  const previousProgramIdRef = useRef<string | null>(null);
  const analyticsProgramRef = useRef<{
    id: string;
    sourceId?: string;
    endsAt: string;
  } | null>(null);
  const emittedMilestonesRef = useRef(new Set<string>());
  const channel = guide.channels.find((item) => item.id === SCENE_TV_MAIN_CHANNEL_ID) ?? guide.channels[0];
  const [clock, setClock] = useState(() => now ?? new Date());
  const [guideView, setGuideView] = useState<GuideView>("now");
  const [selectedDay, setSelectedDay] = useState(() => (
    channel ? dateKey(now ?? new Date(), channel.timeZone) : ""
  ));
  const [reminderIds, setReminderIds] = useState(readSceneTvReminderIds);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(0.72);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [cinemaMode, setCinemaMode] = useState(false);
  const [fallbackMediaUrl, setFallbackMediaUrl] = useState<string | null>(null);
  const [mediaUnavailable, setMediaUnavailable] = useState(false);
  const [playerNotice, setPlayerNotice] = useState("Chargement de l’antenne…");
  const [stationIdentMode, setStationIdentMode] = useState<"opening" | "handoff" | null>("opening");

  useEffect(() => {
    if (now) {
      setClock(now);
      return undefined;
    }
    const timer = window.setInterval(() => setClock(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, [now]);

  useEffect(() => {
    writeSceneTvReminderIds(reminderIds);
  }, [reminderIds]);

  const scheduledCurrent = channel
    ? getCurrentProgram(guide.programs, clock, { channelId: channel.id })
    : null;
  const currentProgram = scheduledCurrent ?? (
    channel ? getFallbackProgram(channel, guide.sources, clock) : null
  );
  const nextProgram = channel
    ? getNextBroadcastProgram(guide.programs, channel, guide.sources, clock)
    : null;
  const previousProgram = channel
    ? getPreviousProgram(guide.programs, clock, { channelId: channel.id })
    : null;
  const currentSource = currentProgram
    ? resolveProgramSource(currentProgram, guide.sources)
    : null;
  const nextSource = nextProgram ? resolveProgramSource(nextProgram, guide.sources) : null;
  const previousSource = previousProgram
    ? resolveProgramSource(previousProgram, guide.sources)
    : null;
  const configuredContinuitySource = channel
    ? guide.sources.find((source) => source.id === channel.fallbackSourceId) ?? null
    : null;
  const continuitySource = configuredContinuitySource?.mediaUrl !== currentSource?.mediaUrl
    ? configuredContinuitySource
    : guide.sources.find((source) => source.mediaUrl !== currentSource?.mediaUrl) ?? configuredContinuitySource;
  const mediaUrl = fallbackMediaUrl ?? currentSource?.mediaUrl ?? "";
  const progress = currentProgram ? progressFor(currentProgram, clock) : 0;
  const remainingMs = currentProgram ? (getProgramRemainingMs(currentProgram, clock) ?? 0) : 0;
  const currentProgramId = currentProgram?.id;
  const currentSourceId = currentProgram?.sourceId;
  const isRoomSimulcast = currentSource?.kind === "room-simulcast";
  const showOnAirGrade = currentProgram?.format === "la_releve";

  useEffect(() => {
    trackSceneTv({ event: "tv_opened" });
  }, []);

  useEffect(() => {
    if (!currentProgramId) return;
    trackSceneTv({
      event: "tv_program_viewed",
      programId: currentProgramId,
      sourceId: currentSourceId,
    });
  }, [currentProgramId, currentSourceId]);

  useEffect(() => {
    if (!currentProgramId) return undefined;
    if (previousProgramIdRef.current === null) {
      previousProgramIdRef.current = currentProgramId;
      return undefined;
    }
    if (previousProgramIdRef.current === currentProgramId) return undefined;

    previousProgramIdRef.current = currentProgramId;
    setStationIdentMode("handoff");
    return undefined;
  }, [currentProgramId]);

  useEffect(() => {
    if (!stationIdentMode) return undefined;
    const timer = window.setTimeout(
      () => setStationIdentMode(null),
      stationIdentMode === "opening" ? 1_450 : 1_800,
    );
    return () => window.clearTimeout(timer);
  }, [stationIdentMode]);

  useEffect(() => {
    if (!currentProgramId || !currentProgram) return;

    const previous = analyticsProgramRef.current;
    if (
      previous
      && previous.id !== currentProgramId
      && clock.getTime() >= Date.parse(previous.endsAt)
    ) {
      const completionKey = `${previous.id}:tv_program_completed`;
      if (!emittedMilestonesRef.current.has(completionKey)) {
        emittedMilestonesRef.current.add(completionKey);
        trackSceneTv({
          event: "tv_program_completed",
          programId: previous.id,
          sourceId: previous.sourceId,
        });
      }
    }

    analyticsProgramRef.current = {
      id: currentProgramId,
      sourceId: currentSourceId,
      endsAt: currentProgram.endsAt,
    };
  }, [clock, currentProgram, currentProgramId, currentSourceId]);

  useEffect(() => {
    if (!currentProgramId) return;
    getSceneTvProgressEvents(progress).forEach((event) => {
      const milestoneKey = `${currentProgramId}:${event}`;
      if (emittedMilestonesRef.current.has(milestoneKey)) return;
      emittedMilestonesRef.current.add(milestoneKey);
      trackSceneTv({
        event,
        programId: currentProgramId,
        sourceId: currentSourceId,
      });
    });
  }, [currentProgramId, currentSourceId, progress]);

  useEffect(() => {
    setFallbackMediaUrl(null);
    setMediaUnavailable(false);
    setAutoplayBlocked(false);
    setPlayerNotice("Chargement de l’antenne…");
  }, [currentProgram?.id]);

  const claimTvPlaybackSlot = useCallback(() => {
    const existingLease = mediaLeaseRef.current;
    const activeSession = meewavMediaSession.getSnapshot().active;
    if (
      existingLease?.isCurrent()
      && activeSession?.token === existingLease.token
      && activeSession.state === "active"
    ) return;

    mediaLeaseRef.current = meewavMediaSession.claim({
      source: "scene_tv",
      id: `scene-tv:${playerInstanceId}`,
      mediaId: currentProgramId,
      label: currentProgram?.title,
      pause: () => {
        playerRef.current?.pause();
        setIsPlaying(false);
      },
    });
  }, [currentProgram?.title, currentProgramId, playerInstanceId]);

  useEffect(() => () => {
    mediaLeaseRef.current?.release({ reason: "route_change" });
    mediaLeaseRef.current = null;
  }, [currentProgramId]);

  const syncLinearPlayback = useCallback(async () => {
    const player = playerRef.current;
    if (!player || !currentProgram) return;

    const elapsedSeconds = Math.max(0, (clock.getTime() - Date.parse(currentProgram.startsAt)) / 1_000);
    if (Number.isFinite(player.duration) && player.duration > 0) {
      player.currentTime = elapsedSeconds % player.duration;
    }
    player.volume = volume;
    player.muted = true;
    setIsMuted(true);

    try {
      await player.play();
      setIsPlaying(true);
      setAutoplayBlocked(false);
      setPlayerNotice("Antenne chargée");
      trackSceneTv({
        event: "tv_play_started",
        programId: currentProgram.id,
        sourceId: currentProgram.sourceId,
      });
    } catch {
      setIsPlaying(false);
      setAutoplayBlocked(true);
      setPlayerNotice("La lecture attend ton interaction");
    }
  }, [clock, currentProgram, volume]);

  const startWithSound = async () => {
    const player = playerRef.current;
    if (!player) return;
    player.muted = false;
    player.volume = volume;
    setIsMuted(false);
    trackSceneTv({
      event: "tv_unmuted",
      programId: currentProgram?.id,
      sourceId: currentProgram?.sourceId,
    });
    try {
      await player.play();
      setIsPlaying(true);
      setAutoplayBlocked(false);
    } catch {
      setAutoplayBlocked(true);
    }
  };

  const togglePlayback = async () => {
    const player = playerRef.current;
    if (!player) return;
    if (player.paused) {
      try {
        await player.play();
        setIsPlaying(true);
      } catch {
        setAutoplayBlocked(true);
      }
    } else {
      player.pause();
      setIsPlaying(false);
    }
  };

  const toggleMuted = () => {
    const player = playerRef.current;
    if (!player) return;
    player.muted = !player.muted;
    setIsMuted(player.muted);
    if (!player.muted) {
      trackSceneTv({
        event: "tv_unmuted",
        programId: currentProgram?.id,
        sourceId: currentProgram?.sourceId,
      });
    }
  };

  const enterPictureInPicture = async () => {
    const player = playerRef.current;
    if (!player?.requestPictureInPicture) return;
    try {
      await player.requestPictureInPicture();
      trackSceneTv({ event: "tv_pip", programId: currentProgram?.id });
    } catch {
      setPlayerNotice("Le mode image dans l’image n’est pas disponible ici");
    }
  };

  const enterFullscreen = async () => {
    try {
      await playerFrameRef.current?.requestFullscreen?.();
      trackSceneTv({ event: "tv_fullscreen", programId: currentProgram?.id });
    } catch {
      setPlayerNotice("Le plein écran n’est pas disponible ici");
    }
  };

  const toggleReminder = (programId: string) => {
    setReminderIds((current) => {
      const next = toggleSceneTvReminder(current, programId);
      if (!current.has(programId) && next.has(programId)) {
        trackSceneTv({ event: "tv_reminder_created", programId });
      }
      return next;
    });
  };

  const availableDays = useMemo(() => {
    if (!channel) return [];
    return [...new Set(guide.programs.map((program) => (
      dateKey(new Date(program.startsAt), channel.timeZone)
    )))].slice(0, 14);
  }, [channel, guide.programs]);

  const todayKey = channel ? dateKey(clock, channel.timeZone) : "";
  const tomorrowKey = todayKey ? (addDaysToDateKey(todayKey, 1) ?? "") : "";

  const visiblePrograms = useMemo(() => {
    if (!channel) return [];
    if (guideView === "now") {
      return getBroadcastTimeline(
        guide.programs,
        channel,
        guide.sources,
        clock,
        new Date(clock.getTime() + 4 * 60 * 60_000),
      ).slice(0, 6);
    }
    if (guideView === "tonight") {
      return getBroadcastProgramsForDay(guide.programs, channel, guide.sources, todayKey, {
        timeZone: channel.timeZone,
      }).filter((program) => Number(formatTime(program.startsAt).slice(0, 2)) >= 18);
    }
    const targetDay = guideView === "tomorrow" ? tomorrowKey : selectedDay;
    return getBroadcastProgramsForDay(guide.programs, channel, guide.sources, targetDay, {
      timeZone: channel.timeZone,
    });
  }, [channel, clock, guide.programs, guide.sources, guideView, selectedDay, todayKey, tomorrowKey]);

  const guideDayKey = guideView === "tomorrow"
    ? tomorrowKey
    : guideView === "guide"
      ? selectedDay
      : todayKey;
  const guideDate = guideDayKey
    ? new Date(`${guideDayKey}T12:00:00Z`)
    : clock;
  const guideTitle = guideView === "now"
    ? "À l’antenne aujourd’hui"
    : guideView === "tonight"
      ? "Ce soir sur MeeWav TV"
      : guideView === "tomorrow"
        ? "Demain sur MeeWav TV"
        : "Le programme";
  const guideContinuityIssues = channel
    ? getScheduleContinuityIssues(visiblePrograms, { channelId: channel.id })
    : [];
  const guideIsContinuous = guideContinuityIssues.length === 0;

  const openTonightGuide = () => {
    setGuideView("tonight");
    window.requestAnimationFrame(() => {
      guideRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  if (!channel || !currentProgram || !currentSource) {
    return (
      <section className={cx("scene-tv", className)} aria-labelledby={titleId}>
        <h2 id={titleId}>MeeWav TV</h2>
        <p className="scene-tv__fatal">L’antenne se prépare. La playlist de sécurité est momentanément indisponible.</p>
      </section>
    );
  }

  const playerProgressStyle = { "--scene-tv-progress": `${progress}%` } as CSSProperties;

  return (
    <section
      className={cx("scene-tv", cinemaMode && "is-cinema", className)}
      aria-labelledby={titleId}
      data-program-tone={currentProgram.format}
    >
      <header className="scene-tv__masthead">
        <div>
          <h2 id={titleId}>MEEWAV TV</h2>
          <p>La chaîne officielle de MeeWav.</p>
        </div>
      </header>

      <div className="scene-tv__broadcast">
        <div ref={playerFrameRef} className="scene-tv-player">
          {!mediaUnavailable ? (
            <video
              key={`${currentProgram.id}-${mediaUrl}`}
              ref={playerRef}
              src={mediaUrl}
              poster={currentSource.thumbnailUrl}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-label={`MeeWav TV diffuse ${currentProgram.title}`}
              onLoadedMetadata={() => void syncLinearPlayback()}
              onPlay={() => {
                claimTvPlaybackSlot();
                setIsPlaying(true);
              }}
              onPause={() => {
                mediaLeaseRef.current?.pause("user");
                setIsPlaying(false);
              }}
              onVolumeChange={(event) => {
                setIsMuted(event.currentTarget.muted);
                setVolume(event.currentTarget.volume);
              }}
              onError={() => {
                mediaLeaseRef.current?.release({ pause: false });
                mediaLeaseRef.current = null;
                if (continuitySource && continuitySource.mediaUrl !== mediaUrl) {
                  setFallbackMediaUrl(continuitySource.mediaUrl);
                  setPlayerNotice("Source indisponible · bascule vers la playlist de sécurité");
                  trackSceneTv({
                    event: "tv_fallback_triggered",
                    programId: currentProgram.id,
                    sourceId: currentProgram.sourceId,
                    reason: "media-error",
                  });
                  return;
                }
                setMediaUnavailable(true);
                setPlayerNotice("Antenne indisponible · nouvelle tentative en cours");
                trackSceneTv({
                  event: "tv_error",
                  programId: currentProgram.id,
                  sourceId: currentProgram.sourceId,
                  reason: "fallback-error",
                });
              }}
            />
          ) : (
            <div className="scene-tv-player__error" role="alert">
              <Radio aria-hidden="true" />
              <strong>La musique continue.</strong>
              <span>La playlist de sécurité va reprendre dans un instant.</span>
              <button type="button" onClick={() => {
                setMediaUnavailable(false);
                setFallbackMediaUrl(continuitySource?.mediaUrl ?? null);
              }}>Réessayer</button>
            </div>
          )}

          <div className="scene-tv-player__ambient" aria-hidden="true" />
          {stationIdentMode ? (
            <div
              className="scene-tv-player__station-ident"
              data-mode={stationIdentMode}
              role="status"
              aria-label="Vous regardez MeeWav TV"
            >
              <SceneTvMark variant="ident" />
              <small>{stationIdentMode === "opening" ? "La chaîne officielle de MeeWav" : "La musique continue"}</small>
            </div>
          ) : null}
          <div className="scene-tv-player__topline">
            <span className="scene-tv-player__on-air"><i aria-hidden="true" /> {isRoomSimulcast ? "EN DIRECT" : "À L’ANTENNE"}</span>
            <span className="scene-tv-player__bug" aria-label="MeeWav TV">
              <SceneTvMark variant="bug" />
            </span>
          </div>

          <div key={currentProgram.id} className="scene-tv-player__lower-third">
            <small>{currentProgram.editorialLabel ?? sourceLabel(currentSource)}</small>
            <strong>{currentProgram.title}</strong>
            <span className="scene-tv-player__artist">
              {currentSource.artistName}
              {showOnAirGrade ? (
                <MeewavGradeBadge
                  level={currentSource.gradeLevel}
                  size="xs"
                  variant="icon"
                  labelMode="none"
                  title={`Niveau ${currentSource.gradeLevel} de ${currentSource.artistName}`}
                />
              ) : null}
            </span>
          </div>

          {remainingMs > 0 && remainingMs <= 90_000 && nextProgram ? (
            <div
              className="scene-tv-player__next-up"
              role="status"
              aria-label={`Ensuite, ${nextProgram.title} à ${formatTime(nextProgram.startsAt)}`}
            >
              <SceneTvMark variant="compact" />
              <div>
                <small>ENSUITE · DANS MOINS DE 2 MIN</small>
                <strong>{nextProgram.title}</strong>
                <span>{nextSource?.artistName ?? "Sélection MeeWav"} · {formatTime(nextProgram.startsAt)}</span>
              </div>
            </div>
          ) : null}

          {autoplayBlocked ? (
            <button type="button" className="scene-tv-player__start" onClick={() => void startWithSound()}>
              <Play fill="currentColor" /> Regarder MeeWav TV
            </button>
          ) : null}

          <div className="scene-tv-player__controls" role="group" aria-label="Contrôles de MeeWav TV">
            <button type="button" onClick={() => void togglePlayback()} aria-label={isPlaying ? "Mettre MeeWav TV en pause" : "Lire MeeWav TV"}>
              {isPlaying ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
            </button>
            <button type="button" onClick={toggleMuted} aria-label={isMuted ? "Activer le son de MeeWav TV" : "Couper le son de MeeWav TV"}>
              {isMuted ? <VolumeX /> : <Volume2 />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              aria-label="Volume de MeeWav TV"
              onChange={(event) => {
                const nextVolume = Number(event.target.value);
                setVolume(nextVolume);
                if (playerRef.current) {
                  playerRef.current.volume = nextVolume;
                  playerRef.current.muted = nextVolume === 0;
                }
              }}
            />
            <span className="scene-tv-player__control-spacer" />
            <button type="button" disabled title="Sous-titres indisponibles pour ce programme" aria-label="Sous-titres indisponibles">
              <Captions />
            </button>
            <button type="button" onClick={() => void enterPictureInPicture()} aria-label="Ouvrir MeeWav TV en image dans l’image">
              <PictureInPicture2 />
            </button>
            <button
              type="button"
              onClick={() => setCinemaMode((current) => !current)}
              aria-pressed={cinemaMode}
              aria-label={cinemaMode ? "Quitter le mode cinéma" : "Activer le mode cinéma"}
            >
              {cinemaMode ? <Minimize2 /> : <Maximize2 />}
            </button>
            <button type="button" onClick={() => void enterFullscreen()} aria-label="Afficher MeeWav TV en plein écran">
              <Maximize2 />
            </button>
          </div>
          <div className="scene-tv-player__program-progress" style={playerProgressStyle} aria-hidden="true" />
          <p className="sr-only" aria-live="polite">{playerNotice}</p>
        </div>

        <aside className="scene-tv-now" aria-label="Contexte de l’antenne">
          <div className="scene-tv-now__status">
            <span><i aria-hidden="true" /> {isRoomSimulcast ? "EN DIRECT" : "À L’ANTENNE"}</span>
            <time dateTime={currentProgram.startsAt}>{formatTimeRange(currentProgram)}</time>
          </div>
          <div className="scene-tv-now__timing">
            <strong>{formatRemaining(currentProgram, clock)}</strong>
            <div role="progressbar" aria-label={`Progression du programme ${currentProgram.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
              <i style={{ width: `${progress}%` }} />
            </div>
          </div>
          <div className="scene-tv-now__current">
            <small>{currentProgram.editorialLabel ?? sourceLabel(currentSource)}</small>
            <span>{currentSource.artistName}</span>
          </div>
          {nextProgram ? (
            <article className="scene-tv-now__next" aria-label={`Ensuite, ${nextProgram.title} à ${formatTime(nextProgram.startsAt)}`}>
              {nextSource ? (
                <span className="scene-tv-now__next-poster" aria-hidden="true">
                  <img src={nextSource.thumbnailUrl} alt="" width="176" height="99" loading="lazy" />
                </span>
              ) : null}
              <div>
                <span>ENSUITE · {formatTimeRange(nextProgram)}</span>
                <strong>{nextProgram.title}</strong>
                <small>{nextSource?.artistName ?? "Sélection MeeWav"}</small>
              </div>
            </article>
          ) : null}
          <button type="button" className="scene-tv-now__later" onClick={openTonightGuide}>
            Plus tard ce soir <Clock3 aria-hidden="true" />
          </button>
          {previousProgram && previousSource && onPlayVideo ? (
            <article className="scene-tv-now__previous">
              <div>
                <span>VOUS AVEZ RATÉ</span>
                <strong>{previousProgram.title}</strong>
                <small>{formatTimeRange(previousProgram)}</small>
              </div>
              <button type="button" onClick={() => {
                trackSceneTv({
                  event: "tv_scene_catchup_opened",
                  programId: previousProgram.id,
                  sourceId: previousSource.id,
                });
                onPlayVideo(previousSource.publishedVideoId);
              }}>
                <RotateCcw aria-hidden="true" /> Revoir dans La Scène
              </button>
            </article>
          ) : null}
          {onPlayVideo ? (
            <button type="button" className="scene-tv-now__scene-link" onClick={() => {
              trackSceneTv({
                event: "tv_scene_catchup_opened",
                programId: currentProgram.id,
                sourceId: currentSource.id,
              });
              onPlayVideo(currentSource.publishedVideoId);
            }}>
              Voir dans La Scène <ExternalLink aria-hidden="true" />
            </button>
          ) : null}
          {isRoomSimulcast && currentSource.roomId && onOpenRoom ? (
            <button type="button" className="scene-tv-now__room-link" onClick={() => {
              trackSceneTv({
                event: "tv_room_simulcast_opened",
                programId: currentProgram.id,
                sourceId: currentSource.id,
              });
              onOpenRoom(currentSource.roomId!);
            }}>
              Voir l’événement dans Rooms <ExternalLink aria-hidden="true" />
            </button>
          ) : null}
        </aside>
      </div>

      <section ref={guideRef} className="scene-tv-guide" aria-labelledby={`${titleId}-guide`}>
        <header>
          <div>
            <p><Clock3 /> PROGRAMMATION</p>
            <h3 id={`${titleId}-guide`}>{guideTitle}</h3>
          </div>
          <span>{LONG_DAY_FORMATTER.format(guideDate)}</span>
        </header>

        <div className="scene-tv-guide__tabs" role="tablist" aria-label="Période du programme TV">
          {([
            ["now", "Maintenant"],
            ["tonight", "Ce soir"],
            ["tomorrow", "Demain"],
            ["guide", "Programme"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              id={`${titleId}-guide-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={guideView === id}
              aria-controls={`${titleId}-guide-panel`}
              className={guideView === id ? "is-active" : ""}
              onClick={() => {
                setGuideView(id);
                trackSceneTv({ event: "tv_guide_opened", programId: currentProgram.id, reason: id });
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {guideView === "guide" ? (
          <div className="scene-tv-guide__days" aria-label="Choisir un jour de programmation">
            {availableDays.map((day) => (
              <button
                key={day}
                type="button"
                className={selectedDay === day ? "is-active" : ""}
                aria-pressed={selectedDay === day}
                onClick={() => setSelectedDay(day)}
              >
                {formatGuideDay(day, todayKey, tomorrowKey)}
              </button>
            ))}
          </div>
        ) : null}

        <div
          id={`${titleId}-guide-panel`}
          className="scene-tv-guide__panel"
          role="tabpanel"
          aria-labelledby={`${titleId}-guide-tab-${guideView}`}
          aria-live="polite"
          data-continuity={guideIsContinuous ? "continuous" : "interrupted"}
        >
          <ol className="scene-tv-guide__list">
            {visiblePrograms.length > 0 ? visiblePrograms.map((program) => (
              <ProgramRow
                key={program.id}
                program={program}
                source={resolveProgramSource(program, guide.sources)}
                now={clock}
                reminderActive={reminderIds.has(program.id)}
                onToggleReminder={toggleReminder}
                onPlayVideo={onPlayVideo}
                onOpenRoom={onOpenRoom}
              />
            )) : (
              <li className="scene-tv-guide__empty">
                <Radio />
                <strong>L’antenne reste active.</strong>
                <span>La playlist de continuité prend le relais entre deux rendez-vous éditoriaux.</span>
              </li>
            )}
          </ol>
        </div>
      </section>
    </section>
  );
}
