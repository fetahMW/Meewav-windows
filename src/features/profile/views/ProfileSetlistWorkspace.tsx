import { isProfileLocalPreviewEnabled } from "../profile.preview";
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronRight,
  CirclePause,
  CirclePlay,
  Clock3,
  Copy,
  FileAudio,
  GripVertical,
  Headphones,
  ListMusic,
  MoreHorizontal,
  Music2,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type ProfileSetlistWorkspaceProps = {
  storageScope: string | null;
  onBack: () => void;
  onDone: (message: string) => void;
};

type SetlistStatus = "Brouillon" | "Prête" | "Utilisée" | "Archivée";
type TrackSource = "Médiathèque" | "Fichier";

type SetlistTrack = {
  id: string;
  title: string;
  artist: string;
  duration: string;
  note: string;
  transition: string;
  source: TrackSource;
  sourceUrl?: string;
};

type SetlistEntry = {
  id: string;
  title: string;
  description: string;
  status: SetlistStatus;
  availableInMixer: boolean;
  tracks: SetlistTrack[];
};

const STORAGE_KEY = "meewav-profile-setlists-v3";

const demoAudioSources = [
  "/media/preprofile-demo/hazy-after-hours.mp3",
  "/media/preprofile-demo/tech-house-vibes.mp3",
] as const;

const libraryTracks: SetlistTrack[] = [
  { id: "lib-loop", title: "Loop Chemistry", artist: "Nox Amani", duration: "02:07", note: "Intro progressive", transition: "Fondu 4 s", source: "Médiathèque", sourceUrl: demoAudioSources[0] },
  { id: "lib-after", title: "After Pulse", artist: "Nox Amani", duration: "01:42", note: "Monter le kick au refrain", transition: "Cut net", source: "Médiathèque", sourceUrl: demoAudioSources[1] },
  { id: "lib-string", title: "String Alive", artist: "Nox Amani", duration: "02:07", note: "Laisser respirer l’outro", transition: "Fondu 8 s", source: "Médiathèque", sourceUrl: demoAudioSources[0] },
  { id: "lib-voice", title: "Voix vibrations", artist: "Nox Amani", duration: "01:42", note: "Micro principal", transition: "Automatique", source: "Médiathèque", sourceUrl: demoAudioSources[1] },
  { id: "lib-neon", title: "Neon District", artist: "Nox Amani", duration: "02:07", note: "Drop sans annonce", transition: "Cut net", source: "Médiathèque", sourceUrl: demoAudioSources[0] },
  { id: "lib-slow", title: "Slow Meridian", artist: "Nox Amani", duration: "01:42", note: "Tempo de respiration", transition: "Fondu 4 s", source: "Médiathèque", sourceUrl: demoAudioSources[1] },
  { id: "lib-paris", title: "Paris 22:14", artist: "Nox Amani", duration: "02:07", note: "Relance public", transition: "Automatique", source: "Médiathèque", sourceUrl: demoAudioSources[0] },
  { id: "lib-aurora", title: "Aurora", artist: "Nox Amani", duration: "01:42", note: "Final", transition: "Fondu 8 s", source: "Médiathèque", sourceUrl: demoAudioSources[1] },
];

const cloneTrack = (track: SetlistTrack, suffix: string): SetlistTrack => ({ ...track, id: `${track.id}-${suffix}` });

