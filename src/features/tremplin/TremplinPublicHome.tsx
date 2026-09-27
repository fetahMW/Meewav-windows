import {
  ArrowRight,
  BadgeCheck,
  Heart,
  CirclePlay,
  CircleUserRound,
  Sparkles,
  Plus,
  Compass,
  MapPin,
  Pause,
  Play,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { MeewavGradeBadge } from "../grades/MeewavGradeBadge";
import { getGradeBadgeMeta } from "../grades/gradeBadges";
import { tremplinArtists, type TremplinArtist } from "./tremplinArtistData";
import {
  getTremplinTokenLifecycleStage,
  isPublicTremplinTalent,
  type TremplinTokenLifecycleStage,
  type TremplinUserState,
} from "./tremplinProductModel";
import { trackTremplinEvent } from "./tremplinAnalytics";
import { TREMPLIN_HOME_TOKEN_STATUS_UI } from "./tremplinHomeTokenStatus";
import {
  getTremplinProfessionLabel,
  getTremplinRoleProfile,
} from "./tremplinRoleData";
import { getTremplinProjectSnapshot } from "./tremplinProjectData";
import {
  getTremplinArtistToken,
  type TremplinArtistToken,
} from "./tremplinTokenData";
import MeewavTokenIcon from "./MeewavTokenIcon";
import TremplinGradeProgression from "./TremplinGradeProgression";
import TremplinDemoBanner from "./TremplinDemoBanner";
import "./tremplin-public-home.css";
import "./tremplin-public-home-compact.css";
import "./tremplin-public-home-gateway.css";
import "./tremplin-grades-prestige.css";
import "./tremplin-home-editorial.css";

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
    return token
      ? [{ artist, token, tokenStage: getTremplinTokenLifecycleStage(artist) }]
      : [];
  });

const SUPPORT_STEPS = [
  {
    number: "01",
    title: "Repère le talent.",
    copy: "Une voix, un geste, une création. Découvre celles et ceux qui ont quelque chose à partager.",
    icon: Search,
  },
  {
    number: "02",
    title: "Suis le chemin.",
    copy: "Entre dans les coulisses. Retrouve ses projets, ses étapes et les repères de son évolution.",
    icon: BadgeCheck,
  },
  {
    number: "03",
    title: "Fais grandir l’élan.",
    copy: "Suis son parcours gratuitement. Et si tu le souhaites, découvre comment soutenir son projet.",
    icon: MeewavTokenIcon,
  },
] as const;

const TOKEN_PROJECT_PURPOSE_LABELS: Readonly<
  Record<TremplinTokenLifecycleStage, string>
> = {
  observation: "Objectif du futur soutien",
  eligible: "Objectif du futur soutien",
  review: "Objectif du futur soutien",
  upcoming: "Ce que le soutien pourra accompagner",
  active: "Ce que la part destinée à l’artiste accompagne",
  suspended: "Projet associé au jeton",
};

const getTokenSymbolLabel = (stage: TremplinTokenLifecycleStage) =>
  stage === "active" || stage === "suspended"
    ? "Jeton de talent"
    : "Symbole réservé";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR");

