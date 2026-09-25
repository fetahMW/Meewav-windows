import { getDesktopApplicationMode } from "../../runtime/applicationMode";
import { useEffect, useMemo, useState } from "react";
import {
  AudioLines,
  ArrowLeft,
  DoorOpen,
  GraduationCap,
  Home,
  Mic2,
  Radio,
  UsersRound,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import MeewavPillarBrand from "../../components/navigation/MeewavPillarBrand";
import MeewavPillarTabs from "../../components/navigation/MeewavPillarTabs";
import { useAuth } from "../auth";
import MeewavPrimaryNav from "../globe/components/MeewavPrimaryNav";
import { getProfileArtistDeepLink } from "../profile/profileArtistDeepLink";
import { buildMessagingRoute, isMessagingUuid } from "../messaging/messaging.route";
import {
  MON_GLOBE_HOST_POSITION_NAVIGATION_STATE,
  MON_GLOBE_ROUTE,
} from "../globe/monGlobeContract";
import PlaceRoomExperience from "./place/PlaceRoomExperience";
import { createPlaceDemoState, PLACE_DEMO_PROFILES } from "./place/place.fixtures";
import { readCageDemoSession } from "./launch/cageLaunch";
import { readRoomLaunchSession } from "./launch/roomLaunch";
import RoomsHome from "./home/RoomsHome";
import { ROOMS_HOME_CATALOG } from "./home/roomsHome.fixtures";
import { createRoomsHomeDemoState } from "./home/roomsHome.fixtureAdapter";
import {
  getLiveRoomPresentation,
  RoomPresentationProvider,
} from "./roomPresentation";
import {
  getRoomDestinationFromPath,

  type RoomDestinationId,
} from "./roomDestinationRoute";
import { useRoomLiveCall } from "./live-call/RoomLiveCallProvider";
import "./rooms-page.css";
import "./place/place-room.css";
import "./place/place-room-premium.css";
import "./place/place-room-shell.css";
import "./live-themes/place-live-theme.css";
import "./live-themes/loge-live-theme.css";
import "./live-themes/wave-live-theme.css";
import "./live-themes/cage-live-theme.css";
import "./live-themes/classe-live-theme.css";
import "./live-themes/scene-live-theme.css";
import "./place/place-tools-wave-skin.css";
import "./tools/panels/loge-premium-tools.css";
import "./place/place-studio-chassis.css";
import "./place/place-studio-black-lacquer.css";
import "./live-themes/classe-chat-finish.css";
import "./place/place-mixer-reference.css";
import "./place/place-mixer-depth.css";
import "./place/place-studio-navigation.css";

import "./place/place-chat-composer-glass.css";
import "./place/place-chat-typography.css";
import "./place/live-glass-material.css";
import "./place/place-chat-smoked-glass.css";

const ROOM_DESTINATIONS = [
  { id: "home", label: "Accueil", icon: Home, accent: "#f7f5ff" },
  { id: "loge", label: "La Loge", icon: DoorOpen, accent: "#e9b949" },
  { id: "place", label: "La Place", icon: UsersRound, accent: "#f7f5ff" },
  { id: "wave", label: "La Wave", icon: AudioLines, accent: "#27c2d1" },
  { id: "cage", label: "La Cage", icon: Radio, accent: "#ff5b73" },
  { id: "classe", label: "La Classe", icon: GraduationCap, accent: "#5b7cff" },
  { id: "scene", label: "La Scène", icon: Mic2, accent: "#c56cff" },
] as const;

type RoomDestination = Extract<(typeof ROOM_DESTINATIONS)[number]["id"], RoomDestinationId>;

export default function RoomsPage() {
  const desktopMode = getDesktopApplicationMode();
  const allowDemo = desktopMode !== "live";
  const demoEnabled = allowDemo && (desktopMode === "demo" || import.meta.env.DEV);
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { requestLiveCall } = useRoomLiveCall();
  const linkedProfileId = getProfileArtistDeepLink(location.search);
  const roomSearch = new URLSearchParams(location.search);
  const browseType = roomSearch.get("type");
  const browsing = location.pathname.startsWith("/rooms/home") || location.pathname.startsWith("/rooms/collections");
  const browseDestination = ROOM_DESTINATIONS.find((entry) => entry.id === browseType)?.id ?? "home";
  const roomQueryId = roomSearch.get("room");
  const homeRoomId = roomSearch.get("homeRoom");
  const launchSessionId = roomSearch.get("launchSession");
  const launchSession = useMemo(() => {
    const session = demoEnabled ? readRoomLaunchSession(launchSessionId) : null;
    return session && location.pathname.endsWith(`/${session.configuration.roomType}`) ? session : null;
  }, [demoEnabled, launchSessionId, location.pathname]);
  const cageSessionId = roomSearch.get("cageSession");
  const cageSession = useMemo(() => demoEnabled && location.pathname.endsWith("/cage") ? readCageDemoSession(cageSessionId) : null, [demoEnabled, cageSessionId, location.pathname]);
  const homeRoom = useMemo(
    () => allowDemo && homeRoomId ? ROOMS_HOME_CATALOG.find((room) => room.id === homeRoomId && location.pathname.endsWith(`/${room.roomType}`)) ?? null : null,
    [allowDemo, homeRoomId, location.pathname],
  );
  const requestedDemoRole = roomSearch.get("demoRole");
  const explicitDemoRole = requestedDemoRole === "viewer" || requestedDemoRole === "guest" || requestedDemoRole === "host"
    ? requestedDemoRole
    : undefined;
  const demoRole = !allowDemo ? undefined : homeRoom
    ? explicitDemoRole ?? "viewer" as const
    : demoEnabled
      ? explicitDemoRole ?? (roomQueryId && desktopMode !== "demo" ? undefined : "host" as const)
      : undefined;
  const homeRoomDemoUserId = demoRole === "host"
    ? PLACE_DEMO_PROFILES.host.id
    : demoRole === "guest"
      ? PLACE_DEMO_PROFILES.guestA.id
      : demoRole === "viewer"
        ? PLACE_DEMO_PROFILES.viewerA.id
        : null;
  const demoSession = demoEnabled && /^[0-9a-f-]{36}$/i.test(roomSearch.get("demoSession") ?? "") ? roomSearch.get("demoSession") : null;
  const homeRoomDemoState = useMemo(
    () => launchSession ? (() => {
      const state = createPlaceDemoState(PLACE_DEMO_PROFILES.host.id);
      return { ...state, id: launchSession.id, title: launchSession.configuration.title, description: launchSession.configuration.description || String(launchSession.configuration.values.topic ?? ""), startedAt: launchSession.createdAt, queueOpen: launchSession.configuration.values.queueOpen !== false, participants: state.participants.filter((person) => person.status === "host"), messages: [], pinnedMessageId: null, highlightText: null };
    })() : cageSession ? {
      ...createPlaceDemoState(homeRoomDemoUserId),
      id: cageSession.roomId,
      title: cageSession.configuration.title,
      startedAt: cageSession.createdAt,
    } : homeRoom ? createRoomsHomeDemoState(homeRoom, homeRoomDemoUserId) : demoSession ? {...createPlaceDemoState(homeRoomDemoUserId), id:demoSession} : null,
    [launchSession, cageSession, homeRoom, homeRoomDemoUserId, demoSession],
  );
  const requestedRoomId = desktopMode !== "demo" && roomQueryId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(roomQueryId)
    ? roomQueryId
    : null;
  const tremplinState = location.state && typeof location.state === "object"
    ? location.state as {
      tremplinReturnTo?: unknown;
      tremplinProfileReturnTo?: unknown;
      tremplinArtistId?: unknown;
      tremplinArtistName?: unknown;
      tremplinRoomTitle?: unknown;
      tremplinRoomDateLabel?: unknown;
      tremplinSessionSnapshot?: unknown;
      roomsHomeReturnTo?: unknown;
    }
    : null;
  const tremplinReturnTo = typeof tremplinState?.tremplinReturnTo === "string" && tremplinState.tremplinReturnTo.startsWith("/tremplin")
    ? tremplinState.tremplinReturnTo
    : null;
  const tremplinArtistId = typeof tremplinState?.tremplinArtistId === "string" ? tremplinState.tremplinArtistId : null;
  const tremplinProfileReturnTo = typeof tremplinState?.tremplinProfileReturnTo === "string" && tremplinState.tremplinProfileReturnTo.startsWith("/tremplin")
    ? tremplinState.tremplinProfileReturnTo
    : null;
  const tremplinArtistName = typeof tremplinState?.tremplinArtistName === "string" ? tremplinState.tremplinArtistName : null;
  const tremplinRoomTitle = typeof tremplinState?.tremplinRoomTitle === "string" ? tremplinState.tremplinRoomTitle : null;
  const tremplinRoomDateLabel = typeof tremplinState?.tremplinRoomDateLabel === "string" ? tremplinState.tremplinRoomDateLabel : null;
  const roomsHomeReturnTo = typeof tremplinState?.roomsHomeReturnTo === "string"
    && /^\/rooms\/(home|collections)(?:[/?]|$)/.test(tremplinState.roomsHomeReturnTo)
    ? tremplinState.roomsHomeReturnTo
    : "/rooms/home";
  const collectionMatch = location.pathname.match(/^\/rooms\/collections\/([^/]+)\/?$/i);
  const collectionSlug = collectionMatch ? decodeURIComponent(collectionMatch[1]) : null;
  const [activeDestination, setActiveDestination] = useState<RoomDestination>(() => (
    tremplinArtistId || linkedProfileId
      ? "scene"
      : getRoomDestinationFromPath(location.pathname)
  ));
  useEffect(() => {
    if (linkedProfileId) setActiveDestination("scene");
  }, [linkedProfileId]);
  useEffect(() => {
    if (linkedProfileId || tremplinArtistId) return;
    setActiveDestination(getRoomDestinationFromPath(location.pathname));
  }, [linkedProfileId, location.pathname, tremplinArtistId]);
  const displayedDestination = browsing ? browseDestination : activeDestination;
  const activeRoom = ROOM_DESTINATIONS.find((room) => room.id === displayedDestination)
    ?? ROOM_DESTINATIONS[0];
  const activeLiveRoomPresentation = browsing ? null : getLiveRoomPresentation(activeDestination);
  const isActiveLiveRoom = activeLiveRoomPresentation !== null;
  const selectDestination = (destination: RoomDestination) => {
    setActiveDestination(destination);
    navigate(destination === "home" ? "/rooms/home" : `/rooms/home?type=${destination}`);
  };
  const openProfileMessaging = (profileId: string, intent: "message" | "collaboration", requestId?: string | null) => {
    const isRealProfile = isMessagingUuid(profileId);
    navigate(buildMessagingRoute({
      space: intent === "collaboration" ? "collabs" : "messages",
      intent,
      source: "rooms",
      mode: isRealProfile ? "real" : "demo",
      profileId: isRealProfile ? profileId : null,
      mockArtistId: isRealProfile ? null : profileId,
      requestId,
    }));
  };

  if (launchSessionId && !launchSession) return <main className="room-launch" style={{ margin: "80px auto", padding: 24 }}><h2>Lancement à compléter</h2><p>Cette session n’est plus disponible ou ses réglages sont incomplets. Pour la Wave, un fichier audio de base est obligatoire.</p><button onClick={() => navigate("/rooms/home")}>Revenir aux Rooms</button></main>;

  return (
    <main className="rooms-page" aria-label="Rooms" data-room-destination={activeDestination}>
      <div className="rooms-page__background" aria-hidden="true" />
      {!isActiveLiveRoom ? (
        <header className="rooms-topbar">
          <div className="rooms-topbar__brand">
            <MeewavPillarBrand pillar="Rooms" />
          </div>
          <MeewavPillarTabs
            className="rooms-pillar-tabs"
            items={ROOM_DESTINATIONS}
            activeId={displayedDestination}
            ariaLabel="Navigation Rooms"
            onSelect={selectDestination}
          />
        </header>
      ) : null}
      <aside className="rooms-primary-rail">
        <MeewavPrimaryNav
          activeView="globe"
          activeDestination="rooms"
          onGlobe={() => navigate(MON_GLOBE_ROUTE, {
            state: MON_GLOBE_HOST_POSITION_NAVIGATION_STATE,
          })}
          onMessages={() => navigate("/messages")}
        />
      </aside>
      {tremplinReturnTo ? (
        <aside className="rooms-tremplin-return" aria-label="Retour au parcours artiste">
          <button type="button" onClick={() => navigate(tremplinReturnTo, { state: {
            tremplinReturnTo: tremplinProfileReturnTo ?? undefined,
            tremplinReturnedFromRooms: true,
            tremplinSessionSnapshot: tremplinState?.tremplinSessionSnapshot,
          } })}><ArrowLeft aria-hidden="true" /> {tremplinReturnTo.includes("/mes-artistes") ? "Retour à Mes artistes" : "Retour au profil artiste"}</button>
          {tremplinArtistId ? <span><strong>{tremplinRoomTitle ?? "Room artiste"}</strong>{tremplinArtistName ? ` · ${tremplinArtistName}` : ""}{tremplinRoomDateLabel ? ` · ${tremplinRoomDateLabel}` : ""}</span> : null}
        </aside>
      ) : null}
      {activeLiveRoomPresentation ? (
        <RoomPresentationProvider presentation={activeLiveRoomPresentation}>
          <PlaceRoomExperience
            key={homeRoomDemoState?.id ?? requestedRoomId ?? activeLiveRoomPresentation.id}
            requestedRoomId={requestedRoomId}
            currentUserId={user?.id}
            demoRole={demoRole}
            demoRoom={homeRoomDemoState}
            onOpenProfile={(profileId) => navigate(`/profile/view/${profileId}`)}
            onMessageProfile={(profileId) => openProfileMessaging(profileId, "message")}
            onCollaborateProfile={(profileId, requestId) => openProfileMessaging(profileId, "collaboration", requestId)}
            onLeaveRoom={() => navigate(roomsHomeReturnTo)}
            onLiveCallRequest={requestLiveCall}
          />
        </RoomPresentationProvider>
      ) : (
        <section className="rooms-page__future-surface" aria-label={`${activeRoom.label} · espace Rooms`}>
          <span className="rooms-page__live-label" aria-live="polite">{activeRoom.label}</span>
          {browsing || activeDestination === "home" ? <RoomsHome key={browseDestination} collectionSlug={collectionSlug} roomType={browseDestination === "home" ? undefined : browseDestination} /> : null}
          {linkedProfileId ? (
            <div className="rooms-page__profile-context" role="status">
              <strong>Rooms de l’artiste sélectionné</strong>
              <span>Les Rooms publiques reliées à ce profil apparaîtront ici dès leur publication.</span>
            </div>
          ) : null}
        </section>
      )}
    </main>
  );
}

import "./place/place-guest-reference.css";

import "./place/place-guest-portraits.css";
import "./place/place-desktop-android-parity.css";
