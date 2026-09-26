import MeewavSelect from "../../../../components/shared/MeewavSelect";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Crown,
  GitBranch,
  ListOrdered,
  Medal,
  Mic2,
  Radio,
  RefreshCw,
  Save,
  Settings2,
  Shuffle,
  Sparkles,
  Trophy,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  cageEntrants,
  cageEvent,
  cageOpenMicEntries,
  cageStandings,
  normalizedCageFormat,
} from "../cageTools.domain";
import type {
  CageEventFormat,
  CageEventStatus,
  CageMatch,
  CageOpenMicEntryStatus,
  CageSeedingMode,
  CageState,
  RoomPerson,
  RoomToolsCommand,
} from "../roomTools.types";

type CageCompetitionPanelProps = {
  cage: CageState;
  disabled: boolean;
  execute: (command: RoomToolsCommand) => Promise<unknown>;
  onOpenBattle?: () => void;
};

const FORMAT_OPTIONS: Array<{
  id: CageEventFormat;
  label: string;
  detail: string;
  icon: typeof Trophy;
}> = [
  { id: "tournament", label: "Tournoi", detail: "Élimination directe", icon: GitBranch },
  { id: "championship", label: "Championnat", detail: "Classement & calendrier", icon: Trophy },
  { id: "open-mic", label: "Open mic", detail: "Ordre de passage", icon: Mic2 },
];

const SEEDING_OPTIONS: Array<{
  id: CageSeedingMode;
  label: string;
  icon: typeof Medal;
}> = [
  { id: "ranking", label: "Classement", icon: Medal },
  { id: "random", label: "Aléatoire", icon: Shuffle },
  { id: "manual", label: "Manuel", icon: Settings2 },
];

const EVENT_STATUS_OPTIONS: Array<{ id: CageEventStatus; label: string }> = [
  { id: "draft", label: "Brouillon" },
  { id: "ready", label: "Prêt" },
  { id: "published", label: "Publié" },
  { id: "live", label: "En direct" },
  { id: "completed", label: "Terminé" },
];

const MATCH_STATUS_LABEL: Record<CageMatch["status"], string> = {
  scheduled: "À venir",
  ready: "Prêt",
  live: "En direct",
  done: "Terminé",
};

const OPEN_MIC_STATUS_OPTIONS: Array<{ id: CageOpenMicEntryStatus; label: string }> = [
  { id: "scheduled", label: "Programmé" },
  { id: "ready", label: "Prêt" },
  { id: "live", label: "En direct" },
  { id: "done", label: "Passé" },
  { id: "absent", label: "Absent" },
];

function eventStatusLabel(status: CageEventStatus) {
  return EVENT_STATUS_OPTIONS.find((option) => option.id === status)?.label ?? status;
}

function roundLabel(round: number, index: number, roundCount: number, championship = false) {
  if (championship) return `Journée ${round}`;
  if (index === roundCount - 1) return "Finale";
  if (index === roundCount - 2) return "Demi-finales";
  if (index === roundCount - 3) return "Quarts de finale";
  return `Tour ${round}`;
}

function updatedAtLabel(value: string) {
  if (!value) return "État hérité · à enregistrer";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Mise à jour récente";
  return `Mis à jour ${new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)}`;
}

function ProfileAvatar({ person }: { person?: RoomPerson }) {
  if (person?.avatarUrl) return <img src={person.avatarUrl} alt="" loading="lazy" />;
  const initials = (person?.name ?? "Participant")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
  return <span className="cage-bracket-avatar__fallback" aria-hidden="true">{initials || "?"}</span>;
}

function MatchParticipant({ person, score, winner, visibleScore }: { person: RoomPerson; score: number; winner: boolean; visibleScore: boolean }) {
  return <span className={`cage-bracket-match__person${winner ? " is-winner" : ""}`}>
    <span className="cage-bracket-match__avatar"><ProfileAvatar person={person} /></span>
    <span className="cage-bracket-match__identity"><strong>{person.name}</strong><small>{person.role}</small></span>
    {winner ? <Crown aria-label="Vainqueur" /> : null}
    <b>{visibleScore ? score : "—"}</b>
  </span>;
}

