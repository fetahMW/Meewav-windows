import MeewavSelect from "../../../components/shared/MeewavSelect";
import { useEffect, useState } from "react";
import { Check, Search, UsersRound } from "lucide-react";
import { messagingRepository } from "../../messaging/messaging.service";
import { defaultClassroomLaunch, type LaunchStudent, type RoomLaunchConfiguration } from "./roomLaunch";
import { readLaunchSetlists } from "./roomLaunchLibrary";

export default function RoomLaunchExtras({ config, scope, onChange }: { config: RoomLaunchConfiguration; scope: string; onChange: (config: RoomLaunchConfiguration) => void }) {
  const classroom = config.classroom ?? defaultClassroomLaunch();
  const capacity = Math.min(24, Math.max(4, Number(config.values.seats) || 24));
  const [contacts, setContacts] = useState<LaunchStudent[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const chooseStudents = config.roomType === "classe" && classroom.allocation !== "premium";
  useEffect(() => {
    if (!chooseStudents) return;
    let current = true;
    setLoading(true); setError("");
    const timer = window.setTimeout(async () => {
      try {
        const found = query.trim().length >= 2
          ? (await messagingRepository.searchMessageableProfiles(query.trim(), 40)).map(row => ({ id: row.profile_id, name: row.display_name, avatarUrl: row.avatar_url || "/avatars/utilisateur.png" }))
          : (await messagingRepository.listConversations({ kinds: ["direct"], limit: 100 })).flatMap(row => row.counterpart_profile_id ? [{ id: row.counterpart_profile_id, name: row.counterpart_display_name || row.counterpart_username || "Contact MeeWav", avatarUrl: row.counterpart_avatar_url || "/avatars/utilisateur.png" }] : []);
        if (current) setContacts(found.filter((person, index) => person.id !== scope && found.findIndex(candidate => candidate.id === person.id) === index));
      } catch { if (current) setError("Les contacts sont indisponibles. Réessaie dans un instant."); }
      finally { if (current) setLoading(false); }
    }, query.trim() ? 250 : 0);
    return () => { current = false; window.clearTimeout(timer); };
  }, [chooseStudents, query, retry, scope]);

  if (config.roomType === "scene") {
    const setlists = readLaunchSetlists(scope);
    return <section className="launch-special" aria-label="Setlist de la Scène"><header><strong>Ta setlist</strong><span>Retrouve les listes enregistrées sur ton profil.</span></header>
      <label>Importer une setlist<MeewavSelect value={config.setlist?.id ?? ""} onChange={event => {
        const setlist = setlists.find(item => item.id === event.target.value);
        onChange({ ...config, setlist, values: { ...config.values, ...(setlist ? { program: setlist.tracks.map(track => track.title).join("\n") } : {}) } });
      }}><option value="">Programme libre</option>{setlists.map(list => <option value={list.id} key={list.id}>{list.title} · {list.tracks.length} titres</option>)}</MeewavSelect></label>
      {!setlists.length ? <p>Pas encore de setlist enregistrée. Compose ton programme ci-dessous.</p> : null}
    </section>;
  }
  if (config.roomType !== "classe") return null;
  const patch = (change: Partial<typeof classroom>) => onChange({ ...config, classroom: { ...classroom, ...change } });
  return <section className="launch-special" aria-label={`Les ${capacity} places élèves`}>
    <header><strong><UsersRound aria-hidden="true" />{capacity} places élèves</strong><span>Réserve des places à tes contacts ou accueille les membres Premium.</span></header>
    <div className="launch-fields">
      <label>Tarif du cours<MeewavSelect value={classroom.pricing} onChange={event => patch({ pricing: event.target.value as "free" | "paid" })}><option value="free">Classe gratuite</option><option value="paid">Classe payante</option></MeewavSelect></label>
      {classroom.pricing === "paid" ? <label>Prix par place (€)<input type="number" min="0.01" max="1000" step="0.01" value={classroom.priceCents / 100} onChange={event => patch({ priceCents: Math.round(Number(event.target.value) * 100) })} /></label> : null}
      <label>Attribution des places<MeewavSelect value={classroom.allocation} onChange={event => patch({ allocation: event.target.value as typeof classroom.allocation })}><option value="premium">{capacity} places libres · membres Premium</option><option value="contacts">Réserver à mes contacts</option><option value="mixed">Mes contacts + places Premium libres</option></MeewavSelect></label>
    </div>
    {chooseStudents ? <>
      <div className="launch-student-count"><strong>{classroom.students.length} / {capacity} réservées</strong><span>{capacity - classroom.students.length} {classroom.allocation === "mixed" ? "places Premium libres" : "places non attribuées"}</span></div>
      {!!classroom.students.length && <div className="launch-student-chips">{classroom.students.map(student => <button type="button" key={student.id} aria-label={`Retirer ${student.name}`} onClick={() => patch({ students: classroom.students.filter(person => person.id !== student.id) })}>{student.name}<span aria-hidden="true">×</span></button>)}</div>}
      <label className="launch-contact-search"><span><Search aria-hidden="true" />Rechercher un contact</span><input type="search" value={query} placeholder="Nom ou pseudo" onChange={event => setQuery(event.target.value)} /></label>
      {loading ? <p role="status">Chargement des contacts…</p> : error ? <p role="alert">{error} <button type="button" onClick={() => setRetry(value => value + 1)}>Réessayer</button></p> : <div className="launch-contact-list">{contacts.map(person => {
        const selected = classroom.students.some(student => student.id === person.id);
        return <button type="button" role="checkbox" aria-checked={selected} key={person.id} disabled={!selected && classroom.students.length >= capacity} onClick={() => patch({ students: selected ? classroom.students.filter(student => student.id !== person.id) : [...classroom.students, person] })}><img src={person.avatarUrl} alt="" /><span>{person.name}</span><i>{selected ? <Check aria-hidden="true" /> : null}</i></button>;
      })}{!contacts.length ? <p>Aucun contact trouvé. Recherche un profil par son nom.</p> : null}</div>}
      <p>Les places sont réservées dans ta préparation ; aucune invitation n’est envoyée à cette étape.</p>
    </> : <p>Les {capacity} chaises restent disponibles au départ.</p>}
    {classroom.pricing === "paid" ? <p>Le tarif est préparé ici. La session de démonstration ne prélève aucun paiement.</p> : null}
  </section>;
}
