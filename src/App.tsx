import { lazy, Suspense, type ReactNode } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigationType,
} from "react-router-dom";
import {
  AuthProvider,
  IS_TREMPLIN_WORKSPACE_PREVIEW_MODE,
  RequireAuth,
  useAuth,
} from "./features/auth";
import { RuntimeProvider, useRuntime } from "./runtime/RuntimeProvider";
import DesktopEntryGate from "./runtime/DesktopEntryGate";
import { getDesktopApplicationMode } from "./runtime/applicationMode";
import DesktopTitleBar from "./runtime/DesktopTitleBar";
import {
  DEPRECATED_MAP_ROUTES,
  getMonGlobeInitialDestination,
  MON_GLOBE_ALIASES,
  MON_GLOBE_ROUTE,
  MonGlobe,
} from "./features/globe";
import {
  getCurrentBrowserNavigationType,
  shouldReturnToAuthenticationOnGlobeLoad,
} from "./features/auth/authRefreshRoutePolicy";
import {
  getCanonicalScenePath,
  LEGACY_SHORTS_ROUTE,
  SCENE_ROUTE,
} from "./features/shorts/sceneContract";
import {
  AudioEngineProvider,
  isAudioEngineRoomId,
  requestAudioEnginePairingTicket,
} from "./features/rooms/audio-engine";
import { RoomLiveCallProvider } from "./features/rooms/live-call/RoomLiveCallProvider";
import {
  getClasseWorkspacePreviewRedirect,
  isClasseWorkspacePreviewEnabled,
  isClasseWorkspacePreviewPath,
} from "./features/rooms/classeWorkspacePreview";
import {
  getRoomsHomeWorkspacePreviewRedirect,
  isRoomsHomeWorkspacePreviewEnabled,
  isPillarWorkspacePreviewPath,
  ROOMS_HOME_WORKSPACE_PREVIEW_PATH,
} from "./features/rooms/roomsHomeWorkspacePreview";
import { isVoiceCorrectionLabEnabled } from "./features/rooms/voice-correction/voiceCorrection.flags";
import AppRouteLoading from "./components/shared/AppRouteLoading";

const AuthPage = lazy(() => import("./pages/AuthPage"));
const AuthCallbackPage = lazy(() => import("./features/auth/AuthCallbackPage"));
const AuthRecoveryPage = lazy(() => import("./features/auth/AuthRecoveryPage"));
const ProfilePage = lazy(() => import("./features/profile/ProfilePage"));
const ProfileViewerPage = lazy(() => import("./features/profile/ProfileViewerPage"));
const MarketPage = lazy(() => import("./features/market/MarketPage"));
const TremplinPage = lazy(() => import("./features/tremplin/TremplinPage"));
const ShortsPage = lazy(() => import("./features/shorts/ShortsPage"));
const RoomsPage = lazy(() => import("./features/rooms/RoomsPage"));
const AudioEngineDiagnostics = lazy(() => import("./features/rooms/audio-engine/AudioEngineDiagnostics"));
const VoiceCorrectionLabPage = import.meta.env.MODE === "audio-lab"
  && import.meta.env.VITE_OPENDAW_VOICE_CORRECTION_LAB === "true"
  && isVoiceCorrectionLabEnabled()
  ? lazy(() => import("./features/rooms/voice-correction/VoiceCorrectionLabPage"))
  : null;
const IS_ROOMS_WORKSPACE_PREVIEW_MODE = import.meta.env.DEV
  && import.meta.env.VITE_ROOMS_WORKSPACE_PREVIEW === "true";
const IS_ROOMS_HOME_WORKSPACE_PREVIEW_MODE = isRoomsHomeWorkspacePreviewEnabled(
  import.meta.env.DEV,
  import.meta.env.VITE_ROOMS_HOME_WORKSPACE_PREVIEW,
);
const IS_CLASSE_WORKSPACE_PREVIEW_MODE = !IS_ROOMS_HOME_WORKSPACE_PREVIEW_MODE
  && isClasseWorkspacePreviewEnabled(
    import.meta.env.DEV,
    import.meta.env.VITE_CLASSE_WORKSPACE_PREVIEW,
  );

