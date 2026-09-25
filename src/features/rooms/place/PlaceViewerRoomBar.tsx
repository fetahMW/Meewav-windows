import { LogOut } from "lucide-react";
import { createPortal } from "react-dom";
import type { PlaceRoomState } from "./place.types";
type PlaceViewerRoomBarProps = {
  room: PlaceRoomState;
  canEngage: boolean;
  goldenUnavailable: boolean;
  onOpenDonation: () => void;
  onLike: () => void;
  onGoldenLike: () => void;
  onLeaveRoom?: () => void;
};

export default function PlaceViewerRoomBar({ onLeaveRoom }: PlaceViewerRoomBarProps) {
  return onLeaveRoom ? createPortal(<nav className="wave-viewer-exit" aria-label="Actions de la Room"><button type="button" onClick={onLeaveRoom}><LogOut aria-hidden="true" /><span>Quitter</span></button></nav>, document.body) : null;
}
