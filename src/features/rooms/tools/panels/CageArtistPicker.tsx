import { ArrowDown, ArrowUp, Search, Users } from "lucide-react";
import { useState } from "react";
import type { TournamentParticipant } from "../cageCompetition.types";

type Props = {
  people: TournamentParticipant[];
  selectedIds: string[];
  maximum: number;
  disabled: boolean;
  solo?: boolean;
  battle?: boolean;
  championship?: boolean;
  lockedIds?: string[];
  statusLabels?: Record<string, string>;
  onSelect: (id: string, selected: boolean) => void;
  onMove: (id: string, direction: -1 | 1) => void;
};

/** One list to choose artists and arrange their positions; no second registration workflow. */
export default function CageArtistPicker({ people, selectedIds, maximum, disabled, solo = false, battle = false, championship = false, lockedIds = [], statusLabels = {}, onSelect, onMove }: Props) {
  const [query, setQuery] = useState("");
  const selected = selectedIds.map(id => people.find(person => person.id === id)).filter((person): person is TournamentParticipant => Boolean(person));
  const others = people.filter(person => !selectedIds.includes(person.id));
  const normalized = query.trim().toLocaleLowerCase("fr");
  const visible = [...selected, ...others].filter(person => person.person.name.toLocaleLowerCase("fr").includes(normalized));
  return <section className="cage-artist-picker" aria-label={solo ? "Choisir et ordonner les artistes" : "Choisir et placer les artistes"}>
    <header><div><h3>{solo ? "Ordre de passage" : "Placement des artistes"}</h3><p>{people.length ? solo ? "Coche tes artistes, puis règle leur ordre." : championship ? "Coche tes artistes. Chacun rencontrera les autres." : battle ? "Les deux premiers ouvrent le duel, les suivants sont challengers." : "Coche tes artistes, puis ajuste les duels avec les flèches." : "Commence par choisir dans les invités."}</p></div>{people.length ? <output aria-label="Artistes sélectionnés">{selectedIds.length}<small> / {maximum}</small></output> : null}</header>
    {!people.length ? <div className="cage-artist-picker__empty"><Users aria-hidden="true" /><span>Les artistes disponibles apparaîtront ici.</span></div> : <>
      {people.length > 6 ? <label className="cage-artist-picker__search"><Search aria-hidden="true" /><input type="search" aria-label="Rechercher un artiste" placeholder="Rechercher un artiste" value={query} onChange={event => setQuery(event.target.value)} /></label> : null}
      <div className="cage-artist-picker__list">{visible.map(person => {
        const index = selectedIds.indexOf(person.id);
        const chosen = index >= 0;
        const locked = lockedIds.includes(person.id);
        return <div className={`cage-artist-picker__row${chosen ? " is-selected" : ""}`} key={person.id}>
          <label><input type="checkbox" aria-label={`Sélectionner ${person.person.name}`} checked={chosen} disabled={disabled || locked || (!chosen && (selectedIds.length >= maximum || !person.present || !person.eligible))} onChange={event => onSelect(person.id, event.target.checked)} />
            {person.person.avatarUrl ? <img src={person.person.avatarUrl} alt="" /> : <Users aria-hidden="true" />}
            <span><strong>{person.person.name}</strong><small>{!person.present ? "Indisponible" : chosen ? solo ? `Passage ${index + 1}${statusLabels[person.id] ? ` · ${statusLabels[person.id]}` : ""}` : championship ? `Position ${index + 1}` : battle && index > 1 ? `Challenger ${index - 1}` : `Duel ${Math.floor(index / 2) + 1} · ${index % 2 === 0 ? "A" : "B"}` : person.person.role}</small></span>
          </label>
          {chosen ? <span className="cage-artist-picker__order"><button type="button" aria-label={`Monter ${person.person.name}`} disabled={disabled || locked || index === 0 || lockedIds.includes(selectedIds[index - 1])} onClick={() => onMove(person.id, -1)}><ArrowUp aria-hidden="true" /></button><button type="button" aria-label={`Descendre ${person.person.name}`} disabled={disabled || locked || index === selectedIds.length - 1 || lockedIds.includes(selectedIds[index + 1])} onClick={() => onMove(person.id, 1)}><ArrowDown aria-hidden="true" /></button></span> : null}
        </div>;
      })}</div>
      {!visible.length ? <p>Aucun artiste avec ce nom.</p> : null}
    </>}
  </section>;
}
