import { Move, RotateCcw } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

type PlaceScreenSharePreviewProps = {
  stream: MediaStream | null;
  host: {
    displayName: string;
    avatarUrl: string;
  };
  layout?: "host-primary" | "source-primary";
};

type PreviewPosition = { x: number; y: number };

const DEFAULT_POSITION: PreviewPosition = { x: 40, y: 10 };
const MAX_POSITION: PreviewPosition = { x: 48, y: 52 };
const KEYBOARD_STEP = 2;
const KEYBOARD_LARGE_STEP = 8;

function clampPosition(value: number, maximum: number) {
  return Math.min(maximum, Math.max(0, Math.round(value * 10) / 10));
}

function positionStyle(position: PreviewPosition) {
  return {
    "--place-screen-x": `${position.x}%`,
    "--place-screen-y": `${position.y}%`,
  } as CSSProperties;
}

export default function PlaceScreenSharePreview({ stream, host, layout = "host-primary" }: PlaceScreenSharePreviewProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const [position, setPosition] = useState<PreviewPosition>(DEFAULT_POSITION);
  const hostInitial = host.displayName.trim().slice(0, 1).toLocaleUpperCase("fr-FR") || "H";

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    const playback = video.play();
    if (playback) void playback.catch(() => undefined);

    return () => {
      if (video.srcObject === stream) video.srcObject = null;
    };
  }, [stream]);

  useEffect(() => {
    setPosition(DEFAULT_POSITION);
    dragRef.current = null;
  }, [stream]);

  const moveBy = (deltaX: number, deltaY: number) => {
    setPosition((current) => ({
      x: clampPosition(current.x + deltaX, MAX_POSITION.x),
      y: clampPosition(current.y + deltaY, MAX_POSITION.y),
    }));
  };

  const resetPosition = () => setPosition(DEFAULT_POSITION);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? KEYBOARD_LARGE_STEP : KEYBOARD_STEP;
    if (event.key === "Home") {
      event.preventDefault();
      resetPosition();
      return;
    }
    const movement = event.key === "ArrowLeft"
      ? [-step, 0]
      : event.key === "ArrowRight"
        ? [step, 0]
        : event.key === "ArrowUp"
          ? [0, -step]
          : event.key === "ArrowDown"
            ? [0, step]
            : null;
    if (!movement) return;
    event.preventDefault();
    moveBy(movement[0], movement[1]);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - bounds.left - (position.x / 100) * bounds.width,
      offsetY: event.clientY - bounds.top - (position.y / 100) * bounds.height,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.currentTarget.focus();
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !canvas) return;
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    setPosition({
      x: clampPosition(((event.clientX - bounds.left - drag.offsetX) / bounds.width) * 100, MAX_POSITION.x),
      y: clampPosition(((event.clientY - bounds.top - drag.offsetY) / bounds.height) * 100, MAX_POSITION.y),
    });
  };

  const finishPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div ref={canvasRef} className="place-tool-screen__canvas" data-has-source={Boolean(stream)} data-layout={layout}>
      <span className="place-tool-screen__host-fallback" aria-hidden="true">{hostInitial}</span>
      {host.avatarUrl ? <img
        className="place-tool-screen__host-image"
        src={host.avatarUrl}
        alt={`Aperçu permanent du Host ${host.displayName}`}
        onError={(event) => { event.currentTarget.hidden = true; }}
      /> : null}
      <span className="place-tool-screen__host-label"><i /> HOST · {host.displayName}</span>

      {stream ? (
        <>
          <div
            className="place-tool-screen__source-layer"
            style={layout === "host-primary" ? positionStyle(position) : undefined}
            role="group"
            tabIndex={layout === "host-primary" ? 0 : undefined}
            aria-label={layout === "host-primary"
              ? `Position de la fenêtre partagée : ${Math.round(position.x)} % horizontal, ${Math.round(position.y)} % vertical`
              : "Fenêtre du DAW sélectionnée"}
            aria-keyshortcuts={layout === "host-primary" ? "ArrowLeft ArrowRight ArrowUp ArrowDown Home" : undefined}
            onKeyDown={layout === "host-primary" ? handleKeyDown : undefined}
            onPointerDown={layout === "host-primary" ? handlePointerDown : undefined}
            onPointerMove={layout === "host-primary" ? handlePointerMove : undefined}
            onPointerUp={layout === "host-primary" ? finishPointer : undefined}
            onPointerCancel={layout === "host-primary" ? finishPointer : undefined}
            onLostPointerCapture={layout === "host-primary" ? finishPointer : undefined}
          >
            <video
              ref={videoRef}
              className="place-tool-screen__video"
              aria-label="Prévisualisation locale de la source sélectionnée"
              autoPlay
              muted
              playsInline
            />
            {layout === "host-primary" ? <span className="place-tool-screen__drag-handle" aria-hidden="true"><Move /></span> : null}
          </div>
          {layout === "host-primary" ? <div className="place-tool-screen__position-tools">
            <output aria-live="polite">Position {Math.round(position.x)} / {Math.round(position.y)}</output>
            <button type="button" onClick={resetPosition} aria-label="Réinitialiser la position de la fenêtre"><RotateCcw aria-hidden="true" /></button>
          </div> : null}
        </>
      ) : null}
    </div>
  );
}