type MessagingPageModule = typeof import("./features/messaging/MessagingPage");

let messagingPageModulePromise: Promise<MessagingPageModule> | null = null;

function loadMessagingPage() {
  if (!messagingPageModulePromise) {
    messagingPageModulePromise = import("./features/messaging/MessagingPage").catch((error: unknown) => {
      messagingPageModulePromise = null;
      throw error;
    });
  }
  return messagingPageModulePromise;
}

const MessagingPage = lazy(loadMessagingPage);

if (typeof window !== "undefined") {
  void loadMessagingPage().catch(() => undefined);
}

const NON_CANONICAL_MAP_ROUTES = [
  ...MON_GLOBE_ALIASES,
  ...DEPRECATED_MAP_ROUTES,
];
const DOCUMENT_GLOBE_ENTRY_ROUTES = new Set([MON_GLOBE_ROUTE, ...NON_CANONICAL_MAP_ROUTES]);
// `PerformanceNavigationTiming.type` stays equal to `reload` for the entire
// document lifetime. Gate the refresh policy with the path that actually
// booted this document so a later browser Back to the Globe is not mistaken
// for a fresh Globe reload.
const DOCUMENT_STARTED_ON_GLOBE = typeof window !== "undefined"
  && DOCUMENT_GLOBE_ENTRY_ROUTES.has(window.location.pathname);

function RedirectToMonGlobe() {
  const location = useLocation();
  return <Navigate to={`${MON_GLOBE_ROUTE}${location.search}${location.hash}`} replace />;
}

function AuthenticatedGlobeTestRoute() {
  const runtime = useRuntime();
  const location = useLocation();
  const routeNavigationType = useNavigationType();
  const navigationType = getCurrentBrowserNavigationType();
  if (
    !runtime.isDesktop
    && !IS_TREMPLIN_WORKSPACE_PREVIEW_MODE
    && !IS_ROOMS_HOME_WORKSPACE_PREVIEW_MODE
    && DOCUMENT_STARTED_ON_GLOBE
    &&
    routeNavigationType === "POP"
    && shouldReturnToAuthenticationOnGlobeLoad(navigationType)
  ) {
    return <Navigate to="/auth" replace />;
  }

  const globe = <MonGlobe initialDestination={getMonGlobeInitialDestination(location.state)} />;
  return runtime.isDesktop ? <RequireAuth>{globe}</RequireAuth> : globe;
}

function PreviewAuthenticatedRoute({
  children,
  allowRoomsWorkspacePreview = false,
}: {
  children: ReactNode;
  allowRoomsWorkspacePreview?: boolean;
}) {
  const location = useLocation();
  if (IS_ROOMS_HOME_WORKSPACE_PREVIEW_MODE && isPillarWorkspacePreviewPath(location.pathname)) return children;
  if (IS_TREMPLIN_WORKSPACE_PREVIEW_MODE) return children;
  if (allowRoomsWorkspacePreview) return children;
  return <RequireAuth>{children}</RequireAuth>;
}

function AuthenticationRoute() {
  if (getDesktopApplicationMode() === "demo") return <Navigate to={MON_GLOBE_ROUTE} replace />;
  if (IS_ROOMS_WORKSPACE_PREVIEW_MODE) return <Navigate to="/rooms" replace />;
  return (
    <Suspense fallback={<AppRouteLoading />}>
      <AuthPage />
    </Suspense>
  );
}

function ProfileRoute() {
  return (
    <PreviewAuthenticatedRoute>
      <Suspense fallback={<AppRouteLoading />}>
        <ProfilePage />
      </Suspense>
    </PreviewAuthenticatedRoute>
  );
}

function ProfileViewerRoute() {
  return (
    <Suspense fallback={<AppRouteLoading />}>
      <ProfileViewerPage />
    </Suspense>
  );
}

