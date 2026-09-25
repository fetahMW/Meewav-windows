import { Hand, HandMetal, Mic, MicOff, RotateCcw, ShieldBan } from "lucide-react";
import type { ClasseState, RoomActorRole, RoomToolsCommand } from "../roomTools.types";
import { EmptyState, PersonChip, ToolPanelHeader, ToolSection } from "./RoomToolPanelPrimitives";

function waitLabel(raisedAt: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(raisedAt).getTime()) / 1_000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)} min`;
}

export default function ClassHandsPanel({ classe, role, accountId, disabled, execute }: { classe: ClasseState; role: RoomActorRole; accountId: string; disabled: boolean; execute: (command: RoomToolsCommand) => Promise<unknown> }) {
  const activeSpeaker = classe.people.find((person) => person.id === classe.activeSpeakerId);
  return <div className="room-tool-panel is-class-hands">
    <ToolPanelHeader eyebrow="PRISE DE PAROLE" title="Gestion des mains" description="Une file séparée de la file des invités" status={classe.handsOpen ? `${classe.raisedHands.length} EN ATTENTE` : "MAINS BLOQUÉES"} />
    <div className="room-class-hands__summary">
      <span className={classe.handsOpen ? "is-open" : "is-closed"}>{classe.handsOpen ? <Hand /> : <ShieldBan />}<span><strong>{classe.handsOpen ? "Mains ouvertes" : "Mains bloquées"}</strong><small>{classe.handsOpen ? "Les participants autorisés peuvent demander la parole" : "Aucune nouvelle demande"}</small></span></span>
      <div><button type="button" disabled={disabled} onClick={() => void execute({ type: "classe.hands.open", open: !classe.handsOpen })}>{classe.handsOpen ? "Bloquer" : "Autoriser"}</button><button type="button" disabled={disabled || !classe.raisedHands.length} onClick={() => void execute({ type: "classe.hands.lower" })}>Baisser toutes</button></div>
    </div>
    <ToolSection title="Parole active">
      {activeSpeaker ? <div className="room-class-hands__speaker"><PersonChip person={activeSpeaker} detail="Prise de parole en cours" /><span><Mic /> Micro autorisé</span><button type="button" className="is-danger" disabled={disabled} onClick={() => void execute({ type: "classe.speaker", personId: null })}><MicOff />Terminer la prise de parole</button></div> : <EmptyState title="Personne ne parle">Donnez la parole à la prochaine main levée.</EmptyState>}
    </ToolSection>
    <ToolSection title={`File des mains · ${classe.raisedHands.length}`} action={<button type="button" disabled={disabled || !classe.raisedHands.length || Boolean(activeSpeaker)} onClick={() => classe.raisedHands[0] && void execute({ type: "classe.speaker", personId: classe.raisedHands[0].personId })}><HandMetal />Personne suivante</button>}>
      <ol className="room-class-hands__queue">{classe.raisedHands.map((hand, index) => {
        const participant = classe.people.find((person) => person.id === hand.personId);
        if (!participant) return null;
        return <li key={hand.personId}><b>{index + 1}</b><PersonChip person={participant} detail={`Place ${participant.place ?? "—"} · attente ${waitLabel(hand.raisedAt)}`} /><span className="room-tool-media-state"><Mic className={participant.microphone === "ready" ? "is-ready" : "is-off"} />{participant.camera === "ready" ? "Caméra prête" : "Caméra coupée"}</span><div><button type="button" className="is-primary" disabled={disabled || Boolean(activeSpeaker)} onClick={() => void execute({ type: "classe.speaker", personId: participant.id })}><Mic />Donner la parole</button><button type="button" disabled={disabled} onClick={() => void execute({ type: "classe.hands.lower", personId: participant.id })}><RotateCcw />Baisser</button></div></li>;
      })}</ol>
      {!classe.raisedHands.length ? <EmptyState title="Aucune main levée">La file se remplira dans l’ordre des demandes.</EmptyState> : null}
    </ToolSection>
    {role === "premium_participant" ? <button type="button" className="is-primary" disabled={!classe.handsOpen || classe.raisedHands.some((hand) => hand.personId === accountId)} onClick={() => void execute({ type: "classe.hand.raise", personId: accountId })}><Hand />Lever la main</button> : role === "viewer" || role === "visitor" ? <p className="room-tool-notice is-warning">La participation est réservée aux 24 places du cours.</p> : null}
  </div>;
}
