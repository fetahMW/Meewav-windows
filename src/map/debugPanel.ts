import type { Map } from "maplibre-gl";

export function installMapDebugPanel(map: Map) {
  // Check if panel already exists
  if (document.getElementById("meewav-map-debug")) return;

  const panel = document.createElement("div");
  panel.id = "meewav-map-debug";
  panel.style.cssText = `
    position: absolute;
    left: 12px;
    bottom: 12px;
    z-index: 9999;
    padding: 8px 10px;
    border-radius: 12px;
    background: rgba(15, 8, 28, 0.72);
    color: white;
    font: 12px/1.35 system-ui, sans-serif;
    pointer-events: none;
    backdrop-filter: blur(12px);
    white-space: pre-line;
  `;

  document.body.appendChild(panel);

  function formatAltitude(meters: number) {
    if (!Number.isFinite(meters)) return "--";
    if (meters >= 1000000) return `${(meters / 1000000).toFixed(2)} Mm`;
    if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
    return `${Math.round(meters)} m`;
  }

  function getEstimatedAltitude() {
    const center = map.getCenter();
    const latitudeRad = center.lat * Math.PI / 180;
    const pitchRad = map.getPitch() * Math.PI / 180;
    const zoomScale = Math.pow(2, map.getZoom());
    const metersPerPixel = (156543.03392804097 * Math.cos(latitudeRad)) / zoomScale;
    const canvasHeight = Math.max(map.getCanvas().clientHeight, 1);
    const cameraToCenterPixels = (canvasHeight / 2) / Math.tan(0.6435011087932844 / 2);

    return Math.max(0, Math.cos(pitchRad) * cameraToCenterPixels * metersPerPixel);
  }

  function update() {
    const alt = getEstimatedAltitude();
    const center = map.getCenter();
    panel.textContent = [
      `altitude: ${formatAltitude(alt)}`,
      `zoom: ${map.getZoom().toFixed(2)}`,
      `pitch: ${map.getPitch().toFixed(0)}°`,
      `lat: ${center.lat.toFixed(6)}`,
      `lng: ${center.lng.toFixed(6)}`,
      `heading: ${map.getBearing().toFixed(1)}°`
    ].join("\n");
  }

  map.on("move", update);
  map.on("moveend", update);
  map.on("zoomend", update);
  update();
}
