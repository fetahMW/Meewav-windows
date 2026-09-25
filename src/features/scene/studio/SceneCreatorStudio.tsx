import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  BarChart3,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ExternalLink,
  Eye,
  FileVideo2,
  Filter,
  Flag,
  Globe2,
  Heart,
  Languages,
  ListVideo,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Pin,
  Plus,
  Radio,
  Reply,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
  UsersRound,
} from "lucide-react";
import {
  SCENE_STUDIO_COMMENTS,
  SCENE_STUDIO_DEMO_CONTENT,
  SCENE_STUDIO_OVERVIEW,
  SCENE_STUDIO_SECTIONS,
  getSceneStudioContent,
  getSceneStudioContentId,
  getSceneStudioSection,
  getSceneStudioSummary,
  type SceneStudioComment,
  type SceneStudioContentItem,
  type SceneStudioPublicationStatus,
  type SceneStudioSectionId,
} from "./sceneCreatorStudio.model";
import { useAuth } from "../../auth/AuthContext";
import { profileMediaRepository, type OwnerMediaItem } from "../../profile/profile.media.service";
import "./scene-creator-studio.css";

type SceneCreatorStudioProps = {
  pathname: string;
  onNavigate: (path: string) => void;
  onPublish: () => void;
};

const SECTION_COPY: Record<SceneStudioSectionId, { title: string; description: string }> = {
  dashboard: { title: "Bonjour Naya.", description: "Voici ce qui s’est passé sur La Scène ces 28 derniers jours." },
  content: { title: "Contenus", description: "Publie, retrouve et pilote toutes tes créations au même endroit." },
  analytics: { title: "Analyses", description: "Comprends ton audience, la rétention et la circulation de tes créations dans MeeWav." },
  comments: { title: "Commentaires", description: "Réponds à ta communauté et traite les conversations importantes." },
  playlists: { title: "Playlists", description: "Organise tes œuvres et tes sélections publiques sans dupliquer les médias." },
  rights: { title: "Droits & collaborations", description: "Crédite chaque participation et contrôle séparément chaque droit de diffusion." },
  tv: { title: "MeeWav TV", description: "Accepte, refuse et suis les programmations éditoriales de tes contenus." },
};

const statusFilters: { value: "all" | SceneStudioPublicationStatus; label: string }[] = [
  { value: "all", label: "Tout" },
  { value: "published", label: "Publié" },
  { value: "scheduled", label: "Programmé" },
  { value: "draft", label: "Brouillon" },
  { value: "processing", label: "En traitement" },
  { value: "review", label: "À vérifier" },
  { value: "blocked", label: "Bloqué" },
];

