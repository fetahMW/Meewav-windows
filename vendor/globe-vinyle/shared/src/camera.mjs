// Camera math uses the laboratory globe radius (100 scene units).
// Public angles are degrees; tick time is in seconds.
const MIN_HEIGHT = 0.003;
const MAX_HEIGHT = 400;
const MAX_LATITUDE = 85;
const MIN_LOG_HEIGHT = Math.log(MIN_HEIGHT);
const MAX_LOG_HEIGHT = Math.log(MAX_HEIGHT);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback) => (Number.isFinite(value) ? value : fallback);
// Zero velocity AND zero acceleration at each endpoint.
const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10);
// Integral of smoothstep velocity: a short launch ramp, then steady travel
// and a longer soft landing. Speed and acceleration stay continuous.
const rampDistance = (t) => t * t * t * (1 - t * 0.5);
function easeQuickDeparture(t, launch) {
  const landing = 0.35;
  const distance = 1 - (launch + landing) * 0.5;
  if (t < launch) return launch * rampDistance(t / launch) / distance;
  if (t > 1 - landing) return 1 - landing * rampDistance((1 - t) / landing) / distance;
  return (t - launch * 0.5) / distance;
}
const heightFromLog = (value) =>
  value <= MIN_LOG_HEIGHT ? MIN_HEIGHT : value >= MAX_LOG_HEIGHT ? MAX_HEIGHT : Math.exp(value);

export function wrapLongitude(value) {
  if (!Number.isFinite(value)) return 0;
  return (((value % 360) + 540) % 360) - 180;
}

export function shortestLongitudeDelta(from, to) {
  return wrapLongitude(wrapLongitude(to) - wrapLongitude(from));
}

function sanitizeView(value, fallback) {
  return {
    lon: wrapLongitude(finite(value?.lon, fallback.lon)),
    // A rigid globe rotation can cross a geographic pole while staying far
    // from its own axle. Do not snap that camera frame back to latitude 85.
    lat: clamp(finite(value?.lat, fallback.lat), -90, 90),
    height: clamp(finite(value?.height, fallback.height), MIN_HEIGHT, MAX_HEIGHT),
    pitch: clamp(finite(value?.pitch, fallback.pitch || 0), 0, 75),
    bearing: wrapLongitude(finite(value?.bearing, fallback.bearing || 0)),
  };
}

function angularDistance(from, to) {
  const radians = Math.PI / 180;
  const latA = from.lat * radians;
  const latB = to.lat * radians;
  const halfLat = (latB - latA) / 2;
  const halfLon = (shortestLongitudeDelta(from.lon, to.lon) * radians) / 2;
  const haversine =
    Math.sin(halfLat) ** 2 + Math.cos(latA) * Math.cos(latB) * Math.sin(halfLon) ** 2;
  return 2 * Math.asin(Math.sqrt(clamp(haversine, 0, 1)));
}