const editDistance = (left: string, right: string) => {
  const previous = Array.from(
    { length: right.length + 1 },
    (_, index) => index,
  );
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
  return values
    .flatMap((value) => value.split(/\s+/))
    .some((token) => editDistance(token, normalizedQuery) <= tolerance);
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

function TokenStatus({ entry }: { entry: HomeEntry }) {
  const status = TREMPLIN_HOME_TOKEN_STATUS_UI[entry.tokenStage];
  return (
    <span className={`tremplin-gateway__token-status is-${entry.tokenStage}`}>
      {entry.tokenStage === "active" || entry.tokenStage === "suspended" ? (
        <MeewavTokenIcon aria-hidden="true" />
      ) : (
        <i aria-hidden="true" />
      )}
      <span>
        <strong>{status.label}</strong>
        <small>{status.helper}</small>
      </span>
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
      aria-label={
        playing
          ? `Mettre l’aperçu de ${entry.artist.name} en pause`
          : `Écouter un bref aperçu de ${entry.artist.name}`
      }
      onClick={onToggle}
    >
      {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
      <span>
        <small>Écouter l’extrait</small>
        <strong>{entry.artist.audio.durationLabel}</strong>
      </span>
    </button>
  );
}

const DISCOVERY_FILTERS = (
  [
    ["all", "Tous les talents"],
    ["voix", "Voix"],
    ["instruments", "Instruments"],
    ["creation-production", "Production"],
    ["danse-performance", "Danse"],
    ["son-image", "Son & image"],
  ] as const
).filter(
  ([id]) =>
    id === "all" ||
    HOME_ENTRIES.some(
      ({ artist }) => getTremplinRoleProfile(artist).familyId === id,
    ),
);

function HeroEditorialVisual({
  entry,
  companion,
  playing,
  onOpen,
  onListen,
}: {
  entry?: HomeEntry;
  companion?: HomeEntry;
  playing: boolean;
  onOpen: () => void;
  onListen: () => void;
}) {
  if (!entry)
    return (
      <figure className="tremplin-home__fallback">
        <img
          src="/images/tremplin/tremplin-home-talents-v2.png"
          alt="Une chanteuse, un beatmaker et une guitariste en pleine création"
        />
        <figcaption>Plusieurs talents. Une même énergie.</figcaption>
      </figure>
    );
  return (
    <div className={"tremplin-home__deck " + (playing ? "is-playing" : "")}>
      <span className="tremplin-home__deck-caption">
        Sélection Meewav <span>À découvrir</span>
      </span>
      <div className="tremplin-home__vinyl" aria-hidden="true">
        <span className="tremplin-home__vinyl-face"><i>
          LE TREMPLIN<span>meewav.</span>
        </i></span>
      </div>
      {companion && (
        <div className="tremplin-home__sleeve" aria-hidden="true">
          <img src={companion.artist.portrait} alt="" />
          <span>{companion.artist.name}</span>
        </div>
      )}
      <article className="tremplin-home__record">
        <span className="tremplin-home__record-label">
          <i /> Le talent avant le bruit <Sparkles aria-hidden="true" />
        </span>
        <button
          type="button"
          className="tremplin-home__record-image"
          onClick={onOpen}
          aria-label={"Découvrir le parcours de " + entry.artist.name}
        >
          <img
            src={entry.artist.portrait}
            alt={"Portrait de " + entry.artist.name}
            fetchPriority="high"
          />
          <span>
            <small>{entry.artist.styles[0]}</small>
            <strong>{entry.artist.name}</strong>
          </span>
        </button>
        <footer>
          <span>
            <strong>{entry.artist.audio.title}</strong>
            <small>{getTremplinProfessionLabel(entry.artist)}</small>
          </span>
          <button
            type="button"
            onClick={onListen}
            aria-pressed={playing}
            aria-label={
              (playing ? "Mettre en pause : " : "Écouter ") + entry.artist.name
            }
          >
            {playing ? <Pause /> : <Play />}
          </button>
        </footer>
      </article>
      <span className="tremplin-home__stamp" aria-hidden="true">
        <small>Les premiers</small>
        <em>comptent.</em>
        <Sparkles />
      </span>
      <span className="tremplin-home__deck-note">
        <Heart aria-hidden="true" />
        <span>
          Pas juste une écoute.<strong>Le début d’une histoire.</strong>
        </span>
      </span>
    </div>
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
    <article
      className="tremplin-gateway__access-card"
      data-token-stage={entry.tokenStage}
    >
      <button
        type="button"
        className="tremplin-gateway__access-media"
        onClick={onOpenArtist}
        aria-label={`Voir le profil de ${entry.artist.name}`}
      >
        <img src={entry.artist.portrait} alt="" loading="lazy" />
      </button>
      <div className="tremplin-gateway__access-copy">
        <header>
          <div>
            <h3>{entry.artist.name}</h3>
            <p>
              {getTremplinProfessionLabel(entry.artist)} · {entry.artist.city}
            </p>
          </div>
          <MeewavGradeBadge
            level={entry.artist.gradeLevel}
            size="sm"
            variant="icon"
          />
        </header>
        <TokenStatus entry={entry} />
        <div className="tremplin-gateway__access-actions">
          <button
            type="button"
            className="is-primary"
            onClick={status.allowSupport ? onOpenSupport : onOpenArtist}
          >
            {status.allowSupport ? (
              <MeewavTokenIcon aria-hidden="true" />
            ) : null}
            {status.action}
          </button>
          {status.action !== "Voir le parcours" ? (
            <button type="button" className="is-link" onClick={onOpenArtist}>
              Voir le parcours <ArrowRight aria-hidden="true" />
            </button>
          ) : null}
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
  const [discoveryFilter, setDiscoveryFilter] = useState("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const searchTrackedRef = useRef(false);
  const gradeViewTrackedRef = useRef(false);

  const editorialEntries = useMemo(
    () => HOME_ENTRIES.filter(({ artist }) => artist.editorialSelection),
    [],
  );
  const defaultEntry = useMemo(() => {
    const entries =
      editorialEntries.length > 0 ? editorialEntries : HOME_ENTRIES;
    const dayIndex =
      Math.floor(Date.now() / 86_400_000) % Math.max(entries.length, 1);
    return entries[dayIndex] ?? HOME_ENTRIES[0];
  }, [editorialEntries]);
  const selectedEntry = useMemo(
    () =>
      HOME_ENTRIES.find(({ artist }) => artist.id === selectedEntryId) ??
      defaultEntry,
    [defaultEntry, selectedEntryId],
  );
  const selectedProject = selectedEntry
    ? getTremplinProjectSnapshot(selectedEntry.artist)
    : null;
  const selectedStatus = selectedEntry
    ? TREMPLIN_HOME_TOKEN_STATUS_UI[selectedEntry.tokenStage]
    : null;

  useEffect(() => {
    const section = document.getElementById("niveaux");
    if (!section || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || gradeViewTrackedRef.current) return;
        gradeViewTrackedRef.current = true;
        trackTremplinEvent("grade_section_viewed");
        observer.disconnect();
      },
      { threshold: 0.35 },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  const searchSuggestions = useMemo(() => {
    const normalizedQuery = normalize(query.trim());
    if (normalizedQuery.length < 2) return [];
    return HOME_ENTRIES.filter((entry) => matchesSearch(entry, normalizedQuery))
      .sort((left, right) => {
        const leftTicker =
          left.tokenStage === "active" &&
          normalize(left.token.symbol).includes(normalizedQuery)
            ? 0
            : 1;
        const rightTicker =
          right.tokenStage === "active" &&
          normalize(right.token.symbol).includes(normalizedQuery)
            ? 0
            : 1;
        return leftTicker - rightTicker;
      })
      .slice(0, 6);
  }, [query]);

  const searchSuggestionGroups = useMemo(() => {
    const normalizedQuery = normalize(query.trim());
    const tokenEntries = searchSuggestions.filter(
      ({ token, tokenStage }) =>
        tokenStage === "active" &&
        normalize(token.symbol).includes(normalizedQuery),
    );
    const tokenIds = new Set(tokenEntries.map(({ artist }) => artist.id));
    const artistEntries = searchSuggestions.filter(
      ({ artist }) => !tokenIds.has(artist.id),
    );
    return [
      { label: "Jetons actifs", entries: tokenEntries },
      { label: "Artistes", entries: artistEntries },
    ].filter(({ entries }) => entries.length > 0);
  }, [query, searchSuggestions]);

  const followedEntries = useMemo(
    () => HOME_ENTRIES.filter(({ artist }) => followedArtistIds.has(artist.id)),
    [followedArtistIds],
  );
  const showRecentAccess =
    userState !== "visitor" && followedEntries.length > 0;
  const spotlightEntries = useMemo(() => {
    const entries =
      discoveryFilter === "all"
        ? HOME_ENTRIES
        : HOME_ENTRIES.filter(
            ({ artist }) =>
              getTremplinRoleProfile(artist).familyId === discoveryFilter,
          );
    return [...entries]
      .sort(
        (a, b) =>
          Number(b.artist.editorialSelection) -
          Number(a.artist.editorialSelection),
      )
      .slice(0, 4);
  }, [discoveryFilter]);
  const featuredProject = defaultEntry
    ? getTremplinProjectSnapshot(defaultEntry.artist)
    : null;
  const scrollToTalents = () =>
    document
      .getElementById("a-la-une")
      ?.scrollIntoView({
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")
          .matches
          ? "auto"
          : "smooth",
        block: "start",
      });
  const selectEntry = (entry: HomeEntry) => {
    setSelectedEntryId(entry.artist.id);
    setQuery(entry.artist.name);
    setSearchOpen(false);
    setActiveSuggestionIndex(-1);
    trackTremplinEvent("artist_search_result_selected", {
      artistId: entry.artist.id,
      tokenStage: entry.tokenStage,
    });
  };

  const handleSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setSearchOpen(false);
      setActiveSuggestionIndex(-1);
      return;
    }
    if (
      (event.key === "ArrowDown" || event.key === "ArrowUp") &&
      searchSuggestions.length > 0
    ) {
      event.preventDefault();
      setSearchOpen(true);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveSuggestionIndex(
        (current) =>
          (current + direction + searchSuggestions.length) %
          searchSuggestions.length,
      );
    }
  };

  const openPath = (entry: HomeEntry, source: string) => {
    trackTremplinEvent(
      source === "project" ? "project_card_opened" : "artist_path_opened",
      { artistId: entry.artist.id, source },
    );
    onOpenArtist(entry.artist);
  };

  const openStatusOrSupport = (entry: HomeEntry, source: string) => {
    const status = TREMPLIN_HOME_TOKEN_STATUS_UI[entry.tokenStage];
    trackTremplinEvent(
      status.allowSupport ? "support_space_opened" : "token_status_explained",
      { artistId: entry.artist.id, tokenStage: entry.tokenStage, source },
    );
    onOpenArtistSupport(entry.artist);
  };

  return (
    <div className="tremplin-public-home tremplin-home">
      <div className="tremplin-home__masthead">
        <span>
          MEEWAV <i /> LE TREMPLIN
        </span>
        <span>
          La nouvelle scène s’écrit ici <Sparkles aria-hidden="true" />
        </span>
      </div>
      <section
        id="tremplin-entry"
        className="tremplin-home__hero"
        aria-labelledby="tremplin-home-title"
      >
        <div className="tremplin-home__hero-copy">
          <span className="tremplin-home__eyebrow">
            <i /> Pour ceux qui créent. Et ceux qui y croient.
          </span>
          <h1 id="tremplin-home-title">
            <span>Les grands noms</span> <span>ont de petits</span>{" "}
            <em>
              débuts.
              <Sparkles aria-hidden="true" />
            </em>
          </h1>
          <p>
            Repère le talent avant le bruit.
            <br />
            Suis les artistes, entre dans leurs projets
            <br className="tremplin-home__desktop-break" /> et fais partie de ce
            qui vient après.
          </p>
          <div className="tremplin-home__hero-actions">
            <button
              type="button"
              className="tremplin-home__primary"
              onClick={scrollToTalents}
            >
              Découvrir les talents <ArrowRight aria-hidden="true" />
            </button>
            <button
              type="button"
              className="tremplin-home__text-button"
              onClick={onUnderstand}
            >
              <CirclePlay aria-hidden="true" /> Comprendre le Tremplin
            </button>
          </div>
          <ul
            className="tremplin-home__reassurance"
            aria-label="Ce qui reste sous ton contrôle"
          >
            <li>
              <ShieldCheck aria-hidden="true" /> Découvrir et suivre reste
              gratuit
            </li>
            <li>
              <Heart aria-hidden="true" /> Donner de la force est facultatif
            </li>
          </ul>
        </div>
        <HeroEditorialVisual
          entry={defaultEntry}
          companion={HOME_ENTRIES.find(
            ({ artist }) => artist.id !== defaultEntry?.artist.id,
          )}
          playing={playingArtistId === defaultEntry?.artist.id}
          onOpen={() => defaultEntry && openPath(defaultEntry, "hero")}
          onListen={() =>
            defaultEntry && onToggleArtistAudio(defaultEntry.artist.id)
          }
        />
      </section>
      <div className="tremplin-home__ribbon" aria-label="L’esprit du Tremplin">
        <span>Le talent avant les chiffres</span>
        <Sparkles aria-hidden="true" />
        <span>La rencontre avant le buzz</span>
        <Sparkles aria-hidden="true" />
        <span>Toi, dès le début</span>
      </div>
      <div className="tremplin-home__demo">
        <TremplinDemoBanner compact context="fixtures" />
      </div>

      {showRecentAccess && (
        <section
          className="tremplin-home__section"
          aria-labelledby="tremplin-home-following"
        >
          <header className="tremplin-home__section-heading">
            <div>
              <span className="tremplin-home__eyebrow">Ton premier rang</span>
              <h2 id="tremplin-home-following">L’histoire continue.</h2>
            </div>
            <button
              type="button"
              className="tremplin-home__text-button"
              onClick={onMyArtists}
            >
              Mes artistes <ArrowRight />
            </button>
          </header>
          <div className="tremplin-gateway__access-grid">
            {followedEntries.slice(0, 3).map((entry) => (
              <RecentAccessCard
                key={entry.artist.id}
                entry={entry}
                onOpenArtist={() => openPath(entry, "recent")}
                onOpenSupport={() => openStatusOrSupport(entry, "recent")}
              />
            ))}
          </div>
        </section>
      )}

      <section
        id="a-la-une"
        className="tremplin-home__section tremplin-home__discover"
        aria-labelledby="tremplin-home-discover-title"
      >
        <header className="tremplin-home__section-heading">
          <div>
            <span className="tremplin-home__eyebrow">01 / La rencontre</span>
            <h2 id="tremplin-home-discover-title">
              Ton prochain <em>coup de cœur.</em>
            </h2>
            <p>
              Des univers singuliers. Des projets en mouvement. À toi de trouver
              celui qui te parle.
            </p>
          </div>
          <button
            type="button"
            className="tremplin-home__text-button"
            onClick={() => onOpenRoute("/tremplin/decouvrir")}
          >
            Tous les talents <ArrowRight aria-hidden="true" />
          </button>
        </header>
        <div className="tremplin-home__discovery-toolbar">
          <div
            className="tremplin-home__filters"
            role="group"
            aria-label="Filtrer les talents par discipline"
          >
            {DISCOVERY_FILTERS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={discoveryFilter === id}
                onClick={() => setDiscoveryFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
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
              if (
                !event.currentTarget.contains(
                  event.relatedTarget as Node | null,
                )
              ) {
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
                if (
                  !searchTrackedRef.current &&
                  event.target.value.trim().length >= 2
                ) {
                  searchTrackedRef.current = true;
                  trackTremplinEvent("artist_search_started");
                }
              }}
              onKeyDown={handleSearchKey}
              placeholder="Un artiste, un projet, une envie…"
              aria-label="Rechercher un artiste, un projet ou un jeton de talent"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={searchOpen && searchSuggestions.length > 0}
              aria-controls="tremplin-gateway-suggestions"
              aria-activedescendant={
                activeSuggestionIndex >= 0
                  ? `tremplin-gateway-suggestion-${searchSuggestions[activeSuggestionIndex]?.artist.id}`
                  : undefined
              }
            />
            {query ? (
              <button
                type="button"
                className="is-clear"
                aria-label="Effacer la recherche"
                onClick={() => {
                  setQuery("");
                  setSelectedEntryId(null);
                  setActiveSuggestionIndex(-1);
                  searchTrackedRef.current = false;
                }}
              >
                <X aria-hidden="true" />
              </button>
            ) : null}
            <button type="submit" className="is-submit" aria-label="Rechercher">
              <span>Rechercher</span>
              <ArrowRight aria-hidden="true" />
            </button>
            <p className="tremplin-gateway__sr-status" aria-live="polite">
              {query.trim().length >= 2
                ? `${searchSuggestions.length} artistes trouvés`
                : ""}
            </p>
            {searchOpen && searchSuggestions.length > 0 ? (
              <ul
                id="tremplin-gateway-suggestions"
                role="listbox"
                aria-label="Artistes et jetons correspondants"
              >
                {searchSuggestionGroups.flatMap((group) => [
                  <li
                    key={`group-${group.label}`}
                    role="presentation"
                    className="tremplin-gateway__suggestion-group"
                  >
                    {group.label}
                  </li>,
                  ...group.entries.map((entry) => {
                    const index = searchSuggestions.findIndex(
                      ({ artist }) => artist.id === entry.artist.id,
                    );
                    return (
                      <li key={entry.artist.id} role="presentation">
                        <button
                          id={`tremplin-gateway-suggestion-${entry.artist.id}`}
                          type="button"
                          role="option"
                          aria-selected={activeSuggestionIndex === index}
                          onMouseEnter={() => {
                            setActiveSuggestionIndex(index);
                          }}
                          onFocus={() => setActiveSuggestionIndex(index)}
                          onClick={() => selectEntry(entry)}
                        >
                          <img src={entry.artist.portrait} alt="" />
                          <span>
                            <strong>{entry.artist.name}</strong>
                            <small>
                              {getTokenSymbolLabel(entry.tokenStage)} :{" "}
                              {entry.token.symbol} ·{" "}
                              {
                                TREMPLIN_HOME_TOKEN_STATUS_UI[entry.tokenStage]
                                  .label
                              }
                            </small>
                          </span>
                          <ArrowRight aria-hidden="true" />
                        </button>
                      </li>
                    );
                  }),
                ])}
              </ul>
            ) : null}
          </form>
        </div>
        {selectedEntryId &&
          selectedEntry &&
          selectedProject &&
          selectedStatus && (
            <div className="tremplin-home__search-result">
              <button
                type="button"
                className="tremplin-home__text-button"
                onClick={() => {
                  setSelectedEntryId(null);
                  setQuery("");
                }}
              >
                Fermer le résultat <X aria-hidden="true" />
              </button>
              <article
                key={selectedEntry.artist.id}
                className="tremplin-gateway__feature"
                aria-labelledby="tremplin-gateway-feature-title"
              >
                <div className="tremplin-gateway__feature-media">
                  <button
                    type="button"
                    onClick={() => openPath(selectedEntry, "resolver-media")}
                    aria-label={`Voir le parcours de ${selectedEntry.artist.name}`}
                  >
                    <img
                      src={selectedEntry.artist.artwork}
                      alt=""
                      fetchPriority="high"
                    />
                  </button>
                  <span>
                    {selectedEntryId
                      ? "Résultat sélectionné"
                      : "Sélection éditoriale rotative"}
                  </span>
                  <PreviewControl
                    entry={selectedEntry}
                    playing={playingArtistId === selectedEntry.artist.id}
                    onToggle={() =>
                      onToggleArtistAudio(selectedEntry.artist.id)
                    }
                  />
                </div>
                <div className="tremplin-gateway__feature-copy">
                  <div className="tremplin-gateway__feature-heading">
                    <div>
                      <small>
                        {selectedEntryId
                          ? "Artiste recherché"
                          : "Projet à la une"}
                      </small>
                      <h2 id="tremplin-gateway-feature-title">
                        {selectedEntry.artist.name}
                      </h2>
                      <p>
                        {getTremplinProfessionLabel(selectedEntry.artist)} ·{" "}
                        {selectedEntry.artist.styles[0]} ·{" "}
                        <MapPin aria-hidden="true" />{" "}
                        {selectedEntry.artist.city}
                      </p>
                    </div>
                    <MeewavGradeBadge
                      level={selectedEntry.artist.gradeLevel}
                      size="md"
                      variant="icon"
                    />
                  </div>
                  <div className="tremplin-gateway__feature-project">
                    <small>Projet documenté</small>
                    <strong>{selectedProject.headline}</strong>
                    <p>{selectedEntry.artist.updates[0]?.summary}</p>
                  </div>
                  <TokenStatus entry={selectedEntry} />
                  <div className="tremplin-gateway__feature-purpose">
                    <span>
                      <small>
                        {TOKEN_PROJECT_PURPOSE_LABELS[selectedEntry.tokenStage]}
                      </small>
                      <strong>{selectedProject.supportNeed}</strong>
                    </span>
                    {selectedStatus.showPrice ? (
                      <span>
                        <small>
                          Valeur actuelle · {selectedEntry.token.symbol}
                        </small>
                        <strong>
                          {formatCurrency(selectedEntry.token.currentValueEur)}
                        </strong>
                      </span>
                    ) : null}
                  </div>
                  {selectedStatus.allowSupport ? (
                    <p className="tremplin-gateway__force-copy">
                      <strong>
                        Donner de la force au projet de{" "}
                        {selectedEntry.artist.name}
                      </strong>
                      <span>
                        En achetant des jetons {selectedEntry.token.symbol}.
                        L’achat est payant, facultatif et comporte un risque de
                        perte.
                      </span>
                    </p>
                  ) : null}
                  <div className="tremplin-gateway__feature-actions">
                    <button
                      type="button"
                      className="is-primary"
                      onClick={() =>
                        openStatusOrSupport(selectedEntry, "resolver")
                      }
                    >
                      {selectedStatus.allowSupport ? (
                        <MeewavTokenIcon aria-hidden="true" />
                      ) : null}
                      {selectedStatus.action} <ArrowRight aria-hidden="true" />
                    </button>
                    {selectedStatus.action !== "Voir le parcours" ? (
                      <button
                        type="button"
                        className="is-secondary"
                        onClick={() => openPath(selectedEntry, "resolver")}
                      >
                        Voir le parcours
                      </button>
                    ) : null}
                  </div>
                  {selectedStatus.allowSupport ? (
                    <small className="tremplin-gateway__feature-risk">
                      <ShieldAlert aria-hidden="true" /> Valeur variable ·
                      Revente potentiellement différée · Aucun gain garanti
                    </small>
                  ) : null}
                </div>
              </article>
            </div>
          )}
        <div className="tremplin-home__talents" aria-live="polite">
          {spotlightEntries.map((entry) => {
            const project = getTremplinProjectSnapshot(entry.artist);
            const playing = playingArtistId === entry.artist.id;
            return (
              <article
                key={entry.artist.id}
                className={`tremplin-home__talent${playing ? " is-playing" : ""}`}
                style={{ "--release-accent": getGradeBadgeMeta(entry.artist.gradeLevel).mainColor } as CSSProperties}
                data-token-stage={entry.tokenStage}
              >
                <div className="tremplin-home__talent-artwork">
                  <span className="tremplin-home__talent-disc" aria-hidden="true">
                    <span className="tremplin-home__talent-disc-face"><img src={entry.artist.portrait} alt="" loading="lazy" /></span>
                  </span>
                <div className="tremplin-home__talent-image">
                  <button
                    type="button"
                    onClick={() => openPath(entry, "project")}
                    aria-label={"Voir le projet de " + entry.artist.name}
                  >
                    <img src={entry.artist.portrait} alt="" loading="lazy" />
                    <span>
                      <small>{getTremplinProfessionLabel(entry.artist)}</small>
                      <strong>{entry.artist.name}</strong>
                      <span>
                        <MapPin aria-hidden="true" /> {entry.artist.city}
                      </span>
                    </span>
                  </button>
                  <button
                    className="tremplin-home__talent-play"
                    type="button"
                    aria-pressed={playing}
                    aria-label={
                      (playing
                        ? "Mettre en pause l’extrait de "
                        : "Écouter l’extrait de ") + entry.artist.name
                    }
                    onClick={() => onToggleArtistAudio(entry.artist.id)}
                  >
                    {playing ? <Pause /> : <Play />}
                  </button>
                  <MeewavGradeBadge
                    level={entry.artist.gradeLevel}
                    size="sm"
                    variant="icon"
                  />
                </div>
                </div>
                <div className="tremplin-home__talent-copy">
                  <small>En ce moment</small>
                  <h3>{project.headline}</h3>
                  <button
                    type="button"
                    className="tremplin-home__text-button"
                    onClick={() => openPath(entry, "project")}
                  >
                    Entrer dans son univers <ArrowRight aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="tremplin-home__talent-status"
                    onClick={() => openStatusOrSupport(entry, "project")}
                  >
                    <TokenStatus entry={entry} />
                    <ArrowRight aria-hidden="true" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        {spotlightEntries.length === 0 && (
          <p className="tremplin-home__empty">
            Les prochains talents de cette discipline seront à découvrir ici.{" "}
            <button type="button" onClick={() => setDiscoveryFilter("all")}>
              Voir tous les talents
            </button>
          </p>
        )}
        <p className="tremplin-home__selection-note">
          <Sparkles aria-hidden="true" /> Sélection éditoriale · Le talent, les
          projets documentés et leur évolution. La sélection est indépendante du
          prix et des achats de jetons.
        </p>
      </section>

      <section
        id="comment-ca-marche"
        className="tremplin-home__section tremplin-home__concept"
        aria-labelledby="tremplin-home-concept-title"
      >
        <header className="tremplin-home__section-heading">
          <div>
            <span className="tremplin-home__eyebrow">02 / Le lien</span>
            <h2 id="tremplin-home-concept-title">
              Une aventure à laquelle
              <br />
              <em>prendre part.</em>
            </h2>
          </div>
          <p>
            Le talent se construit. Le Tremplin le rend visible.
            <br />
            Derrière chaque création, il y a un parcours. Ici, tu peux le suivre
            de près.
          </p>
        </header>
        <ol className="tremplin-home__steps">
          {SUPPORT_STEPS.map(({ number, title, copy, icon: Icon }) => (
            <li key={number}>
              <div>
                <span>{number}</span>
                <Icon aria-hidden="true" />
              </div>
              <h3>{title}</h3>
              <p>{copy}</p>
            </li>
          ))}
        </ol>
      </section>

      {defaultEntry && featuredProject && (
        <section
          className="tremplin-home__section tremplin-home__project"
          aria-labelledby="tremplin-home-project-title"
        >
          <div className="tremplin-home__project-image">
            <img
              src={defaultEntry.artist.artwork}
              alt={"L’univers de " + defaultEntry.artist.name}
              loading="lazy"
            />
            <span>
              <small>Dans les coulisses avec</small>
              <strong>{defaultEntry.artist.name}</strong>
            </span>
          </div>
          <div className="tremplin-home__project-copy">
            <span className="tremplin-home__eyebrow">
              03 / Ce qui se construit
            </span>
            <h2 id="tremplin-home-project-title">{featuredProject.headline}</h2>
            <p>{defaultEntry.artist.biography}</p>
            <div className="tremplin-home__milestone">
              <span>
                <i /> La prochaine étape
              </span>
              <strong>{featuredProject.nextMilestone}</strong>
            </div>
            <ol className="tremplin-home__journal">
              {defaultEntry.artist.updates.slice(0, 2).map((update) => (
                <li key={update.id}>
                  <small>{update.dateLabel}</small>
                  <span>{update.title}</span>
                </li>
              ))}
            </ol>
            <button
              type="button"
              className="tremplin-home__primary"
              onClick={() => openPath(defaultEntry, "project")}
            >
              Suivre l’histoire <ArrowRight aria-hidden="true" />
            </button>
          </div>
        </section>
      )}

      <div className="tremplin-home__grades">
        <TremplinGradeProgression onUnderstandGrades={onUnderstandGrades} />
      </div>

      <section
        id="protections"
        className="tremplin-home__section tremplin-home__faq"
        aria-labelledby="tremplin-home-faq-title"
      >
        <div>
          <span className="tremplin-home__eyebrow">Tout simplement</span>
          <h2 id="tremplin-home-faq-title">
            La curiosité d’abord.
            <br />
            <em>Le choix, toujours.</em>
          </h2>
          <p>Les bons repères pour profiter du Tremplin, à ton rythme.</p>
          <button
            type="button"
            className="tremplin-home__text-button"
            onClick={onUnderstand}
          >
            Comprendre le Tremplin <ArrowRight aria-hidden="true" />
          </button>
        </div>
        <div className="tremplin-home__questions">
          <details open>
            <summary>
              Est-ce que je peux simplement découvrir ?{" "}
              <Plus aria-hidden="true" />
            </summary>
            <p>
              Oui. Découvrir les artistes et suivre leurs parcours reste
              gratuit. Tu peux écouter, explorer les projets et retrouver tes
              artistes sans acheter de jeton.
            </p>
          </details>
          <details>
            <summary>
              Comment donner de la force à un projet ?{" "}
              <Plus aria-hidden="true" />
            </summary>
            <p>
              Tu peux commencer en suivant l’artiste. Lorsqu’un jeton de talent
              est actif, son espace dédié présente le prix, les frais, la part
              destinée à l’artiste et les conditions avant toute confirmation.
            </p>
            <p>
              <strong>Achat payant et facultatif</strong> ·{" "}
              <strong>Valeur variable, aucun gain garanti</strong>. La revente
              peut être différée et une perte est possible.
            </p>
            <button
              type="button"
              className="tremplin-home__text-button"
              onClick={() => {
                trackTremplinEvent("rules_opened", { source: "home-faq" });
                onUnderstandToken();
              }}
            >
              Comprendre le jeton de talent <ArrowRight aria-hidden="true" />
            </button>
          </details>
          <details>
            <summary>
              À quoi correspondent les six grades ? <Plus aria-hidden="true" />
            </summary>
            <p>
              Ils donnent des repères sur le parcours documenté de l’artiste :
              créations, régularité, collaborations et accomplissements. Ils ne
              garantissent pas le succès futur et ne fixent pas automatiquement
              le prix d’un jeton.
            </p>
            <button
              type="button"
              className="tremplin-home__text-button"
              onClick={onUnderstandGrades}
            >
              Comprendre les grades <ArrowRight aria-hidden="true" />
            </button>
          </details>
        </div>
      </section>

      <section
        className="tremplin-home__section tremplin-home__artist-entry"
        aria-labelledby="tremplin-home-artist-title"
      >
        <img
          src="/images/tremplin/tremplin-artist-backstage-v1.png"
          alt=""
          loading="lazy"
        />
        <div>
          <span className="tremplin-home__eyebrow">
            <CircleUserRound aria-hidden="true" /> Pour ceux qui créent
          </span>
          <h2 id="tremplin-home-artist-title">
            Ton talent mérite
            <br />
            <em>une suite.</em>
          </h2>
          <p>
            Montre ce que tu crées. Raconte ce que tu construis.
            <br />
            Donne à ta communauté un parcours à suivre.
          </p>
          <button
            type="button"
            className="tremplin-home__primary"
            onClick={() => {
              trackTremplinEvent("artist_onboarding_opened", { userState });
              onArtistAction();
            }}
          >
            {artistActionLabel} <ArrowRight aria-hidden="true" />
          </button>
          <small>{artistActionDetail}</small>
        </div>
      </section>
      <footer className="tremplin-home__closing">
        <span className="tremplin-home__eyebrow">
          <Compass aria-hidden="true" /> La suite commence ici
        </span>
        <h2>
          Tu pourras dire :<br />
          <em>« J’étais là au début. »</em>
        </h2>
        <button
          type="button"
          className="tremplin-home__primary"
          onClick={() => onOpenRoute("/tremplin/decouvrir")}
        >
          Découvrir les talents <ArrowRight aria-hidden="true" />
        </button>
        <span className="tremplin-home__closing-note">
          Des talents. Des projets. Une communauté.
        </span>
      </footer>
    </div>
  );
}
