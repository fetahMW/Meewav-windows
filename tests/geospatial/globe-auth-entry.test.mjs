import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareGlobeEntry, AUTH_GLOBE_ENTRY_DURATION_MS } from '../../vendor/globe-vinyle/shared/src/globe-entry.mjs';

function fixture() {
  const overview = { lon: 12, lat: 4, height: 215, pitch: 0, bearing: 15 };
  const flights = [];
  const engine = { getOverviewTarget: () => overview, flyTo: (target, duration) => flights.push({ target, duration }) };
  return { overview, flights, engine };
}

test('auth reveals a distant first frame before flying to the standard globe', () => {
  const { engine, flights, overview } = fixture();
  const reveal = prepareGlobeEntry(engine, { fromAuthentication: true });
  assert.deepEqual(flights, [{ target: { ...overview, height: 400 }, duration: 0 }]);
  assert.equal(overview.height, 215);
  reveal();
  assert.deepEqual(flights[1], { target: overview, duration: AUTH_GLOBE_ENTRY_DURATION_MS });
});

test('the first rendered-frame signal cannot start the intro twice', () => {
  const { engine, flights } = fixture();
  const reveal = prepareGlobeEntry(engine, { fromAuthentication: true });
  reveal(); reveal();
  assert.equal(flights.length, 2);
});

test('reduced motion arrives immediately without an entry flight', () => {
  const { engine, flights, overview } = fixture();
  const reveal = prepareGlobeEntry(engine, { fromAuthentication: true, reducedMotion: true });
  reveal();
  assert.deepEqual(flights, [{ target: overview, duration: 0 }]);
});

test('ordinary arrivals keep their standard camera and do not replay the auth intro', () => {
  const { engine, flights, overview } = fixture();
  const reveal = prepareGlobeEntry(engine);
  reveal();
  assert.deepEqual(flights, [{ target: overview, duration: 0 }]);
});
