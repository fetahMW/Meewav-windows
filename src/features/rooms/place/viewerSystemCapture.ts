type CaptureTrack = MediaStreamTrack & {
  getCaptureHandle?: () => { handle?: string; origin?: string } | null;
};
const HANDLE = "meewav-room-audio";
export function canCaptureViewerSystemAudio() {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getDisplayMedia) &&
    /Chrome|Chromium|Edg\//.test(navigator.userAgent) &&
    !/Android|iPhone|iPad|Mobile/.test(navigator.userAgent)
  );
}
export function markMeeWavCaptureSurface() {
  const devices = navigator.mediaDevices as MediaDevices & {
    setCaptureHandleConfig?: (config: unknown) => void;
  };
  try {
    devices?.setCaptureHandleConfig?.({
      handle: HANDLE,
      exposeOrigin: true,
      permittedOrigins: ["*"],
    });
  } catch {
    /* Unsupported embedded context. */
  }
}
export function isSafeViewerCapture(stream: MediaStream) {
  const video = stream.getVideoTracks()[0] as CaptureTrack | undefined;
  const handle = video?.getCaptureHandle?.();
  return (
    video?.getSettings().displaySurface === "browser" &&
    handle?.handle !== HANDLE &&
    !/meewav/i.test(video.label) &&
    stream.getAudioTracks().some((track) => track.readyState === "live")
  );
}
export async function captureViewerSystemAudio() {
  if (!canCaptureViewerSystemAudio())
    throw new Error(
      "La capture audio d’onglet n’est pas disponible dans ce navigateur.",
    );
  const options = {
    video: { displaySurface: "browser" },
    audio: { echoCancellation: false, suppressLocalAudioPlayback: true },
    selfBrowserSurface: "exclude",
    systemAudio: "exclude",
    monitorTypeSurfaces: "exclude",
    surfaceSwitching: "exclude",
  };
  const stream = await navigator.mediaDevices.getDisplayMedia(options);
  if (!isSafeViewerCapture(stream)) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error(
      "Choisissez un autre onglet avec le partage audio activé. MeeWav et le son global de l’ordinateur sont exclus pour éviter un écho.",
    );
  }
  return stream;
}