function MessagingRoute() {
  return (
    <PreviewAuthenticatedRoute>
      <Suspense fallback={<AppRouteLoading />}>
        <MessagingPage />
      </Suspense>
    </PreviewAuthenticatedRoute>
  );
}

function MarketRoute() {
  return (
    <Suspense fallback={<AppRouteLoading />}>
      <MarketPage />
    </Suspense>
  );
}

function TremplinRoute() {
  return (
    <PreviewAuthenticatedRoute>
      <Suspense fallback={<AppRouteLoading />}>
        <TremplinPage />
      </Suspense>
    </PreviewAuthenticatedRoute>
  );
}

function SceneRoute() {
  return (
    <PreviewAuthenticatedRoute>
      <Suspense fallback={<AppRouteLoading />}>
        <ShortsPage />
      </Suspense>
    </PreviewAuthenticatedRoute>
  );
}

function RedirectToScene() {
  const location = useLocation();
  const canonicalPath = getCanonicalScenePath(location.pathname);

  return (
    <Navigate
      to={`${canonicalPath}${location.search}${location.hash}`}
      replace
      state={location.state}
    />
  );
}

function RedirectToMarketplace() {
  const location = useLocation();
  const nestedPath = location.pathname.slice("/marketplace".length);
  return <Navigate to={`/market${nestedPath}${location.search}${location.hash}`} replace state={location.state} />;
}

function RoomsRoute() {
  const location = useLocation();
  const requestedRoomId = new URLSearchParams(location.search).get("room");
  const roomId = isAudioEngineRoomId(requestedRoomId) ? requestedRoomId : undefined;
  return (
    <PreviewAuthenticatedRoute allowRoomsWorkspacePreview={IS_ROOMS_WORKSPACE_PREVIEW_MODE
      || IS_ROOMS_HOME_WORKSPACE_PREVIEW_MODE
      || (IS_CLASSE_WORKSPACE_PREVIEW_MODE && isClasseWorkspacePreviewPath(location.pathname))}>
      <AudioEngineProvider roomId={roomId} pairingTicketProvider={requestAudioEnginePairingTicket}>
        <Suspense fallback={<AppRouteLoading />}>
          <RoomsPage />
        </Suspense>
      </AudioEngineProvider>
    </PreviewAuthenticatedRoute>
  );
}

function RoomsHomeWorkspaceBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  const redirectTo = getRoomsHomeWorkspacePreviewRedirect(
    location.pathname,
    IS_ROOMS_HOME_WORKSPACE_PREVIEW_MODE,
  );
  if (redirectTo) return <Navigate to={redirectTo} replace />;
  return children;
}

function ClasseWorkspaceBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  const redirectTo = getClasseWorkspacePreviewRedirect(
    location.pathname,
    IS_CLASSE_WORKSPACE_PREVIEW_MODE,
  );
  if (redirectTo) return <Navigate to={redirectTo} replace />;
  return children;
}

function InternalAudioEngineRoute() {
  const location = useLocation();
  const requestedRoomId = new URLSearchParams(location.search).get("room");
  const roomId = isAudioEngineRoomId(requestedRoomId) ? requestedRoomId : undefined;
  if (!import.meta.env.DEV) return <Navigate to={MON_GLOBE_ROUTE} replace />;
  return (
    <PreviewAuthenticatedRoute>
      <AudioEngineProvider roomId={roomId} pairingTicketProvider={requestAudioEnginePairingTicket}>
        <Suspense fallback={<AppRouteLoading />}>
          <AudioEngineDiagnostics />
        </Suspense>
      </AudioEngineProvider>
    </PreviewAuthenticatedRoute>
  );
}

function VoiceCorrectionLabRoute() {
  if (!VoiceCorrectionLabPage) {
    return <Navigate to={MON_GLOBE_ROUTE} replace />;
  }
  return (
    <Suspense fallback={<AppRouteLoading />}>
      <VoiceCorrectionLabPage />
    </Suspense>
  );
}