function compactNumber(value: number) {
  return new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function StudioStatus({ item }: { item: SceneStudioContentItem }) {
  return <span className="scene-studio-status" data-status={item.status}>{item.statusLabel}</span>;
}

function Kpi({ label, value, delta, icon }: { label: string; value: string; delta: string; icon: ReactNode }) {
  return (
    <article className="scene-studio-kpi">
      <span className="scene-studio-kpi__icon">{icon}</span>
      <p>{label}</p>
      <strong>{value}</strong>
      <small><b>{delta}</b> sur la période précédente</small>
    </article>
  );
}

function Overview({ onNavigate, items }: Pick<SceneCreatorStudioProps, "onNavigate"> & { items: readonly SceneStudioContentItem[] }) {
  const summary = getSceneStudioSummary(items);
  const topContent = items.find(({ status }) => status === "published") ?? items[0] ?? SCENE_STUDIO_DEMO_CONTENT[0];
  return (
    <div className="scene-studio-overview">
      <div className="scene-studio-kpis">
        <Kpi label="Vues" value="184,2 k" delta={SCENE_STUDIO_OVERVIEW.viewsDelta} icon={<Eye />} />
        <Kpi label="Temps regardé" value="8 420 h" delta={SCENE_STUDIO_OVERVIEW.watchHoursDelta} icon={<Clock3 />} />
        <Kpi label="Nouveaux suivis" value="+1 284" delta={SCENE_STUDIO_OVERVIEW.followersDelta} icon={<UsersRound />} />
        <Kpi label="Complétion moyenne" value="68 %" delta={SCENE_STUDIO_OVERVIEW.completionDelta} icon={<Activity />} />
      </div>

      <div className="scene-studio-overview__grid">
        <section className="scene-studio-featured" aria-labelledby="studio-progress-title">
          <header><div><span>CRÉATION QUI PROGRESSE</span><h2 id="studio-progress-title">Ta vidéo la plus dynamique</h2></div><button type="button" onClick={() => onNavigate(`/scene/studio/content/${topContent.id}`)}>Voir les analyses</button></header>
          <div className="scene-studio-featured__body">
            <img src={topContent.thumbnailUrl} alt="" width="448" height="252" />
            <div><strong>{topContent.title}</strong><p>48,2 k vues <b>+24 % cette semaine</b></p><dl><div><dt>Complétion</dt><dd>76 %</dd></div><div><dt>Nouveaux suivis</dt><dd>+482</dd></div></dl></div>
          </div>
          <div className="scene-studio-sparkline" aria-label="Progression régulière puis accélération sur les sept derniers jours"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
        </section>

        <section className="scene-studio-attention" aria-labelledby="studio-attention-title">
          <header><span>À TRAITER</span><h2 id="studio-attention-title">Ce qui demande ton attention</h2></header>
          <button type="button" onClick={() => onNavigate("/scene/studio/rights")}><UsersRound /><span><strong>2 collaborations à confirmer</strong><small>Crédits et droit à l’image</small></span><b>Ouvrir</b></button>
          <button type="button" onClick={() => onNavigate("/scene/studio/content")}><FileVideo2 /><span><strong>1 contenu en traitement</strong><small>Qualités HD générées à 72 %</small></span><b>Suivre</b></button>
          <button type="button" onClick={() => onNavigate("/scene/studio/tv")}><Radio /><span><strong>1 demande MeeWav TV</strong><small>Réponse attendue avant le 12 août</small></span><b>Décider</b></button>
          <button type="button" onClick={() => onNavigate("/scene/studio/comments")}><Flag /><span><strong>3 commentaires signalés</strong><small>À examiner sans urgence artificielle</small></span><b>Modérer</b></button>
        </section>
      </div>

      <div className="scene-studio-overview__lower">
        <section className="scene-studio-recent">
          <header><span>ACTIVITÉ RÉCENTE</span><h2>Ce qui vient de se passer</h2></header>
          <ol>
            <li><b>Aujourd’hui · 01:42</b><span>« Sous la lumière » a dépassé 48 k vues.</span></li>
            <li><b>Hier · 21:16</b><span>MeeWav TV souhaite programmer « Live sur les toits ».</span></li>
            <li><b>Hier · 18:04</b><span>Maeva Sol a confirmé une partie de ses crédits.</span></li>
          </ol>
        </section>
        <section className="scene-studio-inventory">
          <header><span>BIBLIOTHÈQUE</span><h2>{summary.contentCount} contenus</h2></header>
          <div><p><strong>{summary.publishedCount}</strong> publiés</p><p><strong>{summary.scheduledCount}</strong> programmés</p><p><strong>{summary.draftCount}</strong> brouillons</p><p><strong>{summary.processingCount}</strong> traitement</p></div>
          <button type="button" onClick={() => onNavigate("/scene/studio/content")}>Gérer tous les contenus</button>
        </section>
      </div>
    </div>
  );
}

function ContentRow({ item, menuOpen, onMenu, onOpen, onAction }: {
  item: SceneStudioContentItem;
  menuOpen: boolean;
  onMenu: () => void;
  onOpen: () => void;
  onAction: (label: string) => void;
}) {
  return (
    <article className="scene-studio-content-row">
      <button type="button" className="scene-studio-content-row__content" onClick={onOpen}>
        <span className="scene-studio-content-row__media"><img src={item.thumbnailUrl} alt="" width="192" height="108" loading="lazy" /><small>{item.durationLabel}</small></span>
        <span className="scene-studio-content-row__title"><strong>{item.title}</strong><small>{item.format}{item.isRoomReplay ? " · Replay" : ""}</small></span>
      </button>
      <div className="scene-studio-content-row__status"><StudioStatus item={item} /><small>{item.publishedLabel}</small></div>
      <div className="scene-studio-content-row__metric"><strong>{item.views ? compactNumber(item.views) : "—"}</strong><span>vues</span></div>
      <div className="scene-studio-content-row__metric"><strong>{item.comments || "—"}</strong><span>commentaires</span></div>
      <div className="scene-studio-content-row__visibility"><Eye /><span>{item.visibility}</span></div>
      <div className="scene-studio-content-row__menu">
        <button type="button" aria-label={`Actions pour ${item.title}`} aria-expanded={menuOpen} onClick={onMenu}><MoreHorizontal /></button>
        {menuOpen ? (
          <div role="menu">
            {item.publicSlug ? <button type="button" role="menuitem" onClick={() => onAction("public")}><ExternalLink />Voir dans La Scène</button> : null}
            <button type="button" role="menuitem" onClick={() => onAction("details")}><Pencil />Modifier les détails</button>
            <button type="button" role="menuitem" onClick={() => onAction("analytics")}><BarChart3 />Voir les statistiques</button>
            <button type="button" role="menuitem" onClick={() => onAction("playlist")}><ListVideo />Ajouter à une playlist</button>
            <button type="button" role="menuitem" onClick={() => onAction("rights")}><ShieldCheck />Gérer les droits</button>
            {item.status === "scheduled" ? <button type="button" role="menuitem" onClick={() => onAction("schedule")}><CalendarClock />Modifier l’horaire</button> : null}
            <button type="button" role="menuitem" className="is-danger" onClick={() => onAction("private")}><Eye />Passer en privé</button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function ContentLibrary({ onNavigate, notify, sourceItems }: Pick<SceneCreatorStudioProps, "onNavigate"> & { notify: (message: string) => void; sourceItems: readonly SceneStudioContentItem[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | SceneStudioPublicationStatus>("all");
  const [sort, setSort] = useState("recent");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const items = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("fr-FR");
    const filtered = sourceItems.filter((item) => (
      (status === "all" || item.status === status)
      && (!normalized || `${item.title} ${item.format}`.toLocaleLowerCase("fr-FR").includes(normalized))
    ));
    if (sort === "views") return [...filtered].sort((a, b) => b.views - a.views);
    if (sort === "oldest") return [...filtered].reverse();
    return filtered;
  }, [query, sort, sourceItems, status]);

  const action = (item: SceneStudioContentItem, label: string) => {
    setOpenMenuId(null);
    if (label === "public" && item.publicSlug) onNavigate(`/scene/watch/${item.publicSlug}`);
    else if (label === "details" || label === "analytics") onNavigate(`/scene/studio/content/${item.id}`);
    else if (label === "rights") onNavigate("/scene/studio/rights");
    else notify(label === "private" ? "La visibilité reste inchangée tant que tu ne confirmes pas dans la fiche du contenu." : "Action prête dans la fiche du contenu.");
  };

  return (
    <div className="scene-studio-library">
      <div className="scene-studio-library__toolbar">
        <label><Search /><span className="sr-only">Rechercher dans mes contenus</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher dans mes contenus" /></label>
        <label className="scene-studio-library__sort"><span>Tri</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="recent">Plus récent</option><option value="oldest">Plus ancien</option><option value="views">Plus regardé</option></select><ChevronDown /></label>
      </div>
      <nav className="scene-studio-library__filters" aria-label="Filtrer les contenus">
        {statusFilters.map((filter) => <button key={filter.value} type="button" aria-pressed={status === filter.value} onClick={() => setStatus(filter.value)}>{filter.label}</button>)}
      </nav>
      <div className="scene-studio-table-head" aria-hidden="true"><span>CONTENU</span><span>STATUT / DATE</span><span>VUES</span><span>COMMENTAIRES</span><span>VISIBILITÉ</span><span /></div>
      <div className="scene-studio-content-list">
        {items.map((item) => <ContentRow key={item.id} item={item} menuOpen={openMenuId === item.id} onMenu={() => setOpenMenuId(openMenuId === item.id ? null : item.id)} onOpen={() => onNavigate(`/scene/studio/content/${item.id}`)} onAction={(label) => action(item, label)} />)}
      </div>
      {items.length === 0 ? <p className="scene-studio-empty">Aucun contenu ne correspond à ces filtres.</p> : null}
    </div>
  );
}

function RetentionChart() {
  return (
    <section className="scene-studio-retention">
      <header><div><span>RÉTENTION</span><h2>Sous la lumière</h2></div><strong>76 % de complétion</strong></header>
      <div className="scene-studio-retention__chart" aria-label="La rétention passe de 100 pour cent au début à 54 pour cent à la fin"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
      <footer><span>0:00 · 100 %</span><b>Moment fort · 1:12 → 1:38</b><span>3:42 · 54 %</span></footer>
      <p><Sparkles /> Suggestion IA : les spectateurs restent davantage pendant le refrain. Vérifie cette hypothèse avant d’en tirer une décision éditoriale.</p>
    </section>
  );
}

function Analytics() {
  return (
    <div className="scene-studio-analytics">
      <div className="scene-studio-analytics__period"><button type="button">7 jours</button><button type="button" className="is-active">28 jours</button><button type="button">90 jours</button><button type="button">365 jours</button></div>
      <div className="scene-studio-kpis scene-studio-kpis--analytics"><Kpi label="Spectateurs uniques" value="126,8 k" delta="+11 %" icon={<UsersRound />} /><Kpi label="Durée moyenne" value="2:31" delta="+6 %" icon={<Clock3 />} /><Kpi label="Visites profil" value="3 120" delta="+14 %" icon={<Globe2 />} /><Kpi label="Partages" value="2 486" delta="+9 %" icon={<Send />} /></div>
      <RetentionChart />
      <div className="scene-studio-analytics__sources">
        <section><header><span>DÉCOUVERTE</span><h2>D’où viennent les vues ?</h2></header>{[["Accueil La Scène",34],["Explorer",22],["Recherche",14],["Suivis",12],["Profil artiste",8],["Playlists",5],["Globe",3],["MeeWav TV",2]].map(([label, value]) => <div key={label}><span>{label}</span><i><b style={{ width: `${value}%` }} /></i><strong>{value} %</strong></div>)}</section>
        <section className="scene-studio-infrastructure"><header><span>CIRCULATION MEEWAV</span><h2>Ce que tes créations déclenchent</h2></header><dl><div><dt>Profil complet</dt><dd>3 120 ouvertures</dd></div><div><dt>Parcours Tremplin</dt><dd>842 ouvertures</dd></div><div><dt>Globe</dt><dd>486 visites</dd></div><div><dt>Collaborateurs</dt><dd>279 profils ouverts</dd></div></dl><p>Aucune donnée de jeton n’influence les recommandations de La Scène.</p></section>
      </div>
    </div>
  );
}

function CommentsInbox({ notify }: { notify: (message: string) => void }) {
  const [filter, setFilter] = useState("all");
  const [comments, setComments] = useState(() => SCENE_STUDIO_COMMENTS.map((comment) => ({ ...comment })));
  const filtered = comments.filter((comment) => filter === "all" || (filter === "unanswered" && !comment.replied) || (filter === "pinned" && comment.pinned) || (filter === "reported" && comment.reported) || (filter === "questions" && comment.question));
  const act = (id: string, type: "reply" | "pin" | "like") => setComments((current) => current.map((comment) => comment.id === id ? { ...comment, replied: type === "reply" ? true : comment.replied, pinned: type === "pin" ? !comment.pinned : comment.pinned, likes: type === "like" ? comment.likes + 1 : comment.likes } : comment));
  return (
    <div className="scene-studio-comments">
      <nav aria-label="Filtrer les commentaires">{[["all","Tous"],["unanswered","Sans réponse"],["pinned","Épinglés"],["reported","Signalés"],["questions","Questions"]].map(([value,label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</nav>
      <div className="scene-studio-comments__list">{filtered.map((comment: SceneStudioComment) => <article key={comment.id} data-reported={comment.reported || undefined}><img src={comment.avatarUrl} alt="" width="44" height="44" /><div><header><strong>{comment.author}</strong><span>{comment.dateLabel}</span>{comment.pinned ? <b><Pin /> Épinglé</b> : null}</header><p>{comment.body}</p><small>Sur « {comment.contentTitle} »</small><footer><button type="button" onClick={() => { act(comment.id, "reply"); notify("Réponse enregistrée dans la conversation du contenu."); }}><Reply />Répondre</button><button type="button" onClick={() => act(comment.id, "like")}><Heart />{comment.likes}</button><button type="button" onClick={() => act(comment.id, "pin")}><Pin />{comment.pinned ? "Désépingler" : "Épingler"}</button></footer></div></article>)}</div>
    </div>
  );
}

function Playlists({ notify }: { notify: (message: string) => void }) {
  const [playlists, setPlaylists] = useState([{"title":"Sessions essentielles","meta":"12 vidéos · Publique","image":"/images/shorts/catalog-v2/tv-performance-multicam.webp"},{"title":"Collaborations","meta":"8 vidéos · Publique","image":"/images/shorts/catalog/live-azur-band.webp"},{"title":"Inspirations studio","meta":"19 vidéos · Privée","image":"/images/shorts/community/community-producer-bedroom.webp"},{"title":"Shorts","meta":"6 vidéos · Publique","image":"/images/shorts/community/community-purple-performance.webp"},{"title":"Archives live","meta":"14 vidéos · Non répertoriée","image":"/images/shorts/community/community-vocal-booth.webp"}]);
  return <div className="scene-studio-playlists">{playlists.map((playlist) => <article key={playlist.title}><img src={playlist.image} alt="" width="320" height="180" loading="lazy" /><div><strong>{playlist.title}</strong><span>{playlist.meta}</span><button type="button" onClick={() => notify(`La playlist « ${playlist.title} » est prête à être réorganisée.`)}>Gérer</button></div></article>)}<button type="button" className="scene-studio-playlists__new" onClick={() => { setPlaylists((current) => [...current, { title: "Nouvelle playlist", meta: "0 vidéo · Privée", image: "/images/shorts/shorts-acoustic-wall.webp" }]); notify("Playlist privée créée."); }}><Plus /><span>Créer une playlist</span></button></div>;
}

function Rights({ notify }: { notify: (message: string) => void }) {
  return (
    <div className="scene-studio-rights-page">
      <section className="scene-studio-rights-summary"><article><CheckCircle2 /><strong>17</strong><span>Dossiers complets</span></article><article><Clock3 /><strong>2</strong><span>Confirmations en attente</span></article><article><AlertCircle /><strong>1</strong><span>Droit à vérifier</span></article></section>
      <section className="scene-studio-collaborators"><header><span>COLLABORATIONS</span><h2>Confirmations en cours</h2></header><article><img src="/images/messaging/avatars/avatar_3.png" alt="" /><div><strong>Maeva Sol</strong><span>Featuring · Lignes croisées</span><small>Crédit musical confirmé · droit à l’image en attente</small></div><b>En attente</b><button type="button" onClick={() => notify("Relance envoyée dans la conversation de collaboration.")}>Relancer</button></article><article><img src="/images/messaging/avatars/avatar_5.png" alt="" /><div><strong>Elio M.</strong><span>Producteur · Live sur les toits</span><small>Crédit et territoires à confirmer</small></div><b>En attente</b><button type="button" onClick={() => notify("Relance envoyée dans la conversation de collaboration.")}>Relancer</button></article></section>
      <section className="scene-studio-grants"><header><span>DROITS DE DIFFUSION</span><h2>Sous la lumière</h2></header>{[["La Scène VOD",true],["Mode audio",true],["Replay de Room",true],["MeeWav TV",false],["Création d’extraits",true]].map(([label, enabled]) => <div key={String(label)}><span>{enabled ? <CheckCircle2 /> : <AlertCircle />}{label}</span><strong>{enabled ? "Autorisé" : "Non autorisé"}</strong></div>)}<p>Une autorisation La Scène ne vaut jamais automatiquement autorisation MeeWav TV.</p></section>
    </div>
  );
}

function TvStudio({ notify }: { notify: (message: string) => void }) {
  const [request, setRequest] = useState<"pending" | "accepted" | "refused">("pending");
  return (
    <div className="scene-studio-tv">
      <section className="scene-studio-tv__request"><span>DEMANDE REÇUE</span><div><img src="/images/shorts/community/community-songwriter-night.webp" alt="" /><div><small>LA RELÈVE · CRÉNEAU PROPOSÉ</small><h2>Live sur les toits</h2><p>16 août 2026 · 20:30 → 21:00</p><p>Diffusion linéaire MeeWav TV · France, Belgique, Maroc</p></div></div>{request === "pending" ? <footer><button type="button" onClick={() => { setRequest("accepted"); notify("Proposition TV acceptée. Les droits restent vérifiables jusqu’à la programmation."); }}>Accepter</button><button type="button" onClick={() => notify("Conditions de programmation ouvertes.")}>Voir les conditions</button><button type="button" onClick={() => { setRequest("refused"); notify("Proposition TV refusée sans modifier la publication La Scène."); }}>Refuser</button></footer> : <p className={`scene-studio-tv__decision is-${request}`}><Check />{request === "accepted" ? "Proposition acceptée" : "Proposition refusée"}</p>}</section>
      <section className="scene-studio-tv__schedule"><header><span>PROGRAMMÉ</span><h2>Prochaine diffusion</h2></header><article><img src="/images/shorts/catalog-v2/vocal-pop-urbaine-blue-hour.webp" alt="" /><div><strong>Sous la lumière</strong><span>MeeWav Sessions</span><small>12 août · 21:00</small></div><button type="button" onClick={() => notify("Ouverture du programme MeeWav TV.")}>Voir le programme</button></article></section>
      <section className="scene-studio-tv__history"><header><span>DIFFUSÉ</span><h2>Impact des passages récents</h2></header><div><article><strong>12,4 k</strong><span>audience estimée</span></article><article><strong>+1 240</strong><span>nouveaux spectateurs</span></article><article><strong>+182</strong><span>nouveaux suivis</span></article></div><p>2 diffusions passées. Les chiffres TV restent séparés des vues à la demande.</p></section>
    </div>
  );
}

type DetailTab = "details" | "analytics" | "comments" | "subtitles" | "rights" | "tv";

function ContentDetail({ item, onNavigate, notify, onSaveDetails }: { item: SceneStudioContentItem; onNavigate: (path: string) => void; notify: (message: string) => void; onSaveDetails: (details: { title: string; description: string; contentType: string; city: string; language: string; visibility: "public" | "unlisted" | "private" }) => Promise<boolean> }) {
  const [tab, setTab] = useState<DetailTab>("details");
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState("Une Session tournée en prise directe. Écriture, voix et interprétation par Naya K.");
  const [contentType, setContentType] = useState("session");
  const [visibility, setVisibility] = useState<"public" | "unlisted" | "private">(item.visibility === "Public" ? "public" : item.visibility === "Non répertorié" ? "unlisted" : "private");
  const [city, setCity] = useState("Grenoble");
  const [language, setLanguage] = useState("fr");
  const [saved, setSaved] = useState(true);
  const update = (setter: (value: string) => void, value: string) => { setter(value); setSaved(false); };
  return (
    <div className="scene-studio-detail">
      <button type="button" className="scene-studio-detail__back" onClick={() => onNavigate("/scene/studio/content")}><ArrowLeft />Retour aux contenus</button>
      <header className="scene-studio-detail__hero"><img src={item.thumbnailUrl} alt="" width="240" height="135" /><div><StudioStatus item={item} /><h2>{title}</h2><p>{item.format} · {item.durationLabel}</p></div>{item.publicSlug ? <button type="button" onClick={() => onNavigate(`/scene/watch/${item.publicSlug}`)}>Voir dans La Scène <ExternalLink /></button> : null}</header>
      <nav className="scene-studio-detail__tabs" aria-label="Gestion du contenu">{[["details","Détails"],["analytics","Analyses"],["comments","Commentaires"],["subtitles","Sous-titres"],["rights","Droits"],["tv","TV"]].map(([value,label]) => <button key={value} type="button" aria-current={tab === value ? "page" : undefined} onClick={() => setTab(value as DetailTab)}>{label}</button>)}</nav>
      {tab === "details" ? <div className="scene-studio-detail__details"><section><label>Titre<input value={title} maxLength={120} onChange={(event) => update(setTitle, event.target.value)} /></label><label>Description<textarea value={description} rows={7} onChange={(event) => update(setDescription, event.target.value)} /></label><div className="scene-studio-detail__fields"><label>Type<select value={contentType} onChange={(event) => { setContentType(event.target.value); setSaved(false); }}><option value="session">Session</option><option value="clip">Clip</option><option value="performance">Performance</option></select></label><label>Visibilité<select value={visibility} onChange={(event) => { setVisibility(event.target.value as typeof visibility); setSaved(false); }}><option value="public">Public</option><option value="unlisted">Non répertorié</option><option value="private">Privé</option></select></label><label>Ville<input value={city} onChange={(event) => update(setCity, event.target.value)} /></label><label>Langue<select value={language} onChange={(event) => { setLanguage(event.target.value); setSaved(false); }}><option value="fr">Français</option><option value="en">Anglais</option><option value="ar">Arabe</option></select></label></div><button type="button" className="scene-studio-save" disabled={saved} onClick={() => { void onSaveDetails({ title, description, contentType, city, language, visibility }).then((success) => { if (success) setSaved(true); }); }}><Check />{saved ? "Modifications enregistrées" : "Enregistrer"}</button></section><aside><span>MINIATURE</span><img src={item.thumbnailUrl} alt="Aperçu de la miniature" /><button type="button" onClick={() => notify("Sélecteur de miniature ouvert.")}>Modifier la miniature</button><small>Prévisualisation 16:9 · mobile · partage social</small></aside></div> : null}
      {tab === "analytics" ? <><div className="scene-studio-kpis scene-studio-kpis--detail"><Kpi label="Vues" value={compactNumber(item.views)} delta="+24 %" icon={<Eye />} /><Kpi label="Complétion" value={`${item.completionPercent ?? 0} %`} delta="+4 pts" icon={<Activity />} /><Kpi label="Commentaires" value={String(item.comments)} delta="+12 %" icon={<MessageCircle />} /><Kpi label="Nouveaux suivis" value="+482" delta="+19 %" icon={<UsersRound />} /></div><RetentionChart /></> : null}
      {tab === "comments" ? <CommentsInbox notify={notify} /> : null}
      {tab === "subtitles" ? <section className="scene-studio-subtitles"><header><div><span>SOUS-TITRES</span><h2>Langues et transcription</h2></div><button type="button" onClick={() => notify("Transcription IA proposée comme brouillon à relire.")}><Sparkles />Générer une transcription</button></header>{[["Français","Publié","Corrigé manuellement"],["Anglais","Brouillon IA","À relire"],["Arabe","Non ajouté","—"]].map(([language,status,meta]) => <article key={language}><Languages /><div><strong>{language}</strong><span>{meta}</span></div><b>{status}</b><button type="button">Gérer</button></article>)}</section> : null}
      {tab === "rights" ? <Rights notify={notify} /> : null}
      {tab === "tv" ? <TvStudio notify={notify} /> : null}
    </div>
  );
}

export default function SceneCreatorStudio({ pathname, onNavigate, onPublish }: SceneCreatorStudioProps) {
  const { user } = useAuth();
  const activeSection = getSceneStudioSection(pathname);
  const [ownerItems, setOwnerItems] = useState<SceneStudioContentItem[]>([]);
  const studioItems = ownerItems.length > 0 ? ownerItems : SCENE_STUDIO_DEMO_CONTENT;
  const detailContentId = getSceneStudioContentId(pathname);
  const detailItem = studioItems.find(({ id }) => id === detailContentId) ?? getSceneStudioContent(detailContentId);
  const copy = SECTION_COPY[activeSection];
  const [toast, setToast] = useState("");
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 3200); };
  const saveOwnerDetails = async (details: { title: string; description: string; contentType: string; city: string; language: string; visibility: "public" | "unlisted" | "private" }) => {
    if (!detailItem || !user || !ownerItems.some(({ id }) => id === detailItem.id)) {
      notify("Modifications enregistrées dans la démonstration du Studio.");
      return true;
    }
    try {
      const updated = await profileMediaRepository.updateOwnerMediaDetails(user.id, detailItem.id, {
        name: details.title,
        description: details.description,
        contentType: details.contentType,
        city: details.city,
        language: details.language,
        visibility: details.visibility,
      });
      setOwnerItems((current) => current.map((item) => item.id === updated.id ? {
        ...item,
        title: updated.title,
        visibility: updated.isPublic ? "Public" : details.visibility === "unlisted" ? "Non répertorié" : "Privé",
        status: updated.isPublic ? "published" : "draft",
        statusLabel: updated.status,
      } : item));
      notify("Modifications enregistrées sur le serveur.");
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Impossible d’enregistrer les modifications.");
      return false;
    }
  };

  useEffect(() => {
    if (!user) return;
    let active = true;
    void profileMediaRepository.listOwnerMedia(user.id).then((records) => {
      if (!active) return;
      const mapped = records.map((record: OwnerMediaItem): SceneStudioContentItem => {
        const status: SceneStudioPublicationStatus = record.status === "Publié" ? "published" : record.status === "Programmé" ? "scheduled" : "draft";
        return {
          id: record.id,
          title: record.title,
          format: `${record.kind === "video" ? "Vidéo" : record.kind === "audio" ? "Audio visualizer" : "Média"} · ${record.meta}`,
          durationLabel: record.duration || "0:00",
          thumbnailUrl: record.cover || "/images/shorts/catalog-v3/daily-01-soul-singer.webp",
          status,
          statusLabel: record.status,
          publishedLabel: record.meta,
          visibility: record.isPublic ? "Public" : "Privé",
          views: Number(String(record.plays || "0").replace(/[^0-9]/g, "")) || 0,
          comments: 0,
          completionPercent: null,
          rightsReady: false,
        };
      });
      setOwnerItems(mapped);
    }).catch(() => {
      // The filled investor fixture remains available when the owner media
      // projection is unavailable.
    });
    return () => { active = false; };
  }, [user]);

  return (
    <section className="scene-studio" aria-labelledby="scene-studio-title">
      <header className="scene-studio__header">
        <div><span>MEEWAV / LA SCÈNE / STUDIO</span><h1 id="scene-studio-title">Studio La Scène</h1><p>Publie, pilote et comprends tes contenus.</p></div>
        <div className="scene-studio__header-actions"><button type="button" className="is-secondary" onClick={() => onNavigate("/scene/artist/naya%20k")}>Voir ma page <ExternalLink /></button><button type="button" onClick={onPublish}><Upload />Publier</button></div>
      </header>
      <div className="scene-studio__shell">
        <nav className="scene-studio__nav" aria-label="Navigation du Studio créateur">
          {SCENE_STUDIO_SECTIONS.map((section) => <button key={section.id} type="button" aria-current={activeSection === section.id ? "page" : undefined} onClick={() => onNavigate(section.path)}>{section.id === "dashboard" ? <Activity /> : section.id === "content" ? <FileVideo2 /> : section.id === "analytics" ? <BarChart3 /> : section.id === "comments" ? <MessageCircle /> : section.id === "playlists" ? <ListVideo /> : section.id === "rights" ? <ShieldCheck /> : <Radio />}<span>{section.label}</span>{section.id === "comments" ? <b>3</b> : section.id === "rights" || section.id === "tv" ? <b>1</b> : null}</button>)}
          <button type="button" className="scene-studio__nav-settings" onClick={() => notify("Les paramètres du Studio sont prêts pour le branchement compte.")}><Filter /><span>Paramètres</span></button>
        </nav>
        <main className="scene-studio__main">
          {!detailItem ? <header className="scene-studio__section-header"><div><span>{activeSection === "dashboard" ? "VUE D’ENSEMBLE" : activeSection.toLocaleUpperCase("fr-FR")}</span><h2>{copy.title}</h2><p>{copy.description}</p></div>{activeSection !== "dashboard" ? <small>{SCENE_STUDIO_OVERVIEW.periodLabel}</small> : null}</header> : null}
          {detailItem ? <ContentDetail item={detailItem} onNavigate={onNavigate} notify={notify} onSaveDetails={saveOwnerDetails} /> : null}
          {!detailItem && activeSection === "dashboard" ? <Overview onNavigate={onNavigate} items={studioItems} /> : null}
          {!detailItem && activeSection === "content" ? <ContentLibrary onNavigate={onNavigate} notify={notify} sourceItems={studioItems} /> : null}
          {!detailItem && activeSection === "analytics" ? <Analytics /> : null}
          {!detailItem && activeSection === "comments" ? <CommentsInbox notify={notify} /> : null}
          {!detailItem && activeSection === "playlists" ? <Playlists notify={notify} /> : null}
          {!detailItem && activeSection === "rights" ? <Rights notify={notify} /> : null}
          {!detailItem && activeSection === "tv" ? <TvStudio notify={notify} /> : null}
        </main>
      </div>
      <div className="scene-studio-toast" role="status" aria-live="polite" data-visible={Boolean(toast) || undefined}>{toast}</div>
    </section>
  );
}
