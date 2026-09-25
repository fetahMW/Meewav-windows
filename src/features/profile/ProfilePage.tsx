import { getDesktopApplicationMode } from "../../runtime/applicationMode";
import {
  ArrowRight,
  AlertTriangle,
  BarChart3,
  BellRing,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileAudio,
  FileImage,
  FileText,
  Film,
  Fingerprint,
  Home,
  LockKeyhole,
  LoaderCircle,
  MapPin,
  MoreHorizontal,
  PencilLine,
  Play,
  Search,
  SlidersHorizontal,
  Sparkles,
  UserPlus,
  UsersRound,
  WandSparkles,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import MeewavPillarBrand from "../../components/navigation/MeewavPillarBrand";
import MeewavPillarTabs from "../../components/navigation/MeewavPillarTabs";
import { useAuth } from "../auth";
import { LOCAL_PREVIEW_FETAH_HOST } from "../auth/localAuthPreview";
import { isProfileLocalPreviewEnabled } from "./profile.preview";
import MeewavPrimaryNav from "../globe/components/MeewavPrimaryNav";
import "../globe/components/MeewavPrimaryNav.css";
import {
  MON_GLOBE_HOST_POSITION_NAVIGATION_STATE,
  MON_GLOBE_ROUTE,
} from "../globe/monGlobeContract";
import { MeewavGradeBadge } from "../grades/MeewavGradeBadge";
import { getGradeBadgeMeta } from "../grades/gradeBadges";
import {
  demoProfile,
  emptyProfile,
  fetahDemoProfile,
  profileNotifications,
  profileTabs,
  searchEntries,
  type DemoProfile,
  type MediaItem,
  type MediaSectionId,
  type ProfileNotification,
  type ProfileTabId,
  type SearchEntry,
} from "./profile.data";
import { canonicalRoleKeyForLabel, profileRepository } from "./profile.service";
import ProfileHomeView from "./views/ProfileHomeView";
import ProfileMediaView from "./views/ProfileMediaView";
import {
  PrivateQuickActionPanel,
  type PrivateQuickAction,
} from "./views/ProfilePrivateModuleView";
import ProfileSpaceView from "./views/ProfileSpaceView";
import ProfileStatsView from "./views/ProfileStatsView";
import "./profile.css";
import "./profile-smoked-glass.css";

const ProfileOwnerViewer = lazy(() => import("./ProfileOwnerViewer"));

type DialogState =
  | { type: "edit-profile" }
  | { type: "viewer" }
  | { type: "notifications" }
  | { type: "private-action"; action: PrivateQuickAction }
  | { type: "media-detail"; item: MediaItem }
  | null;

type ToastState = { id: number; message: string } | null;
type ProfileDataStatus = "loading" | "ready" | "fallback";

const tabIcons: Record<ProfileTabId, LucideIcon> = {
  home: Home,
  stats: BarChart3,
  media: WandSparkles,
  space: LockKeyhole,
};

const profileTabAccents: Record<ProfileTabId, string> = {
  home: "#f7f5ff",
  stats: "#45dfa8",
  media: "#c56cff",
  space: "#6590ff",
};

const profileTabPaths: Record<ProfileTabId, string> = {
  home: "/profile",
  stats: "/profile/statistics",
  media: "/profile/creations",
  space: "/profile/private",
};

function getProfileTabFromPath(pathname: string): ProfileTabId {
  if (pathname.startsWith(profileTabPaths.space) || pathname.startsWith("/profil/espace-prive")) return "space";
  if (pathname.startsWith(profileTabPaths.stats) || pathname.startsWith("/profil/statistiques")) return "stats";
  if (pathname.startsWith(profileTabPaths.media) || pathname.startsWith("/profil/creations")) return "media";
  return "home";
}

export default function ProfilePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, status: authStatus, error: authError } = useAuth();
  const demoFallbackEnabled = getDesktopApplicationMode() !== "live" && import.meta.env.DEV && import.meta.env.VITE_PROFILE_DEMO_FALLBACK === "true";
  const localAuthPreviewEnabled = isProfileLocalPreviewEnabled();
  const activeTab = getProfileTabFromPath(location.pathname);
  const [mediaSection, setMediaSection] = useState<MediaSectionId>("library");
  const [profile, setProfile] = useState<DemoProfile>(() =>
    !user && authStatus === "anonymous" && localAuthPreviewEnabled ? fetahDemoProfile : emptyProfile);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [notifications, setNotifications] = useState<ProfileNotification[]>([]);
  const [profileStatus, setProfileStatus] = useState<ProfileDataStatus>("loading");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [toast, setToast] = useState<ToastState>(null);

  const showToast = (message: string) => setToast({ id: Date.now(), message });

  useLayoutEffect(() => {
    // React Router keeps the document scroll position between routes. The Globe
    // is a fixed surface, so an older Profile position is otherwise revealed
    // again when the user comes back from the map.
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.key]);

  useEffect(() => {
    document.title = "Profil — Meewav";
  }, []);

  useEffect(() => {
    if (authStatus === "loading") {
      setProfileStatus("loading");
      return undefined;
    }
    if (!user) {
      if (localAuthPreviewEnabled) {
        setProfile(fetahDemoProfile);
        setNotifications(profileNotifications.map((notification) => ({ ...notification })));
        setProfileError(null);
        setNotificationsError(null);
        setProfileStatus("ready");
      }
      return undefined;
    }

    let active = true;
    setProfileStatus("loading");
    setProfileError(null);
    setNotificationsError(null);

    void Promise.allSettled([
      profileRepository.getOwnerProfile(user.id),
      profileRepository.getNotifications(user.id),
    ]).then(([profileResult, notificationsResult]) => {
      if (!active) return;

      if (profileResult.status === "fulfilled") {
        setProfile(profileResult.value);
        setProfileStatus("ready");
      } else {
        setProfile(demoFallbackEnabled ? demoProfile : emptyProfile);
        setProfileStatus("fallback");
        setProfileError(profileResult.reason instanceof Error
          ? profileResult.reason.message
          : "Impossible de charger le profil pour le moment.");
      }

      if (notificationsResult.status === "fulfilled") {
        setNotifications(notificationsResult.value);
      } else {
        setNotifications([]);
        setNotificationsError(notificationsResult.reason instanceof Error
          ? notificationsResult.reason.message
          : "Impossible de charger les notifications pour le moment.");
      }
    });

    return () => {
      active = false;
    };
  }, [authStatus, demoFallbackEnabled, localAuthPreviewEnabled, reloadKey, user]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    // The visitor overlay owns its scroll lock and Escape handling. Locking
    // here too can restore "hidden" after both layers have been dismissed.
    if (!dialog || dialog.type === "viewer") return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDialog(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [dialog]);

  const openTab = (tab: ProfileTabId) => {
    if (tab === activeTab) return;
    navigate(profileTabPaths[tab]);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
  };

  const saveProfile = async (nextProfile: DemoProfile) => {
    if (!user && localAuthPreviewEnabled) {
      setProfile(nextProfile);
      setProfileStatus("ready");
      setProfileError(null);
      return;
    }
    if (!user) throw new Error("La session a expiré. Reconnecte-toi pour sauvegarder.");
    const savedProfile = await profileRepository.updateOwnerProfile(user.id, nextProfile);
    setProfile(savedProfile);
    setProfileStatus("ready");
    setProfileError(null);
  };

  const markNotificationsRead = async (notificationIds?: string[]) => {
    const targetIds = notificationIds?.length
      ? notificationIds
      : notifications.filter((notification) => notification.unread).map((notification) => notification.id);
    if (!targetIds.length) return;

    if (!user && localAuthPreviewEnabled) {
      setNotifications((current) => current.map((notification) => (
        targetIds.includes(notification.id) ? { ...notification, unread: false } : notification
      )));
      return;
    }
    if (!user) throw new Error("La session a expiré. Reconnecte-toi pour continuer.");

    const previousNotifications = notifications;
    setNotifications((current) => current.map((notification) => (
      targetIds.includes(notification.id) ? { ...notification, unread: false } : notification
    )));
    try {
      await profileRepository.markNotificationsRead(user.id, targetIds);
      setNotificationsError(null);
    } catch (error) {
      setNotifications(previousNotifications);
      setNotificationsError(error instanceof Error ? error.message : "Impossible de mettre à jour les notifications.");
      throw error;
    }
  };

  return (
    <div className={`profile-page is-${activeTab}`} aria-busy={profileStatus === "loading"}>
      <div className="profile-page__background" aria-hidden="true">
        <span className="profile-page__aurora is-one" />
        <span className="profile-page__aurora is-two" />
        <span className="profile-page__noise" />
      </div>

      <div className="profile-data-announcer" aria-live="polite" aria-atomic="true">
        {profileStatus === "loading" && (
          <div className="profile-data-status is-loading" role="status"><LoaderCircle size={15} aria-hidden="true" /> Synchronisation du profil…</div>
        )}
        {(profileStatus === "fallback" || notificationsError || authError) && (
          <div className="profile-data-status is-error" role="alert">
            <AlertTriangle size={15} aria-hidden="true" />
            <span>{profileStatus === "fallback"
              ? `${profileError ?? "Profil indisponible."} ${demoFallbackEnabled ? "Données de démonstration affichées." : "Identité neutre affichée."}`
              : notificationsError ?? "La session n’a pas pu être vérifiée."}</span>
            <button type="button" onClick={() => setReloadKey((value) => value + 1)}>Réessayer</button>
          </div>
        )}
      </div>

      <header className="profile-command-bar">
        <span className="profile-command-brand"><MeewavPillarBrand pillar="Profil" /></span>
        <MeewavPillarTabs
          className="profile-top-tabs is-fine-indicator is-unframed-icons"
          ariaLabel="Sections du profil"
          items={profileTabs.map((tab) => ({
            ...tab,
            icon: tabIcons[tab.id],
            accent: profileTabAccents[tab.id],
          }))}
          activeId={activeTab}
          onSelect={openTab}
        />

        <div className="profile-command-bar__actions">
          <button type="button" className="profile-command-avatar" onClick={() => setDialog({ type: "edit-profile" })} aria-label="Modifier le profil">
            <img src={profile.avatarUrl} alt="" /><span><strong>{profile.displayName}</strong><small>{profile.username}</small></span>
          </button>
        </div>
      </header>

      <aside className="profile-primary-rail">
        <MeewavPrimaryNav
          activeView="globe"
          activeDestination="profile"
          onGlobe={() => navigate(MON_GLOBE_ROUTE, {
            state: MON_GLOBE_HOST_POSITION_NAVIGATION_STATE,
          })}
        />
      </aside>

      <main className={`profile-main ${activeTab === "home" ? "is-profile-home" : "is-profile-workspace"}`}>
        {activeTab === "home" && (
          <ProfileHero
            profile={profile}
            onEdit={() => setDialog({ type: "edit-profile" })}
            onViewer={() => setDialog({ type: "viewer" })}
            onToast={showToast}
          />
        )}

        <section className="profile-view-stage" key={activeTab}>
          {activeTab === "home" && (
            <ProfileHomeView
              profile={profile}
              onNavigate={openTab}
              onEditProfile={() => setDialog({ type: "edit-profile" })}
              onOpenNotifications={() => setDialog({ type: "notifications" })}
              onOpenBadges={() => {
                setMediaSection("badges");
                navigate("/profile/creations/badges");
                window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
              }}
            />
          )}
          {activeTab === "stats" && <ProfileStatsView gradeLevel={profile.grade} gradeProgress={profile.gradeProgress} pointsToNextGrade={profile.pointsToNextGrade} onToast={showToast} />}
          {activeTab === "media" && (
            <ProfileMediaView
              section={mediaSection}
              onSectionChange={setMediaSection}
              onOpenMedia={(item) => setDialog({ type: "media-detail", item })}
              gradeLevel={profile.grade}
              gradeProgress={profile.gradeProgress}
              pointsToNextGrade={profile.pointsToNextGrade}
              onToast={showToast}
            />
          )}
          {activeTab === "space" && (
            <ProfileSpaceView
              profile={profile}
              onEditProfile={() => setDialog({ type: "edit-profile" })}
              onViewerPreview={() => setDialog({ type: "viewer" })}
              onOpenQuickAction={(action) => setDialog({ type: "private-action", action })}
              onToast={showToast}
            />
          )}
        </section>
      </main>

      {dialog?.type === "viewer" && (
        <Suspense fallback={<div className="profile-toast" role="status">Chargement du profil public…</div>}>
          <ProfileOwnerViewer profileId={user?.id ?? LOCAL_PREVIEW_FETAH_HOST.profileId} profile={profile} onClose={() => setDialog(null)} />
        </Suspense>
      )}
      {dialog && dialog.type !== "viewer" && (
        <ProfileDialog
          key={dialog.type === "private-action" ? `${dialog.type}-${dialog.action.kind}-${dialog.action.kind === "transaction-detail" ? dialog.action.transaction.reference : ""}` : dialog.type}
          dialog={dialog}
          profile={profile}
          notifications={notifications}
          onClose={() => setDialog(null)}
          onProfileSave={saveProfile}
          onMarkNotificationsRead={markNotificationsRead}
          onToast={showToast}
        />
      )}

      {toast && (
        <div className="profile-toast" role="status" key={toast.id}><CheckCircle2 size={18} /><span>{toast.message}</span></div>
      )}
    </div>
  );
}

