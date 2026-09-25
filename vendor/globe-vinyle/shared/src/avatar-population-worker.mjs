import { createParisAvatarPopulation } from './paris-avatar-population.mjs';

let population, search = null, scheduled = false;
const zones = new Set();
const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function schedule() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(pump, 0);
}

function pump() {
  scheduled = false;
  if (!population) return;
  // Yield between zones so a new destination or query can overtake a search.
  // The deterministic placement algorithm and IDs remain unchanged.
  if (zones.size) {
    const zoneId = [...zones].at(-1);
    zones.delete(zoneId);
    try { self.postMessage({ type: 'zone', zoneId, avatars: population.avatarsIn(zoneId) }); }
    catch (error) { self.postMessage({ type: 'zone', zoneId, error: String(error) }); }
  } else if (search) {
    const request = search;
    try {
      const zoneId = request.zones[request.index++];
      for (const avatar of population.avatarsIn(zoneId)) {
        if (!avatar.isHost && !request.pinned.has(avatar.id)) {
          if (!request.roles.has(avatar.icon)) continue;
          if (request.grades.size && !request.grades.has(avatar.grade)) continue;
          if (request.hideConsulted && request.consulted.has(avatar.id) && avatar.id !== request.selectedId) continue;
        }
        const hay = fold(`${avatar.name} ${avatar.role} ${avatar.zoneName} ${avatar.city}${avatar.isHost ? ' feta fetah beatmaker' : ''}`);
        if (!request.terms.every(term => hay.includes(term))) continue;
        request.hits.push({
          id: avatar.id, name: avatar.name, subtitle: `${avatar.role} · ${avatar.zoneName}`,
          avatar: true, zoneId: avatar.zoneId, cityId: avatar.cityId,
          target: { lon: avatar.lon, lat: avatar.lat, height: 0.03, pitch: 0 },
        });
        if (request.hits.length === 8) break;
      }
      if (request.hits.length === 8 || request.index >= request.zones.length) {
        self.postMessage({ type: 'search', id: request.id, hits: request.hits });
        search = null;
      }
    } catch (error) {
      self.postMessage({ type: 'search', id: request.id, error: String(error), hits: [] });
      search = null;
    }
  }
  if (zones.size || search) schedule();
}

self.onmessage = ({ data }) => {
  if (data.type === 'init') {
    population = createParisAvatarPopulation(data.sectors, data.communes, { eager: false });
  } else if (data.type === 'quarters') {
    for (const feature of data.features) population.ensureQuartier(feature);
  } else if (data.type === 'zone') {
    zones.delete(data.zoneId);
    zones.add(data.zoneId);
  } else if (data.type === 'cancel-search') {
    search = null;
  } else if (data.type === 'search') {
    search = { ...data, zones: [...new Set([...data.preferredZones, ...population.zoneIds()])], index: 0, hits: [],
      terms: fold(data.query).trim().split(/\s+/).filter(Boolean),
      roles: new Set(data.roles), grades: new Set(data.grades),
      pinned: new Set(data.pinned), consulted: new Set(data.consulted) };
  }
  schedule();
};
