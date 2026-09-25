import { Scale } from "lucide-react";
import "./room-voting.css";

export default function RoomJuryControl({ count, selected, onClick }: {
  count: number; selected: boolean; onClick: () => void;
}) {
  return <span className="room-jury-control">
    <button type="button" aria-pressed={selected} onClick={onClick} aria-label={`Afficher les membres du jury, ${count} sur 4`}>
      <Scale aria-hidden="true" />Jury <span>{count}/4</span>
    </button>
  </span>;
}