type ProfileSearchProps = {
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (entry: SearchEntry) => void;
  onFilterApplied: (count: number) => void;
};

const profileGradeFilters = [
  { level: 1, count: 112 },
  { level: 2, count: 136 },
  { level: 3, count: 97 },
  { level: 4, count: 73 },
  { level: 5, count: 27 },
  { level: 6, count: 5 },
] as const;

const profileRoleFilters = [
  { key: "avatar_1", label: "Violoniste", count: 3, image: "/avatars/violoniste.png" },
  { key: "avatar_2", label: "Vidéaste clipper", count: 22, image: "/avatars/videaste-clipper.png" },
  { key: "avatar_3", label: "Utilisatrice", count: 25, image: "/avatars/utilisatrice.png" },
  { key: "avatar_4", label: "Utilisateur", count: 40, image: "/avatars/utilisateur.png" },
  { key: "avatar_5", label: "Studio", count: 10, image: "/avatars/studio-enregistrement.png" },
  { key: "avatar_6", label: "Sound designer", count: 6, image: "/avatars/sound-designer.png" },
  { key: "avatar_7", label: "Pianiste", count: 18, image: "/avatars/pianiste.png" },
  { key: "avatar_8", label: "Percussionniste", count: 12, image: "/avatars/percussionniste.png" },
  { key: "avatar_9", label: "Organisation scénique", count: 7, image: "/avatars/organisateur-evenements.png" },
  { key: "avatar_10", label: "Management", count: 9, image: "/avatars/management.png" },
  { key: "avatar_11", label: "Label", count: 5, image: "/avatars/label.png" },
  { key: "avatar_12", label: "Cuivres", count: 8, image: "/avatars/instrumentiste-cuivre.png" },
  { key: "avatar_13", label: "Instruments à vent", count: 11, image: "/avatars/instrumentiste-a-vent.png" },
  { key: "avatar_14", label: "Ingénieur du son", count: 16, image: "/avatars/ingenieur-son.png" },
  { key: "avatar_15", label: "Guitariste électrique", count: 21, image: "/avatars/guitariste-electrique.png" },
  { key: "avatar_16", label: "Guitariste acoustique", count: 19, image: "/avatars/guitariste-acoustique.png" },
  { key: "avatar_17", label: "DJ", count: 27, image: "/avatars/dj.png" },
  { key: "avatar_18", label: "Direction artistique", count: 8, image: "/avatars/directeur-artistique.png" },
  { key: "avatar_19", label: "Danseuse", count: 14, image: "/avatars/danseuse.png" },
  { key: "avatar_20", label: "Danseur", count: 15, image: "/avatars/danseur.png" },
  { key: "avatar_21", label: "Compositeur", count: 23, image: "/avatars/compositeur.png" },
  { key: "avatar_22", label: "Coach vocal", count: 7, image: "/avatars/coach-vocal.png" },
  { key: "avatar_23", label: "Chanteuse / rappeuse", count: 31, image: "/avatars/chanteuse-rappeuse.png" },
  { key: "avatar_24", label: "Chanteur / rappeur", count: 34, image: "/avatars/chanteur-rappeur.png" },
  { key: "avatar_25", label: "Beatmaker", count: 29, image: "/avatars/beatmaker.png" },
  { key: "avatar_26", label: "Beatboxer", count: 4, image: "/avatars/beatboxer.png" },
  { key: "avatar_27", label: "Batteur / batteuse", count: 13, image: "/avatars/batteur-batteuse.png" },
  { key: "avatar_28", label: "Bassiste", count: 11, image: "/avatars/bassiste.png" },
  { key: "avatar_29", label: "Auteur / parolier", count: 17, image: "/avatars/auteur-parolier.png" },
  { key: "avatar_30", label: "Accordéoniste", count: 3, image: "/avatars/accordeoniste.png" },
] as const;

