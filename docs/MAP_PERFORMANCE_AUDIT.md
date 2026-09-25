# Map performance audit

Date: 2026-07-09

## Scope

The audit covers the canonical `/globe` map with the Charonne stress dataset:

- MapLibre map construction and cache options
- camera and premium fly paths
- avatar MVT source, layers, labels, hover and selection
- GeoJSON mutations and rendered-feature queries
- terrain, hillshade, buildings and custom Three.js landmarks
- MVT server selection, encoding and HTTP caching
- idle and two-way camera stress measurements in external Chrome

## Runtime architecture

- MapLibre GL JS: `5.24.0`
- Charonne dataset: 451 deterministic profiles served as MVT
- Avatar source: vector tiles with `promoteId` and a 128-unit buffer
- Avatar rendering: MapLibre symbol layer; no DOM or canvas avatar overlay in the canonical mode
- Charonne camera used for profiling: zoom `17.97`, pitch `60`, bearing `-55.3`
- Test canvas: `3441 x 1237` backing pixels for a `2294 x 825` CSS viewport at DPR `1.5`
- Style after patch: 83 layers, 23 sources, 36 layers active at the audited zoom

## Measured result

The same 4.8-second two-way camera path was run before and after the patch with
Chrome kept visible. WebGL calls, MapLibre renders, source mutations and frame
times were instrumented in the page.

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| `queryRenderedFeatures` calls | 39 | 8 | -79% |
| label GeoJSON `setData` calls | 33 | 2 | -94% |
| `triggerRepaint` requests | 2,102 | 1,093 | -48% |
| MapLibre render events | 542 | 433 | -20% |
| WebGL `drawElements` calls | 309,941 | 238,264 | -23% |
| WebGL `texImage2D` calls | 906 | 180 | -80% |
| Chrome script duration | 4.03 s | 3.55 s | -12% |
| Chrome JS heap after run | 254.5 MB | 130.0 MB | -49% |
| Slowest sampled frame | 54.5 ms | 36.2 ms | -34% |
| Frames over 33 ms | 2 | 1 | -50% |

Frame timing varies with the 120 Hz desktop compositor, so WebGL work and
mutation counts are the more reliable comparison. At rest, a separate 2.5-second
measurement recorded zero MapLibre renders, zero WebGL draws and zero repaint
requests.

## Patched costs

### Avatar labels

Previously, every moving-camera event scheduled a full rendered-feature query,
rebuilt a GeoJSON collection, sent it to a worker with `setData`, and wrote six
unchanged layout properties. MapLibre already reprojects stable geographic label
coordinates while the camera moves.

The patched path keeps the current label set during movement, refreshes after the
camera settles, deduplicates identical collections, and guards layout writes.
No label style or coordinate was changed.

### France focus layers

The complete region focus stack was reapplied on each zoom frame, including 13
feature-state writes, static GeoJSON replacement, filters, visibility checks and
layer ordering. It now computes a small mode signature and applies changes only
when the view, focused region or camera-derived overlay mode actually changes.
Style reloads still force a repair.

### Premium fly diagnostics

The fly handler updated unused React state on every `move` event, causing full
component renders. The React state was removed because the module already exposes
its debug snapshot. Per-move blackout sampling now runs only when camera debugging
or a state observer is explicitly enabled; a final check is still forced at landing.

### Camera and district regression pass

A second pass exercised the real district selector and Globe button rather than a
synthetic camera path.

- Charonne avatars are now hidden as soon as another selected district starts its
  fly. The selected district takes precedence over the old broad camera wake box,
  and both the symbol filter and layer visibility remain disabled after `idle`.
- Hero GLB layers are physically removed outside their valid mode. At zoom `11.8`,
  the city overview owns all 12 landmark layers. At district zoom, a selection of
  `paris_09e_chaussee_d_antin` owns only `palais-garnier-glb-landmark`; Belleville
  and Charonne own none. Non-Paris destinations use the premium-fly target context;
  `commune-39478` was verified with only the Saint-Claude Bonneville GLB present.
- Frame-by-frame `jumpTo` camera interpolation was replaced by MapLibre's native
  `flyTo` path. Fixed-duration overview transitions use a symmetric easing curve;
  geographic fly duration remains controlled by MapLibre's native flight model.
- The Globe target now accounts for MapLibre's viewport-fit minimum zoom. On the
  audited 2294 px-wide canvas the reachable value is `2.16365`, not the previous
  impossible `1.68`, eliminating the constrained tail and corrective snap.
