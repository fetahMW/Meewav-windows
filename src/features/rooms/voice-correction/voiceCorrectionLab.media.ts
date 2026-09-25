import { VoiceCorrectionTrackRouter } from "./voiceCorrectionTrackRouter";
import { selectRecordingMimeType } from "./voiceCorrectionLab.utils";

export type VoiceCorrectionRecordingResult = {
  dry: Blob;
  processed: Blob;
  durationMs: number;
};

export type VoiceCorrectionRecordingSession = {
  stop(): Promise<VoiceCorrectionRecordingResult>;
};

function audioTrack(stream: MediaStream, label: string): MediaStreamTrack {
  const track = stream.getAudioTracks()[0];
  if (!track || track.readyState === "ended") throw new Error(`${label} n’est pas disponible.`);
  return track;
}

function recorderOptions(): MediaRecorderOptions | undefined {
  const mimeType = selectRecordingMimeType();
  return mimeType ? { mimeType } : undefined;
}

function collectRecorder(recorder: MediaRecorder, chunks: Blob[]) {
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });
}

function recorderFailure(event: Event) {
  const cause = (event as Event & { error?: DOMException }).error;
  return new Error(
    cause?.message
      ? `L’enregistrement de comparaison a échoué : ${cause.message}`
      : "L’enregistrement de comparaison a échoué.",
  );
}

export function startPairedVoiceCorrectionRecording(options: {
  dryStream: MediaStream;
  processedStream: MediaStream;
  maximumDurationMs?: number;
}): VoiceCorrectionRecordingSession {
  if (typeof MediaRecorder === "undefined") throw new Error("L’enregistrement audio n’est pas pris en charge par ce navigateur.");
  const dryTrack = audioTrack(options.dryStream, "La voix originale");
  const processedTrack = audioTrack(options.processedStream, "La voix corrigée");
  if (dryTrack.id === processedTrack.id) {
    throw new Error("La comparaison refuse d’enregistrer deux fois la même piste.");
  }

  const dryChunks: Blob[] = [];
  const processedChunks: Blob[] = [];
  const selectedOptions = recorderOptions();
  const dryRecorder = new MediaRecorder(new MediaStream([dryTrack]), selectedOptions);
  const processedRecorder = new MediaRecorder(new MediaStream([processedTrack]), selectedOptions);
  collectRecorder(dryRecorder, dryChunks);
  collectRecorder(processedRecorder, processedChunks);
  let terminalError: Error | null = null;
  const handleRecorderError = (event: Event) => {
    terminalError ??= recorderFailure(event);
  };
  dryRecorder.addEventListener("error", handleRecorderError);
  processedRecorder.addEventListener("error", handleRecorderError);
  const startedAt = performance.now();
  let stopPromise: Promise<VoiceCorrectionRecordingResult> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cleanupRecorderListeners = () => {
    dryRecorder.removeEventListener("error", handleRecorderError);
    processedRecorder.removeEventListener("error", handleRecorderError);
  };

  const stop = () => {
    if (stopPromise) return stopPromise;
    stopPromise = new Promise<VoiceCorrectionRecordingResult>((resolve, reject) => {
      let stopped = 0;
      const finish = () => {
        stopped += 1;
        if (stopped < 2) return;
        cleanupRecorderListeners();
        if (terminalError) {
          reject(terminalError);
          return;
        }
        const type = dryRecorder.mimeType || processedRecorder.mimeType || "audio/webm";
        const dry = new Blob(dryChunks, { type });
        const processed = new Blob(processedChunks, { type });
        if (dry.size === 0 || processed.size === 0) {
          reject(new Error("La comparaison est vide ou incomplète. Aucun essai ABX n’a été créé."));
          return;
        }
        resolve({
          dry,
          processed,
          durationMs: Math.max(0, performance.now() - startedAt),
        });
      };
      dryRecorder.addEventListener("stop", finish, { once: true });
      processedRecorder.addEventListener("stop", finish, { once: true });
      if (dryRecorder.state !== "inactive") dryRecorder.stop(); else finish();
      if (processedRecorder.state !== "inactive") processedRecorder.stop(); else finish();
    });
    if (timer) clearTimeout(timer);
    timer = null;
    return stopPromise;
  };

  try {
    dryRecorder.start(100);
    processedRecorder.start(100);
  } catch (error) {
    cleanupRecorderListeners();
    if (dryRecorder.state !== "inactive") dryRecorder.stop();
    if (processedRecorder.state !== "inactive") processedRecorder.stop();
    throw error;
  }
  timer = setTimeout(() => { void stop().catch(() => undefined); }, options.maximumDurationMs ?? 8_000);
  return { stop };
}

