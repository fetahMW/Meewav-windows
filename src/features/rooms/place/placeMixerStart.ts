import { placeTransportCues, type CueOrigin } from "./placeTransportCues";

export type PlaceMixerStartRequest = {
  start: () => void;
  cancel: () => void;
  signal?: AbortSignal;
  origin?: CueOrigin;
};

/** A Pad may hold the transport until its actual media clock reaches the cue. */
export function requestPlaceMixerStart(
  start: () => void,
  signal?: AbortSignal,
  onCancel?: () => void,
  origin: CueOrigin = "chrono",
) {
  let settled = false;
  const finish = (ready: boolean) => {
    if (settled) return;
    settled = true;
    signal?.removeEventListener("abort", cancel);
    if (ready && !signal?.aborted) start();
    else onCancel?.();
  };
  const cancel = () => finish(false);
  if (signal?.aborted) {
    cancel();
    return;
  }
  signal?.addEventListener("abort", cancel, { once: true });
  const detail: PlaceMixerStartRequest = { start: () => finish(true), cancel, signal, origin };
  if (placeTransportCues.claimStart(detail)) return;
  if (typeof window === "undefined") {
    detail.start();
    return;
  }
  const request = new CustomEvent("meewav:mixer-chrono-start-requested", { cancelable: true, detail });
  if (window.dispatchEvent(request)) detail.start();
}

export function waitForPlaceMixerStart(signal: AbortSignal, origin: CueOrigin = "chrono") {
  return new Promise<boolean>((resolve) => {
    requestPlaceMixerStart(() => resolve(true), signal, () => resolve(false), origin);
  });
}
