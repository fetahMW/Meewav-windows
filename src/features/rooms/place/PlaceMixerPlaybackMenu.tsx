import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ListOrdered, Repeat1, Repeat2, Settings2, Shuffle } from "lucide-react";
import "./place-mixer-playback-menu.css";
import { useWaveTransport, useWaveTransportState } from "../wave-transport/WaveTransportProvider";

type PlaybackMode = "ordered" | "shuffle" | "loop";

const MODES = [
  { value: "ordered", label: "Lecture dans l’ordre", Icon: ListOrdered },
  { value: "shuffle", label: "Lecture aléatoire", Icon: Shuffle },
  { value: "loop", label: "Lecture en boucle", Icon: Repeat1 },
] as const;

export default function PlaceMixerPlaybackMenu({ open, onOpenChange, mode, onModeChange, canLoop, loopActive, onToggleLoop }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: PlaybackMode;
  onModeChange: (mode: PlaybackMode) => void;
  canLoop: boolean;
  loopActive: boolean;
  onToggleLoop: () => void;
}) {
  const transport = useWaveTransport();
  const wave = useWaveTransportState();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const [position, setPosition] = useState({ left: 8, top: 8 });

  // Render outside the player's clipping/stacking contexts, then anchor to
  // the real button position. The panel remains inside the visible viewport.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;
      const anchor = trigger.getBoundingClientRect();
      const bounds = menu.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportTop = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const minLeft = viewportLeft + 8;
      const minTop = viewportTop + 8;
      const maxLeft = Math.max(minLeft, viewportLeft + width - bounds.width - 8);
      const maxTop = Math.max(minTop, viewportTop + height - bounds.height - 8);
      const above = anchor.top - bounds.height - 8;
      const below = anchor.bottom + 8;
      const top = above >= minTop ? above : below <= maxTop ? below : minTop;
      setPosition({
        left: Math.min(maxLeft, Math.max(minLeft, anchor.right - bounds.width)),
        top: Math.min(maxTop, Math.max(minTop, top)),
      });
    };
    place();
    const initialChoice = menuRef.current?.querySelector<HTMLButtonElement>('button[aria-checked="true"]:not(:disabled)')
      ?? menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)");
    initialChoice?.focus({ preventScroll: true });
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!menuRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) onOpenChange(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, onOpenChange]);

  const close = () => {
    onOpenChange(false);
    triggerRef.current?.focus({ preventScroll: true });
  };

  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === "Tab") {
      // Resume the surrounding toolbar's natural tab order from the trigger.
      triggerRef.current?.focus({ preventScroll: true });
      onOpenChange(false);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const choices = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    if (!choices.length) return;
    const current = choices.indexOf(document.activeElement as HTMLButtonElement);
    const index = event.key === "Home" ? 0 : event.key === "End" ? choices.length - 1
      : (current + (event.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length;
    choices[index]?.focus();
  };

  return <span className="place-mixer-audio__playback-menu-shell">
    <button
      ref={triggerRef}
      type="button"
      className={`place-mixer-audio__playback-menu-button${open ? " is-active" : ""}`}
      onClick={() => onOpenChange(!open)}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); onOpenChange(true); }
      }}
      aria-label="Options de lecture"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? id : undefined}
    ><Settings2 aria-hidden="true" /></button>
    {open && typeof document !== "undefined" ? createPortal(
      <div ref={menuRef} id={id} className="place-mixer-playback-popover" role="menu" aria-label="Mode de lecture"
        style={{ left: position.left, top: position.top }} onKeyDown={keyboard}>
        <span className="place-mixer-playback-popover__caption">Lecture des pistes</span>
        {MODES.map(({ value, label, Icon }) => <button key={value} type="button" role="menuitemradio"
          tabIndex={-1} aria-checked={mode === value} onClick={() => { onModeChange(value); close(); }}>
          <Icon aria-hidden="true" /><span>{label}</span><i aria-hidden="true" />
        </button>)}
        <div className="place-mixer-playback-popover__separator" role="separator" />
        <button type="button" role="menuitemcheckbox" tabIndex={-1} aria-checked={loopActive}
          disabled={!canLoop} aria-describedby={`${id}-loop-hint`} onClick={() => { onToggleLoop(); close(); }}>
          <Repeat2 aria-hidden="true" /><span>{loopActive ? "Désactiver la boucle A–B" : "Activer la boucle A–B"}</span><i aria-hidden="true" />
        </button>
        {transport && wave ? <>
          <div className="place-mixer-playback-popover__length-heading">
            <span>Longueur</span><small>{wave.grid.bpm || "—"} BPM · {wave.grid.beatsPerBar}/4</small>
          </div>
          <div className="wave-musical-length" role="group" aria-label="Longueur de la zone A/B">
            <button type="button" role="menuitemradio" tabIndex={-1} aria-label="Libre A–B"
              aria-checked={wave.regionMode === "free"} disabled={!canLoop}
              onClick={() => {
                const start = wave.region?.start ?? wave.position;
                transport.engine.setFreeRegion(start, wave.region?.end ?? start + Math.max(.25, 4 * 60 / (wave.grid.bpm || 120) * wave.grid.beatsPerBar));
              }}><strong>A–B</strong><span>libre</span></button>
            {([4, 8, 16, 32] as const).map(bars => <button type="button" role="menuitemradio" key={bars}
              tabIndex={-1} aria-label={`${bars} mesures`} aria-checked={wave.regionMode === "musical" && wave.bars === bars}
              disabled={!canLoop || Boolean(wave.candidate?.bars && bars < wave.candidate.bars)}
              onClick={() => transport.engine.setRegion(wave.region?.start ?? wave.position, bars)}>
              <strong>{bars}</strong><span>mes.</span>
            </button>)}
          </div>
        </> : null}
        <p id={`${id}-loop-hint`} className="place-mixer-playback-popover__hint">
          {canLoop && wave?.regionMode === "free" ? "Glissez A et B séparément pour cadrer la boucle." : canLoop && wave ? "Chevrons et glisser : pas de 4 mesures, longueur conservée." : canLoop ? "Glissez A et B pour régler la zone. La cible revient au début." : "Chargez un son pour définir une boucle A–B."}
        </p>
        {transport?.context === "wave-sequencer" && wave ? <button type="button" role="menuitemcheckbox" tabIndex={-1} aria-checked={wave.voteBroadcast}
          disabled={!wave.voteEligible} onClick={() => transport.engine.setVoteBroadcast(!wave.voteBroadcast)}>
          <Repeat2 aria-hidden="true" /><span>Candidate du vote vers Public</span><i aria-hidden="true" />
        </button> : null}
        {wave && (wave.voteBroadcast || wave.error) ? <p className="place-mixer-playback-popover__hint" role="status">
          {wave.voteBroadcast ? "Candidate officielle armée. Choisissez Public puis Play pour diffuser." : wave.error}
        </p> : null}
      </div>, document.body,
    ) : null}
  </span>;
}