function waitForIceGathering(peer: RTCPeerConnection, timeoutMs = 5_000) {
  if (peer.iceGatheringState === "complete") return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      peer.removeEventListener("icegatheringstatechange", handleChange);
      reject(new Error("La collecte ICE du test local a expiré."));
    }, timeoutMs);
    const handleChange = () => {
      if (peer.iceGatheringState !== "complete") return;
      clearTimeout(timeout);
      peer.removeEventListener("icegatheringstatechange", handleChange);
      resolve();
    };
    peer.addEventListener("icegatheringstatechange", handleChange);
  });
}

function waitForRemoteAudio(peer: RTCPeerConnection, timeoutMs = 5_000) {
  return new Promise<MediaStreamTrack>((resolve, reject) => {
    const timeout = setTimeout(() => {
      peer.removeEventListener("track", handleTrack);
      reject(new Error("Aucune piste audio distante n’a été reçue pendant le test local."));
    }, timeoutMs);
    const handleTrack = (event: RTCTrackEvent) => {
      if (event.track.kind !== "audio") return;
      clearTimeout(timeout);
      peer.removeEventListener("track", handleTrack);
      resolve(event.track);
    };
    peer.addEventListener("track", handleTrack);
  });
}

export type VoiceCorrectionRtpCounters = {
  packetsSent: number;
  bytesSent: number;
  packetsReceived: number;
  bytesReceived: number;
};

export type VoiceCorrectionLoopbackResult = {
  activeRoute: "processed";
  remoteTrackState: MediaStreamTrackState;
  before: VoiceCorrectionRtpCounters;
  after: VoiceCorrectionRtpCounters;
  delta: VoiceCorrectionRtpCounters;
};

async function readVoiceCorrectionRtpCounters(
  sender: RTCRtpSender,
  receiverPeer: RTCPeerConnection,
  remoteTrack: MediaStreamTrack,
): Promise<VoiceCorrectionRtpCounters> {
  const [senderStats, receiverStats] = await Promise.all([
    sender.getStats(),
    receiverPeer.getStats(remoteTrack),
  ]);
  let outboundFound = false;
  let inboundFound = false;
  const counters: VoiceCorrectionRtpCounters = {
    packetsSent: 0,
    bytesSent: 0,
    packetsReceived: 0,
    bytesReceived: 0,
  };
  senderStats.forEach((report) => {
    if (report.type !== "outbound-rtp" || (report.kind ?? report.mediaType) !== "audio") return;
    outboundFound = true;
    counters.packetsSent += typeof report.packetsSent === "number" ? report.packetsSent : 0;
    counters.bytesSent += typeof report.bytesSent === "number" ? report.bytesSent : 0;
  });
  receiverStats.forEach((report) => {
    if (report.type !== "inbound-rtp" || (report.kind ?? report.mediaType) !== "audio") return;
    inboundFound = true;
    counters.packetsReceived += typeof report.packetsReceived === "number" ? report.packetsReceived : 0;
    counters.bytesReceived += typeof report.bytesReceived === "number" ? report.bytesReceived : 0;
  });
  if (!outboundFound || !inboundFound) {
    throw new Error("Les statistiques RTP audio du test local ne sont pas disponibles dans ce navigateur.");
  }
  return counters;
}

