import {
  ArrowRight,
  BadgeCheck,
  ChartNoAxesColumnIncreasing,
  FileText,
  Heart,
  Eye,
  UsersRound,
  CirclePlay,
  CircleUserRound,
  Compass,
  LockKeyhole,
  MapPin,
  MoreHorizontal,
  ChevronRight,
  BookOpen,
  Pause,
  Play,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { MeewavGradeBadge } from "../grades/MeewavGradeBadge";
import { tremplinArtists, type TremplinArtist } from "./tremplinArtistData";
import {
  getTremplinTokenLifecycleStage,
  isPublicTremplinTalent,
  type TremplinTokenLifecycleStage,
  type TremplinUserState,
} from "./tremplinProductModel";
import { trackTremplinEvent } from "./tremplinAnalytics";
import { TREMPLIN_HOME_TOKEN_STATUS_UI } from "./tremplinHomeTokenStatus";
import { getTremplinProfessionLabel } from "./tremplinRoleData";
import { getTremplinProjectSnapshot } from "./tremplinProjectData";
import { getTremplinArtistToken, type TremplinArtistToken } from "./tremplinTokenData";
import MeewavTokenIcon from "./MeewavTokenIcon";
import TremplinGradeProgression from "./TremplinGradeProgression";
import TremplinDemoBanner from "./TremplinDemoBanner";
import "./tremplin-public-home.css";
import "./tremplin-public-home-compact.css";
import "./tremplin-public-home-gateway.css";
import "./tremplin-grades-prestige.css";

type TremplinPublicHomeProps = {
  playingArtistId: string | null;
  followedArtistIds: ReadonlySet<string>;
  userState: TremplinUserState;
  onToggleArtistAudio: (artistId: string) => void;
  onOpenArtist: (artist: TremplinArtist) => void;
  onOpenArtistSupport: (artist: TremplinArtist) => void;
  onMyArtists: () => void;
  onUnderstand: () => void;
  onUnderstandGrades: () => void;
  onUnderstandToken: () => void;
  onOpenRoute: (route: string) => void;
  onSearch: (query: string) => void;
  artistActionLabel: string;
  artistActionDetail: string;
  onArtistAction: () => void;
};

type HomeEntry = {
  artist: TremplinArtist;
  token: TremplinArtistToken;
  tokenStage: TremplinTokenLifecycleStage;
};

const HOME_ENTRIES: readonly HomeEntry[] = tremplinArtists
  .filter(isPublicTremplinTalent)
  .flatMap((artist) => {
    const token = getTremplinArtistToken(artist.id);
    return token ? [{ artist, token, tokenStage: getTremplinTokenLifecycleStage(artist) }] : [];
  });

const SUPPORT_STEPS = [
  {
    number: "01",
    title: "Repère un artiste",
    copy: "À la une du Tremplin ou après l’avoir découvert ailleurs sur MeeWav.",
    icon: Search,
  },
  {
    number: "02",
    title: "Consulte son parcours",
    copy: "Projet, grade, éléments vérifiés : tout ce qu’il faut pour comprendre son évolution.",
    icon: BadgeCheck,
  },
  {
    number: "03",
    title: "Soutiens-le si tu le souhaites",
    copy: "Si son jeton est actif, l’achat reste payant, facultatif et expliqué avant confirmation.",
    icon: MeewavTokenIcon,
  },
] as const;

const TOKEN_PROJECT_PURPOSE_LABELS: Readonly<Record<TremplinTokenLifecycleStage, string>> = {
  observation: "Objectif du futur soutien",
  eligible: "Objectif du futur soutien",
  review: "Objectif du futur soutien",
  upcoming: "Ce que le soutien pourra accompagner",
  active: "Ce que la part destinée à l’artiste accompagne",
  suspended: "Projet associé au jeton",
};

const getTokenSymbolLabel = (stage: TremplinTokenLifecycleStage) => (
  stage === "active" || stage === "suspended" ? "Jeton de talent" : "Symbole réservé"
);

const normalize = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("fr-FR");

const editDistance = (left: string, right: string) => {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length];
};

