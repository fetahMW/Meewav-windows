import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Drum, HeartPulse, Megaphone, PartyPopper, Pause, Play, Plus, RefreshCw, ThumbsDown, Timer, Trash2, Upload, Volume2 } from "lucide-react";
import { DEFAULT_PLACE_TWIST_VOLUME, placeTwistAudio, type PlaceTwistKind } from "./placeTwistAudio";
import type { PlaceMixerStartRequest } from "./placeMixerStart";

type TwistDefinition = {
  id: PlaceTwistKind;
  title: string;
  description: string;
  durationMs: number;
  accent: string;
  icon: typeof HeartPulse;
};

const TWISTS: TwistDefinition[] = [
  {
    id: "heartbeat",
    title: "Battement",
    description: "Suspense et attente",
    durationMs: 4100,
    accent: "#ff4f86",
    icon: HeartPulse,
  },
  {
    id: "dj_horn",
    title: "DJ Horn",
    description: "Impact instantané",
    durationMs: 2700,
    accent: "#ffc34a",
    icon: Megaphone,
  },
  {
    id: "applause",
    title: "Applause",
    description: "Réaction collective",
    durationMs: 8485,
    accent: "#a876ff",
    icon: PartyPopper,
  },
  {
    id: "crowd_boo",
    title: "Huées du public",
    description: "Désapprobation collective",
    durationMs: 6656,
    accent: "#7f8cff",
    icon: ThumbsDown,
  },
  {
    id: "drum_roll",
    title: "Roulement de tambour",
    description: "Suspense avant une annonce",
    durationMs: 5942,
    accent: "#45c2ff",
    icon: Drum,
  },
  {
    id: "countdown",
    title: "Compte à rebours",
    description: "Départ synchronisé",
    durationMs: 27_000,
    accent: "#64d98b",
    icon: Timer,
  },
];

type TwistSlot = {
  id: string;
  title: string;
  description: string;
  accent: string;
  icon: typeof HeartPulse;
  builtin?: PlaceTwistKind;
  source?: string;
};

const PLACE_TWIST_SLOT_COUNT = 15;
const EMPTY_TWIST_ACCENT = "#77727f";
const SLOT_ACCENTS = [
  "#ff4f86", "#ffc34a", "#a876ff", "#2ed9d0", "#62a8ff",
  "#ec73d5", "#84db69", "#ff8f5c", "#c4a7ff", "#37dba2",
  "#ff6c9f", "#73c6ff", "#8f74ff", "#45cbb7", "#ee7f9f",
];
let savedTwistSlots: Array<TwistSlot | null> = [
  ...TWISTS.map((twist) => ({ ...twist, builtin: twist.id })),
  ...Array<TwistSlot | null>(PLACE_TWIST_SLOT_COUNT - TWISTS.length).fill(null),
];