export function createCamera(initial, reducedMotion = false) {
  const defaults = { lon: 14, lat: 24, height: 230 };
  const view = sanitizeView(initial, defaults);
  let dragging = false;
  let flight = null;
  let flightId = 0, completedFlightId = 0;

  function interrupt() {
    Object.assign(view, sanitizeView(view, defaults));
    flight = null;
    dragging = false;
  }

  return {
    view,
    interrupt,

    tick(dtSeconds) {
      Object.assign(view, sanitizeView(view, defaults));
      if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return;
      // Suspend rather than replay a background-tab pause in one visible frame.
      if (dtSeconds > 0.25) {
        dragging = false;
        return;
      }
      const dt = Math.min(dtSeconds, 0.05);
      if (flight) {
        flight.elapsed = Math.min(flight.duration, flight.elapsed + dt);
        const progress = Math.min(1, flight.elapsed / flight.duration);
        const a = flight.launchRamp ? easeQuickDeparture(progress, flight.launchRamp) : ease(progress);
        // One circular arc parameter drives both ground travel and altitude.
        // No independent arrival phase or vertical descent above the target.
        const angle = (2 * a - 1) * flight.halfArc;
        const travel = flight.arc ? clamp(0.5 + Math.sin(angle) / (2 * Math.sin(flight.halfArc)), 0, 1) : a;
        view.lon = wrapLongitude(flight.from.lon + flight.deltaLon * travel);
        view.lat = flight.from.lat + (flight.to.lat - flight.from.lat) * travel;
        view.pitch = flight.from.pitch + (flight.to.pitch - flight.from.pitch) * a;
        view.bearing = wrapLongitude(flight.from.bearing + flight.deltaBearing * a);
        const rise = flight.arc ? flight.arcRadius * (Math.cos(angle) - Math.cos(flight.halfArc)) : 0;
        view.height = flight.arc
          ? clamp(flight.from.height + (flight.to.height - flight.from.height) * travel + rise, MIN_HEIGHT, MAX_HEIGHT)
          : heightFromLog(flight.fromLogHeight + (flight.toLogHeight - flight.fromLogHeight) * a);
        if (progress >= 1 - 1e-12) {
          Object.assign(view, flight.to);
          completedFlightId = flight.id;
          flight = null;
        }
        return;
      }
    },

    drag(deltaLon, deltaLat) {
      if (!Number.isFinite(deltaLon) || !Number.isFinite(deltaLat)) return;
      interrupt();
      dragging = true;
      view.lon = wrapLongitude(view.lon + deltaLon);
      view.lat = clamp(view.lat + deltaLat, -MAX_LATITUDE, MAX_LATITUDE);
    },

    rotateTo(pose) {
      if (![pose.lon, pose.lat, pose.bearing].every(Number.isFinite)) return;
      interrupt();
      dragging = true;
      Object.assign(view, sanitizeView({ ...view, ...pose }, view));
    },

    release() {
      // Direct manipulation stops where the user leaves it, with no synthetic coast.
      dragging = false;
    },

    zoom(factor) {
      if (!Number.isFinite(factor) || factor <= 0) return;
      interrupt();
      // Consume every input immediately, including a reversal, from the displayed pose.
      view.height = heightFromLog(
        clamp(Math.log(view.height) + Math.log(factor), MIN_LOG_HEIGHT, MAX_LOG_HEIGHT),
      );
    },

    flyTo(target, durationMs = null) {
      interrupt();
      const id = ++flightId;
      const to = sanitizeView(target, view);
      if (reducedMotion || (durationMs !== null && (!Number.isFinite(durationMs) || durationMs <= 0))) {
        Object.assign(view, to);
        completedFlightId = id;
        return id;
      }
      const from = { ...view };
      const fromLogHeight = Math.log(from.height);
      const toLogHeight = Math.log(to.height);
      const chordLength = 200 * Math.sin(angularDistance(from, to) / 2);
      const retreatHeight = clamp(chordLength * 0.45, MIN_HEIGHT, MAX_HEIGHT);
      const maxEndpointHeight = Math.max(from.height, to.height);
      const distanceKm = angularDistance(from, to) * 6371;
      const cityArrival = target.cityFlight && distanceKm > 0.25;
      const countryArrival = target.countryFlight && distanceKm > 0.25;
      const globeReset = !!target.globeOverview;
      // Already above the destination: start closing the zoom immediately.
      // Reusing the city-to-city takeoff arc here partly cancels the initial
      // descent and leaves the wide country framing almost stationary.
      const descendingCityApproach = !!(target.quickDeparture && !target.localFlight
        && from.height >= 8 && from.height >= to.height * 4);
      const arcRise = Math.min(chordLength * 0.45, MAX_HEIGHT - maxEndpointHeight);
      const arc = !target.localFlight && !descendingCityApproach && !globeReset && arcRise > 0
        && (cityArrival || countryArrival || retreatHeight > maxEndpointHeight * 1.3);
      const halfArc = arc ? 2 * Math.atan2(2 * arcRise, chordLength) : 0;
      // Resetting the globe is a short reorientation, not a long city journey.
      // Include bearing/pitch corrections even when the ground center is close.
      const globeTurn = Math.max(angularDistance(from, to),
        Math.abs(shortestLongitudeDelta(from.bearing, to.bearing)) * Math.PI / 180,
        Math.abs(from.pitch - to.pitch) * Math.PI / 180);
      const automaticDuration = globeReset
        ? clamp(750 + 650 * globeTurn / Math.PI + 125 * Math.abs(toLogHeight - fromLogHeight), 900, 2200)
        : descendingCityApproach
        ? clamp(2400 + 420 * Math.log1p(distanceKm / 300)
          + 140 * Math.abs(toLogHeight - fromLogHeight), 2600, 4800)
        : target.countryFlight
        ? clamp(1800 + 450 * Math.log1p(distanceKm / 300)
          + 120 * Math.abs(toLogHeight - fromLogHeight), 2200, 4800)
        : clamp(3000 + 1200 * Math.log1p(distanceKm / 30)
          + 350 * Math.abs(toLogHeight - fromLogHeight), 3000, 9500);
      const duration = Math.max(0.001, (durationMs ?? automaticDuration) / 1000);
      flight = {
        id,
        from,
        to,
        fromLogHeight,
        toLogHeight,
        arc,
        halfArc,
        arcRadius: arc ? chordLength / (2 * Math.sin(halfArc)) : 0,
        deltaLon: shortestLongitudeDelta(from.lon, to.lon),
        deltaBearing: shortestLongitudeDelta(from.bearing, to.bearing),
        elapsed: 0,
        duration,
        // A long journey must not stretch the initial acceleration over seconds.
        // Nearby city/quarter hops retain their established short animation.
        launchRamp: globeReset ? Math.min(0.12 / duration, 0.2)
          : target.quickDeparture && !target.localFlight
          ? Math.min((descendingCityApproach ? 0.09 : 0.18) / duration, 0.2) : 0,
      };
      return id;
    },

    getCompletedFlightId() { return completedFlightId; },

    isMoving() {
      return flight !== null || dragging;
    },
    isFlying() {
      return flight !== null;
    },
  };
}