async function waitForVoiceCorrectionRtpCounters(
  sender: RTCRtpSender,
  receiverPeer: RTCPeerConnection,
  remoteTrack: MediaStreamTrack,
  timeoutMs = 3_000,
) {
  const deadline = performance.now() + timeoutMs;
  let lastError: unknown;
  do {
    try {
      return await readVoiceCorrectionRtpCounters(sender, receiverPeer, remoteTrack);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  } while (performance.now() < deadline);
  throw lastError instanceof Error
    ? lastError
    : new Error("Les statistiques RTP audio du test local ne sont pas devenues disponibles.");
}

export function calculateVoiceCorrectionRtpProgress(
  before: VoiceCorrectionRtpCounters,
  after: VoiceCorrectionRtpCounters,
) {
  const delta: VoiceCorrectionRtpCounters = {
    packetsSent: after.packetsSent - before.packetsSent,
    bytesSent: after.bytesSent - before.bytesSent,
    packetsReceived: after.packetsReceived - before.packetsReceived,
    bytesReceived: after.bytesReceived - before.bytesReceived,
  };
  if (Object.values(delta).some((value) => value <= 0)) {
    throw new Error(
      "La piste corrigée a remplacé la piste originale, mais le trafic RTP audio n’a pas progressé après le basculement.",
    );
  }
  return { before, after, delta };
}

/** Local technical proof of the same replaceTrack boundary used by a Room. */
export async function runVoiceCorrectionLoopbackProof(options: {
  dryStream: MediaStream;
  processedStream: MediaStream;
}): Promise<VoiceCorrectionLoopbackResult> {
  if (typeof RTCPeerConnection === "undefined") throw new Error("WebRTC n’est pas pris en charge par ce navigateur.");
  const dryTrack = audioTrack(options.dryStream, "La piste originale");
  const processedTrack = audioTrack(options.processedStream, "La piste corrigée");
  const senderPeer = new RTCPeerConnection();
  const receiverPeer = new RTCPeerConnection();
  const sender = senderPeer.addTrack(dryTrack, new MediaStream([dryTrack]));
  const remoteTrackPromise = waitForRemoteAudio(receiverPeer);
  void remoteTrackPromise.catch(() => undefined);
  const router = new VoiceCorrectionTrackRouter({ sender, dryTrack, processedTrack });

  try {
    await senderPeer.setLocalDescription(await senderPeer.createOffer());
    await waitForIceGathering(senderPeer);
    const gatheredOffer = senderPeer.localDescription;
    if (!gatheredOffer) throw new Error("L’offre WebRTC locale n’a pas été créée.");
    await receiverPeer.setRemoteDescription(gatheredOffer);
    await receiverPeer.setLocalDescription(await receiverPeer.createAnswer());
    await waitForIceGathering(receiverPeer);
    const gatheredAnswer = receiverPeer.localDescription;
    if (!gatheredAnswer) throw new Error("La réponse WebRTC locale n’a pas été créée.");
    await senderPeer.setRemoteDescription(gatheredAnswer);
    const remoteTrack = await remoteTrackPromise;
    await router.useDry();
    const before = await waitForVoiceCorrectionRtpCounters(sender, receiverPeer, remoteTrack);
    const diagnostics = await router.useProcessed();
    if (diagnostics.activeRoute !== "processed") {
      throw new Error(diagnostics.lastError ?? "La piste corrigée n’a pas remplacé la piste originale.");
    }

    await new Promise((resolve) => setTimeout(resolve, 350));
    const after = await readVoiceCorrectionRtpCounters(sender, receiverPeer, remoteTrack);
    const progress = calculateVoiceCorrectionRtpProgress(before, after);
    return {
      activeRoute: "processed",
      remoteTrackState: remoteTrack.readyState,
      ...progress,
    };
  } finally {
    await router.dispose();
    senderPeer.close();
    receiverPeer.close();
  }
}