export default function PlaceTwists({ active = true }: { active?: boolean }) {
  const [slots, setSlots] = useState<Array<TwistSlot | null>>(() => [...savedTwistSlots]);
  const [activeTwist, setActiveTwist] = useState<string | null>(null);
  const [pausedTwist, setPausedTwist] = useState<string | null>(null);
  const [hornAtChronoEnd, setHornAtChronoEnd] = useState(false);
  const [countdownAtChronoStart, setCountdownAtChronoStart] = useState(false);
  const [volume, setVolume] = useState(DEFAULT_PLACE_TWIST_VOLUME);
  const [error, setError] = useState<string | null>(null);
  const endTimer = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const targetSlot = useRef<number | null>(null);
  const pendingStart = useRef<(() => void) | null>(null);

  useEffect(() => {
    placeTwistAudio.setVolume(volume);
    placeTwistAudio.preloadHorn();
  }, [volume]);

  useEffect(() => () => {
    pendingStart.current?.();
    if (endTimer.current !== null) window.clearTimeout(endTimer.current);
    placeTwistAudio.stop();
  }, []);

  const updateSlots = (next: Array<TwistSlot | null>) => {
    savedTwistSlots = next;
    setSlots(next);
  };

  const trigger = async (twist: TwistSlot, onOneSecondBeforeEnd?: () => void, onFailure?: () => void) => {
    if (!onOneSecondBeforeEnd) pendingStart.current?.();
    if (endTimer.current !== null) window.clearTimeout(endTimer.current);
    setError(null);
    setActiveTwist(twist.id);
    setPausedTwist(null);
    try {
      const finish = () => {
        setActiveTwist((current) => current === twist.id ? null : current);
        setPausedTwist((current) => current === twist.id ? null : current);
      };
      if (twist.builtin && onOneSecondBeforeEnd) await placeTwistAudio.play(twist.builtin, finish, onOneSecondBeforeEnd, onFailure);
      else if (twist.builtin) await placeTwistAudio.play(twist.builtin, finish);
      else if (twist.source) await placeTwistAudio.playFile(twist.source, finish);
      else throw new Error("Source audio absente");
    } catch {
      setActiveTwist(null);
      setPausedTwist(null);
      onFailure?.();
      setError("Le navigateur n’a pas pu lire ce son. Réessaie après avoir autorisé l’audio.");
    }
  };

  const togglePause = async (twist: TwistSlot) => {
    if (activeTwist !== twist.id) return;
    setError(null);
    try {
      if (pausedTwist === twist.id) {
        if (await placeTwistAudio.resume()) setPausedTwist(null);
      } else if (await placeTwistAudio.pause()) {
        setPausedTwist(twist.id);
      }
    } catch {
      setError("Le Pad n’a pas pu changer d’état. Relance-le depuis sa carte.");
    }
  };

  useEffect(() => {
    if (!hornAtChronoEnd) return;
    const playHornAtEnd = () => {
      const horn = slots.find((slot) => slot?.builtin === "dj_horn");
      if (horn) void trigger(horn);
    };
    window.addEventListener("meewav:mixer-chrono-ended", playHornAtEnd);
    return () => window.removeEventListener("meewav:mixer-chrono-ended", playHornAtEnd);
  }, [hornAtChronoEnd, slots]);

  useEffect(() => {
    if (!countdownAtChronoStart) return;
    const playCountdownBeforeStart = (rawEvent: Event) => {
      const event = rawEvent as CustomEvent<PlaceMixerStartRequest>;
      const countdown = slots.find((slot) => slot?.builtin === "countdown");
      if (!countdown || typeof event.detail?.start !== "function") return;
      event.preventDefault();
      pendingStart.current?.();
      let started = false;
      const clearPending = () => {
        event.detail.signal?.removeEventListener("abort", cancelStart);
        if (pendingStart.current === cancelStart) pendingStart.current = null;
      };
      const cancelStart = () => {
        if (started) return;
        started = true;
        clearPending();
        placeTwistAudio.stop();
        setActiveTwist(null);
        setPausedTwist(null);
        event.detail.cancel();
      };
      const startChrono = () => {
        if (started || event.detail.signal?.aborted) return;
        started = true;
        clearPending();
        event.detail.start();
      };
      pendingStart.current = cancelStart;
      event.detail.signal?.addEventListener("abort", cancelStart, { once: true });
      void trigger(countdown, startChrono, cancelStart);
    };
    window.addEventListener("meewav:mixer-chrono-start-requested", playCountdownBeforeStart);
    return () => {
      window.removeEventListener("meewav:mixer-chrono-start-requested", playCountdownBeforeStart);
      pendingStart.current?.();
    };
  }, [countdownAtChronoStart, slots]);

  const chooseFile = (index: number) => {
    targetSlot.current = index;
    if (fileInput.current) {
      fileInput.current.value = "";
      fileInput.current.click();
    }
  };

  const loadFile = (file: File) => {
    const index = targetSlot.current;
    if (index === null) return;
    const previous = slots[index];
    if (previous?.source?.startsWith("blob:")) URL.revokeObjectURL(previous.source);
    const title = file.name.replace(/\.[^.]+$/, "").trim() || "Twist personnalisé";
    const next = [...slots];
    next[index] = {
      id: `custom-${index}-${Date.now()}`,
      title,
      description: "Son personnalisé",
      accent: SLOT_ACCENTS[index],
      icon: Upload,
      source: URL.createObjectURL(file),
    };
    updateSlots(next);
    targetSlot.current = null;
  };

  const removeSlot = (index: number) => {
    const previous = slots[index];
    if (activeTwist === previous?.id) {
      placeTwistAudio.stop();
      setActiveTwist(null);
      setPausedTwist(null);
    }
    if (previous?.source?.startsWith("blob:")) URL.revokeObjectURL(previous.source);
    const next = [...slots];
    next[index] = null;
    updateSlots(next);
  };

  return (
    <section className="place-twists" aria-labelledby="place-twists-title" hidden={!active} style={active ? undefined : { display: "none" }}>
      <input
        ref={fileInput}
        className="place-twists__file"
        type="file"
        accept="audio/*"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) loadFile(file);
        }}
      />
      <header className="place-twists__header">
        <span>
          <strong id="place-twists-title">Pads</strong>
        </span>
        <label className="place-twists__volume">
          <Volume2 aria-hidden="true" />
          <span className="sr-only">Volume des Pads</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(event) => setVolume(Number(event.currentTarget.value))}
            aria-valuetext={`${Math.round(volume * 100)} %`}
          />
          <output>{Math.round(volume * 100)} %</output>
        </label>
      </header>

      <div className="place-twists__pads">
        {slots.map((twist, index) => {
          const Icon = twist?.icon ?? Plus;
          const active = twist ? activeTwist === twist.id : false;
          const paused = twist ? pausedTwist === twist.id : false;
          return (
            <article
              key={twist?.id ?? `empty-${index}`}
              className={`place-twists__pad${active ? " is-playing" : ""}${paused ? " is-paused" : ""}${twist ? "" : " is-empty"}`}
              style={{ "--twist-accent": twist?.accent ?? EMPTY_TWIST_ACCENT } as CSSProperties}
            >
              <button
                type="button"
                className="place-twists__pad-main"
                aria-pressed={active}
                aria-label={twist ? `Jouer ${twist.title}` : `Ajouter un Pad à l’emplacement ${index + 1}`}
                onClick={() => twist ? void trigger(twist) : chooseFile(index)}
              >
                <span className="place-twists__pad-icon"><Icon aria-hidden="true" /><i /></span>
                <span>
                  <strong>{twist?.title ?? "Ajouter"}</strong>
                  {twist?.builtin === "dj_horn" ? (
                    <label className="place-twists__chrono-link" onClick={(event) => event.stopPropagation()}>
                      <span>Fin du chrono</span>
                      <input type="checkbox" checked={hornAtChronoEnd} onChange={(event) => setHornAtChronoEnd(event.currentTarget.checked)} />
                      <i aria-hidden="true" />
                    </label>
                  ) : twist?.builtin === "countdown" ? (
                    <label className="place-twists__chrono-link" onClick={(event) => event.stopPropagation()}>
                      <span>Début du chrono</span>
                      <input type="checkbox" checked={countdownAtChronoStart} onChange={(event) => setCountdownAtChronoStart(event.currentTarget.checked)} />
                      <i aria-hidden="true" />
                    </label>
                  ) : <small>{paused ? "En pause" : active ? "Lecture en cours" : twist?.description ?? "Emplacement libre"}</small>}
                </span>
              </button>
              {twist && active ? (
                <button
                  type="button"
                  className="place-twists__playback-toggle"
                  onClick={() => void togglePause(twist)}
                  aria-label={paused ? `Reprendre ${twist.title}` : `Mettre ${twist.title} en pause`}
                  title={paused ? "Reprendre" : "Pause"}
                >
                  {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
                </button>
              ) : null}
              {twist && !twist.builtin ? (
                <div className="place-twists__pad-actions">
                  <button type="button" onClick={() => chooseFile(index)} aria-label={`Remplacer ${twist.title}`} title="Remplacer"><RefreshCw aria-hidden="true" /></button>
                  <button type="button" onClick={() => removeSlot(index)} aria-label={`Supprimer ${twist.title}`} title="Supprimer"><Trash2 aria-hidden="true" /></button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {error ? <p className="place-twists__error" role="alert">{error}</p> : null}
    </section>
  );
}
