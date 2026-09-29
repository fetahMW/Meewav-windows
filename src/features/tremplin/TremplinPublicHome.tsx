import {
  ArrowRight,
  ArrowLeft,
  Heart,
  CirclePlay,
  CircleUserRound,
  Sparkles,
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
import Vinyl from "../../../vendor/meewav-vinyl/src/components/Vinyl";
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
import "./tremplin-public-home.css";
import "./tremplin-public-home-compact.css";
import "./tremplin-public-home-gateway.css";
import "./tremplin-grades-prestige.css";
import "./tremplin-home-editorial.css";
import "./tremplin-home-rails.css";
import "../../components/shared/mixer-play-button.css";

type TremplinPublicHomeProps = {
  playingArtistId: string | null;
  followedArtistIds: ReadonlySet<string>;
  userState: TremplinUserState;
  onToggleArtistAudio: (artistId: string, source?: string) => void;
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
  reducedMotion,
  onOpen,
  onListen,
}: {
  entry?: HomeEntry;
  companion?: HomeEntry;
  playing: boolean;
  reducedMotion: boolean;
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
    <div
      className={"tremplin-home__deck " + (playing ? "is-playing" : "")}
    >
      <span className="tremplin-home__deck-caption">
        Sélection Meewav <span>À découvrir</span>
      </span>
      <div className="tremplin-home__vinyl" aria-hidden="true">
        <Vinyl
          playing={playing}
          rpm={5}
          rotateReflections
          reducedMotion={reducedMotion}
          interactive={false}
        />
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
        <div className="tremplin-home__record-cover">
        <button
          type="button"
          className="tremplin-home__record-image"
          onClick={onOpen}
          aria-label={"Découvrir le parcours de " + entry.artist.name}
        >
          <img
            src={
              entry.artist.id === "kylian-osei"
                ? "/images/tremplin/artists/generated/kylian-osei-home-studio-v1.png"
                : entry.artist.portrait
            }
            alt={"Portrait de " + entry.artist.name}
            fetchPriority="high"
          />
          <span>
            <small>{entry.artist.styles[0]}</small>
            <strong>{entry.artist.name}</strong>
          </span>
        </button>
          <button
            type="button"
            onClick={onListen}
            className="tremplin-home__record-play mw-mixer-play"
            aria-pressed={playing}
            aria-label={
              (playing ? "Mettre en pause : " : "Écouter ") + entry.artist.name
            }
          >
            {playing ? <Pause /> : <Play />}
          </button>
        </div>
        <footer>
          <span>
            <strong>003 KING</strong>
            <small>{getTremplinProfessionLabel(entry.artist)}</small>
          </span>

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

export default function TremplinPublicHome({
  playingArtistId,
  userState,
  onToggleArtistAudio,
  onOpenArtist,
  onOpenArtistSupport,
  onUnderstand,
  onUnderstandGrades,
  onOpenRoute,
  onSearch,
  artistActionLabel,
  artistActionDetail,
  onArtistAction,
}: TremplinPublicHomeProps) {
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const [query, setQuery] = useState("");
  const [discoveryFilter, setDiscoveryFilter] = useState("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const searchTrackedRef = useRef(false);
  const gradeViewTrackedRef = useRef(false);
  const talentRailRef = useRef<HTMLDivElement>(null);
  const [railEdges, setRailEdges] = useState({ start: true, end: false });

  const defaultEntry =
    HOME_ENTRIES.find(({ artist }) => artist.id === "kylian-osei") ??
    HOME_ENTRIES[0];
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
  useEffect(() => {
    const rail = talentRailRef.current;
    if (!rail) return;
    rail.scrollLeft = 0;
    const sync = () => setRailEdges({ start: rail.scrollLeft <= 2, end: rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 2 });
    sync();
    rail.addEventListener("scroll", sync, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(sync);
    observer?.observe(rail);
    return () => { rail.removeEventListener("scroll", sync); observer?.disconnect(); };
  }, [discoveryFilter]);
  const moveTalents = (direction: number) => {
    const rail = talentRailRef.current;
    if (!rail) return;
    const first = rail.children[0] as HTMLElement | undefined;
    const second = rail.children[1] as HTMLElement | undefined;
    const step = first && second ? second.offsetLeft - first.offsetLeft : rail.clientWidth;
    rail.scrollBy({ left: direction * step, behavior: reducedMotion ? "auto" : "smooth" });
  };
  const scrollToTalents = () =>
    document.getElementById("a-la-une")?.scrollIntoView({
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
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
          companion={HOME_ENTRIES.find(({ artist }) => artist.id === "lunae")}
          playing={playingArtistId === defaultEntry?.artist.id}
          reducedMotion={reducedMotion}
          onOpen={() => defaultEntry && openPath(defaultEntry, "hero")}
          onListen={() =>
            defaultEntry && onToggleArtistAudio(defaultEntry.artist.id, "/media/vinyl/003-king.mp3")
          }
        />
      </section>
      <div className="tremplin-home__grades">
        <TremplinGradeProgression landing onUnderstandGrades={onUnderstandGrades} />
      </div>

      <section
        id="a-la-une"
        className="tremplin-home__section tremplin-home__discover"
        aria-labelledby="tremplin-home-discover-title"
      >
        <header className="tremplin-home__section-heading">
          <div>
            <span className="tremplin-home__eyebrow">La rencontre</span>
            <h2 id="tremplin-home-discover-title">
              Ton prochain <em>coup de cœur.</em>
            </h2>
            <p>
              Une voix, un univers, une rencontre. Trouve les artistes qui te
              parlent et rejoins leur histoire dès les premières notes.
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
        <div className="tremplin-home__rail-controls">
          <span>{spotlightEntries.length} {spotlightEntries.length > 1 ? "artistes à découvrir" : "artiste à découvrir"}</span>
          <button type="button" className="mw-compact-control" aria-label="Artiste précédent" disabled={railEdges.start} onClick={() => moveTalents(-1)}><ArrowLeft aria-hidden="true" /></button>
          <button type="button" className="mw-compact-control" aria-label="Artiste suivant" disabled={railEdges.end} onClick={() => moveTalents(1)}><ArrowRight aria-hidden="true" /></button>
        </div>
        <div className="tremplin-home__talents" ref={talentRailRef} role="group" aria-label="Artistes à découvrir, défilement horizontal" tabIndex={0}>
          {spotlightEntries.map((entry) => {
            const project = getTremplinProjectSnapshot(entry.artist);
            const playing = playingArtistId === entry.artist.id;
            return (
              <article
                key={entry.artist.id}
                className={`tremplin-home__talent${playing ? " is-playing" : ""}`}
                style={
                  {
                    "--release-accent": getGradeBadgeMeta(
                      entry.artist.gradeLevel,
                    ).mainColor,
                  } as CSSProperties
                }
                data-token-stage={entry.tokenStage}
              >
                <div
                  className="tremplin-home__talent-artwork"
                >
                  <span
                    className="tremplin-home__talent-disc"
                    aria-hidden="true"
                  >
                    <Vinyl
                      playing={playing}
                      rpm={5}
                      rotateReflections
                      reducedMotion={reducedMotion}
                      interactive={false}
                    />
                  </span>
                  <div className="tremplin-home__talent-image">
                    <button
                      type="button"
                      onClick={() => openPath(entry, "project")}
                      aria-label={"Voir le projet de " + entry.artist.name}
                    >
                      <img src={entry.artist.portrait} alt="" loading="lazy" />
                      <span>
                        <small>
                          {getTremplinProfessionLabel(entry.artist)}
                        </small>
                        <strong>{entry.artist.name}</strong>
                        <span>
                          <MapPin aria-hidden="true" /> {entry.artist.city}
                        </span>
                      </span>
                    </button>
                    <button
                      className="tremplin-home__talent-play mw-mixer-play"
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

      <div className="tremplin-home__invitation">
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
              Rejoins le Tremplin et donne à ta communauté un parcours à suivre.
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
    </div>
  );
}