function MatchCard({ match, selected, disabled, onSelect }: { match: CageMatch; selected: boolean; disabled: boolean; onSelect: () => void }) {
  const visibleScore = match.status === "live" || match.status === "done";
  const matchIdParts = match.id.split("-");
  const shortMatchId = matchIdParts[matchIdParts.length - 1]?.toUpperCase();
  return <button
    type="button"
    className={`cage-bracket-match is-${match.status}${selected ? " is-selected" : ""}`}
    aria-pressed={selected}
    disabled={disabled}
    onClick={onSelect}
  >
    <span className="cage-bracket-match__meta"><em>DUEL {shortMatchId}</em><span className={`is-${match.status}`}><i />{MATCH_STATUS_LABEL[match.status]}</span></span>
    <MatchParticipant person={match.competitorA} score={match.scoreA} winner={match.winnerId === match.competitorA.id} visibleScore={visibleScore} />
    <span className="cage-bracket-match__versus"><i />VS<i /></span>
    <MatchParticipant person={match.competitorB} score={match.scoreB} winner={match.winnerId === match.competitorB.id} visibleScore={visibleScore} />
  </button>;
}

function SelectionProfile({ person, fallback }: { person?: RoomPerson; fallback: string }) {
  return <span className="cage-bracket-inspector__profile">
    <span><ProfileAvatar person={person} /></span>
    <span><strong>{person?.name ?? fallback}</strong><small>{person?.role ?? "Participant"}</small></span>
  </span>;
}

