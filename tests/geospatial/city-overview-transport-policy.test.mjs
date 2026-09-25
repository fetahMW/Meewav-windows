import assert from "node:assert/strict";
import test from "node:test";

import {
  CITY_OVERVIEW_TRANSPORT_CAMERA_EVENTS,
  resolveCityOverviewTransportPolicy,
} from "../../src/features/globe/maplibre/cityOverviewTransportPolicy.ts";

const BASE_INPUT = {
  altitudeMeters: 8_500,
  hideMinAltitudeMeters: 4_000,
  forceHidden: false,
  selectedZoneId: null,
  selectedZoneRuntimeMode: null,
};

test("high-altitude overview hides transport before a local scene is selected", () => {
  assert.deepEqual(resolveCityOverviewTransportPolicy(BASE_INPUT), {
    hideTransport: true,
    hideRoads: true,
    selectedSinglePlateActive: false,
  });
});

test("an active single-plate commune always restores roads despite stale overview state", () => {
  assert.deepEqual(resolveCityOverviewTransportPolicy({
    ...BASE_INPUT,
    forceHidden: true,
    selectedZoneId: "commune_30069",
    selectedZoneRuntimeMode: "single_plate",
  }), {
    hideTransport: true,
    hideRoads: false,
    selectedSinglePlateActive: true,
  });
});

test("a partial or non-single-plate selection cannot bypass the overview gate", () => {
  for (const [selectedZoneId, selectedZoneRuntimeMode] of [
    ["commune_30069", null],
    [null, "single_plate"],
    ["", "single_plate"],
  ]) {
    assert.equal(resolveCityOverviewTransportPolicy({
      ...BASE_INPUT,
      selectedZoneId,
      selectedZoneRuntimeMode,
    }).hideRoads, true);
  }
});

test("transport visibility stays out of MapLibre's per-frame move loop", () => {
  assert.deepEqual(CITY_OVERVIEW_TRANSPORT_CAMERA_EVENTS, [
    "moveend",
    "zoomend",
    "pitchend",
  ]);
  assert.equal(CITY_OVERVIEW_TRANSPORT_CAMERA_EVENTS.includes("move"), false);
  assert.equal(CITY_OVERVIEW_TRANSPORT_CAMERA_EVENTS.includes("movestart"), false);
});
