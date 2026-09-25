import { Camera, CameraOff, Lock, LockOpen, Mic, MicOff, MonitorUp, Trash2, UserMinus, UserPlus } from "lucide-react";
import type { ClassSeat, ClasseState, RoomToolsCommand } from "../roomTools.types";
import { ToolNotice, ToolPanelHeader } from "./RoomToolPanelPrimitives";

const STATE_LABEL: Record<ClassSeat["status"], string> = { free: "Libre", reserved: "Réservée", connected: "Connectée", absent: "Absente", speaking: "Parole", listening: "Écoute", suspended: "Suspendue", "hand-raised": "Main levée", private: "Privé", muted: "Muet", disconnected: "Déconnectée" };

export default function ClassSeatsPanel({ classe, disabled, execute }: { classe: ClasseState; disabled: boolean; execute: (command: RoomToolsCommand) => Promise<unknown> }) {
  const occupied = classe.seats.filter((seat) => seat.person).length;
  const patch = (seat: ClassSeat, value: Partial<ClassSeat>) => execute({ type: "classe.seat.patch", seat: seat.number, patch: value });
  const assign = (seat: ClassSeat) => {
    const name = prompt(`Nom de la personne pour la place ${seat.number}`);
    if (!name?.trim()) return;
    const person = { id: `manual-seat-${seat.number}-${crypto.randomUUID()}`, name: name.trim(), role: "Accès manuel", avatarUrl: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=160&q=82", place: seat.number, access: "Accordé manuellement" as const, microphone: "muted" as const, camera: "off" as const };
    void patch(seat, { person, status: "connected", canSpeak: false, canShareScreen: false, handRaised: false });
  };
  return <div className="room-tool-panel is-class-seats">
    <ToolPanelHeader eyebrow="PARTICIPATION PREMIUM" title="Places & parole" description="Droits temporaires, sans réglages audio" status={`${occupied}/24 OCCUPÉES`} />
    <div className="room-class-seats__actions"><button type="button" disabled={disabled} onClick={() => void execute({ type: "classe.seats.lock", locked: !classe.seatsLocked })}>{classe.seatsLocked ? <Lock /> : <LockOpen />}{classe.seatsLocked ? "Déverrouiller les places" : "Verrouiller les 24 places"}</button><button type="button" disabled={disabled} onClick={() => classe.seats.forEach((seat) => { if (seat.person && seat.canSpeak) void patch(seat, { canSpeak: false, status: "listening" }); })}><MicOff />Couper les droits micro</button></div>
    <ToolNotice>La participation est réservée aux 24 places du cours. Un cadeau ne déclenche jamais le micro dans la session actuelle.</ToolNotice>
    <div className="room-class-seats__grid" role="list" aria-label="24 places du cours">{classe.seats.map((seat) => <article role="listitem" key={seat.number} className={`is-${seat.status}${seat.person ? " is-occupied" : ""}`}>
      <header><b>{String(seat.number).padStart(2, "0")}</b><span className={`room-tool-status is-${seat.status}`}>{STATE_LABEL[seat.status]}</span></header>
      {seat.person ? <>
        <div className="room-class-seats__identity"><img src={seat.person.avatarUrl} alt="" loading="lazy" /><span><strong>{seat.person.name}</strong><small>{seat.person.access}</small></span></div>
        <div className="room-class-seats__rights"><button type="button" className={seat.canSpeak ? "is-active" : ""} aria-pressed={seat.canSpeak} title="Droit de parole" disabled={disabled} onClick={() => void patch(seat, { canSpeak: !seat.canSpeak, status: !seat.canSpeak ? "speaking" : "listening" })}>{seat.canSpeak ? <Mic /> : <MicOff />}</button><button type="button" className={seat.person.camera === "ready" ? "is-active" : ""} aria-pressed={seat.person.camera === "ready"} title="Droit caméra" disabled={disabled} onClick={() => void patch(seat, { person: { ...seat.person!, camera: seat.person!.camera === "ready" ? "off" : "ready" } })}>{seat.person.camera === "ready" ? <Camera /> : <CameraOff />}</button><button type="button" className={seat.canShareScreen ? "is-active" : ""} aria-pressed={seat.canShareScreen} title="Droit de partage" disabled={disabled} onClick={() => void patch(seat, { canShareScreen: !seat.canShareScreen })}><MonitorUp /></button><button type="button" title="Suspendre de la participation" disabled={disabled} onClick={() => void patch(seat, { status: seat.status === "suspended" ? "listening" : "suspended", canSpeak: false })}><UserMinus /></button><button type="button" title="Libérer la place" disabled={disabled} onClick={() => { if (confirm(`Libérer la place ${seat.number} sans expulser ${seat.person?.name} du live ?`)) void patch(seat, { person: undefined, status: "free", canSpeak: false, canShareScreen: false, handRaised: false }); }}><Trash2 /></button></div>
      </> : <button type="button" className="room-class-seats__assign" disabled={disabled || classe.seatsLocked} onClick={() => assign(seat)}><UserPlus />Attribuer</button>}
    </article>)}</div>
  </div>;
}
