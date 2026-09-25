import type { Map as MapLibreMap } from "maplibre-gl";
import * as THREE from "three";

type MapLibreThreeRendererEntry = {
  context: WebGLRenderingContext | WebGL2RenderingContext;
  renderer: THREE.WebGLRenderer;
};

const renderers = new WeakMap<MapLibreMap, MapLibreThreeRendererEntry>();

/**
 * MapLibre owns the canvas and its WebGL context. Every Three custom layer must
 * therefore reuse the same renderer instead of creating (and disposing) one
 * renderer per landmark. Disposing a renderer backed by MapLibre's context can
 * lose the whole Globe context during a route or style transition.
 */
export function getMapLibreThreeRenderer(
  map: MapLibreMap,
  context: WebGLRenderingContext | WebGL2RenderingContext,
) {
  const current = renderers.get(map);
  if (current?.context === context) return current.renderer;

  const renderer = new THREE.WebGLRenderer({
    canvas: map.getCanvas(),
    context,
    antialias: true,
  });
  renderer.autoClear = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;

  renderers.set(map, { context, renderer });
  return renderer;
}
