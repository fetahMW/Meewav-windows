import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Clock3, Eye } from "lucide-react";
import { MeewavGradeBadge } from "../../grades/MeewavGradeBadge";
import type { RoomsHomeRoom } from "./roomsHome.types";
import "./rooms-home-components.css";

const CARD_MEDIA_FALLBACK = "/images/rooms/rooms-home-acoustic-2026-06-08.png";
const HostPreProfile = lazy(() => import("../tools/panels/ClassStudentPreProfile"));

const ROOM_TYPE_LABELS: Record<string, string> = {
  cage: "La Cage",
  classe: "La Classe",
  loge: "La Loge",
  place: "La Place",
  scene: "La Scène",
  wave: "La Wave",
};

const VIEWER_NUMBER_FORMATTER = new Intl.NumberFormat("fr-FR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export interface RoomCardProps {
  room: RoomsHomeRoom;
  featured?: boolean;
  priority?: boolean;
  onOpen: (room: RoomsHomeRoom) => void;
}

function initialsFor(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]?.toLocaleUpperCase("fr-FR") ?? "").join("") || "MW";
}

function roomTypeLabel(roomType: RoomsHomeRoom["roomType"]) {
  return ROOM_TYPE_LABELS[roomType] ?? roomType;
}

function liveDurationLabel(startedAt: string) {
  const elapsedMinutes = Math.max(1, Math.floor((Date.now() - new Date(startedAt).getTime()) / 60_000));
  if (elapsedMinutes < 60) return `${elapsedMinutes} min`;
  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  return minutes > 0 ? `${hours} h ${minutes}` : `${hours} h`;
}