const defaultFavoriteCities = ["Paris", "Lyon", "Marseille", "Bordeaux"];

export function ProfileSearch({ query, onQueryChange, onSelect, onFilterApplied }: ProfileSearchProps) {
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [filterOpen, setFilterOpen] = useState(true);
  const [selectedGrades, setSelectedGrades] = useState<number[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>(() => profileRoleFilters.map((role) => role.key));
  const [hideConsultedProfiles, setHideConsultedProfiles] = useState(false);
  const [favoriteCities, setFavoriteCities] = useState(defaultFavoriteCities);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return searchEntries.slice(0, 5);
    return searchEntries.filter((entry) => `${entry.label} ${entry.detail} ${entry.keywords}`.toLowerCase().includes(normalized)).slice(0, 7);
  }, [query]);
  const open = focused && (query.length > 0 || results.length > 0);
  const allRolesSelected = selectedRoles.length === profileRoleFilters.length;
  const gradeShare = selectedGrades.length === 0
    ? 1
    : profileGradeFilters.filter((grade) => selectedGrades.includes(grade.level)).reduce((sum, grade) => sum + grade.count, 0) / 450;
  const roleShare = selectedRoles.length / profileRoleFilters.length;
  const matchedArtists = Math.round(450 * gradeShare * roleShare * (hideConsultedProfiles ? 0.96 : 1));
  const filterCount = selectedGrades.length + (allRolesSelected ? 0 : profileRoleFilters.length - selectedRoles.length) + (hideConsultedProfiles ? 1 : 0);

  useEffect(() => setActiveIndex(0), [query]);

  return (
    <div className="profile-search-shell">
      <form
        className={`profile-search ${open || filterOpen ? "is-open" : ""}`}
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          if (results[activeIndex]) onSelect(results[activeIndex]);
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
        }}
      >
        <button type="submit" className="profile-search__submit" aria-label="Lancer la recherche"><Search size={17} /></button>
        <input
          ref={inputRef}
          type="search"
          value={query}
          placeholder="Rechercher une ville ou un avatar..."
          aria-label="Rechercher une ville ou un avatar"
          aria-expanded={open}
          onFocus={() => setFocused(true)}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((index) => Math.min(results.length - 1, index + 1));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) => Math.max(0, index - 1));
            }
            if (event.key === "Escape") {
              setFocused(false);
              inputRef.current?.blur();
            }
          }}
        />
        {query && <button type="button" className="profile-search__clear" onClick={() => onQueryChange("")} aria-label="Effacer la recherche"><X size={14} /></button>}
        <button
          type="button"
          className={`profile-search__filter ${filterOpen || filterCount > 0 ? "is-active" : ""}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setFilterOpen((value) => !value)}
          aria-label={filterOpen ? "Fermer les filtres" : "Ouvrir les filtres"}
          aria-expanded={filterOpen}
        >
          <SlidersHorizontal size={15} />
          {filterCount > 0 && <span>{filterCount}</span>}
        </button>
        {open && (
          <div className="profile-search-results" role="listbox">
            <div className="profile-search-results__label"><span>{query ? "Résultats" : "Accès rapides"}</span><small>↑↓ naviguer · ↵ ouvrir</small></div>
            {results.map((entry, index) => {
              const Icon = tabIcons[entry.tab];
              return (
                <button key={entry.id} type="button" role="option" aria-selected={index === activeIndex} className={index === activeIndex ? "is-active" : ""} onMouseEnter={() => setActiveIndex(index)} onClick={() => onSelect(entry)}>
                  <span><Icon size={16} /></span><span><strong>{entry.label}</strong><small>{entry.detail}</small></span><ChevronRight size={15} />
                </button>
              );
            })}
            {results.length === 0 && <div className="profile-search-results__empty"><Search size={18} /><span>Aucun module trouvé</span></div>}
          </div>
        )}
      </form>

      <aside className={`profile-artist-filter ${filterOpen ? "is-open" : ""}`} role="dialog" aria-modal="false" aria-labelledby="profile-artist-filter-title" aria-hidden={!filterOpen}>
        <div className="profile-artist-filter__header">
          <div><span>Exploration personnalisée</span><strong id="profile-artist-filter-title">Filtres artistes</strong><p>450 profils dans ce quartier</p></div>
          <button type="button" onClick={() => setFilterOpen(false)} aria-label="Fermer les filtres"><X size={18} /></button>
        </div>

        <div className="profile-artist-filter__body">
          <div className="profile-artist-filter__counter" aria-live="polite"><strong>{matchedArtists} profils affichés</strong><span>sur 450 dans le quartier</span></div>

          <section className="profile-artist-filter__history" aria-label="Profils déjà consultés">
            <div><span><EyeOff size={16} /></span><span><strong>Masquer les profils déjà consultés</strong><small>Les profils consultés disparaîtront de la carte. Les épinglés resteront visibles.</small></span></div>
            <button type="button" role="switch" aria-checked={hideConsultedProfiles} className={hideConsultedProfiles ? "is-active" : ""} onClick={() => setHideConsultedProfiles((value) => !value)} aria-label="Masquer les profils déjà consultés"><span /></button>
          </section>

          <section aria-label="Niveaux">
            <div className="profile-artist-filter__group-title"><span>Niveaux</span><small>{selectedGrades.length || "Tous"}</small></div>
            <div className="profile-artist-filter__grades">
              {profileGradeFilters.map((grade) => {
                const active = selectedGrades.includes(grade.level);
                const gradeMeta = getGradeBadgeMeta(grade.level);
                return (
                  <button key={grade.level} type="button" className={active ? "is-active" : ""} aria-pressed={active} onClick={() => setSelectedGrades((current) => current.includes(grade.level) ? current.filter((level) => level !== grade.level) : [...current, grade.level])}>
                    <MeewavGradeBadge level={grade.level} size="sm" variant="icon" />
                    <span className="profile-artist-filter__grade-copy"><strong>{gradeMeta.label}</strong><small>Niveau {grade.level}</small></span><em>{grade.count}</em>
                  </button>
                );
              })}
            </div>
          </section>

          <section aria-label="Styles d’avatar">
            <div className="profile-artist-filter__group-title is-roles">
              <span><strong>Styles d’avatar</strong><small>{selectedRoles.length} / {profileRoleFilters.length} sélectionnés</small></span>
              <button type="button" className={`profile-artist-filter__bulk ${allRolesSelected ? "is-active" : ""}`} aria-pressed={allRolesSelected} onClick={() => setSelectedRoles(allRolesSelected ? [] : profileRoleFilters.map((role) => role.key))}><i aria-hidden="true" />{allRolesSelected ? "Tout désélectionner" : "Tout sélectionner"}</button>
            </div>
            <div className="profile-artist-filter__roles">
              {profileRoleFilters.map((role) => {
                const active = selectedRoles.includes(role.key);
                return (
                  <button key={role.key} type="button" className={active ? "is-active" : ""} aria-pressed={active} onClick={() => setSelectedRoles((current) => current.includes(role.key) ? current.filter((key) => key !== role.key) : [...current, role.key])}>
                    <span className="profile-artist-filter__avatar" aria-hidden="true"><img src={role.image} alt="" loading="lazy" decoding="async" draggable={false} /><i /></span><span>{role.label}</span><em>{role.count}</em>
                  </button>
                );
              })}
            </div>
          </section>

          <section aria-label="Villes favorites">
            <div className="profile-artist-filter__group-title"><span>Villes favorites</span><button type="button" onClick={() => setFavoriteCities(defaultFavoriteCities)}>Reset</button></div>
            <div className="profile-artist-filter__cities">
              {favoriteCities.map((city, index) => (
                <label key={index}><input value={city} aria-label={`Ville favorite ${index + 1}`} onChange={(event) => setFavoriteCities((current) => current.map((value, cityIndex) => cityIndex === index ? event.target.value : value))} /><ChevronDown size={13} /></label>
              ))}
            </div>
          </section>
        </div>

        <p className="profile-artist-filter__hint" aria-live="polite">{selectedRoles.length === 0 ? "Choisissez au moins une catégorie." : allRolesSelected ? "Tous les styles disponibles pour ce quartier sont sélectionnés." : "Sélection prête à appliquer."}</p>
        <div className="profile-artist-filter__actions">
          <button type="button" onClick={() => { setSelectedGrades([]); setSelectedRoles(profileRoleFilters.map((role) => role.key)); setHideConsultedProfiles(false); }}>Recomposer ma sélection</button>
          <button type="button" disabled={selectedRoles.length === 0} onClick={() => { onFilterApplied(filterCount); setFilterOpen(false); }}>Appliquer</button>
        </div>
      </aside>
    </div>
  );
}

type ProfileHeroProps = {
  profile: DemoProfile;
  onEdit: () => void;
  onViewer: () => void;
  onToast: (message: string) => void;
};

function ProfileHero({ profile, onEdit, onViewer, onToast }: ProfileHeroProps) {
  const gradeMeta = getGradeBadgeMeta(profile.grade);
  return (
    <section className="profile-hero" aria-labelledby="profile-hero-title">
      <div className="profile-hero__mesh" aria-hidden="true" />
      <div className="profile-hero__identity-card">
        <div className="profile-hero__avatar-shell">
          <span className="profile-hero__avatar-orbit" />
          <img src={profile.avatarUrl} alt={`Portrait de ${profile.displayName}`} />
          <span className="profile-hero__live"><i /> Live</span>
        </div>
        <div className="profile-hero__identity">
          <div className="profile-hero__eyebrow"><span>Profil artiste</span></div>
          <h1 id="profile-hero-title">{profile.displayName}</h1>
          <p className="profile-hero__role">{profile.username} · {profile.role}</p>
          <p className="profile-hero__location"><MapPin size={14} /> {profile.city}, {profile.country}<span /> Disponible pour collaborer</p>
          <p className="profile-hero__bio">{profile.bio}</p>
          <div className="profile-hero__actions">
            <button type="button" className="profile-primary-button" onClick={onEdit}><PencilLine size={16} /> Modifier le profil</button>
            <button type="button" className="profile-soft-button" onClick={onViewer}><Eye size={16} /> Voir en mode visiteur</button>
            <button type="button" className="profile-icon-button" onClick={() => onToast("Menu du profil prêt") } aria-label="Plus d’actions"><MoreHorizontal size={18} /></button>
          </div>
        </div>
      </div>
      <div className="profile-hero__insights-card">
        <div className="profile-hero__stats">
          <div><UsersRound aria-hidden="true" /><strong>{profile.followers}</strong><span>Abonnés</span><small>+1 248 ce mois</small></div>
          <div><UserPlus aria-hidden="true" /><strong>{profile.following}</strong><span>Abonnements</span><small>Réseau actif</small></div>
          <div><Sparkles aria-hidden="true" /><strong>{profile.tokenValue}</strong><span>Token MW</span><small>+4,8 %</small></div>
        </div>
        <div className="profile-hero__grade">
          <div className="profile-hero__grade-badge"><MeewavGradeBadge level={profile.grade} size="lg" variant="icon" /></div>
          <div>
            <span>Grade Meewav</span>
            <strong>{gradeMeta.label}</strong>
            <small>{profile.profileCompletion} % du profil complété</small>
            <span className="profile-hero__completion" aria-label={`${profile.profileCompletion} % du profil complété`}><i style={{ width: `${profile.profileCompletion}%` }} /></span>
            <button type="button" className="profile-hero__benefits" onClick={() => onToast("Avantages du grade ouverts")}>Voir les avantages <ArrowRight size={14} /></button>
          </div>
        </div>
      </div>
    </section>
  );
}

type ProfileDialogProps = {
  dialog: Exclude<DialogState, null | { type: "viewer" }>;
  profile: DemoProfile;
  notifications: ProfileNotification[];
  onClose: () => void;
  onProfileSave: (profile: DemoProfile) => Promise<void>;
  onMarkNotificationsRead: (notificationIds?: string[]) => Promise<void>;
  onToast: (message: string) => void;
};

function ProfileDialog({ dialog, profile, notifications, onClose, onProfileSave, onMarkNotificationsRead, onToast }: ProfileDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const title = dialog.type === "edit-profile"
    ? "Modifier le profil public"
    : dialog.type === "notifications"
        ? "Notifications"
        : dialog.type === "private-action"
          ? dialog.action.kind === "invite-member"
            ? "Inviter un membre"
            : dialog.action.kind === "edit-member"
              ? `Modifier ${dialog.action.memberName}`
              : dialog.action.kind === "payment-method"
                ? "Compte de versement"
                : dialog.action.kind === "add-hardware"
                  ? "Ajouter du matériel"
                  : dialog.action.kind === "edit-hardware"
                    ? `Modifier ${dialog.action.equipmentName}`
                    : dialog.action.kind === "hardware-unavailability"
                      ? `Indisponibilité · ${dialog.action.equipmentName}`
                      : dialog.action.transaction.title
          : dialog.type === "media-detail"
            ? dialog.item.title
            : "Profil";

  return (
    <div className="profile-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section ref={dialogRef} tabIndex={-1} className={`profile-dialog is-${dialog.type}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="profile-dialog__topbar">
          <div><span>Meewav · Profil</span><h2>{title}</h2></div>
          <button type="button" className="profile-icon-button" onClick={onClose} aria-label="Fermer"><X size={19} /></button>
        </div>
        <div className="profile-dialog__content">
          {dialog.type === "edit-profile" && <EditProfilePanel profile={profile} onSave={async (nextProfile) => { await onProfileSave(nextProfile); onToast("Profil public sauvegardé"); onClose(); }} onCancel={onClose} />}
          {dialog.type === "notifications" && <NotificationsPanel notifications={notifications} onMarkRead={onMarkNotificationsRead} onToast={onToast} />}
          {dialog.type === "private-action" && <PrivateQuickActionPanel action={dialog.action} onDone={(message) => { onToast(message); onClose(); }} onCancel={onClose} />}
          {dialog.type === "media-detail" && <MediaDetailPanel item={dialog.item} onToast={onToast} />}
        </div>
      </section>
    </div>
  );
}

