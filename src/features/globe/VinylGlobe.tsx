import { getDesktopApplicationMode } from "../../runtime/applicationMode";
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GlobeLoading from '../../../vendor/meewav-vinyl/src/GlobeLoading';
import { consumePendingMusicSceneArrival, peekPendingMusicSceneArrival, type MusicSceneOnboardingPayload } from '../auth/musicSceneOnboardingContract';
import './vinyl-globe.css';
import { loadPublicGlobeMarkers, type LiveGlobeMarker } from './api/globePublicMarkers';
import LiveGlobeProfile from './LiveGlobeProfile';

const CHANNEL = 'meewav:vinyl-globe:v1';
const destinations = new Set(['/messages', '/rooms/home', '/scene', '/market', '/tremplin', '/profile']);

type VinylGlobeProps = {
  arrival?: MusicSceneOnboardingPayload | null;
  ownerKey?: string | null;
};

export default function VinylGlobe({ arrival, ownerKey = 'anonymous' }: VinylGlobeProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const navigate = useNavigate();
  const [frameState, setFrameState] = useState<{ owner: string | null; loading: boolean }>({
    owner: null, loading: true,
  });
  // One continuous loader covers session resolution and the first rendered frame.
  const loading = ownerKey === null || frameState.owner !== ownerKey || frameState.loading;
  const sentArrival = useRef<string | null>(null);
  const markers = useRef<LiveGlobeMarker[]>([]);
  const [profile, setProfile] = useState<LiveGlobeMarker | null>(null);
  useEffect(() => {
    sentArrival.current = null;
    markers.current = []; setProfile(null);
  }, [ownerKey]);
  useEffect(() => {
    if (loading || !arrival || !frame.current?.contentWindow) return;
    const key = `${arrival.profile.profileId}:${arrival.scene.zoneId}:${arrival.createdAt}`;
    if (sentArrival.current === key) return;
    sentArrival.current = key;
    frame.current.contentWindow.postMessage({ channel: CHANNEL, type: 'scene-arrival',
      scene: { cityCode: arrival.city.communeCode, zoneId: arrival.scene.zoneId,
        center: arrival.scene.center, singlePlate: arrival.scene.source === 'single-plate' },
    }, window.location.origin);
    const pending = peekPendingMusicSceneArrival();
    if (pending?.profile.profileId === arrival.profile.profileId) consumePendingMusicSceneArrival();
  }, [arrival, loading]);
  useEffect(() => {
    const abort = new AbortController();
    let pendingMarkers: Promise<LiveGlobeMarker[]> | null = null;
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow
        || event.data?.channel !== CHANNEL) return;
      if (event.data.type === 'navigate' && destinations.has(event.data.path)) navigate(event.data.path);
      if (event.data.type === 'markers-request' && getDesktopApplicationMode() === 'live'
        && typeof event.data.requestId === 'string' && event.data.requestId.length <= 64) {
        const requestId = event.data.requestId;
        if (!pendingMarkers) pendingMarkers = loadPublicGlobeMarkers(abort.signal).finally(() => { pendingMarkers = null; });
        void pendingMarkers.then(result => {
          if (abort.signal.aborted) return;
          markers.current = result;
          setProfile(current => current ? result.find(marker => marker.id === current.id) ?? null : null);
          frame.current?.contentWindow?.postMessage({ channel: CHANNEL, type: 'markers-result', requestId, markers: result }, window.location.origin);
        }).catch(() => {
          if (abort.signal.aborted) return;
          markers.current = []; setProfile(null);
          frame.current?.contentWindow?.postMessage({ channel: CHANNEL, type: 'markers-result', requestId, error: true }, window.location.origin);
        });
      }
      if (event.data.type === 'profile-select' && getDesktopApplicationMode() === 'live') {
        const selected = markers.current.find(marker => marker.id === event.data.profileId);
        if (selected?.id === ownerKey) navigate('/profile');
        else if (selected) setProfile(selected);
      }
      if (event.data.type === 'ready' || event.data.type === 'error') setFrameState({ owner: ownerKey, loading: false });
      if (event.data.type === 'loading') setFrameState({ owner: ownerKey, loading: true });
    };
    const activity = () => frame.current?.contentWindow?.postMessage({
      channel: CHANNEL, type: 'activity', active: !document.hidden,
    }, window.location.origin);
    window.addEventListener('message', receive);
    document.addEventListener('visibilitychange', activity);
    return () => {
      abort.abort();
      window.removeEventListener('message', receive);
      document.removeEventListener('visibilitychange', activity);
      frame.current?.contentWindow?.postMessage({ channel: CHANNEL, type: 'activity', active: false }, window.location.origin);
    };
  }, [navigate, ownerKey]);
  return <main className="vinyl-globe-page" aria-label="Mon Globe" aria-busy={loading}>
    {ownerKey !== null && <iframe key={ownerKey} ref={frame} className="vinyl-globe-frame" title="Globe MeeWav et artistes légendaires"
      src={`${import.meta.env.BASE_URL}globe-vinyle/index.html${getDesktopApplicationMode() ? `?mode=${getDesktopApplicationMode() === "demo" ? "demo" : "real"}` : ""}`} allow="fullscreen" inert={loading}
      data-loading={loading} />}
    {loading && <GlobeLoading />}
    {profile && ownerKey && <LiveGlobeProfile key={profile.id} marker={profile} ownerId={ownerKey} onClose={() => {
      setProfile(null);
      frame.current?.contentWindow?.postMessage({ channel: CHANNEL, type: 'profile-close' }, window.location.origin);
      frame.current?.focus();
    }} />}
  </main>;
}
