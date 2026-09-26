const CHANNEL = 'meewav:vinyl-globe:v1';
const destinations = new Set(['/messages', '/rooms/home', '/scene', '/market', '/tremplin', '/profile']);
import type { LiveGlobeMarker } from './live-markers';

export function requestLiveMarkers(): Promise<LiveGlobeMarker[]> {
  if (window.parent === window) return Promise.reject(new Error('Ouvre le Globe réel depuis Meewav.'));
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const finish = () => { clearTimeout(timer); window.removeEventListener('message', receive); };
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent || event.data?.channel !== CHANNEL
        || event.data?.type !== 'markers-result' || event.data.requestId !== requestId) return;
      finish();
      if (event.data.error || !Array.isArray(event.data.markers)) reject(new Error('Les profils du Globe sont indisponibles.'));
      else resolve(event.data.markers);
    };
    const timer = setTimeout(() => { finish(); reject(new Error('Le chargement des profils du Globe a expiré.')); }, 30_000);
    window.addEventListener('message', receive);
    window.parent.postMessage({ channel: CHANNEL, type: 'markers-request', requestId }, window.location.origin);
  });
}

export function openLiveProfile(id: string) {
  if (/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id) && window.parent !== window) {
    window.parent.postMessage({ channel: CHANNEL, type: 'profile-select', profileId: id }, window.location.origin);
  }
}

export function notifyHost(type: 'ready' | 'loading' | 'error') {
  if (window.parent !== window) window.parent.postMessage({ channel: CHANNEL, type }, window.location.origin);
}

export function installHostBridge() {
  const navigate = (event: Event) => {
    const path = (event as CustomEvent).detail?.path;
    if (window.parent === window || !destinations.has(path)) return;
    event.preventDefault();
    window.parent.postMessage({ channel: CHANNEL, type: 'navigate', path }, window.location.origin);
  };
  const lifecycle = (event: MessageEvent) => {
    if (event.origin !== window.location.origin || event.source !== window.parent || event.data?.channel !== CHANNEL) return;
    if (event.data.type === 'activity' && typeof event.data.active === 'boolean') {
      document.dispatchEvent(new CustomEvent('globelab-lifecycle', { detail: { active: event.data.active } }));
    }
    if (event.data.type === 'profile-close') {
      window.dispatchEvent(new CustomEvent('meewav:ground-avatar-select', { detail: null }));
      (window as any).__meewavEngine?.closeGroundAvatar?.();
    }
    if (event.data.type === 'scene-arrival') {
      const scene = event.data.scene;
      if (!scene || !/^[0-9A-Z]{5}$/.test(scene.cityCode) || typeof scene.zoneId !== 'string'
        || !Array.isArray(scene.center) || scene.center.length !== 2
        || !scene.center.every((n: unknown) => typeof n === 'number' && Number.isFinite(n))
        || Math.abs(scene.center[0]) > 180 || Math.abs(scene.center[1]) > 90) return;
      const expected = scene.singlePlate ? `fr-commune-${scene.cityCode}`
        : scene.cityCode === '75056' ? 'fr-paris-' : `fr-quartier-${scene.cityCode}-`;
      if (scene.singlePlate ? scene.zoneId !== expected : !scene.zoneId.startsWith(expected)) return;
      document.dispatchEvent(new CustomEvent('globelab-scene-arrival', { detail: scene }));
    }
  };
  window.addEventListener('meewav:navigate', navigate);
  window.addEventListener('message', lifecycle);
  return () => {
    window.removeEventListener('meewav:navigate', navigate);
    window.removeEventListener('message', lifecycle);
  };
}
