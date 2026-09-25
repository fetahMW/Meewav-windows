const CHANNEL = 'meewav:vinyl-globe:v1';
const destinations = new Set(['/messages', '/rooms/home', '/scene', '/market', '/tremplin', '/profile']);

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
