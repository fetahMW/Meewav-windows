import React, { useState, useRef, useEffect } from "react";

import { Button } from "../../web/components/ui/button";
import { createThree } from "./three-engine";
import { targetFor } from "./geo.mjs";
import { EIFFEL } from "./eiffel-landmark.mjs";
import { GlobeInterface } from "./globe-interface";
import { GLOBE_OVERVIEW } from "./saturn-ring.mjs";
import { notifyHost, requestLiveMarkers } from './host-bridge';
import GlobeLoading from '../../../meewav-vinyl/src/GlobeLoading';
import { cityArrivalTarget, countryArrivalTarget, quarterArrivalTarget } from "./navigation-presets.mjs";

const world = GLOBE_OVERVIEW;
const base = () => new URL(".", document.baseURI);
export default function App() {
  const host = useRef<HTMLDivElement>(null),
    engine = useRef<any>(null),
    data = useRef<any>(null),
    frame = useRef<any>(null),
    selection = useRef<any>(null),
    operation = useRef(0),
    previewSnapshot = useRef<any>(null);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [zoomLimit, setZoomLimit] = useState("");
  const zoomLimitRef = useRef("");
  const [selectedFeature, setSelectedFeature] = useState<any>(null);
  function navigate(feature: any = null, target: any = world, focus: any = undefined) {
    const betweenRegions = selection.current?.properties.kind === "region" && feature?.properties.kind === "region";
    selection.current = feature;
    setSelectedFeature(feature);
    engine.current?.setSelection(feature);
    const kind = feature?.properties.kind;
    const previousFocus = engine.current?.getFocus();
    const destinationFocus = focus === undefined ? kind === 'quartier'
      ? { quarterId: feature.id, cityCode: feature.properties.cityCode || '75056' }
      : kind === 'commune' ? { cityCode: feature.properties.code || feature.id.replace('fr-commune-', '') } : null : focus;
    const localQuarterFlight = destinationFocus?.quarterId && previousFocus?.cityCode === destinationFocus.cityCode
      && engine.current?.getView().height < 1;
    const countryDestination = target.countryFlight || (feature && (kind === "country" || (!kind && feature.properties.iso3)));
    const arrival = target.landmarkFlight ? target : countryDestination ? countryArrivalTarget(target)
      : destinationFocus?.quarterId ? quarterArrivalTarget(target)
      : destinationFocus?.cityCode && !destinationFocus?.quarterId ? cityArrivalTarget(target) : target;
    if (betweenRegions) {
      engine.current?.stopNavigation();
      engine.current?.setFocus(destinationFocus);
    }
    else if (localQuarterFlight) engine.current?.flyTo({ ...arrival, localFlight: true }, 1100, destinationFocus);
    else engine.current?.flyTo({ ...arrival, cityFlight: !!destinationFocus?.cityCode,
      quickDeparture: !!destinationFocus?.cityCode && !destinationFocus?.quarterId }, null, destinationFocus);
  }
  async function boot() {
    const op = ++operation.current;
    setReady(false);
    notifyHost('loading');
    setError("");
    engine.current?.destroy();
    engine.current = null;
    try {
      if (!data.current) {
        const resources = await Promise.all(
          [
            "countries.geojson",
            "sectors.geojson",
            "communes.geojson",
            "land.bin",
            "communes/index.json",
            "regions.geojson",
            "land-tiles.json",
            "labels.json",
            "cities.json",
            "quarters/index.json",
          ].map(async (name) => {
            const response = await fetch(new URL("data/" + name, base()));
            if (!response.ok) throw Error(`Le fichier du globe « ${name} » n’est pas disponible.`);
            if (name.endsWith(".bin")) return response.arrayBuffer();
            try {
              return await response.json();
            } catch {
              throw Error(`Le fichier du globe « ${name} » est illisible. Rechargez la page après sa restauration.`);
            }
          }),
        );
        data.current = {
          countries: resources[0],
          sectors: resources[1],
          communes: resources[2],
          land: resources[3],
          communeIndex: resources[4],
          regions: resources[5],
          landTiles: resources[6],
          labels: resources[7].labels,
          cities: resources[8].cities,
          quarterIndex: resources[9],
        };
      }
      if (op !== operation.current) return;
      const d = data.current;
      const markers = new URLSearchParams(location.search).get('mode') === 'real' ? await requestLiveMarkers() : null;
      if (op !== operation.current) return;
      const result = await createThree(
        host.current!,
        d.countries,
        d.sectors,
        d.communes,
        d.land,
        d.communeIndex,
        d.regions,
        d.landTiles,
        [...d.labels.filter((label: any) => label.kind !== "city"), ...d.cities],
        navigate,
        (info: any) => {
          frame.current = info;
          const limit =
            info.view.height <= 0.00300001 ? "near" : info.view.height >= 399.999 ? "far" : "";
          if (limit !== zoomLimitRef.current) {
            zoomLimitRef.current = limit;
            setZoomLimit(limit);
          }
        },
        d.quarterIndex,
        markers,
      );
      if (op !== operation.current) {
        result.destroy();
        return;
      }
      engine.current = result;
      (window as any).__meewavEngine = result;
      if (previewSnapshot.current) {
        result.restorePreviewSnapshot(previewSnapshot.current);
        result.setSelection(selection.current);
        previewSnapshot.current = null;
      } else if (new URLSearchParams(location.search).get("view") === "eiffel") {
        result.flyTo({ lon: EIFFEL.lon, lat: EIFFEL.lat, height: 0.02, pitch: 60, bearing: -35 }, 0);
      } else result.flyTo(result.getOverviewTarget("globe"), 0);
      // The host keeps the spinning record until the canvas has actually
      // rendered its first frame, including a restored artist-exploration view.
      await result.firstFrame;
      if (op !== operation.current) return;
      setReady(true);
      notifyHost('ready');
      if (new URLSearchParams(location.search).get("probe") === "1") {
        result.probeCadence().then((report) => {
          const output = document.createElement("script");
          output.type = "application/json";
          output.id = "globe-cadence-report";
          output.textContent = JSON.stringify(report);
          document.body.appendChild(output);
        });
      }
      (window as any).webkit?.messageHandlers?.globeLab?.postMessage({ type: "ready" });
    } catch (e: any) {
      if (op !== operation.current) return;
      setError(e.message || String(e));
      notifyHost('error');
      (window as any).webkit?.messageHandlers?.globeLab?.postMessage({
        type: "error",
        message: e.message,
      });
    }
  }
  useEffect(() => {
    boot();
    const activity = () => engine.current?.setActive(!document.hidden),
      native = (e: any) => engine.current?.setActive(e.detail.active);
    const sceneArrival = (event: Event) => {
      const scene = (event as CustomEvent).detail;
      if (!engine.current || !scene) return;
      navigate(null, { lon: scene.center[0], lat: scene.center[1], height: scene.singlePlate ? .07 : .008, pitch: 62 },
        { cityCode: scene.cityCode, quarterId: scene.singlePlate ? undefined : scene.zoneId });
    };
    document.addEventListener("visibilitychange", activity);
    document.addEventListener("globelab-lifecycle", native);
    document.addEventListener('globelab-scene-arrival', sceneArrival);
    return () => {
      operation.current++;
      if (import.meta.hot && engine.current) previewSnapshot.current = engine.current.getPreviewSnapshot();
      engine.current?.destroy();
      document.removeEventListener("visibilitychange", activity);
      document.removeEventListener("globelab-lifecycle", native);
      document.removeEventListener('globelab-scene-arrival', sceneArrival);
    };
  }, []);
  useEffect(() => {
    if (!ready || new URLSearchParams(location.search).get('mode') !== 'real') return;
    let cancelled = false, pending = false;
    const refresh = async () => {
      if (pending || document.hidden) return;
      pending = true;
      try { const markers = await requestLiveMarkers(); if (!cancelled) { engine.current?.setLiveMarkers(markers); setError(''); } }
      catch { if (!cancelled) { engine.current?.setLiveMarkers([]); setError('Impossible d’actualiser les profils du Globe.'); } }
      finally { pending = false; }
    };
    const visible = () => { if (!document.hidden) void refresh(); };
    const timer = window.setInterval(() => { void refresh(); }, 60_000);
    document.addEventListener('visibilitychange', visible);
    return () => { cancelled = true; clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [ready]);
  useEffect(() => {
    const context = (document as any).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: any) => {
      try {
        Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(
          console.warn,
        );
      } catch (e) {
        console.warn(e);
      }
    };
    register({
      name: "get_globe_state",
      description: "Lire la caméra et la sélection du globe local.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute() {
        return {
          engine: "three",
          ready: !!engine.current,
          sectorId: selection.current?.id || null,
          camera: frame.current?.view || null,
          moving: engine.current?.isMoving() || false,
          fps: engine.current?.getPerformance().renderFps || 0,
          drawCalls: frame.current?.drawCalls || 0,
          triangles: frame.current?.triangles || 0,
          communesLoaded: frame.current?.communesLoaded || 0,
          geographyLoading: frame.current?.geographyLoading || false,
          geographyErrors: frame.current?.geographyErrors || [],
          geographyLevel: frame.current?.geographyLevel,
          layerVisibility: frame.current?.layerVisibility,
          visibleTiles: frame.current?.visibleTiles,
          visibleSegments: frame.current?.visibleSegments,
          visibleLabels: frame.current?.visibleLabels,
          landmark: frame.current?.landmark,
          saturnRing: frame.current?.saturnRing,
          departmentsLoaded: frame.current?.departmentsLoaded,
          departmentsVisible: frame.current?.departmentsVisible,
          performance: engine.current?.getPerformance(),
          motionPerformance: engine.current?.getMotionPerformance(),
          profiles: engine.current?.getAvatarStats()?.total || 0,
          visibleProfiles: engine.current?.getAvatarStats()?.visible || 0,
        };
      },
    });
    register({
      name: "start_globe_measurement",
      description:
        "Mesurer les prochaines frames en mouvement et la latence des gestes du globe local. Réinitialise seulement les mesures temporaires, sans déplacer la caméra.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false },
      execute() {
        if (!engine.current) throw Error("Globe encore en chargement");
        engine.current.startMeasurement();
        return { status: "measuring" };
      },
    });
    register({
      name: "finish_globe_measurement",
      description:
        "Terminer la mesure locale des gestes, libérer les chronomètres GPU et lire le résultat. Ne déplace pas la caméra.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false },
      execute() {
        return engine.current?.stopMeasurement();
      },
    });
    register({
      name: "probe_globe_cadence",
      description:
        "Comparer pendant six secondes la cadence du navigateur avec et sans rendu du globe, sans déplacer la caméra. Restaure automatiquement le rendu normal.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false },
      execute() {
        if (!engine.current) throw Error("Globe encore en chargement");
        return engine.current.probeCadence();
      },
    });
    register({
      name: "start_globe_navigation",
      description:
        "Déplacer la caméra du globe vers world, france, paris ou un identifiant de territoire chargé. Utilise le même déplacement que les gestes sur le globe.",
      inputSchema: {
        type: "object",
        properties: { destination: { type: "string" } },
        required: ["destination"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute(input: any) {
        if (
          !input ||
          typeof input.destination !== "string" ||
          Object.keys(input).some((k) => k !== "destination")
        )
          throw Error("Destination invalide");
        if (!engine.current) throw Error("Globe encore en chargement");
        const preset: any = {
          world,
          france: { lon: 2.4, lat: 46.6, height: 23 },
          paris: { lon: 2.344, lat: 48.858, height: 0.26 },
        };
        const feature = [
          ...data.current.sectors.features,
          ...data.current.communes.features,
          ...data.current.regions.features,
        ].find((f: any) => f.id === input.destination);
        if (!preset[input.destination] && !feature) throw Error("Territoire inconnu");
        navigate(feature || null, preset[input.destination] || targetFor(feature));
        return { status: "started", destination: input.destination, engine: "three" };
      },
    });
    return () => lifecycle.abort();
  }, []);
  return (
    <main className="immersive-globe globe-v2-page">
      <div ref={host} className="globe-stage" />
      <GlobeInterface ready={ready} data={data.current} engine={engine} navigate={navigate} selection={selectedFeature} zoomLimit={zoomLimit} />
      {!ready && !error && window.parent === window && <GlobeLoading />}
      {error && (
        <section className="error" role="alert">
          <img className="orbit-static-fallback" src={new URL("ui/orbit-rings/reference.png", base()).href}
            alt="Image de référence des anneaux violets et bleus, affichée en attendant le retour de la scène 3D." />
          <p>{error}</p>
          <Button onClick={boot}>Réessayer</Button>
        </section>
      )}
    </main>
  );
}