function makeTracks(count: number, totalMinutes: number, suffix: string): SetlistTrack[] {
  const totalSeconds = totalMinutes * 60;
  const baseSeconds = Math.floor(totalSeconds / count);
  const remainder = totalSeconds % count;
  return Array.from({ length: count }, (_, index) => {
    const track = cloneTrack(libraryTracks[index % libraryTracks.length], `${suffix}-${index}`);
    const seconds = baseSeconds + (index < remainder ? 1 : 0);
    return { ...track, duration: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` };
  });
}

const initialSetlists: SetlistEntry[] = [
  { id: "loop-chemistry", title: "Loop Chemistry", description: "Sélection énergique prête pour la prochaine Room.", status: "Prête", availableInMixer: true, tracks: makeTracks(8, 22, "loop") },
  { id: "after-pulse", title: "After Pulse", description: "Construction en cours pour le live du vendredi.", status: "Brouillon", availableInMixer: true, tracks: makeTracks(12, 45, "after") },
  { id: "voix-vibrations", title: "Voix vibrations", description: "Set vocal compact et prêt à mixer.", status: "Prête", availableInMixer: true, tracks: makeTracks(5, 15, "voice") },
  { id: "string-alive", title: "String Alive", description: "Set utilisé pendant la Room String Alive.", status: "Utilisée", availableInMixer: true, tracks: makeTracks(6, 25, "string") },
];

const statusSlug = (status: string) => status.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]+/g, "-");

function secondsFor(duration: string) {
  const [minutes = "0", seconds = "0"] = duration.split(":");
  return Number(minutes) * 60 + Number(seconds);
}

function formatPlaybackTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

function durationFor(tracks: SetlistTrack[]) {
  const seconds = tracks.reduce((total, track) => total + secondsFor(track.duration), 0);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function loadSetlists(storageKey: string | null, preview: boolean) {
  if (!storageKey) return preview ? initialSetlists : [];
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored) {
      const parsed = JSON.parse(stored) as SetlistEntry[];
      return parsed.map((entry) => ({
        ...entry,
        tracks: entry.tracks.map((track, index) => ({
          ...track,
          source: (track.source === "Médiathèque" ? "Médiathèque" : "Fichier") as TrackSource,
          sourceUrl: track.sourceUrl && !track.sourceUrl.startsWith("blob:")
            ? track.sourceUrl
            : track.source === "Médiathèque"
              ? demoAudioSources[index % demoAudioSources.length]
              : undefined,
        })),
      }));
    }
  } catch {
    // Le Studio reste utilisable même si le stockage local est indisponible.
  }
  return preview ? initialSetlists : [];
}

function StatusPill({ status }: { status: SetlistStatus }) {
  return <span className={`profile-studio-status is-${statusSlug(status)}`}><i />{status}</span>;
}

function SetlistConfirm({ title, detail, confirmLabel, cancelLabel = "Retour", danger = false, onCancel, onConfirm }: { title: string; detail: string; confirmLabel: string; cancelLabel?: string; danger?: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <div className="profile-studio-confirm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}><section className="profile-studio-confirm" role="alertdialog" aria-modal="true" aria-label={title}><span>{danger ? <Trash2 size={21} /> : <ShieldCheck size={21} />}</span><div><h4>{title}</h4><p>{detail}</p></div><footer><button type="button" onClick={onCancel}>{cancelLabel}</button><button type="button" className={danger ? "is-danger" : ""} onClick={onConfirm}>{danger ? <Trash2 size={15} /> : <Check size={15} />}{confirmLabel}</button></footer></section></div>;
}

export default function ProfileSetlistWorkspace({ storageScope, onBack, onDone }: ProfileSetlistWorkspaceProps) {
  const storageKey = storageScope ? `${STORAGE_KEY}:${storageScope}` : null;
  const [entries, setEntries] = useState<SetlistEntry[]>(() => loadSetlists(storageKey, isProfileLocalPreviewEnabled()));
  const [screen, setScreen] = useState<"overview" | "detail" | "editor" | "mixer">("overview");
  const [filter, setFilter] = useState("Toutes");
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("Nouvelle setlist");
  const [description, setDescription] = useState("Session prête pour Room.");
  const [availableInMixer, setAvailableInMixer] = useState(true);
  const [tracks, setTracks] = useState<SetlistTrack[]>(() => libraryTracks.slice(0, 3).map((track, index) => cloneTrack(track, `new-${index}`)));
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [librarySelection, setLibrarySelection] = useState<string[]>([]);
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [draggedTrackId, setDraggedTrackId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "close" | "delete" | "launch"; id?: string } | null>(null);
  const [mixerId, setMixerId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [mixerTrackIndex, setMixerTrackIndex] = useState(0);
  const [trackVolumes, setTrackVolumes] = useState<Record<string, number>>({});
  const [trackDurations, setTrackDurations] = useState<Record<string, number>>({});
  const [mutedIds, setMutedIds] = useState<string[]>([]);
  const [soloId, setSoloId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mixerAudioRef = useRef<HTMLAudioElement | null>(null);
  const mixerShouldAutoplayRef = useRef(false);
  const importedObjectUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!storageKey) return;
    try { window.localStorage.setItem(storageKey, JSON.stringify(entries)); } catch { /* stockage optionnel */ }
  }, [entries, storageKey]);

  useEffect(() => () => {
    mixerAudioRef.current?.pause();
    importedObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const activeEntry = entries.find((entry) => entry.id === activeId) ?? null;
  const mixerEntry = entries.find((entry) => entry.id === mixerId) ?? null;
  const mixerTrack = mixerEntry?.tracks[mixerTrackIndex] ?? null;

  useEffect(() => {
    const audio = mixerAudioRef.current;
    if (!audio || !mixerTrack) return;
    audio.volume = Math.max(0, Math.min(1, (trackVolumes[mixerTrack.id] ?? 76) / 100));
    audio.muted = mutedIds.includes(mixerTrack.id) || (soloId !== null && soloId !== mixerTrack.id);
  }, [mixerTrack, mutedIds, soloId, trackVolumes]);

  useEffect(() => {
    if (screen === "mixer") return;
    mixerShouldAutoplayRef.current = false;
    mixerAudioRef.current?.pause();
    setPlaying(false);
  }, [screen]);

  const filteredEntries = useMemo(() => entries.filter((entry) => {
    if (filter === "Brouillons") return entry.status === "Brouillon";
    if (filter === "Prêtes") return entry.status === "Prête";
    if (filter === "Récentes") return entry.status === "Utilisée";
    return true;
  }), [entries, filter]);

  const resetEditor = () => {
    setEditingId(null);
    setTitle("Nouvelle setlist");
    setDescription("Session prête pour Room.");
    setAvailableInMixer(true);
    setTracks(libraryTracks.slice(0, 3).map((track, index) => cloneTrack(track, `new-${Date.now()}-${index}`)));
    setLibraryOpen(false);
    setEditingTrackId(null);
  };

  const openNew = () => { resetEditor(); setScreen("editor"); };

  const editEntry = (entry: SetlistEntry) => {
    setEditingId(entry.id);
    setTitle(entry.title);
    setDescription(entry.description);
    setAvailableInMixer(entry.availableInMixer);
    setTracks(entry.tracks.map((track) => ({ ...track })));
    setLibraryOpen(false);
    setEditingTrackId(null);
    setActiveMenu(null);
    setScreen("editor");
  };

  const saveEntry = () => {
    const previous = entries.find((entry) => entry.id === editingId);
    const status: SetlistStatus = previous && ["Utilisée", "Archivée"].includes(previous.status) ? previous.status : tracks.length > 0 ? "Prête" : "Brouillon";
    const next: SetlistEntry = { id: editingId ?? `setlist-${Date.now()}`, title: title.trim() || "Nouvelle setlist", description: description.trim(), status, availableInMixer, tracks: tracks.map((track) => ({ ...track })) };
    setEntries((current) => editingId ? current.map((entry) => entry.id === editingId ? next : entry) : [next, ...current]);
    setScreen("overview");
    setEditingId(null);
    onDone(`${next.title} enregistrée · ${status}`);
  };

  const duplicateEntry = (entry: SetlistEntry) => {
    const copy: SetlistEntry = { ...entry, id: `${entry.id}-copy-${Date.now()}`, title: `${entry.title} copie`, status: "Brouillon", tracks: entry.tracks.map((track, index) => cloneTrack(track, `copy-${Date.now()}-${index}`)) };
    setEntries((current) => [copy, ...current]);
    setActiveMenu(null);
    setFilter("Toutes");
    onDone("Setlist dupliquée en brouillon");
  };

  const openDetail = (entry: SetlistEntry) => { setActiveId(entry.id); setActiveMenu(null); setScreen("detail"); };
  const requestMixer = (entry: SetlistEntry) => { setConfirm({ kind: "launch", id: entry.id }); setActiveMenu(null); };
  const openMixer = (entryId: string) => {
    const entry = entries.find((candidate) => candidate.id === entryId);
    mixerAudioRef.current?.pause();
    mixerShouldAutoplayRef.current = false;
    setMixerId(entryId);
    setPlaying(false);
    setPlayhead(0);
    setMixerTrackIndex(0);
    setTrackDurations({});
    setTrackVolumes(Object.fromEntries((entry?.tracks ?? []).map((track, index) => [track.id, index === 0 ? 88 : 74])));
    setMutedIds([]);
    setSoloId(null);
    setConfirm(null);
    setScreen("mixer");
  };

  const updateMixerProgress = (audio: HTMLAudioElement) => {
    if (!mixerEntry || !mixerTrack) return;
    const durations = mixerEntry.tracks.map((track, index) => {
      if (index === mixerTrackIndex && Number.isFinite(audio.duration) && audio.duration > 0) return audio.duration;
      return trackDurations[track.id] ?? secondsFor(track.duration);
    });
    const totalDuration = durations.reduce((total, duration) => total + duration, 0);
    if (totalDuration <= 0) return;
    const elapsedBefore = durations.slice(0, mixerTrackIndex).reduce((total, duration) => total + duration, 0);
    setPlayhead(Math.max(0, Math.min(100, (elapsedBefore + audio.currentTime) / totalDuration * 100)));
  };

  const playMixerAudio = () => {
    const audio = mixerAudioRef.current;
    if (!audio || !mixerTrack?.sourceUrl) {
      onDone(`Aucun aperçu audio disponible pour ${mixerTrack?.title ?? "cette piste"}`);
      return;
    }
    if (audio.ended || (audio.duration && audio.currentTime >= audio.duration)) audio.currentTime = 0;
    void audio.play().catch(() => onDone("Lecture audio impossible dans ce navigateur"));
  };

  const toggleMixerPlayback = () => {
    const audio = mixerAudioRef.current;
    if (!audio || !mixerTrack?.sourceUrl) {
      onDone(`Aucun aperçu audio disponible pour ${mixerTrack?.title ?? "cette piste"}`);
      return;
    }
    if (audio.paused) playMixerAudio();
    else audio.pause();
  };

  const cueMixerTrack = (index: number) => {
    const entry = mixerEntry;
    const track = entry?.tracks[index];
    if (!entry || !track) return;
    if (!track.sourceUrl) {
      onDone(`Aucun aperçu audio disponible pour ${track.title}`);
      return;
    }

    const audio = mixerAudioRef.current;
    if (index === mixerTrackIndex && audio) {
      audio.currentTime = 0;
      playMixerAudio();
      return;
    }

    audio?.pause();
    mixerShouldAutoplayRef.current = true;
    setPlaying(false);
    setMixerTrackIndex(index);
    const elapsedBefore = entry.tracks.slice(0, index).reduce((total, item) => total + (trackDurations[item.id] ?? secondsFor(item.duration)), 0);
    const totalDuration = entry.tracks.reduce((total, item) => total + (trackDurations[item.id] ?? secondsFor(item.duration)), 0);
    setPlayhead(totalDuration > 0 ? elapsedBefore / totalDuration * 100 : 0);
  };

  const stopMixerPlayback = () => {
    mixerShouldAutoplayRef.current = false;
    const audio = mixerAudioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setPlaying(false);
    setMixerTrackIndex(0);
    setPlayhead(0);
  };

  const handleMixerTrackEnded = () => {
    if (!mixerEntry) return;
    const nextIndex = mixerEntry.tracks.findIndex((track, index) => index > mixerTrackIndex && Boolean(track.sourceUrl));
    if (nextIndex >= 0) {
      mixerShouldAutoplayRef.current = true;
      setMixerTrackIndex(nextIndex);
      return;
    }
    mixerShouldAutoplayRef.current = false;
    setPlaying(false);
    setPlayhead(100);
  };

  const updateTrackVolume = (trackId: string, volume: number) => {
    setTrackVolumes((current) => ({ ...current, [trackId]: Math.max(0, Math.min(100, volume)) }));
  };

  const primaryAction = (entry: SetlistEntry) => {
    if (entry.status === "Brouillon") return editEntry(entry);
    if (entry.status === "Prête") return requestMixer(entry);
    if (entry.status === "Utilisée") return duplicateEntry(entry);
    openDetail(entry);
  };

  const primaryLabel = (status: SetlistStatus) => status === "Brouillon" ? "Modifier" : status === "Prête" ? "Mixer" : status === "Utilisée" ? "Dupliquer" : "Ouvrir";

  const addLibraryTracks = () => {
    const additions = libraryTracks.filter((track) => librarySelection.includes(track.id)).map((track, index) => cloneTrack(track, `added-${Date.now()}-${index}`));
    setTracks((current) => [...current, ...additions]);
    setLibrarySelection([]);
    setLibraryOpen(false);
    onDone(`${additions.length} son${additions.length > 1 ? "s ajoutés" : " ajouté"}`);
  };

  const importFromComputer = (files: FileList | null) => {
    if (!files?.length) return;
    const additions = Array.from(files).map((file, index): SetlistTrack => {
      const sourceUrl = URL.createObjectURL(file);
      importedObjectUrlsRef.current.push(sourceUrl);
      return { id: `file-${Date.now()}-${index}`, title: file.name.replace(/\.[^.]+$/, ""), artist: "Import local", duration: "03:00", note: "", transition: "Automatique", source: "Fichier", sourceUrl };
    });
    setTracks((current) => [...current, ...additions]);
    onDone(`${additions.length} fichier${additions.length > 1 ? "s importés" : " importé"}`);
  };

  const moveTrack = (trackId: string, direction: -1 | 1) => {
    setTracks((current) => {
      const index = current.findIndex((track) => track.id === trackId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const dropTrack = (targetId: string) => {
    if (!draggedTrackId || draggedTrackId === targetId) return;
    setTracks((current) => {
      const sourceIndex = current.findIndex((track) => track.id === draggedTrackId);
      const targetIndex = current.findIndex((track) => track.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setDraggedTrackId(null);
  };

  const updateTrack = (trackId: string, patch: Partial<SetlistTrack>) => setTracks((current) => current.map((track) => track.id === trackId ? { ...track, ...patch } : track));

  const goBack = () => {
    if (screen === "overview") return onBack();
    if (screen === "editor") return setConfirm({ kind: "close" });
    setScreen("overview");
  };

  return <section className="profile-studio-workspace profile-studio-mode-shell is-setlist profile-setlist-workspace" style={{ "--studio-flow-accent": "#f3a742" } as React.CSSProperties} aria-label="Setlists">
    <div className="profile-studio-workspace__command"><button className="profile-studio-workspace__back" type="button" onClick={goBack}><ArrowLeft size={16} /> Studio</button><div className="profile-studio-workspace__identity"><span><ListMusic size={24} /></span><div><small>Rooms & Live</small><h3>Setlists</h3><p>Prépare, ordonne et ouvre tes sons directement dans le mixeur.</p></div></div><span className="profile-studio-workspace__status"><ShieldCheck size={15} /> Espace privé</span></div>

    {screen === "overview" && <div className="profile-studio-mode-overview"><header className="profile-studio-mode-heading"><div><span className="profile-kicker"><ListMusic size={14} /> Setlists</span><h3>Prépare l’ordre de tes sons avant la Room.</h3><p>Chaque setlist garde ses pistes, ses notes, ses transitions et sa disponibilité dans le mixeur.</p></div><button type="button" className="profile-primary-button" onClick={openNew}><Plus size={17} /> Nouvelle setlist</button></header><div className="profile-studio-filter-row" aria-label="Filtrer les setlists">{["Toutes", "Brouillons", "Prêtes", "Récentes"].map((item) => <button key={item} type="button" className={filter === item ? "is-active" : ""} onClick={() => setFilter(item)}>{item}<span>{item === "Toutes" ? entries.length : item === "Brouillons" ? entries.filter((entry) => entry.status === "Brouillon").length : item === "Prêtes" ? entries.filter((entry) => entry.status === "Prête").length : entries.filter((entry) => entry.status === "Utilisée").length}</span></button>)}</div><div className="profile-studio-tracking-list">{filteredEntries.map((entry) => <article key={entry.id} className={`profile-studio-tracking-card ${activeMenu === entry.id ? "is-menu-open" : ""}`} onClick={() => openDetail(entry)}><span className="profile-studio-tracking-card__icon"><ListMusic size={20} /></span><div className="profile-studio-tracking-card__copy"><div><h4>{entry.title}</h4><StatusPill status={entry.status} /></div><p>{entry.tracks.length} {entry.tracks.length > 1 ? "sons" : "son"} · {durationFor(entry.tracks)} min</p><small><SlidersHorizontal size={13} /> {entry.availableInMixer ? "Disponible dans le mixeur" : "Profil uniquement"}</small></div><div className="profile-studio-tracking-card__actions" onClick={(event) => event.stopPropagation()}><button type="button" className="is-primary" onClick={() => primaryAction(entry)}>{primaryLabel(entry.status)}<ChevronRight size={15} /></button><button type="button" aria-label={`Actions pour ${entry.title}`} onClick={() => setActiveMenu((current) => current === entry.id ? null : entry.id)}><MoreHorizontal size={17} /></button></div>{activeMenu === entry.id && <div className="profile-studio-row-menu" role="menu" onClick={(event) => event.stopPropagation()}><button type="button" onClick={() => openDetail(entry)}><FileAudio size={14} /> Ouvrir</button><button type="button" onClick={() => editEntry(entry)}><Pencil size={14} /> Modifier</button><button type="button" onClick={() => requestMixer(entry)} disabled={!entry.availableInMixer || entry.tracks.length === 0}><SlidersHorizontal size={14} /> Ouvrir dans le mixeur</button><button type="button" onClick={() => duplicateEntry(entry)}><Copy size={14} /> Dupliquer</button><button type="button" onClick={() => { setEntries((current) => current.map((item) => item.id === entry.id ? { ...item, status: "Archivée" } : item)); setActiveMenu(null); onDone("Setlist archivée"); }}><Archive size={14} /> Archiver</button><button type="button" className="is-danger" onClick={() => { setConfirm({ kind: "delete", id: entry.id }); setActiveMenu(null); }}><Trash2 size={14} /> Supprimer</button></div>}</article>)}</div></div>}

    {screen === "detail" && activeEntry && <div className="profile-studio-detail-view profile-setlist-detail"><button type="button" className="profile-studio-inline-back" onClick={() => setScreen("overview")}><ArrowLeft size={15} /> Retour aux setlists</button><article className="profile-studio-detail-hero"><span><ListMusic size={27} /></span><div><span className="profile-kicker">Setlist host</span><h3>{activeEntry.title}</h3><p>{activeEntry.description}</p></div><StatusPill status={activeEntry.status} /></article><div className="profile-setlist-detail__metrics"><span><strong>{activeEntry.tracks.length}</strong><small>Sons</small></span><span><strong>{durationFor(activeEntry.tracks)}</strong><small>Durée</small></span><span><strong>{activeEntry.availableInMixer ? "Oui" : "Non"}</strong><small>Mixeur</small></span></div><div className="profile-setlist-track-list is-detail">{activeEntry.tracks.map((track, index) => <div key={track.id}><span>{String(index + 1).padStart(2, "0")}</span><Music2 size={16} /><div><strong>{track.title}</strong><small>{track.artist} · {track.transition}{track.note ? ` · ${track.note}` : ""}</small></div><time>{track.duration}</time></div>)}</div><footer className="profile-setlist-detail__actions"><button type="button" onClick={() => editEntry(activeEntry)}><Pencil size={15} /> Modifier</button><button type="button" className="is-primary" disabled={!activeEntry.availableInMixer || activeEntry.tracks.length === 0} onClick={() => requestMixer(activeEntry)}><SlidersHorizontal size={15} /> Ouvrir mixeur</button></footer></div>}

    {screen === "editor" && <div className="profile-setlist-editor"><header><div><span className="profile-kicker"><Pencil size={14} /> Éditeur Setlist</span><h3>{editingId ? "Modifier la setlist" : "Créer une setlist"}</h3><p>Une seule surface de travail : informations, sons, ordre et réglages.</p></div><span><ShieldCheck size={15} /> Brouillon privé</span></header><div className="profile-setlist-editor__grid"><section className="profile-setlist-editor__info"><div className="profile-cage-live-section-title"><ListMusic size={18} /><span><strong>Infos de base</strong><small>{tracks.length} son{tracks.length > 1 ? "s" : ""} · {durationFor(tracks)} min</small></span></div><label><span>Nom</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label><span>Description</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label><button type="button" className={`profile-cage-toggle ${availableInMixer ? "is-on" : ""}`} onClick={() => setAvailableInMixer((current) => !current)} aria-pressed={availableInMixer}><span><SlidersHorizontal size={17} /></span><span><strong>Disponible dans le mixeur</strong><small>{availableInMixer ? "Accessible depuis le mixeur" : "Visible dans le profil seulement"}</small></span><i><b /></i></button></section><section className="profile-setlist-editor__tracks"><div className="profile-cage-live-section-title"><Music2 size={18} /><span><strong>Sons</strong><small>Glisse les lignes pour définir l’ordre de lecture.</small></span></div><div className="profile-setlist-add-actions"><button type="button" onClick={() => setLibraryOpen((current) => !current)}><Music2 size={16} /> Médiathèque</button><button type="button" onClick={() => fileInputRef.current?.click()}><FileAudio size={16} /> Fichier audio</button><input ref={fileInputRef} type="file" accept="audio/*" multiple hidden onChange={(event) => { importFromComputer(event.target.files); event.currentTarget.value = ""; }} /></div>{libraryOpen && <div className="profile-setlist-library-picker"><header><div><strong>Ajouter des sons</strong><small>{librarySelection.length} sélectionné{librarySelection.length > 1 ? "s" : ""}</small></div><button type="button" onClick={() => setLibraryOpen(false)}><X size={15} /></button></header>{libraryTracks.map((track) => { const selected = librarySelection.includes(track.id); return <button key={track.id} type="button" className={selected ? "is-selected" : ""} onClick={() => setLibrarySelection((current) => selected ? current.filter((id) => id !== track.id) : [...current, track.id])}><span><Music2 size={16} /></span><div><strong>{track.title}</strong><small>{track.artist}</small></div><time>{track.duration}</time><i>{selected ? <Check size={13} /> : <Plus size={13} />}</i></button>; })}<footer><button type="button" onClick={() => setLibraryOpen(false)}>Annuler</button><button type="button" className="is-primary" disabled={librarySelection.length === 0} onClick={addLibraryTracks}><Plus size={14} /> Ajouter</button></footer></div>}<div className="profile-setlist-editor__list">{tracks.length === 0 ? <div className="profile-studio-empty"><Music2 size={24} /><p>Aucun son. La setlist sera enregistrée en brouillon.</p></div> : tracks.map((track, index) => <article key={track.id} draggable onDragStart={() => setDraggedTrackId(track.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropTrack(track.id)} className={draggedTrackId === track.id ? "is-dragged" : ""}><GripVertical size={17} /><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{track.title}</strong><small>{track.artist} · {track.source}</small></div><time>{track.duration}</time><button type="button" aria-label="Monter" disabled={index === 0} onClick={() => moveTrack(track.id, -1)}><ArrowUp size={14} /></button><button type="button" aria-label="Descendre" disabled={index === tracks.length - 1} onClick={() => moveTrack(track.id, 1)}><ArrowDown size={14} /></button><button type="button" aria-label="Modifier les réglages" className={editingTrackId === track.id ? "is-active" : ""} onClick={() => setEditingTrackId((current) => current === track.id ? null : track.id)}><MoreHorizontal size={15} /></button><button type="button" aria-label="Retirer" onClick={() => setTracks((current) => current.filter((item) => item.id !== track.id))}><X size={15} /></button>{editingTrackId === track.id && <div className="profile-setlist-track-editor"><label><span>Note</span><input value={track.note} onChange={(event) => updateTrack(track.id, { note: event.target.value })} /></label><label><span>Durée</span><input value={track.duration} pattern="[0-9]{1,2}:[0-5][0-9]" onChange={(event) => updateTrack(track.id, { duration: event.target.value })} /></label><label><span>Transition</span><select value={track.transition} onChange={(event) => updateTrack(track.id, { transition: event.target.value })}><option>Automatique</option><option>Cut net</option><option>Fondu 4 s</option><option>Fondu 8 s</option></select></label><button type="button" onClick={() => setEditingTrackId(null)}><Check size={14} /> Terminer</button></div>}</article>)}</div></section></div><footer className="profile-setlist-editor__footer"><button type="button" onClick={() => setConfirm({ kind: "close" })}><X size={15} /> Annuler</button><button type="button" className="is-primary" disabled={!title.trim()} onClick={saveEntry}><Save size={16} /> Enregistrer dans mes setlists</button></footer></div>}

    {screen === "mixer" && mixerEntry && (
      <div className="profile-setlist-mixer">
        <audio
          key={mixerTrack?.id ?? "empty-track"}
          ref={mixerAudioRef}
          src={mixerTrack?.sourceUrl}
          preload="metadata"
          style={{ display: "none" }}
          onLoadedMetadata={(event) => {
            const audio = event.currentTarget;
            if (mixerTrack && Number.isFinite(audio.duration)) {
              setTrackDurations((current) => ({ ...current, [mixerTrack.id]: audio.duration }));
            }
            updateMixerProgress(audio);
            if (mixerShouldAutoplayRef.current) {
              mixerShouldAutoplayRef.current = false;
              void audio.play().catch(() => onDone("Lecture audio impossible dans ce navigateur"));
            }
          }}
          onTimeUpdate={(event) => updateMixerProgress(event.currentTarget)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={handleMixerTrackEnded}
          onError={() => {
            mixerShouldAutoplayRef.current = false;
            setPlaying(false);
          }}
        />
        <header>
          <button type="button" onClick={() => setScreen("overview")}><ArrowLeft size={15} /> Mes setlists</button>
          <div><span className="profile-kicker"><SlidersHorizontal size={14} /> Mixeur Room</span><h3>{mixerEntry.title}</h3><p>{mixerEntry.tracks.length} sons préchargés · {durationFor(mixerEntry.tracks)} min</p></div>
          <span><ShieldCheck size={15} /> Préparation host</span>
        </header>
        <section className="profile-setlist-mixer__transport">
          <button type="button" className="is-play" onClick={toggleMixerPlayback} aria-label={playing ? "Mettre la séquence en pause" : "Lire la séquence"}>{playing ? <CirclePause size={27} /> : <CirclePlay size={27} />}</button>
          <div>
            <span><i style={{ width: `${playhead}%` }} /></span>
            <small>{mixerTrack ? `${mixerTrack.title} · ${formatPlaybackTime(mixerAudioRef.current?.currentTime ?? 0)} / ${formatPlaybackTime(trackDurations[mixerTrack.id] ?? secondsFor(mixerTrack.duration))}` : "Aucune piste"} · {Math.floor(playhead)} %</small>
          </div>
          <button type="button" onClick={stopMixerPlayback}><X size={16} /> Stop</button>
        </section>
        <div className="profile-setlist-mixer__tracks">
          {mixerEntry.tracks.map((track, index) => {
            const muted = mutedIds.includes(track.id);
            const solo = soloId === track.id;
            const active = mixerTrackIndex === index;
            const volume = trackVolumes[track.id] ?? (index === 0 ? 88 : 74);
            return (
              <article key={track.id} className={`${muted ? "is-muted" : ""} ${solo ? "is-solo" : ""} ${active ? "is-playing" : ""}`}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <button type="button" className={`is-cue ${active && playing ? "is-active" : ""}`} aria-label={`Préécouter ${track.title}`} aria-pressed={active && playing} onClick={() => cueMixerTrack(index)}><Headphones size={16} /></button>
                <div><strong>{track.title}</strong><small>{track.artist} · {track.transition}</small></div>
                <time>{track.duration}</time>
                <label><span>Volume · {volume} %</span><input type="range" min="0" max="100" value={volume} onChange={(event) => updateTrackVolume(track.id, Number(event.target.value))} /></label>
                <button type="button" className={muted ? "is-active" : ""} aria-label={`${muted ? "Réactiver" : "Couper"} ${track.title}`} aria-pressed={muted} onClick={() => setMutedIds((current) => muted ? current.filter((id) => id !== track.id) : [...current, track.id])}>M</button>
                <button type="button" className={solo ? "is-active" : ""} aria-label={`${solo ? "Désactiver le solo de" : "Écouter en solo"} ${track.title}`} aria-pressed={solo} onClick={() => setSoloId((current) => current === track.id ? null : track.id)}>S</button>
              </article>
            );
          })}
        </div>
        <footer>
          <div><Clock3 size={16} /><span><strong>Séquence prête</strong><small>L’ordre et les réglages de la setlist sont réellement chargés.</small></span></div>
          <button type="button" className="is-primary" onClick={() => { stopMixerPlayback(); setEntries((current) => current.map((entry) => entry.id === mixerEntry.id ? { ...entry, status: "Utilisée" } : entry)); onDone("Setlist ouverte dans la Room"); }}><Upload size={16} /> Lancer en Room</button>
        </footer>
      </div>
    )}

    {confirm?.kind === "close" && <SetlistConfirm title="Fermer sans enregistrer ?" detail="Les modifications de cette setlist seront perdues." confirmLabel="Fermer" cancelLabel="Continuer" danger onCancel={() => setConfirm(null)} onConfirm={() => { setConfirm(null); setScreen("overview"); }} />}
    {confirm?.kind === "delete" && <SetlistConfirm title="Supprimer cette setlist ?" detail="La setlist sera retirée du Studio, sans supprimer les sons de la médiathèque." confirmLabel="Supprimer" danger onCancel={() => setConfirm(null)} onConfirm={() => { setEntries((current) => current.filter((entry) => entry.id !== confirm.id)); setConfirm(null); onDone("Setlist supprimée"); }} />}
    {confirm?.kind === "launch" && confirm.id && <SetlistConfirm title="Lancer en Room" detail="La setlist et son ordre seront chargés dans le mixeur central." confirmLabel="Ouvrir le mixeur" onCancel={() => setConfirm(null)} onConfirm={() => openMixer(confirm.id!)} />}
  </section>;
}