export default function CageCompetitionPanel({ cage, disabled, execute, onOpenBattle }: CageCompetitionPanelProps) {
  const persistedEvent = cageEvent(cage);
  const resolvedFormat = normalizedCageFormat(cage.format);
  const people = useMemo(() => cageEntrants(cage), [cage]);
  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const standings = useMemo(() => cageStandings(cage), [cage]);
  const openMicEntries = useMemo(() => cageOpenMicEntries(cage), [cage]);

  const [format, setFormat] = useState<CageEventFormat>(resolvedFormat);
  const [title, setTitle] = useState(persistedEvent.title);
  const [discipline, setDiscipline] = useState(persistedEvent.discipline);
  const [seeding, setSeeding] = useState<CageSeedingMode>(persistedEvent.seeding);
  const [eventStatus, setEventStatus] = useState<CageEventStatus>(persistedEvent.status);
  const [selectedMatchId, setSelectedMatchId] = useState(cage.currentMatchId);
  const [selectedEntryId, setSelectedEntryId] = useState(() => openMicEntries.find((entry) => entry.status === "live")?.id ?? openMicEntries[0]?.id ?? "");
  const [selectedChampionshipRound, setSelectedChampionshipRound] = useState(() => cage.matches.find((match) => match.id === cage.currentMatchId)?.round ?? 1);
  const [setupExpanded, setSetupExpanded] = useState(() => resolvedFormat === "open-mic"
    ? !cage.openMicEntries?.length
    : cage.matches.length === 0);

  useEffect(() => setFormat(resolvedFormat), [resolvedFormat]);
  useEffect(() => {
    setTitle(persistedEvent.title);
    setDiscipline(persistedEvent.discipline);
    setSeeding(persistedEvent.seeding);
    setEventStatus(persistedEvent.status);
  }, [persistedEvent.discipline, persistedEvent.seeding, persistedEvent.status, persistedEvent.title]);
  useEffect(() => {
    if (cage.currentMatchId) setSelectedMatchId(cage.currentMatchId);
  }, [cage.currentMatchId]);
  useEffect(() => {
    if (openMicEntries.some((entry) => entry.id === selectedEntryId)) return;
    setSelectedEntryId(openMicEntries.find((entry) => entry.status === "live")?.id ?? openMicEntries[0]?.id ?? "");
  }, [openMicEntries, selectedEntryId]);
  useEffect(() => {
    const hasStructure = format === "open-mic" ? Boolean(cage.openMicEntries?.length) : cage.matches.length > 0;
    if (!hasStructure) setSetupExpanded(true);
  }, [cage.matches.length, cage.openMicEntries?.length, format]);

  const matchesByRound = useMemo(() => {
    const grouped = new Map<number, CageMatch[]>();
    cage.matches.forEach((match) => grouped.set(match.round, [...(grouped.get(match.round) ?? []), match]));
    return Array.from(grouped.entries()).sort(([roundA], [roundB]) => roundA - roundB);
  }, [cage.matches]);

  const selectedMatch = cage.matches.find((match) => match.id === selectedMatchId)
    ?? cage.matches.find((match) => match.status === "live")
    ?? cage.matches[0];
  const selectedEntry = openMicEntries.find((entry) => entry.id === selectedEntryId) ?? openMicEntries[0];
  const selectedEntryPerson = selectedEntry ? peopleById.get(selectedEntry.personId) : undefined;
  const activeFormat = FORMAT_OPTIONS.find((option) => option.id === format) ?? FORMAT_OPTIONS[0];
  const totalItems = format === "open-mic" ? openMicEntries.length : cage.matches.length;
  const completedItems = format === "open-mic"
    ? openMicEntries.filter((entry) => entry.status === "done").length
    : cage.matches.filter((match) => match.status === "done").length;
  const hasPersistedStructure = format === "open-mic" ? Boolean(cage.openMicEntries?.length) : cage.matches.length > 0;
  const selectedChampionshipMatches = matchesByRound.find(([round]) => round === selectedChampionshipRound)
    ?? matchesByRound[0];

  const changeFormat = (nextFormat: CageEventFormat) => {
    setFormat(nextFormat);
    setSetupExpanded(true);
    void execute({ type: "cage.format", format: nextFormat });
  };

  const saveConfiguration = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanTitle = title.trim();
    const cleanDiscipline = discipline.trim();
    if (!cleanTitle || !cleanDiscipline) return;
    void execute({
      type: "cage.event.patch",
      patch: { title: cleanTitle, discipline: cleanDiscipline, seeding },
    });
  };

  const changeEventStatus = (status: CageEventStatus) => {
    setEventStatus(status);
    void execute({ type: "cage.event.status", status });
  };

  const selectMatch = (matchId: string) => {
    setSelectedMatchId(matchId);
    const nextMatch = cage.matches.find((match) => match.id === matchId);
    if (nextMatch && format === "championship") setSelectedChampionshipRound(nextMatch.round);
  };

  const openSelectedMatchInBattle = async () => {
    if (!selectedMatch || !onOpenBattle) return;
    if (selectedMatch.id !== cage.currentMatchId) {
      await execute({ type: "cage.match.select", matchId: selectedMatch.id });
    }
    onOpenBattle();
  };

  return <div className="room-tool-panel is-cage-competition">
    <header className="cage-bracket-console__hero">
      <span className="cage-bracket-console__glyph"><GitBranch aria-hidden="true" /></span>
      <span className="cage-bracket-console__heading">
        <small>CAGE · CONTROL CENTER</small>
        <strong>Bracket</strong>
        <em>Construire, publier et piloter chaque passage.</em>
      </span>
      <span className="cage-bracket-console__summary">
        <span><UsersRound aria-hidden="true" /><b>{people.length}</b><small>participants</small></span>
        <span className={`is-${eventStatus}`}><i /><b>{eventStatusLabel(eventStatus)}</b><small>événement</small></span>
      </span>
    </header>

    <nav className="cage-bracket-formats" aria-label="Format de compétition">
      {FORMAT_OPTIONS.map((option) => {
        const Icon = option.icon;
        return <button
          type="button"
          key={option.id}
          className={format === option.id ? "is-active" : ""}
          aria-pressed={format === option.id}
          disabled={disabled}
          onClick={() => changeFormat(option.id)}
        >
          <span><Icon aria-hidden="true" /></span>
          <span><strong>{option.label}</strong><small>{option.detail}</small></span>
          {format === option.id ? <Check aria-hidden="true" /> : null}
        </button>;
      })}
    </nav>

    <form className={`cage-bracket-setup ${setupExpanded ? "is-expanded" : "is-collapsed"}`} onSubmit={saveConfiguration}>
      <header>
        <button
          type="button"
          className="cage-bracket-setup__toggle"
          aria-expanded={setupExpanded}
          onClick={() => setSetupExpanded((expanded) => !expanded)}
        >
          <span className="cage-bracket-setup__title"><Sparkles aria-hidden="true" /><span><strong>Configuration de l’événement</strong><small>{setupExpanded ? "Visible par le public après publication" : "Titre, discipline, seeding et publication"}</small></span></span>
          {!setupExpanded ? <span className="cage-bracket-setup__snapshot"><strong>{title || "Événement sans titre"}</strong><small>{discipline || "Discipline à définir"} · {SEEDING_OPTIONS.find((option) => option.id === seeding)?.label}</small></span> : null}
          <ChevronDown className="cage-bracket-setup__chevron" aria-hidden="true" />
        </button>
        {setupExpanded ? <span className="cage-bracket-setup__updated">{updatedAtLabel(persistedEvent.updatedAt)}</span> : null}
      </header>
      {setupExpanded ? <>
        <div className="cage-bracket-setup__fields">
          <label><span>Titre</span><input aria-label="Titre de l'événement" value={title} disabled={disabled} onChange={(event) => setTitle(event.currentTarget.value)} placeholder="Cage Masters — Paris" /></label>
          <label><span>Discipline</span><input aria-label="Discipline" value={discipline} disabled={disabled} onChange={(event) => setDiscipline(event.currentTarget.value)} placeholder="Danse, rap, beatbox…" /></label>
          <fieldset>
            <legend>Seeding</legend>
            <div className="cage-bracket-seeding">
              {SEEDING_OPTIONS.map((option) => {
                const Icon = option.icon;
                return <button type="button" key={option.id} className={seeding === option.id ? "is-active" : ""} aria-pressed={seeding === option.id} disabled={disabled} onClick={() => setSeeding(option.id)}><Icon aria-hidden="true" />{option.label}</button>;
              })}
            </div>
          </fieldset>
          <label><span>Statut</span><MeewavSelect aria-label="Statut de l'événement" value={eventStatus} disabled={disabled} onChange={(event) => changeEventStatus(event.currentTarget.value as CageEventStatus)}>{EVENT_STATUS_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</MeewavSelect></label>
        </div>
        <footer>
          <span>Le seeding organise le départ. Les résultats restent souverains.</span>
          <div>
            <button type="submit" className="cage-bracket-action is-secondary" disabled={disabled || !title.trim() || !discipline.trim()}><Save aria-hidden="true" />Enregistrer</button>
            <button type="button" className="cage-bracket-action is-primary" disabled={disabled || people.length < (format === "open-mic" ? 1 : 2)} onClick={() => void execute({ type: "cage.structure.generate", format, seeding })}>{hasPersistedStructure ? <RefreshCw aria-hidden="true" /> : <Sparkles aria-hidden="true" />}{hasPersistedStructure ? "Régénérer" : "Générer"} la structure</button>
          </div>
        </footer>
      </> : null}
    </form>

    <div className="cage-bracket-workspace">
      <main className="cage-bracket-stage">
        <header className="cage-bracket-stage__header">
          <span><small>{activeFormat.label.toUpperCase()} · STRUCTURE OFFICIELLE</small><strong>{persistedEvent.title}</strong><em>{persistedEvent.discipline}</em></span>
          <span className="cage-bracket-stage__progress"><span><i style={{ width: totalItems ? `${Math.round((completedItems / totalItems) * 100)}%` : "0%" }} /></span><small>{completedItems}/{totalItems} terminés</small></span>
        </header>

        {format === "tournament" ? <div className="cage-bracket-rounds" tabIndex={0} aria-label="Tableau du tournoi par tours">
          {matchesByRound.length ? matchesByRound.map(([round, matches], roundIndex) => <section className="cage-bracket-round" key={round}>
            <header><span>{String(roundIndex + 1).padStart(2, "0")}</span><span><strong>{roundLabel(round, roundIndex, matchesByRound.length)}</strong><small>{matches.length} duel{matches.length > 1 ? "s" : ""}</small></span></header>
            <div>{matches.map((match) => <MatchCard key={match.id} match={match} selected={selectedMatch?.id === match.id} disabled={disabled} onSelect={() => selectMatch(match.id)} />)}</div>
          </section>) : <div className="cage-bracket-empty"><GitBranch aria-hidden="true" /><strong>Le tableau attend ses participants</strong><span>Choisissez le seeding puis générez la structure.</span><button type="button" disabled={disabled || people.length < 2} onClick={() => void execute({ type: "cage.structure.generate", format, seeding })}>Générer le tournoi</button></div>}
        </div> : null}

        {format === "championship" ? <div className="cage-championship">
          <section className="cage-championship__standings">
            <header><span><Medal aria-hidden="true" /><span><strong>Classement</strong><small>3 pts victoire · 1 pt nul</small></span></span><b>{standings.length} engagés</b></header>
            <div className="cage-championship__table-scroll">
              <table>
                <thead><tr><th>#</th><th>Participant</th><th>J</th><th>V</th><th>N</th><th>D</th><th>+/-</th><th>PTS</th></tr></thead>
                <tbody>{standings.map((row, index) => <tr key={row.person.id} className={index < 3 ? "is-podium" : ""}>
                  <td><b>{index + 1}</b></td>
                  <td><span className="cage-championship__person"><span><ProfileAvatar person={row.person} /></span><span><strong>{row.person.name}</strong><small>{row.person.role}</small></span></span></td>
                  <td>{row.played}</td><td>{row.wins}</td><td>{row.draws}</td><td>{row.losses}</td><td>{row.difference > 0 ? "+" : ""}{row.difference}</td><td><strong>{row.points}</strong></td>
                </tr>)}</tbody>
              </table>
            </div>
          </section>
          <section className="cage-championship__calendar">
            <header><span><CalendarDays aria-hidden="true" /><span><strong>Calendrier</strong><small>{matchesByRound.length} journées</small></span></span>{selectedChampionshipMatches ? <b>J{selectedChampionshipMatches[0]}</b> : null}</header>
            {matchesByRound.length ? <nav className="cage-championship__days" aria-label="Journée du championnat">
              {matchesByRound.map(([round, matches]) => <button type="button" key={round} className={selectedChampionshipMatches?.[0] === round ? "is-active" : ""} aria-pressed={selectedChampionshipMatches?.[0] === round} onClick={() => setSelectedChampionshipRound(round)}><span>J{round}</span><small>{matches.filter((match) => match.status === "done").length}/{matches.length}</small></button>)}
            </nav> : null}
            <div>{selectedChampionshipMatches ? <section key={selectedChampionshipMatches[0]}>
              <header><strong>{roundLabel(selectedChampionshipMatches[0], matchesByRound.findIndex(([round]) => round === selectedChampionshipMatches[0]), matchesByRound.length, true)}</strong><small>{selectedChampionshipMatches[1].filter((match) => match.status === "done").length}/{selectedChampionshipMatches[1].length}</small></header>
              {selectedChampionshipMatches[1].map((match) => <button type="button" key={match.id} className={`${selectedMatch?.id === match.id ? "is-selected " : ""}is-${match.status}`} aria-pressed={selectedMatch?.id === match.id} disabled={disabled} onClick={() => selectMatch(match.id)}>
                <span><strong>{match.competitorA.name}</strong><small>{match.competitorB.name}</small></span><b>{match.status === "done" || match.status === "live" ? `${match.scoreA} — ${match.scoreB}` : "VS"}</b><em>{MATCH_STATUS_LABEL[match.status]}</em>
              </button>)}
            </section> : <div className="cage-bracket-empty"><CalendarDays aria-hidden="true" /><strong>Aucun calendrier</strong><span>Générez les journées du championnat.</span></div>}</div>
          </section>
        </div> : null}

        {format === "open-mic" ? <section className="cage-open-mic">
          <header><span><ListOrdered aria-hidden="true" /><span><strong>Ordre de passage</strong><small>La file Invités reste indépendante</small></span></span><b>{openMicEntries.filter((entry) => entry.status === "ready").length} prêts</b></header>
          {openMicEntries.length ? <ol>{openMicEntries.map((entry, index) => {
            const person = peopleById.get(entry.personId);
            return <li key={entry.id} className={`is-${entry.status}${selectedEntry?.id === entry.id ? " is-selected" : ""}`}>
              <button type="button" className="cage-open-mic__identity" aria-pressed={selectedEntry?.id === entry.id} onClick={() => setSelectedEntryId(entry.id)}>
                <b>{String(index + 1).padStart(2, "0")}</b><span><ProfileAvatar person={person} /></span><span><strong>{person?.name ?? `Participant ${index + 1}`}</strong><small>{person?.role ?? "Open mic"}</small></span>
              </button>
              <span className="cage-open-mic__slot"><Clock3 aria-hidden="true" /><strong>{entry.slot}</strong>{typeof entry.score === "number" ? <small>{entry.score} pts</small> : null}</span>
              <MeewavSelect aria-label={`Statut de ${person?.name ?? `participant ${index + 1}`}`} value={entry.status} disabled={disabled} onChange={(event) => void execute({ type: "cage.open-mic.status", entryId: entry.id, status: event.currentTarget.value as CageOpenMicEntryStatus })}>{OPEN_MIC_STATUS_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</MeewavSelect>
              <span className="cage-open-mic__actions">
                <button type="button" aria-label={`Monter ${person?.name ?? `participant ${index + 1}`}`} disabled={disabled || index === 0} onClick={() => void execute({ type: "cage.open-mic.move", entryId: entry.id, direction: -1 })}><ArrowUp aria-hidden="true" /></button>
                <button type="button" aria-label={`Descendre ${person?.name ?? `participant ${index + 1}`}`} disabled={disabled || index === openMicEntries.length - 1} onClick={() => void execute({ type: "cage.open-mic.move", entryId: entry.id, direction: 1 })}><ArrowDown aria-hidden="true" /></button>
              </span>
            </li>;
          })}</ol> : <div className="cage-bracket-empty"><Mic2 aria-hidden="true" /><strong>La scène est ouverte</strong><span>Ajoutez des participants, puis générez leur ordre de passage.</span></div>}
        </section> : null}
      </main>

      <aside className="cage-bracket-inspector" aria-label="Inspecteur de sélection">
        <header><span><Radio aria-hidden="true" /><span><small>SÉLECTION ACTIVE</small><strong>Inspecteur</strong></span></span><i /></header>
        {format === "open-mic" ? selectedEntry ? <>
          <SelectionProfile person={selectedEntryPerson} fallback="Participant Open mic" />
          <dl><div><dt>Position</dt><dd>#{String(openMicEntries.findIndex((entry) => entry.id === selectedEntry.id) + 1).padStart(2, "0")}</dd></div><div><dt>Créneau</dt><dd>{selectedEntry.slot}</dd></div><div><dt>Statut</dt><dd><span className={`cage-bracket-inspector__status is-${selectedEntry.status}`}><i />{OPEN_MIC_STATUS_OPTIONS.find((option) => option.id === selectedEntry.status)?.label}</span></dd></div>{typeof selectedEntry.score === "number" ? <div><dt>Score</dt><dd>{selectedEntry.score} pts</dd></div> : null}</dl>
          <p>Préparez le passage dans la Régie sans modifier la file des Invités.</p>
          <button type="button" className="cage-bracket-inspector__regie" disabled={disabled || !onOpenBattle} onClick={onOpenBattle}><Radio aria-hidden="true" /><span><strong>Ouvrir dans la Régie</strong><small>Préparer le passage live</small></span><ArrowRight aria-hidden="true" /></button>
        </> : <p className="cage-bracket-inspector__empty">Sélectionnez un passage pour afficher ses détails.</p> : selectedMatch ? <>
          <div className="cage-bracket-inspector__versus">
            <SelectionProfile person={selectedMatch.competitorA} fallback="Participant A" />
            <span><i />VS<i /></span>
            <SelectionProfile person={selectedMatch.competitorB} fallback="Participant B" />
          </div>
          <dl><div><dt>Tour</dt><dd>{format === "championship" ? `J${selectedMatch.round}` : roundLabel(selectedMatch.round, matchesByRound.findIndex(([round]) => round === selectedMatch.round), matchesByRound.length)}</dd></div><div><dt>Score</dt><dd>{selectedMatch.status === "scheduled" || selectedMatch.status === "ready" ? "—" : `${selectedMatch.scoreA} — ${selectedMatch.scoreB}`}</dd></div><div><dt>Statut</dt><dd><span className={`cage-bracket-inspector__status is-${selectedMatch.status}`}><i />{MATCH_STATUS_LABEL[selectedMatch.status]}</span></dd></div></dl>
          <p>Le résultat validé alimentera automatiquement {format === "championship" ? "le classement" : "le tour suivant"}.</p>
          <button type="button" className="cage-bracket-inspector__regie" disabled={disabled || !onOpenBattle} onClick={() => void openSelectedMatchInBattle()}><Radio aria-hidden="true" /><span><strong>Ouvrir dans la Régie</strong><small>Timer, score et vote</small></span><ArrowRight aria-hidden="true" /></button>
        </> : <p className="cage-bracket-inspector__empty">Sélectionnez un duel pour afficher ses détails.</p>}
      </aside>
    </div>

    <footer className="cage-bracket-console__footer"><Trophy aria-hidden="true" /><span><strong>Compétition équitable</strong> La Récompense valorise une performance ; elle ne modifie jamais le seeding ni les scores.</span></footer>
  </div>;
}