function EditProfilePanel({ profile, onSave, onCancel }: { profile: DemoProfile; onSave: (profile: DemoProfile) => Promise<void>; onCancel: () => void }) {
  const [draft, setDraft] = useState(profile);
  const [visibility, setVisibility] = useState({
    role: profile.visibility.role,
    grade: profile.visibility.grade,
    collab: profile.visibility.collab,
    menu: profile.visibility.viewerMenu,
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const update = (key: keyof DemoProfile, value: string) => setDraft((current) => ({ ...current, [key]: value }));

  return (
    <form className="profile-edit-form" aria-busy={saving} onSubmit={(event) => {
      event.preventDefault();
      setSaving(true);
      setSaveError(null);
      const nextProfile: DemoProfile = {
        ...draft,
        visibility: {
          ...draft.visibility,
          role: visibility.role,
          grade: visibility.grade,
          collab: visibility.collab,
          viewerMenu: visibility.menu,
        },
      };
      void onSave(nextProfile)
        .catch((error: unknown) => {
          setSaveError(error instanceof Error ? error.message : "Le profil n’a pas pu être sauvegardé.");
        })
        .finally(() => setSaving(false));
    }}>
      <div className="profile-edit-preview">
        <img src={draft.avatarUrl} alt="" />
        <div><strong>{draft.displayName || "Nom artiste"}</strong><span>{draft.username || "@username"}</span></div>
        <span className="profile-edit-preview__status"><CheckCircle2 size={14} /> Avatar synchronisé</span>
      </div>
      <div className="profile-form-section"><span className="profile-kicker"><Fingerprint size={14} /> Identité publique</span>
        <div className="profile-form-grid">
          <label><span>Nom affiché</span><input value={draft.displayName} onChange={(event) => update("displayName", event.target.value)} /></label>
          <label><span>@username</span><input value={draft.username} onChange={(event) => update("username", event.target.value.startsWith("@") ? event.target.value : `@${event.target.value}`)} /></label>
          <label><span>Rôle artistique</span><input value={draft.role} onChange={(event) => {
            const role = event.target.value;
            setDraft((current) => ({ ...current, role, roleKey: canonicalRoleKeyForLabel(role, current.roleKey) }));
          }} /></label>
          <label><span>Ville</span><input value={draft.city} onChange={(event) => update("city", event.target.value)} /></label>
          <label><span>Pays</span><input value={draft.country} onChange={(event) => update("country", event.target.value)} /></label>
        </div>
        <label className="profile-form-textarea"><span>Bio publique</span><textarea value={draft.bio} maxLength={220} onChange={(event) => update("bio", event.target.value)} /><small>{draft.bio.length}/220</small></label>
      </div>
      <div className="profile-form-section"><span className="profile-kicker"><Eye size={14} /> Informations visibles</span>
        {Object.entries({ role: "Rôle artistique", grade: "Grade et niveau", collab: "Bouton Collab", menu: "Menu Viewer" }).map(([key, label]) => (
          <button key={key} className="profile-form-toggle" type="button" onClick={() => setVisibility((current) => ({ ...current, [key]: !current[key as keyof typeof current] }))}>
            <span>{label}</span><span className={`profile-switch ${visibility[key as keyof typeof visibility] ? "is-on" : ""}`}><i /></span>
          </button>
        ))}
      </div>
      {saveError && <p className="profile-form-error" role="alert"><AlertTriangle size={15} /> {saveError}</p>}
      <div className="profile-dialog-actions"><button className="profile-soft-button" type="button" onClick={onCancel} disabled={saving}>Annuler</button><button className="profile-primary-button" type="submit" disabled={saving}>{saving ? <LoaderCircle className="is-spinning" size={16} /> : <Check size={16} />} {saving ? "Sauvegarde…" : "Sauvegarder"}</button></div>
    </form>
  );
}

function PauseIcon() {
  return <span className="profile-pause-glyph" aria-hidden="true"><i /><i /></span>;
}

function NotificationsPanel({ notifications, onMarkRead, onToast }: { notifications: ProfileNotification[]; onMarkRead: (notificationIds?: string[]) => Promise<void>; onToast: (message: string) => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const markRead = async (notificationIds?: string[]) => {
    setPending(true);
    setError(null);
    try {
      await onMarkRead(notificationIds);
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : "Impossible de mettre à jour les notifications.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="profile-notifications-panel" aria-busy={pending}>
      <div className="profile-dialog-intro"><span className="profile-kicker"><BellRing size={14} /> Activité récente</span><p>Les signaux utiles de ton profil, de ton activité et de ta communauté.</p><button type="button" disabled={pending || !notifications.some((notification) => notification.unread)} onClick={() => void markRead()}>Tout marquer comme lu</button></div>
      {error && <p className="profile-form-error" role="alert"><AlertTriangle size={15} /> {error}</p>}
      <div className="profile-notification-list">
        {!notifications.length && <p className="profile-notification-empty" role="status">Aucune notification pour le moment.</p>}
        {notifications.map((notification) => (
          <button key={notification.id} type="button" disabled={pending} className={notification.unread ? "is-unread" : ""} onClick={() => { if (notification.unread) void markRead([notification.id]); onToast(notification.title); }}>
            <span className="profile-notification-list__mark"><Sparkles size={15} /></span><span><strong>{notification.title}</strong><small>{notification.detail}</small></span><time>{notification.time}</time>{notification.unread && <i />}
          </button>
        ))}
      </div>
    </div>
  );
}

function MediaDetailPanel({ item, onToast }: { item: MediaItem; onToast: (message: string) => void }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPublic, setIsPublic] = useState(item.status === "Publié");
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [scheduledAt, setScheduledAt] = useState("");
  const mediaRef = useRef<HTMLMediaElement>(null);
  const ItemIcon = item.kind === "video" ? Film : item.kind === "image" ? FileImage : item.kind === "document" ? FileText : FileAudio;
  const isPlayable = (item.kind === "audio" || item.kind === "video") && Boolean(item.sourceUrl);

  const togglePlayback = () => {
    const media = mediaRef.current;
    if (!media) return;
    if (media.paused) void media.play().catch(() => onToast("Lecture impossible dans ce navigateur"));
    else media.pause();
  };

  const copyPublicLink = async () => {
    const link = `${window.location.origin}/profile/creations/library?media=${encodeURIComponent(item.id)}`;
    try {
      await navigator.clipboard.writeText(link);
      onToast("Lien public copié");
    } catch {
      onToast("Impossible de copier le lien automatiquement");
    }
  };

  const openSource = () => {
    if (!item.sourceUrl) {
      onToast("Aucun fichier source associé");
      return;
    }
    window.open(item.sourceUrl, "_blank", "noopener,noreferrer");
  };

  const formatTime = (seconds: number) => {
    const safe = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
    return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
  };

  return (
    <div className="profile-media-detail">
      <div className={`profile-media-detail__cover is-${item.kind}`} style={{ "--media-detail-accent": item.accent } as React.CSSProperties}>
        {item.kind === "video" && item.sourceUrl ? (
          <video
            ref={(element) => { mediaRef.current = element; }}
            src={item.sourceUrl}
            poster={item.cover}
            preload="metadata"
            playsInline
            onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
            onTimeUpdate={(event) => setProgress(event.currentTarget.duration ? event.currentTarget.currentTime / event.currentTarget.duration * 100 : 0)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
          />
        ) : item.cover ? (
          <img src={item.cover} alt={`Aperçu de ${title}`} />
        ) : item.kind === "document" ? (
          <div className="profile-media-detail__document">
            <span><FileText size={18} /> Note de production</span>
            <strong>{item.previewLines?.[0] ?? title}</strong>
            {(item.previewLines ?? []).slice(1).map((line) => <small key={line}>{line}</small>)}
          </div>
        ) : (
          <div className="profile-media-detail__audio-visual"><ItemIcon size={38} />{Array.from({ length: 30 }, (_, index) => <i key={index} style={{ height: `${22 + (index * 23) % 68}%` }} />)}</div>
        )}

        {item.kind === "audio" && item.sourceUrl && (
          <audio
            ref={(element) => { mediaRef.current = element; }}
            src={item.sourceUrl}
            preload="metadata"
            onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
            onTimeUpdate={(event) => setProgress(event.currentTarget.duration ? event.currentTarget.currentTime / event.currentTarget.duration * 100 : 0)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
          />
        )}

        {isPlayable && <button type="button" onClick={togglePlayback} aria-label={playing ? "Mettre en pause" : "Lire"}>{playing ? <PauseIcon /> : <Play size={23} fill="currentColor" />}</button>}
        {isPlayable && (
          <label className="profile-media-detail__timeline">
            <span>{formatTime(duration * progress / 100)}</span>
            <input
              type="range"
              min="0"
              max="100"
              step="0.1"
              value={progress}
              aria-label={`Position de lecture de ${title}`}
              onChange={(event) => {
                const nextProgress = Number(event.target.value);
                setProgress(nextProgress);
                if (mediaRef.current?.duration) mediaRef.current.currentTime = mediaRef.current.duration * nextProgress / 100;
              }}
            />
            <span>{formatTime(duration)}</span>
          </label>
        )}
      </div>

      <div className="profile-media-detail__meta">
        <span className="profile-kicker">{item.kind} · {isPublic ? "Publié" : "Privé"}</span>
        {editing ? <input value={title} onChange={(event) => setTitle(event.target.value)} aria-label="Titre du contenu" autoFocus /> : <h3>{title}</h3>}
        <p>{item.meta} · {item.plays} lectures</p>
      </div>

      {scheduledAt && <div className="profile-media-detail__schedule"><CalendarDays size={16} /><span>Publication prévue le <strong>{new Date(scheduledAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}</strong></span><button type="button" onClick={() => setScheduledAt("")}>Annuler</button></div>}

      <div className="profile-media-detail__actions">
        <button type="button" onClick={() => { if (editing) onToast("Titre du contenu enregistré"); setEditing((value) => !value); }}><PencilLine size={17} /><span><strong>{editing ? "Enregistrer" : "Modifier"}</strong><small>Titre et visibilité</small></span></button>
        <button type="button" onClick={copyPublicLink}><Copy size={17} /><span><strong>Partager</strong><small>Copier le lien public</small></span></button>
        <label className="profile-media-detail__schedule-action"><CalendarDays size={17} /><span><strong>Programmer</strong><small>Choisir date et heure</small></span><input type="datetime-local" value={scheduledAt} onChange={(event) => { setScheduledAt(event.target.value); if (event.target.value) onToast("Publication programmée"); }} /></label>
        {item.sourceUrl && <button type="button" onClick={openSource}><Download size={17} /><span><strong>Ouvrir le fichier</strong><small>Aperçu dans un nouvel onglet</small></span></button>}
      </div>

      <button type="button" className="profile-module-setting" onClick={() => { setIsPublic((value) => !value); onToast(isPublic ? "Contenu retiré du profil public" : "Contenu ajouté au profil public"); }} aria-pressed={isPublic}>
        <span>{isPublic ? <Eye size={17} /> : <EyeOff size={17} />}<span><strong>Visible dans le profil public</strong><small>Ce contenu remonte dans la Vue Viewer.</small></span></span><span className={`profile-switch ${isPublic ? "is-on" : ""}`}><i /></span>
      </button>
    </div>
  );
}
