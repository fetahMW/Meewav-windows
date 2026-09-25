import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, X } from "lucide-react";
import type { PlaceParticipant, PlaceRoomState } from "./place.types";
import type { PlaceLiveKitVideoTrack } from "./placeLiveKit.service";
import PlaceGuestQuickMessage from "./PlaceGuestQuickMessage";
import "./place-guest-media-controls.css";
import "./place-guest-quick-message.css";

function CameraPreview({ item }: { item: PlaceLiveKitVideoTrack }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    item.track.attach(element);
    element.muted = true;
    void element.play().catch(() => undefined);
    return () => { item.track.detach(element); element.srcObject = null; };
  }, [item.track]);
  return <video ref={video} autoPlay muted playsInline aria-label="Aperçu caméra privé" />;
}

export default function PlaceBackstageControls({ room, participant, isHost, liveKitVideoTracks = [], dock = false }: {
  room: PlaceRoomState; participant: PlaceParticipant; isHost: boolean; liveKitVideoTracks?: PlaceLiveKitVideoTrack[]; dock?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const name = participant.profile.displayName;
  const item = participant.isCameraEnabled && room.source === "live" ? liveKitVideoTracks.find((track) =>
    track.participantIdentity === participant.profile.id && track.source === "camera" && !track.muted && !track.local
  ) : undefined;
  const demoUrl = room.source === "demo" && participant.isCameraEnabled ? participant.videoUrl : undefined;
  function close() { setOpen(false); dialog.current?.close(); trigger.current?.focus(); }
  useEffect(() => { if (!isHost || (participant.status !== "backstage" && !(dock && participant.status === "onstage"))) { setOpen(false); dialog.current?.close(); } }, [isHost, participant.status, dock]);
  return <div className={dock ? "place-guest-camera-dock" : "place-guest-media-controls"} role="group" aria-label={`Actions privées pour ${name}`}>
    <button ref={trigger} type="button" className="place-guest-media-controls__button" disabled={!isHost}
      aria-label={`Voir la caméra de ${name}`} aria-haspopup="dialog"
      onClick={() => { setFailed(false); setOpen(true); dialog.current?.showModal(); }}>
      {participant.isCameraEnabled ? <Camera aria-hidden="true" /> : <CameraOff aria-hidden="true" />}
      {dock ? <span>Caméra</span> : null}
    </button>
    {!dock ? <PlaceGuestQuickMessage room={room} participant={participant} disabled={!isHost || room.currentUserProfile?.id === participant.profile.id} /> : null}
    <dialog ref={dialog} className="place-guest-quick-message place-backstage-camera" aria-label={`Caméra de ${name}`}
      onCancel={(event) => { event.preventDefault(); close(); }} onClose={() => setOpen(false)}>
      <header><div><small>APERÇU HORS ANTENNE</small><strong>{name}</strong></div>
        <button type="button" aria-label="Fermer l’aperçu" onClick={close}><X aria-hidden="true" /></button></header>
      {open && isHost && (item ? <CameraPreview item={item} /> : demoUrl && !failed ?
        <><video src={demoUrl} autoPlay muted loop playsInline onError={() => setFailed(true)} /><p>Vidéo de démonstration — pas une caméra en direct.</p></> :
        <p role="status">{!participant.isCameraEnabled ? "L’artiste a coupé sa caméra." : "Aucun flux caméra autorisé n’est disponible pour cet aperçu."}</p>)}
      <p>Visible uniquement ici, sans passage sur scène et sans son.</p>
    </dialog>
  </div>;
}