const matchesSearch = (entry: HomeEntry, normalizedQuery: string) => {
  const project = getTremplinProjectSnapshot(entry.artist);
  const values = [
    entry.artist.name,
    entry.token.symbol,
    project.headline,
    project.nextMilestone,
    getTremplinProfessionLabel(entry.artist),
    entry.artist.city,
    ...entry.artist.styles,
  ].map(normalize);
  if (values.some((value) => value.includes(normalizedQuery))) return true;
  const tolerance = normalizedQuery.length >= 6 ? 2 : 1;
  return values.flatMap((value) => value.split(/\s+/)).some((token) => editDistance(token, normalizedQuery) <= tolerance);
};

const formatCurrency = (value: number) => new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(value);

function TokenStatus({ entry }: { entry: HomeEntry }) {
  const status = TREMPLIN_HOME_TOKEN_STATUS_UI[entry.tokenStage];
  return (
    <span className={`tremplin-gateway__token-status is-${entry.tokenStage}`}>
      {entry.tokenStage === "active" || entry.tokenStage === "suspended"
        ? <MeewavTokenIcon aria-hidden="true" />
        : <i aria-hidden="true" />}
      <span><strong>{status.label}</strong><small>{status.helper}</small></span>
    </span>
  );
}

function PreviewControl({
  entry,
  playing,
  onToggle,
}: {
  entry: HomeEntry;
  playing: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="tremplin-gateway__preview"
      aria-label={playing ? `Mettre l’aperçu de ${entry.artist.name} en pause` : `Écouter un bref aperçu de ${entry.artist.name}`}
      onClick={onToggle}
    >
      {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
      <span><small>Écouter l’extrait</small><strong>{entry.artist.audio.durationLabel}</strong></span>
    </button>
  );
}

function HeroEditorialVisual() {
  return (
    <figure className="tremplin-gateway__editorial-visual">
      <img
        src="/images/tremplin/tremplin-home-talents-v2.png"
        alt="Trois jeunes talents travaillent chacun chez eux : une chanteuse sous les combles, un beatmaker dans son salon et une guitariste dans une pièce lumineuse."
        width="1448"
        height="1086"
        fetchPriority="high"
      />
      <figcaption>
        <span><span className="tremplin-gateway__visual-eyebrow">Un vivier de</span><strong>Talents</strong><small>Plusieurs projets. Plusieurs trajectoires. Une même énergie.</small></span>
        <ul aria-label="Les repères du Tremplin">
          <li><FileText aria-hidden="true" /> Parcours documentés</li>
          <li><ChartNoAxesColumnIncreasing aria-hidden="true" /> Six grades</li>
          <li><UsersRound aria-hidden="true" /> Soutien facultatif</li>
        </ul>
      </figcaption>
    </figure>
  );
}

function RecentAccessCard({
  entry,
  onOpenArtist,
  onOpenSupport,
}: {
  entry: HomeEntry;
  onOpenArtist: () => void;
  onOpenSupport: () => void;
}) {
  const status = TREMPLIN_HOME_TOKEN_STATUS_UI[entry.tokenStage];
  return (
    <article className="tremplin-gateway__access-card" data-token-stage={entry.tokenStage}>
      <button type="button" className="tremplin-gateway__access-media" onClick={onOpenArtist} aria-label={`Voir le profil de ${entry.artist.name}`}>
        <img src={entry.artist.portrait} alt="" loading="lazy" />
      </button>
      <div className="tremplin-gateway__access-copy">
        <header>
          <div><h3>{entry.artist.name}</h3><p>{getTremplinProfessionLabel(entry.artist)} · {entry.artist.city}</p></div>
          <MeewavGradeBadge level={entry.artist.gradeLevel} size="sm" variant="icon" />
        </header>
        <TokenStatus entry={entry} />
        <div className="tremplin-gateway__access-actions">
          <button type="button" className="is-primary" onClick={status.allowSupport ? onOpenSupport : onOpenArtist}>{status.allowSupport ? <MeewavTokenIcon aria-hidden="true" /> : null}{status.action}</button>
          {status.action !== "Voir le parcours" ? <button type="button" className="is-link" onClick={onOpenArtist}>Voir le parcours <ArrowRight aria-hidden="true" /></button> : null}
        </div>
      </div>
    </article>
  );
}

export default function TremplinPublicHome({
  playingArtistId,
  followedArtistIds,
  userState,
  onToggleArtistAudio,
  onOpenArtist,
  onOpenArtistSupport,
  onMyArtists,
  onUnderstand,
  onUnderstandGrades,
  onUnderstandToken,
  onOpenRoute,
  onSearch,
  artistActionLabel,
  artistActionDetail,
  onArtistAction,
}: TremplinPublicHomeProps) {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const searchTrackedRef = useRef(false);
  const gradeViewTrackedRef = useRef(false);

  const editorialEntries = useMemo(() => HOME_ENTRIES.filter(({ artist }) => artist.editorialSelection), []);
  const defaultEntry = useMemo(() => {
    const entries = editorialEntries.length > 0 ? editorialEntries : HOME_ENTRIES;
    const dayIndex = Math.floor(Date.now() / 86_400_000) % Math.max(entries.length, 1);
    return entries[dayIndex] ?? HOME_ENTRIES[0];
  }, [editorialEntries]);
  const selectedEntry = useMemo(
    () => HOME_ENTRIES.find(({ artist }) => artist.id === selectedEntryId) ?? defaultEntry,
    [defaultEntry, selectedEntryId],
  );
  const selectedProject = selectedEntry ? getTremplinProjectSnapshot(selectedEntry.artist) : null;
  const selectedStatus = selectedEntry ? TREMPLIN_HOME_TOKEN_STATUS_UI[selectedEntry.tokenStage] : null;

  useEffect(() => {
    const section = document.getElementById("niveaux");
    if (!section || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || gradeViewTrackedRef.current) return;
      gradeViewTrackedRef.current = true;
      trackTremplinEvent("grade_section_viewed");
      observer.disconnect();
    }, { threshold: 0.35 });
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  const searchSuggestions = useMemo(() => {
    const normalizedQuery = normalize(query.trim());
    if (normalizedQuery.length < 2) return [];
    return HOME_ENTRIES
      .filter((entry) => matchesSearch(entry, normalizedQuery))
      .sort((left, right) => {
        const leftTicker = left.tokenStage === "active" && normalize(left.token.symbol).includes(normalizedQuery) ? 0 : 1;
        const rightTicker = right.tokenStage === "active" && normalize(right.token.symbol).includes(normalizedQuery) ? 0 : 1;
        return leftTicker - rightTicker;
      })
      .slice(0, 6);
  }, [query]);

  const searchSuggestionGroups = useMemo(() => {
    const normalizedQuery = normalize(query.trim());
    const tokenEntries = searchSuggestions.filter(({ token, tokenStage }) => tokenStage === "active" && normalize(token.symbol).includes(normalizedQuery));
    const tokenIds = new Set(tokenEntries.map(({ artist }) => artist.id));
    const artistEntries = searchSuggestions.filter(({ artist }) => !tokenIds.has(artist.id));
    return [
      { label: "Jetons actifs", entries: tokenEntries },
      { label: "Artistes", entries: artistEntries },
    ].filter(({ entries }) => entries.length > 0);
  }, [query, searchSuggestions]);

  const followedEntries = useMemo(() => HOME_ENTRIES.filter(({ artist }) => followedArtistIds.has(artist.id)), [followedArtistIds]);
  const showRecentAccess = userState !== "visitor" && followedEntries.length > 0;
  const spotlightEntries = useMemo(() => {
    const withoutContext = HOME_ENTRIES.filter(({ artist }) => artist.id !== selectedEntry?.artist.id);
    const picked: HomeEntry[] = [];
    (["active", "upcoming", "review", "observation", "eligible", "suspended"] as TremplinTokenLifecycleStage[])
      .forEach((stage) => {
        const match = withoutContext.find((entry) => entry.tokenStage === stage && !picked.includes(entry));
        if (match && picked.length < 4) picked.push(match);
      });
    withoutContext.forEach((entry) => { if (picked.length < 4 && !picked.includes(entry)) picked.push(entry); });
    return picked;
  }, [selectedEntry?.artist.id]);
  const selectEntry = (entry: HomeEntry) => {
    setSelectedEntryId(entry.artist.id);
    setQuery(entry.artist.name);
    setSearchOpen(false);
    setActiveSuggestionIndex(-1);
    trackTremplinEvent("artist_search_result_selected", { artistId: entry.artist.id, tokenStage: entry.tokenStage });
  };

  const handleSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setSearchOpen(false);
      setActiveSuggestionIndex(-1);
      return;
    }
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && searchSuggestions.length > 0) {
      event.preventDefault();
      setSearchOpen(true);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveSuggestionIndex((current) => (current + direction + searchSuggestions.length) % searchSuggestions.length);
    }
  };

  const openPath = (entry: HomeEntry, source: string) => {
    trackTremplinEvent(source === "project" ? "project_card_opened" : "artist_path_opened", { artistId: entry.artist.id, source });
    onOpenArtist(entry.artist);
  };

  const openStatusOrSupport = (entry: HomeEntry, source: string) => {
    const status = TREMPLIN_HOME_TOKEN_STATUS_UI[entry.tokenStage];
    trackTremplinEvent(status.allowSupport ? "support_space_opened" : "token_status_explained", { artistId: entry.artist.id, tokenStage: entry.tokenStage, source });
    onOpenArtistSupport(entry.artist);
  };

  return (
    <div className="tremplin-public-home tremplin-gateway">
      <section id="tremplin-entry" className="tremplin-gateway__hero" aria-labelledby="tremplin-gateway-title">
        <div className="tremplin-gateway__hero-copy">
          <span className="tremplin-gateway__eyebrow"><Zap aria-hidden="true" /> Le Tremplin</span>
          <h1 id="tremplin-gateway-title">
            <span>Le talent se construit.</span>{" "}
            <strong>Le Tremplin le rend visible.</strong>
          </h1>
          <p>Suis les artistes qui t’inspirent, comprends leur évolution et donne de la force aux projets qui te parlent — seulement si tu le souhaites.</p>

          <div className="tremplin-gateway__hero-actions">
            <button type="button" className="is-primary" onClick={() => document.getElementById("a-la-une")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Explorer le Tremplin <ArrowRight aria-hidden="true" /></button>
            <button type="button" className="is-secondary" onClick={onUnderstand}><CirclePlay aria-hidden="true" /> Comprendre comment ça marche</button>
          </div>

          <small className="tremplin-gateway__search-intro">Tu sais déjà qui tu cherches&nbsp;?</small>

          <form
            className="tremplin-gateway__search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              const suggestion = searchSuggestions[activeSuggestionIndex];
              if (suggestion) selectEntry(suggestion);
              else if (searchSuggestions[0]) selectEntry(searchSuggestions[0]);
              else onSearch(query.trim());
            }}
            onFocus={() => setSearchOpen(true)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setSearchOpen(false);
                setActiveSuggestionIndex(-1);
              }
            }}
          >
            <Search aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchOpen(true);
                setActiveSuggestionIndex(-1);
                if (!searchTrackedRef.current && event.target.value.trim().length >= 2) {
                  searchTrackedRef.current = true;
                  trackTremplinEvent("artist_search_started");
                }
              }}
              onKeyDown={handleSearchKey}
              placeholder="Rechercher un artiste, un projet ou un jeton de talent"
              aria-label="Rechercher un artiste, un projet ou un jeton de talent"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={searchOpen && searchSuggestions.length > 0}
              aria-controls="tremplin-gateway-suggestions"
              aria-activedescendant={activeSuggestionIndex >= 0 ? `tremplin-gateway-suggestion-${searchSuggestions[activeSuggestionIndex]?.artist.id}` : undefined}
            />
            {query ? <button type="button" className="is-clear" aria-label="Effacer la recherche" onClick={() => { setQuery(""); setSelectedEntryId(null); setActiveSuggestionIndex(-1); searchTrackedRef.current = false; }}><X aria-hidden="true" /></button> : null}
            <button type="submit" className="is-submit" aria-label="Rechercher"><span>Rechercher</span><ArrowRight aria-hidden="true" /></button>
            <p className="tremplin-gateway__sr-status" aria-live="polite">{query.trim().length >= 2 ? `${searchSuggestions.length} artistes trouvés` : ""}</p>
            {searchOpen && searchSuggestions.length > 0 ? (
              <ul id="tremplin-gateway-suggestions" role="listbox" aria-label="Artistes et jetons correspondants">
                {searchSuggestionGroups.flatMap((group) => [
                  <li key={`group-${group.label}`} role="presentation" className="tremplin-gateway__suggestion-group">{group.label}</li>,
                  ...group.entries.map((entry) => {
                    const index = searchSuggestions.findIndex(({ artist }) => artist.id === entry.artist.id);
                    return (
                      <li key={entry.artist.id} role="presentation">
                        <button
                          id={`tremplin-gateway-suggestion-${entry.artist.id}`}
                          type="button"
                          role="option"
                          aria-selected={activeSuggestionIndex === index}
                          onMouseEnter={() => { setActiveSuggestionIndex(index); setSelectedEntryId(entry.artist.id); }}
                          onFocus={() => setSelectedEntryId(entry.artist.id)}
                          onClick={() => selectEntry(entry)}
                        >
                          <img src={entry.artist.portrait} alt="" />
                          <span><strong>{entry.artist.name}</strong><small>{getTokenSymbolLabel(entry.tokenStage)} : {entry.token.symbol} · {TREMPLIN_HOME_TOKEN_STATUS_UI[entry.tokenStage].label}</small></span>
                          <ArrowRight aria-hidden="true" />
                        </button>
                      </li>
                    );
                  }),
                ])}
              </ul>
            ) : null}
          </form>

          <ul className="tremplin-gateway__reassurance" aria-label="Ce qui reste sous ton contrôle">
            <li><ShieldCheck aria-hidden="true" /> <span>Découvrir et suivre<br />reste gratuit</span></li>
            <li><Heart aria-hidden="true" /> <span>Donner de la force<br />est facultatif</span></li>
            <li><Eye aria-hidden="true" /> <span>Tout est visible<br />avant de décider</span></li>
          </ul>
        </div>

        {selectedEntryId && selectedEntry && selectedProject && selectedStatus ? (
          <article key={selectedEntry.artist.id} className="tremplin-gateway__feature" aria-labelledby="tremplin-gateway-feature-title">
            <div className="tremplin-gateway__feature-media">
              <button type="button" onClick={() => openPath(selectedEntry, "resolver-media")} aria-label={`Voir le parcours de ${selectedEntry.artist.name}`}><img src={selectedEntry.artist.artwork} alt="" fetchPriority="high" /></button>
              <span>{selectedEntryId ? "Résultat sélectionné" : "Sélection éditoriale rotative"}</span>
              <PreviewControl entry={selectedEntry} playing={playingArtistId === selectedEntry.artist.id} onToggle={() => onToggleArtistAudio(selectedEntry.artist.id)} />
            </div>
            <div className="tremplin-gateway__feature-copy">
              <div className="tremplin-gateway__feature-heading">
                <div><small>{selectedEntryId ? "Artiste recherché" : "Projet à la une"}</small><h2 id="tremplin-gateway-feature-title">{selectedEntry.artist.name}</h2><p>{getTremplinProfessionLabel(selectedEntry.artist)} · {selectedEntry.artist.styles[0]} · <MapPin aria-hidden="true" /> {selectedEntry.artist.city}</p></div>
                <MeewavGradeBadge level={selectedEntry.artist.gradeLevel} size="md" variant="icon" />
              </div>
              <div className="tremplin-gateway__feature-project"><small>Projet documenté</small><strong>{selectedProject.headline}</strong><p>{selectedEntry.artist.updates[0]?.summary}</p></div>
              <TokenStatus entry={selectedEntry} />
              <div className="tremplin-gateway__feature-purpose">
                <span><small>{TOKEN_PROJECT_PURPOSE_LABELS[selectedEntry.tokenStage]}</small><strong>{selectedProject.supportNeed}</strong></span>
                {selectedStatus.showPrice ? <span><small>Valeur actuelle · {selectedEntry.token.symbol}</small><strong>{formatCurrency(selectedEntry.token.currentValueEur)}</strong></span> : null}
              </div>
              {selectedStatus.allowSupport ? <p className="tremplin-gateway__force-copy"><strong>Donner de la force au projet de {selectedEntry.artist.name}</strong><span>En achetant des jetons {selectedEntry.token.symbol}. L’achat est payant, facultatif et comporte un risque de perte.</span></p> : null}
              <div className="tremplin-gateway__feature-actions">
                <button type="button" className="is-primary" onClick={() => openStatusOrSupport(selectedEntry, "resolver")}>{selectedStatus.allowSupport ? <MeewavTokenIcon aria-hidden="true" /> : null}{selectedStatus.action} <ArrowRight aria-hidden="true" /></button>
                {selectedStatus.action !== "Voir le parcours" ? <button type="button" className="is-secondary" onClick={() => openPath(selectedEntry, "resolver")}>Voir le parcours</button> : null}
              </div>
              {selectedStatus.allowSupport ? <small className="tremplin-gateway__feature-risk"><ShieldAlert aria-hidden="true" /> Valeur variable · Revente potentiellement différée · Aucun gain garanti</small> : null}
            </div>
          </article>
        ) : <HeroEditorialVisual />}
      </section>

      <div className="tremplin-gateway__demo"><TremplinDemoBanner compact context="fixtures" /></div>

      {showRecentAccess ? (
        <section id="acces-recents" className="tremplin-gateway__section tremplin-gateway__quick" aria-labelledby="tremplin-gateway-quick-title">
          <header className="tremplin-gateway__section-header">
            <div><span>Tes repères</span><h2 id="tremplin-gateway-quick-title">Tes accès récents.</h2><p>Retrouve les parcours que tu suis sans relancer une recherche.</p></div>
            <button type="button" onClick={onMyArtists}>Ouvrir Mes artistes <ArrowRight aria-hidden="true" /></button>
          </header>
          <div className="tremplin-gateway__access-grid">
            {followedEntries.slice(0, 3).map((entry) => <RecentAccessCard key={entry.artist.id} entry={entry} onOpenArtist={() => openPath(entry, "recent")} onOpenSupport={() => openStatusOrSupport(entry, "recent")} />)}
          </div>
        </section>
      ) : null}

      <section id="comment-ca-marche" className="tremplin-gateway__section tremplin-gateway__steps" aria-labelledby="tremplin-gateway-steps-title">
        <header className="tremplin-gateway__section-header">
          <div><span>En trois étapes</span><h2 id="tremplin-gateway-steps-title">Comprendre avant de choisir.</h2><p>Le parcours de l’artiste passe avant son jeton de talent.</p></div>
          <button type="button" onClick={() => { trackTremplinEvent("rules_opened", { source: "support-path" }); onUnderstand(); }}>Comprendre le Tremplin <ArrowRight aria-hidden="true" /></button>
        </header>
        <ol className="tremplin-gateway__steps-grid" aria-label="Le parcours de soutien en trois étapes">
          {SUPPORT_STEPS.map(({ number, title, copy, icon: Icon }, index) => (
            <li key={number} className="tremplin-gateway__step" data-step={index + 1}>
              <div className="tremplin-gateway__step-top">
                <span className="tremplin-gateway__step-number">{number}</span>
                <span className="tremplin-gateway__step-icon"><Icon aria-hidden="true" /></span>
              </div>
              <h3>{title}</h3>
              <p>{copy}</p>
              <div className="tremplin-gateway__step-progress" aria-hidden="true">
                {[0, 1, 2].map((segment) => <i key={segment} className={segment <= index ? "is-lit" : undefined} />)}
              </div>
              {index < SUPPORT_STEPS.length - 1 && <span className="tremplin-gateway__step-next" aria-hidden="true"><ArrowRight /></span>}
            </li>
          ))}
        </ol>
      </section>

      <section id="a-la-une" className="tremplin-gateway__section tremplin-gateway__spotlights" aria-labelledby="tremplin-gateway-spotlights-title">
        <header className="tremplin-gateway__section-header">
          <div><span>À la une du Tremplin</span><h2 id="tremplin-gateway-spotlights-title">Des projets, pas un classement.</h2><p>Une sélection fondée sur le talent, les projets documentés et l’évolution des artistes dans MeeWav.</p><small className="tremplin-gateway__selection-note">La sélection est indépendante du prix et des achats de jetons.</small></div>
          <button type="button" onClick={() => onOpenRoute("/tremplin/decouvrir?collection=watchlist")}>Voir tous les projets <ArrowRight aria-hidden="true" /></button>
        </header>
        <div className="tremplin-gateway__spotlight-grid">
          {spotlightEntries.map((entry) => {
            const project = getTremplinProjectSnapshot(entry.artist);
            const status = TREMPLIN_HOME_TOKEN_STATUS_UI[entry.tokenStage];
            return (
              <article key={entry.artist.id} data-token-stage={entry.tokenStage}>
                <div className="tremplin-gateway__spotlight-cover">
                  <button type="button" className="tremplin-gateway__spotlight-media" onClick={() => openPath(entry, "project")} aria-label={`Voir le projet de ${entry.artist.name}`}><img src={entry.artist.portrait} alt="" loading="lazy" /><span><MapPin aria-hidden="true" />{entry.artist.city}</span></button>
                  <details className="tremplin-gateway__spotlight-menu" onKeyDown={(event) => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}>
                    <summary aria-label={`Actions pour ${entry.artist.name}`}><MoreHorizontal aria-hidden="true" /></summary>
                    <div><button type="button" onClick={() => openPath(entry, "project")}>Voir le projet <ArrowRight aria-hidden="true" /></button><button type="button" onClick={() => openStatusOrSupport(entry, "project")}>{status.action} <ArrowRight aria-hidden="true" /></button></div>
                  </details>
                </div>
                <div className="tremplin-gateway__spotlight-copy">
                  <header><div><h3>{entry.artist.name}</h3><p>{getTremplinProfessionLabel(entry.artist)} · {entry.artist.styles[0]}</p></div><MeewavGradeBadge level={entry.artist.gradeLevel} size="sm" variant="icon" /></header>
                  <div className="tremplin-gateway__spotlight-project"><small>Ce qu’il construit</small><strong>{project.headline}</strong><p>{project.nextMilestone}</p></div>
                  <button type="button" className="tremplin-gateway__spotlight-status" onClick={() => openStatusOrSupport(entry, "project")}><TokenStatus entry={entry} /><ChevronRight aria-hidden="true" /></button>
                  <footer className="tremplin-gateway__spotlight-footer">
                    <dl><div><dt>{getTokenSymbolLabel(entry.tokenStage)}</dt><dd>{entry.token.symbol}</dd></div>{status.showPrice ? <div><dt className="tremplin-gateway__price-label">Valeur actuelle</dt><dd className="tremplin-gateway__spotlight-price">{formatCurrency(entry.token.currentValueEur)}</dd></div> : null}</dl>
                    <button type="button" className="tremplin-gateway__spotlight-action" onClick={() => openStatusOrSupport(entry, "project")}>{status.allowSupport ? <MeewavTokenIcon aria-hidden="true" /> : entry.tokenStage === "upcoming" ? <BookOpen aria-hidden="true" /> : entry.tokenStage === "review" ? <FileText aria-hidden="true" /> : <ChartNoAxesColumnIncreasing aria-hidden="true" />}<span>{status.action}</span><ArrowRight aria-hidden="true" /></button>
                  </footer>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <TremplinGradeProgression onUnderstandGrades={onUnderstandGrades} />

      <section id="protections" className="tremplin-gateway__section tremplin-gateway__final" aria-label="Règles essentielles et espace artiste">
        <div className="tremplin-gateway__final-grid">
          <article className="tremplin-gateway__trust" aria-labelledby="tremplin-gateway-trust-title">
            <img className="tremplin-gateway__final-token-art" src="/images/tremplin/mw-token-premium-reference-cropped-v2.png" alt="" loading="lazy" decoding="async" width="646" height="360" />
            <span className="tremplin-gateway__final-motto" aria-hidden="true">Soutenir<br />Révéler<br />Évoluer</span>
            <span className="tremplin-gateway__eyebrow"><LockKeyhole aria-hidden="true" /> Le jeton de talent, simplement</span>
            <h2 id="tremplin-gateway-trust-title">Tu comprends<br /><span>avant de décider.</span></h2>
            <p>Lorsqu’un jeton est actif, son prix, les frais, la part destinée à l’artiste et les conditions de revente sont visibles avant toute confirmation.</p>
            <ul className="tremplin-gateway__final-benefits">
              <li><ShieldCheck aria-hidden="true" /><span>Achat payant<small>et facultatif</small></span></li>
              <li><Eye aria-hidden="true" /><span>Part artiste<small>visible</small></span></li>
              <li><ChartNoAxesColumnIncreasing aria-hidden="true" /><span>Valeur variable,<small>aucun gain garanti</small></span></li>
            </ul>
            <button type="button" onClick={() => { trackTremplinEvent("rules_opened", { source: "trust-card" }); onUnderstandToken(); }}><MeewavTokenIcon aria-hidden="true" /> Comprendre le jeton de talent <ArrowRight aria-hidden="true" /></button>
          </article>
          <article className="tremplin-gateway__artist-entry" aria-labelledby="tremplin-gateway-artist-title">
            <img className="tremplin-gateway__final-artist-art" src="/images/tremplin/tremplin-artist-backstage-v1.png" alt="" loading="lazy" decoding="async" width="1536" height="1024" />
            <span className="tremplin-gateway__final-motto" aria-hidden="true">Créer<br />Progresser<br />Être vu</span>
            <span className="tremplin-gateway__eyebrow"><CircleUserRound aria-hidden="true" /> Espace artiste</span>
            <h2 id="tremplin-gateway-artist-title">Construis un parcours<br />visible et <span>vérifiable.</span></h2>
            <p>Documente ton activité, comprends ton grade et découvre les conditions d’une demande de jeton de talent.</p>
            <ul className="tremplin-gateway__final-benefits">
              <li><FileText aria-hidden="true" /><span>Tes créations<small>documentées</small></span></li>
              <li><ChartNoAxesColumnIncreasing aria-hidden="true" /><span>Ton grade<small>et son évolution</small></span></li>
              <li><ShieldCheck aria-hidden="true" /><span>Des conditions<small>claires et transparentes</small></span></li>
            </ul>
            <small>{artistActionDetail}</small>
            <button type="button" onClick={() => { trackTremplinEvent("artist_onboarding_opened", { userState }); onArtistAction(); }}>{artistActionLabel} <ArrowRight aria-hidden="true" /></button>
          </article>
        </div>
        <div className="tremplin-gateway__closing" aria-label="Choisir la suite du parcours Tremplin">
          <img className="tremplin-gateway__final-crowd-art" src="/images/tremplin/tremplin-community-live-v1.png" alt="" loading="lazy" decoding="async" width="2172" height="724" />
          <span className="tremplin-gateway__final-motto" aria-hidden="true">Des talents<br />Des projets<br />Une communauté</span>
          <div className="tremplin-gateway__closing-copy"><span><Compass aria-hidden="true" /> Tu gardes le choix</span><h2>Découvre gratuitement. Suis librement.<br />Donne de la force seulement si tu le souhaites.</h2><p>Le projet, le grade, le prix, les frais et les risques restent lisibles avant toute décision.</p></div>
          <ul className="tremplin-gateway__closing-benefits"><li><Search aria-hidden="true" /> Explorer sans frais</li><li><Heart aria-hidden="true" /> Soutenir si tu le souhaites</li><li><LockKeyhole aria-hidden="true" /> Toujours en toute transparence</li></ul>
          <div className="tremplin-gateway__closing-actions"><button type="button" className="is-primary" onClick={() => onOpenRoute("/tremplin/decouvrir")}>Explorer le Tremplin <ArrowRight aria-hidden="true" /></button><button type="button" onClick={onUnderstand}>Comprendre comment ça marche</button></div>
        </div>
      </section>
    </div>
  );
}