function ApplicationEntry() {
  const runtime = useRuntime();
  const auth = useAuth();
  if (!runtime.ready || (runtime.isDesktop && auth.status === "loading")) return <AppRouteLoading />;
  if (runtime.isDesktop) return <Navigate to={(getDesktopApplicationMode() === "demo" || auth.status === "authenticated") ? MON_GLOBE_ROUTE : "/auth"} replace />;
  return <Navigate to={IS_ROOMS_HOME_WORKSPACE_PREVIEW_MODE ? ROOMS_HOME_WORKSPACE_PREVIEW_PATH : IS_ROOMS_WORKSPACE_PREVIEW_MODE ? '/rooms' : '/auth'} replace />;
}

function DesktopAuthenticationBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  if (getDesktopApplicationMode() === "live" && !location.pathname.startsWith("/auth")) return <RequireAuth>{children}</RequireAuth>;
  return children;
}

function App() {
  return (
    <RuntimeProvider>
      <BrowserRouter>
        <DesktopTitleBar />
        <DesktopEntryGate><AuthProvider>
        <DesktopAuthenticationBoundary><RoomLiveCallProvider>
          <RoomsHomeWorkspaceBoundary>
            <ClasseWorkspaceBoundary>
              <Routes>
          <Route
            path="/"
            element={<ApplicationEntry />}
          />
          <Route
            path="/auth"
            element={<AuthenticationRoute />}
          />
          <Route
            path="/auth/callback"
            element={(
              <Suspense fallback={<AppRouteLoading />}>
                <AuthCallbackPage />
              </Suspense>
            )}
          />
          <Route
            path="/auth/reset-password"
            element={(
              <Suspense fallback={<AppRouteLoading />}>
                <AuthRecoveryPage mode="request" />
              </Suspense>
            )}
          />
          <Route
            path="/auth/update-password"
            element={(
              <Suspense fallback={<AppRouteLoading />}>
                <AuthRecoveryPage mode="update" />
              </Suspense>
            )}
          />
          <Route path={MON_GLOBE_ROUTE} element={<AuthenticatedGlobeTestRoute />} />
          <Route path="/messages" element={<MessagingRoute />} />
          <Route path="/messages/*" element={<MessagingRoute />} />
          <Route path="/messagerie/*" element={<MessagingRoute />} />
          <Route path="/market/*" element={<MarketRoute />} />
          <Route path="/marketplace/*" element={<RedirectToMarketplace />} />
          <Route path="/tremplin/*" element={<TremplinRoute />} />
          <Route path="/profile/view/:profileId" element={<ProfileViewerRoute />} />
          <Route path="/profil/voir/:profileId" element={<ProfileViewerRoute />} />
          <Route path="/profil/*" element={<ProfileRoute />} />
          <Route path="/profile/*" element={<ProfileRoute />} />
          <Route path={`${SCENE_ROUTE}/*`} element={<SceneRoute />} />
          <Route path={`${LEGACY_SHORTS_ROUTE}/*`} element={<RedirectToScene />} />
          <Route path="/rooms/*" element={<RoomsRoute />} />
          <Route path="/room/*" element={<RoomsRoute />} />
          <Route path="/internal/audio-engine" element={<InternalAudioEngineRoute />} />
          <Route path="/labs/correction-vocale" element={<VoiceCorrectionLabRoute />} />
          {NON_CANONICAL_MAP_ROUTES.map((path) => (
            <Route key={path} path={path} element={<RedirectToMonGlobe />} />
          ))}
          <Route path="*" element={<RedirectToMonGlobe />} />
              </Routes>
            </ClasseWorkspaceBoundary>
          </RoomsHomeWorkspaceBoundary>
        </RoomLiveCallProvider></DesktopAuthenticationBoundary>
        </AuthProvider></DesktopEntryGate>
      </BrowserRouter>
    </RuntimeProvider>
  );
}

export default App;
