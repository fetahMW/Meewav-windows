import RoomViewerHost from "./RoomViewerHost";
import { useEffect, useState, type ReactNode } from "react";
import {
  CircleStop,
  Eye,
  Heart,
  LogOut,
  Star,
  Timer,
} from "lucide-react";
import MeewavPillarBrand from "../../../components/navigation/MeewavPillarBrand";
import { useRoomPresentation } from "../roomPresentation";
import PlaceLiveCallPicker from "./PlaceLiveCallPicker";
import type { PlaceLiveCallRequestHandler } from "./placeLiveCall";
import type { PlaceRoomState } from "./place.types";
import { formatPlaceRoomTime, usePlaceRoomTime } from "./placeRoomTime";
import WaveSimulationPicker from "../tools/WaveSimulationPicker";

type PlaceRoomShellHeaderProps = {
  centerSlot?: ReactNode;
  switchSlot?: ReactNode;
  productionSlot?: ReactNode;
  room: PlaceRoomState;
  isHost: boolean;
  endConfirmationOpen: boolean;
  onEndConfirmationOpen: (open: boolean) => void;
  onEndRoom: () => void | Promise<void>;
  onLeaveRoom?: () => void;
  onLiveCallRequest?: PlaceLiveCallRequestHandler;
};

function formatCompactMetric(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("fr-FR", {
    notation: value >= 1_000 ? "compact" : "standard",
    maximumFractionDigits: value >= 1_000 ? 1 : 0,
  }).format(value);
}

function formatLiveDuration(startedAt: string, now: number) {
  const seconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1_000));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainingSeconds = seconds % 60;
  return [hours, minutes, remainingSeconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export function SilverMoneyBagIcon() {
  return (
    <img
      className="place-room-shellbar__money-bag"
      src="/images/rooms/place/money-bag.svg"
      alt=""
      width="800"
      height="800"
      aria-hidden="true"
    />
  );
}

export default function PlaceRoomShellHeader({
  centerSlot,
  room,
  isHost,
  endConfirmationOpen,
  switchSlot,
  productionSlot,
  onEndConfirmationOpen,
  onEndRoom,
  onLeaveRoom,
  onLiveCallRequest,
}: PlaceRoomShellHeaderProps) {
  const roomPresentation = useRoomPresentation();
  const [now, setNow] = useState(() => Date.now());
  const countdown = usePlaceRoomTime();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <header className={`rooms-topbar place-room-shellbar ${isHost ? "is-host" : "is-viewer"}`} aria-label={`Bandeau de ${roomPresentation.label}`} data-room-presentation={roomPresentation.id} data-room-theme={roomPresentation.theme} data-room-role={isHost ? "host" : "viewer"}>
      <div className="place-room-shellbar__identity">
        <MeewavPillarBrand pillar={roomPresentation.label} />
        <output className={`place-room-shellbar__live-since${room.status === "ended" ? " is-ended" : ""}`} aria-label={`En live depuis ${formatLiveDuration(room.startedAt, now)}`}>
          <span><i aria-hidden="true" />{room.status === "ended" ? "LIVE TERMINÉ" : "EN DIRECT"}</span>
          <strong>{formatLiveDuration(room.startedAt, now)}</strong>
        </output>
        {<span className="place-room-shellbar__audience-group"><output className="wave-viewer-audience is-header-audience" aria-label={`Audience actuelle : ${formatCompactMetric(room.participantsCount)}`} title="Audience actuelle"><Eye aria-hidden="true" />{formatCompactMetric(room.participantsCount)}</output></span>}
        {switchSlot}
      </div>

      <div className="place-room-shellbar__broadcast-cluster" data-countdown-active={!centerSlot && countdown.enabled ? "true" : "false"} data-matchup-active={centerSlot ? "true" : "false"}>
        {isHost && roomPresentation.id === "wave" && room.source === "demo" ? <WaveSimulationPicker roomId={room.id} /> : null}
        {centerSlot ?? (countdown.enabled ? (
          <output className={`place-room-shellbar__countdown is-${countdown.status}`} aria-label={`Compte à rebours ${formatPlaceRoomTime(countdown.remainingMs)}`}>
            <Timer aria-hidden="true" />
            <span><strong>{formatPlaceRoomTime(countdown.remainingMs)}</strong></span>
          </output>
        ) : null)}
      </div>

      {!isHost ? <RoomViewerHost room={room} onLeaveRoom={onLeaveRoom} /> : null}
      {isHost ? (
        <div className="place-room-shellbar__host-side">
          <div className="place-room-shellbar__counters is-host" aria-label="Indicateurs de la Room">
            <PlaceLiveCallPicker roomId={room.id} onLiveCallRequest={onLiveCallRequest} />
            <output className="is-support" title="Soutien reçu">
              <SilverMoneyBagIcon />
              <strong>{formatCompactMetric(room.hatTotalAmount)}</strong>
            </output>
            <output className="is-golden" title="Golden Likes"><Star aria-hidden="true" /><strong>{formatCompactMetric(room.goldenLikesCount)}</strong></output>
            <output className="is-like" title="Likes"><Heart aria-hidden="true" /><strong>{formatCompactMetric(room.likesCount)}</strong></output>

          </div>
          <div className={`place-room-shellbar__actions${productionSlot ? " has-production" : ""}`} role="toolbar" aria-label="Actions de la Room">
            {room.status === "live" ? productionSlot : null}
            {room.status === "ended" && onLeaveRoom ? (
              <button type="button" className="is-leave" onClick={onLeaveRoom} title="Quitter la régie">
                <LogOut aria-hidden="true" />
                <span>Quitter</span>
              </button>
            ) : room.status === "live" ? (
              <button type="button" className="is-danger" onClick={() => onEndConfirmationOpen(true)}>
                <CircleStop aria-hidden="true" />
                <span>Terminer</span>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {isHost && room.status === "live" && endConfirmationOpen ? (
        <div className="place-room-shellbar__confirm" role="dialog" aria-modal="false" aria-label="Confirmer la fin du live">
          <span><strong>Terminer le live ?</strong><small>La diffusion et les passages invités seront arrêtés.</small></span>
          <button type="button" onClick={() => onEndConfirmationOpen(false)}>Annuler</button>
          <button type="button" className="is-danger" onClick={() => { onEndConfirmationOpen(false); void onEndRoom(); }}>Terminer</button>
        </div>
      ) : null}
    </header>
  );
}