- Pending intermediate tile requests are cancelled while zooming, matching the
  MapLibre 5.24 default and avoiding work for zoom levels crossed by a fly.

On the same local-to-Globe scenario, transition wall time fell from 6.86 s to
3.35 s, GPU-process CPU time from 9.09 s to 4.42 s, redundant projection changes
from two to zero, the slowest sampled frame from 200 ms to 139 ms, and frames over
33 ms from 13 to 8. Cold tile and GLB uploads still create a few device-dependent
spikes.

On a short premium district fly, unchanged building state previously caused 16
paint writes and four layer zoom-range writes. Both counters are now zero. The
building-rise animation still updates height and base while moving, but no longer
rewrites static opacity and gradient properties on every animation frame.

### Avatar source wakeups

The city effect forced avatar layer visibility, source refresh and repaint after
every camera end. MVT viewport changes already load the correct tiles. These
camera-end wakeups were removed; the staged wakeups used when entering city view
remain in place for style/source recovery.

### Background polling

Selected-extrusion UI state was polled every 240 ms. It now reacts to the existing
`meewav:selected-zone-extrusion-change` event plus camera settle events.

### Terrain and tile caches

The render-mode manager created a second raster DEM source with the same tiles as
the style source. It now reuses `terrain-dem-source`. The general MapLibre tile
cache was reduced from eight zoom levels to five, MapLibre's documented default.

The deterministic Charonne MVT cache now uses a five-minute server and browser TTL
instead of 30 seconds. Live/non-stress tiles keep the original 30-second policy.

## Server findings

A representative Charonne z18 tile was 1,354 bytes. Server-side selection and MVT
encoding measured about 0.3-0.6 ms after warmup; warm local requests completed in
about 2-4 ms. The backend is not the frame bottleneck. The MVT approach is retained.

A console regression pass exposed a separate synchronous API cost. Every
`/api/avatars/zone-summary` request rebuilt payloads for all 50,451 searchable
profiles and renormalized their zone fields. During a fly, requests queued behind
about 6.4 seconds of CPU work each and could delay both avatar tiles and health
checks. The nano index now owns one shared searchable payload pool, normalized zone
lookups are cached, and up to 512 zone summaries are retained with a short browser
TTL. Seven distinct cold summaries measured 11-144 ms after the patch; Charonne
still returns all 451 profiles.

The deterministic tile route also encoded GeoJSON through a new zoom-22 index for
every request and let `vt-pbf` default the layer metadata to MVT version 1. It now
projects the already-selected points directly into tile coordinates and explicitly
emits MVT version 2. A decoded Charonne tile reported version 2, extent 4096 and a
3.9 ms server time; MapLibre no longer reports a vector-tile specification warning.

## Verified good paths

- `antialias: false` and `preserveDrawingBuffer: false`
- `renderWorldCopies: false` and zero symbol fade duration
- MVT source rather than a 451-feature client GeoJSON source
- avatar icons use overlap/ignore-placement, avoiding collision work
- avatar anchor and building-occlusion rewrites are disabled in the canonical mode
- custom GLB landmarks are static and request a repaint only when their model loads
- only the overview skyline or the selected district's matching GLB stays allocated
- building extrusion layers are hidden until the product flow enables them
- hover queries are throttled and disabled during camera movement
- build succeeds and the MVT server passes Node syntax validation
- avatar hover, preprofile rendering and premium fly round-trip work after patching

## Deliberately unchanged

The DPR 1.5 canvas is the largest fixed GPU cost at roughly 4.25 million pixels per
frame. Capping `pixelRatio` would materially reduce fill cost, but it would also
reduce sharpness and requires recreating the map to change at runtime. It was not
changed because this audit preserves visible output.

The style still contains many zoom-gated and hidden layers. Only 36 of 83 are active
at the audited Charonne zoom. Removing or merging product layers could save more,
but it carries visual and interaction risk and should be handled per view with
screenshot baselines.

The production bundle remains about 2.9 MB before gzip. Code-splitting the large
map module would improve startup and compile cost, not steady-state GPU cost, and
is a separate architectural task.

## Tooling note

`npm run lint` currently scans `.tmp` Chrome profiles and vendored Draco output,
producing thousands of unrelated errors. `tsc --noEmit` also reports pre-existing
MapLibre expression typing errors across the map modules. The production build is
the reliable repository gate until lint/typecheck inputs are scoped correctly.
