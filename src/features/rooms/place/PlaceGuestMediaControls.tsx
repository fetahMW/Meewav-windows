import { Camera, CameraOff, Mic, MicOff } from "lucide-react";
import type { PlaceParticipant, PlaceRoomState } from "./place.types";
import "./place-guest-media-controls.css";
import PlaceGuestQuickMessage from "./PlaceGuestQuickMessage";

export default function PlaceGuestMediaControls({ room, participant, isHost, onMute, onCamera }: {
  room: PlaceRoomState;
  participant: PlaceParticipant;
  isHost: boolean;
  onMute: (channelId: string) => void;
  onCamera: (profileId: string, enabled: boolean) => void;
}) {
  const channel = room.channels.find((item) => item.kind === "guest" && (
    item.participantId === participant.id || item.participantId === participant.profile.id
  ));
  const name = participant.profile.displayName;
  const hostMuted = channel?.isHostForcedMuted === true;
  const muted = channel?.isMuted === true || !participant.isMicrophoneEnabled;
  const microphoneLabel = `${hostMuted ? "Autoriser" : "Couper"} le micro à l’antenne de ${name}`;
  const cameraEnabled = participant.isCameraEnabled;
  const cameraForcedOff = participant.isHostForcedCameraOff === true;
  const cameraLabel = cameraEnabled ? `Couper la caméra de ${name}`
    : cameraForcedOff ? `Autoriser la caméra de ${name}` : `Caméra de ${name} déjà coupée`;
  return (
    <div className="place-guest-media-controls" role="group" aria-label={`Micro et caméra de ${name}`}>
      <button type="button" className={`place-guest-media-controls__button${muted ? " is-active" : ""}`}
        aria-label={microphoneLabel} aria-pressed={hostMuted}
        disabled={!isHost || !channel} onClick={() => { if (isHost && channel) onMute(channel.id); }}>
        {muted ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}
      </button>
      <button type="button" className={`place-guest-media-controls__button${cameraEnabled ? "" : " is-active"}`}
        aria-label={cameraLabel} aria-pressed={!cameraEnabled}
        disabled={!isHost || (!cameraEnabled && !cameraForcedOff)}
        onClick={() => { if (isHost && (cameraEnabled || cameraForcedOff)) onCamera(participant.profile.id, !cameraEnabled); }}>
        {cameraEnabled ? <Camera aria-hidden="true" /> : <CameraOff aria-hidden="true" />}
      </button>
      <PlaceGuestQuickMessage room={room} participant={participant} disabled={!isHost || room.currentUserProfile?.id === participant.profile.id} />
    </div>
  );
}