export function RoomCard({ room, featured = false, priority = false, onOpen }: RoomCardProps) {
  const mediaRef = useRef<HTMLSpanElement | null>(null);
  const [mediaSource, setMediaSource] = useState(room.thumbnail);
  const [mediaUnavailable, setMediaUnavailable] = useState(false);
  const [videoUnavailable, setVideoUnavailable] = useState(false);
  const [videoVisible, setVideoVisible] = useState(priority);
  const [previewRequested, setPreviewRequested] = useState(false);
  const [avatarUnavailable, setAvatarUnavailable] = useState(false);
  const [profileTrigger, setProfileTrigger] = useState<HTMLButtonElement | null>(null);
  const isVertical = room.mediaFormat === "vertical";
  const viewerLabel = VIEWER_NUMBER_FORMATTER.format(room.viewerCount);
  const durationLabel = liveDurationLabel(room.startedAt);

  useEffect(() => {
    setMediaSource(room.thumbnail);
    setMediaUnavailable(false);
    setVideoUnavailable(false);
    setAvatarUnavailable(false);
  }, [room.hostAvatar, room.thumbnail, room.videoSource]);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media || typeof IntersectionObserver === "undefined") {
      setVideoVisible(priority);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      setVideoVisible(Boolean(entry?.isIntersecting));
    }, { rootMargin: "160px", threshold: 0.08 });
    observer.observe(media);
    return () => observer.disconnect();
  }, [priority, room.id]);

  const handleMediaError = () => {
    if (mediaSource !== CARD_MEDIA_FALLBACK) {
      setMediaSource(CARD_MEDIA_FALLBACK);
      return;
    }
    setMediaUnavailable(true);
  };

  return (
    <article
      className={[
        "rooms-home-card",
        featured ? "rooms-home-card--featured" : "",
        isVertical ? "rooms-home-card--vertical-media" : "rooms-home-card--horizontal-media",
        `rooms-home-card--${room.roomType}`,
      ].filter(Boolean).join(" ")}
    >
      <button
        type="button"
        className="rooms-home-card__action"
        onClick={() => onOpen(room)}
        onPointerEnter={(event) => { if (event.pointerType !== "touch") setPreviewRequested(true); }}
        onPointerLeave={() => setPreviewRequested(false)}
        onFocus={() => setPreviewRequested(true)}
        onBlur={() => setPreviewRequested(false)}
        aria-label={`Ouvrir ${room.title}, ${roomTypeLabel(room.roomType)}, animé par ${room.hostName}, ${viewerLabel} spectateurs`}
      >
        <span ref={mediaRef} className="rooms-home-card__media" aria-hidden="true">
          {(mediaUnavailable || !mediaSource) ? (
            <span className="rooms-home-card__media-fallback"><span>MW</span></span>
          ) : isVertical ? (
            <span className="rooms-home-card__vertical-stage">
              <img
                className="rooms-home-card__vertical-ambient"
                src={mediaSource}
                alt=""
                loading={priority ? "eager" : "lazy"}
                fetchPriority={priority ? "high" : "auto"}
                decoding="async"
                draggable={false}
              />
              <span className="rooms-home-card__vertical-window">
                <img
                  src={mediaSource}
                  alt=""
                  loading={priority ? "eager" : "lazy"}
                  fetchPriority={priority ? "high" : "auto"}
                  decoding="async"
                  onError={handleMediaError}
                />
                {room.videoSource && videoVisible && previewRequested && !videoUnavailable ? (
                  <video
                    src={room.videoSource}
                    poster={mediaSource}
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload={priority ? "metadata" : "none"}
                    tabIndex={-1}
                    onError={() => setVideoUnavailable(true)}
                  />
                ) : null}
              </span>
            </span>
          ) : (
            <>
              <img
                src={mediaSource}
                alt=""
                loading={priority ? "eager" : "lazy"}
                fetchPriority={priority ? "high" : "auto"}
                decoding="async"
                onError={handleMediaError}
              />
              {room.videoSource && videoVisible && previewRequested && !videoUnavailable ? (
                <video
                  src={room.videoSource}
                  poster={mediaSource}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload={priority ? "metadata" : "none"}
                  tabIndex={-1}
                  onError={() => setVideoUnavailable(true)}
                />
              ) : null}
            </>
          )}
          <span className="rooms-home-card__media-shade" />
          <span className="rooms-home-card__audience">
            <Eye aria-hidden="true" />
            <span>{viewerLabel}</span>
          </span>
          <span className="rooms-home-card__duration">
            <Clock3 aria-hidden="true" />
            <span>{durationLabel}</span>
          </span>
        </span>

        <span className="rooms-home-card__body">
          <span className="rooms-home-card__category-line"><span className="rooms-home-card__room-type">{roomTypeLabel(room.roomType)}</span><span className="rooms-home-card__city">{room.city ?? "France"} · {isVertical ? "9:16" : "16:9"}</span></span>
          <strong className="rooms-home-card__title">{room.title}</strong>
          <span className="rooms-home-card__host">
            <span className="rooms-home-card__avatar" aria-hidden="true">
              <span>{initialsFor(room.hostName)}</span>
              {!avatarUnavailable && room.hostAvatar ? (
                <img
                  src={room.hostAvatar}
                  alt=""
                  loading={priority ? "eager" : "lazy"}
                  decoding="async"
                  onError={() => setAvatarUnavailable(true)}
                />
              ) : null}
            </span>
            <span className="rooms-home-card__host-name">{room.hostName}</span>
            {room.gradeLevel ? (
              <MeewavGradeBadge
                level={room.gradeLevel}
                size="xs"
                variant="icon"
                labelMode="none"
                className="rooms-home-card__grade"
                title={`Badge niveau ${room.gradeLevel}`}
              />
            ) : null}
          </span>
        </span>
      </button>
      <button
        type="button"
        className="rooms-home-card__profile-trigger"
        aria-label={`Ouvrir le pré-profil de ${room.hostName}`}
        aria-haspopup="dialog"
        onClick={(event) => setProfileTrigger(event.currentTarget)}
      />
      {profileTrigger ? <Suspense fallback={null}><HostPreProfile
        person={{ id: room.hostId, name: room.hostName, avatarUrl: room.hostAvatar, role: room.hostRole,
          gradeLevel: room.gradeLevel, microphone: "off", camera: "off" }}
        source={/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(room.hostId) ? "live" : "demo"}
        returnFocusTo={profileTrigger}
        boundsElement={profileTrigger.closest<HTMLElement>(".rooms-home")}
        onClose={() => setProfileTrigger(null)}
      /></Suspense> : null}
    </article>
  );
}

export default RoomCard;
