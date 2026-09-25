import { afterEach, describe, expect, it, vi } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import * as THREE from "three";
import {
  mountHiddenFranceGiftLayer,
  mountHiddenFranceIphonePrizeLayer,
  resolveHiddenFranceGiftCameraMaxZoom,
  resolveHiddenGiftScreenScaleMultiplier,
  resolveHiddenGiftTerrainElevation,
  resolveHiddenGiftZoomZoneUnlocked,
  setHiddenGiftClipSpaceScaleMatrix,
} from "./hiddenFranceGiftLayer";

class GiftTestCanvas extends EventTarget {
  getBoundingClientRect() {
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 900,
      bottom: 600,
      width: 900,
      height: 600,
      toJSON: () => ({}),
    } as DOMRect;
  }
}

function createMapHarness() {
  const canvas = new GiftTestCanvas();
  const layers = new Map<string, Record<string, unknown>>();
  const sources = new Map<string, unknown>();
  const handlers = new Map<string, Set<() => void>>();
  const triggerRepaint = vi.fn();
  const flyTo = vi.fn();
  const stop = vi.fn();
  const queryRenderedFeatures = vi.fn(() => [{ type: "Feature" }]);
  const setPaintProperty = vi.fn();
  let maxZoom = 20;
  let styleLoaded = true;
  let center = { lng: 2.3522, lat: 48.8566 };
  const setMaxZoom = vi.fn((value: number) => {
    maxZoom = value;
  });

  const map = {
    isStyleLoaded: () => styleLoaded,
    getCanvas: () => canvas,
    getCenter: () => center,
    getZoom: () => 18,
    getMaxZoom: () => maxZoom,
    setMaxZoom,
    getLayer: (id: string) => layers.get(id),
    getSource: (id: string) => sources.get(id),
    addSource: (id: string, source: unknown) => sources.set(id, source),
    removeSource: (id: string) => sources.delete(id),
    addLayer: (layer: Record<string, unknown>) => layers.set(layer.id as string, layer),
    removeLayer: (id: string) => layers.delete(id),
    on: (eventName: string, handler: () => void) => {
      const eventHandlers = handlers.get(eventName) ?? new Set();
      eventHandlers.add(handler);
      handlers.set(eventName, eventHandlers);
    },
    off: (eventName: string, handler: () => void) => handlers.get(eventName)?.delete(handler),
    queryRenderedFeatures,
    setPaintProperty,
    triggerRepaint,
    flyTo,
    stop,
  };

  return {
    map: map as unknown as MapLibreMap,
    canvas,
    layers,
    sources,
    handlers,
    triggerRepaint,
    flyTo,
    stop,
    queryRenderedFeatures,
    setPaintProperty,
    setMaxZoom,
    setCenter: (nextCenter: { lng: number; lat: number }) => {
      center = nextCenter;
    },
    setStyleLoaded: (loaded: boolean) => {
      styleLoaded = loaded;
    },
    getMaxZoom: () => maxZoom,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("hidden France gift MapLibre layer", () => {
  it("uses the mountain fallback while the DEM temporarily reports sea level", () => {
    expect(resolveHiddenGiftTerrainElevation(0, 2_518.19)).toBe(2_518.19);
    expect(resolveHiddenGiftTerrainElevation(null, 2_518.19)).toBe(2_518.19);
    expect(resolveHiddenGiftTerrainElevation(2_604.5, 2_518.19)).toBe(2_604.5);
  });

  it("keeps a tiny visible model floor without enlarging an already readable gift", () => {
    expect(resolveHiddenGiftScreenScaleMultiplier(24, 8)).toBe(1);
    expect(resolveHiddenGiftScreenScaleMultiplier(1, 8)).toBe(8);
    expect(resolveHiddenGiftScreenScaleMultiplier(0.01, 8)).toBe(800);
    expect(resolveHiddenGiftScreenScaleMultiplier(0, 8)).toBe(1);
  });

  it("uses an invisible circular geofence with hysteresis for close inspection", () => {
    expect(resolveHiddenGiftZoomZoneUnlocked(419, false)).toBe(true);
    expect(resolveHiddenGiftZoomZoneUnlocked(421, false)).toBe(false);
    expect(resolveHiddenGiftZoomZoneUnlocked(500, true)).toBe(true);
    expect(resolveHiddenGiftZoomZoneUnlocked(561, true)).toBe(false);
  });

  it("raises the camera ceiling only near a visible gift and restores it outside", () => {
    const harness = createMapHarness();
    const controller = mountHiddenFranceGiftLayer(harness.map);
    expect(resolveHiddenFranceGiftCameraMaxZoom(harness.map, 20)).toBe(20);

    const giftSource = [...harness.sources.values()][0] as {
      data: GeoJSON.FeatureCollection<GeoJSON.Point>;
    };
    const [lng, lat] = giftSource.data.features[0].geometry.coordinates;
    harness.setCenter({ lng, lat });
    [...(harness.handlers.get("move") ?? [])].forEach((handler) => handler());

    expect(resolveHiddenFranceGiftCameraMaxZoom(harness.map, 20)).toBe(24);
    expect(harness.getMaxZoom()).toBe(24);

    harness.setCenter({ lng: 2.3522, lat: 48.8566 });
    [...(harness.handlers.get("move") ?? [])].forEach((handler) => handler());

    expect(resolveHiddenFranceGiftCameraMaxZoom(harness.map, 20)).toBe(20);
    expect(harness.getMaxZoom()).toBe(20);
    controller.remove();
  });

  it("scales only clip-space x/y around the gift anchor", () => {
    const matrix = setHiddenGiftClipSpaceScaleMatrix(new THREE.Matrix4(), 3, 0.2, -0.1);
    const anchor = new THREE.Vector4(0.4, -0.2, 0.7, 2).applyMatrix4(matrix);
    const point = new THREE.Vector4(0.8, 0.2, 0.9, 2).applyMatrix4(matrix);

    expect(anchor.x / anchor.w).toBeCloseTo(0.2);
    expect(anchor.y / anchor.w).toBeCloseTo(-0.1);
    expect(point.x / point.w).toBeCloseTo(0.8);
    expect(point.y / point.w).toBeCloseTo(0.5);
    expect(point.z / point.w).toBeCloseTo(0.45);
  });

  it("mounts as an independent custom layer with a fully invisible hit target", () => {
    const harness = createMapHarness();
    const controller = mountHiddenFranceGiftLayer(harness.map);

    expect(harness.sources).toHaveLength(1);
    expect(harness.layers).toHaveLength(2);
    const customLayer = [...harness.layers.values()].find((layer) => layer.type === "custom");
    const hitLayer = [...harness.layers.values()].find((layer) => layer.type === "circle");
    expect(customLayer).toMatchObject({ type: "custom", renderingMode: "3d" });
    expect(hitLayer).toMatchObject({
      type: "circle",
      minzoom: 17,
      paint: expect.objectContaining({
        "circle-radius": 24,
        "circle-opacity": 0,
        "circle-stroke-width": 0,
        "circle-stroke-opacity": 0,
      }),
    });

    controller.remove();
    expect(harness.layers).toHaveLength(0);
    expect(harness.sources).toHaveLength(0);
  });

  it("survives a MapLibre style replacement without duplicating resources", () => {
    const harness = createMapHarness();
    const controller = mountHiddenFranceGiftLayer(harness.map);
    const styleLoadHandler = [...(harness.handlers.get("style.load") ?? [])][0];

    harness.layers.clear();
    harness.sources.clear();
    styleLoadHandler();

    expect(harness.sources).toHaveLength(1);
    expect(harness.layers).toHaveLength(2);
    styleLoadHandler();
    expect(harness.sources).toHaveLength(1);
    expect(harness.layers).toHaveLength(2);
    controller.remove();
  });

  it("captures only a real hit and triggers the discovery callback", () => {
    vi.useFakeTimers();
    const harness = createMapHarness();
    const onActivate = vi.fn();
    const controller = mountHiddenFranceGiftLayer(harness.map, { onActivate });
    const event = new MouseEvent("click", {
      clientX: 420,
      clientY: 260,
      bubbles: true,
      cancelable: true,
    });
    const stopImmediatePropagation = vi.spyOn(event, "stopImmediatePropagation");

    harness.canvas.dispatchEvent(event);

    expect(onActivate).toHaveBeenCalledOnce();
    expect(harness.queryRenderedFeatures).toHaveBeenCalledWith(
      [420, 260],
      expect.objectContaining({ layers: expect.any(Array) }),
    );
    expect(event.defaultPrevented).toBe(true);
    expect(stopImmediatePropagation).toHaveBeenCalledOnce();
    expect(controller.getState().phase).toBe("pulse");

    controller.remove();
  });

  it("removes the model and hit target after its short dismissal", async () => {
    vi.useFakeTimers();
    const harness = createMapHarness();
    const controller = mountHiddenFranceGiftLayer(harness.map);

    const dismissed = controller.dismiss();
    await vi.advanceTimersByTimeAsync(1_000);
    await dismissed;

    expect(controller.getState()).toMatchObject({
      phase: "hidden",
      visible: false,
      interactive: false,
    });
    expect(harness.layers).toHaveLength(0);
    expect(harness.sources).toHaveLength(0);
    controller.remove();
  });

  it("cancels the startup camera motion before focusing the inspection view", () => {
    const harness = createMapHarness();
    const controller = mountHiddenFranceGiftLayer(harness.map);

    controller.focusForPreview({ duration: 0 });

    expect(harness.stop).toHaveBeenCalledBefore(harness.flyTo);
    expect(harness.flyTo).toHaveBeenCalledWith(expect.objectContaining({
      center: expect.any(Array),
      zoom: 20.4,
      duration: 0,
    }));
    expect(harness.setPaintProperty).toHaveBeenCalledWith(
      expect.any(String),
      "circle-opacity",
      0,
    );
    controller.remove();
  });

  it("flies to the hidden location from the secret search without enabling a marker", () => {
    const harness = createMapHarness();
    const controller = mountHiddenFranceGiftLayer(harness.map);

    controller.focusFromSecretSearch({ duration: 0 });

    expect(harness.stop).toHaveBeenCalledBefore(harness.flyTo);
    expect(harness.setMaxZoom).toHaveBeenCalledBefore(harness.flyTo);
    expect(harness.setMaxZoom).toHaveBeenCalledWith(24);
    expect(harness.flyTo).toHaveBeenCalledWith(expect.objectContaining({
      center: expect.any(Array),
      zoom: 21.2,
      duration: 0,
    }));
    expect(harness.setPaintProperty).toHaveBeenCalledWith(
      expect.any(String),
      "circle-opacity",
      0,
    );
    controller.remove();
  });

  it("mounts both rewards when the style becomes ready after their controllers", () => {
    const harness = createMapHarness();
    harness.setStyleLoaded(false);
    const giftController = mountHiddenFranceGiftLayer(harness.map);
    const iphoneController = mountHiddenFranceIphonePrizeLayer(harness.map);

    expect(harness.layers).toHaveLength(0);
    expect(harness.sources).toHaveLength(0);

    harness.setStyleLoaded(true);
    [...(harness.handlers.get("styledata") ?? [])].forEach((handler) => handler());

    expect(harness.sources).toHaveLength(2);
    expect(harness.layers).toHaveLength(4);

    giftController.remove();
    iphoneController.remove();
  });

  it("repairs rewards removed after a late style mutation", () => {
    const harness = createMapHarness();
    const giftController = mountHiddenFranceGiftLayer(harness.map);
    const iphoneController = mountHiddenFranceIphonePrizeLayer(harness.map);

    harness.layers.clear();
    harness.sources.clear();
    [...(harness.handlers.get("idle") ?? [])].forEach((handler) => handler());

    expect(harness.sources).toHaveLength(2);
    expect(harness.layers).toHaveLength(4);

    giftController.remove();
    iphoneController.remove();
  });

  it("mounts the shoe-box-scale iPhone as a second independent hidden reward", () => {
    const harness = createMapHarness();
    const giftController = mountHiddenFranceGiftLayer(harness.map);
    const iphoneController = mountHiddenFranceIphonePrizeLayer(harness.map);

    expect(harness.sources).toHaveLength(2);
    expect(harness.layers).toHaveLength(4);

    const iphoneSource = harness.sources.get("meewav-hidden-france-iphone-hit-source") as {
      data: GeoJSON.FeatureCollection<GeoJSON.Point, { kind: string; reward: string }>;
    };
    expect(iphoneSource.data.features[0]).toMatchObject({
      properties: { kind: "treasure", reward: "iphone" },
      geometry: { type: "Point", coordinates: [6.35775, 44.92162] },
    });
    expect(harness.layers.get("meewav-hidden-france-iphone-hit-layer")).toMatchObject({
      type: "circle",
      minzoom: 17,
      paint: expect.objectContaining({
        "circle-radius": 28,
        "circle-opacity": 0,
        "circle-stroke-width": 0,
      }),
    });

    giftController.remove();
    expect(harness.sources.has("meewav-hidden-france-iphone-hit-source")).toBe(true);
    expect(harness.layers.has("meewav-hidden-france-iphone-model")).toBe(true);
    iphoneController.remove();
    expect(harness.sources).toHaveLength(0);
    expect(harness.layers).toHaveLength(0);
  });

  it("flies to shtata000's isolated iPhone and unlocks zoom only around it", () => {
    const harness = createMapHarness();
    const controller = mountHiddenFranceIphonePrizeLayer(harness.map);
    const iphoneSource = harness.sources.get("meewav-hidden-france-iphone-hit-source") as {
      data: GeoJSON.FeatureCollection<GeoJSON.Point>;
    };
    const [lng, lat] = iphoneSource.data.features[0].geometry.coordinates;

    expect(resolveHiddenFranceGiftCameraMaxZoom(harness.map, 20)).toBe(20);
    harness.setCenter({ lng, lat });
    [...(harness.handlers.get("move") ?? [])].forEach((handler) => handler());
    expect(resolveHiddenFranceGiftCameraMaxZoom(harness.map, 20)).toBe(24);

    harness.setCenter({ lng: 2.3522, lat: 48.8566 });
    [...(harness.handlers.get("move") ?? [])].forEach((handler) => handler());
    expect(resolveHiddenFranceGiftCameraMaxZoom(harness.map, 20)).toBe(20);

    controller.focusFromSecretSearch({ duration: 0 });
    expect(harness.stop).toHaveBeenCalledBefore(harness.flyTo);
    expect(harness.flyTo).toHaveBeenCalledWith(expect.objectContaining({
      center: [6.35775, 44.92162],
      zoom: 21.4,
      duration: 0,
    }));
    controller.remove();
  });
});
