export type VoiceCorrectionHeadphoneMonitoringState =
  | "off"
  | "starting"
  | "active"
  | "interrupted";

export type VoiceCorrectionHeadphoneOutputSnapshot = {
  monitoring: boolean;
  monitoringState: VoiceCorrectionHeadphoneMonitoringState;
  outputLevel: number;
  /**
   * This only proves that the internal Web Audio monitoring bus reached its
   * final analyser. It proves neither the selected DSP nor the physical
   * headphones; the person listening must confirm those separately.
   */
  localOutputProof: "not-run" | "passed" | "failed";
};

type EnableMonitoringOptions = {
  playProofTone?: boolean;
};

const PROOF_FREQUENCY_HZ = 880;
const PROOF_DURATION_SECONDS = 0.12;
const PROOF_GAIN = 0.035;
const PROOF_DETECTION_FLOOR = 0.004;

function rms(analyser: AnalyserNode, values: Float32Array<ArrayBuffer>) {
  analyser.getFloatTimeDomainData(values);
  let sum = 0;
  for (const value of values) sum += value * value;
  return Math.min(1, Math.sqrt(sum / values.length));
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Final Web Audio output for the voice-correction lab, mirroring La Place's
 * proven direct-monitor topology without changing the Room implementation.
 *
 * The processed node is connected once to both the Room stream destination
 * and a pre-wired headphone gain. Enabling monitoring therefore never loops a
 * MediaStreamDestination back into the context and never creates a second,
 * buffered playback graph.
 */
export class VoiceCorrectionHeadphoneOutput {
  readonly streamDestination: MediaStreamAudioDestinationNode;
  readonly monitorGain: GainNode;
  readonly outputAnalyser: AnalyserNode;
  readonly monitorAnalyser: AnalyserNode;

  private readonly outputValues: Float32Array<ArrayBuffer>;
  private readonly monitorValues: Float32Array<ArrayBuffer>;
  private monitoring = false;
  private monitoringState: VoiceCorrectionHeadphoneMonitoringState = "off";
  private localOutputProof: VoiceCorrectionHeadphoneOutputSnapshot["localOutputProof"] = "not-run";
  private disposed = false;

  constructor(
    private readonly context: AudioContext,
    readonly source: AudioNode,
  ) {
    this.streamDestination = context.createMediaStreamDestination();
    this.monitorGain = context.createGain();
    this.outputAnalyser = context.createAnalyser();
    this.monitorAnalyser = context.createAnalyser();
    this.outputAnalyser.fftSize = 512;
    this.monitorAnalyser.fftSize = 512;
    this.monitorGain.gain.value = 0;

    // This is the proven La Place topology: one final source fans out to the
    // published stream and directly to the hardware destination through a
    // gain that remains connected at zero while monitoring is disabled.
    source.connect(this.outputAnalyser);
    this.outputAnalyser.connect(this.streamDestination);
    this.outputAnalyser.connect(this.monitorGain);
    this.monitorGain.connect(this.monitorAnalyser);
    this.monitorAnalyser.connect(context.destination);

    this.outputValues = new Float32Array(this.outputAnalyser.fftSize);
    this.monitorValues = new Float32Array(this.monitorAnalyser.fftSize);
  }

  get stream() {
    return this.streamDestination.stream;
  }

  get outputTrack() {
    return this.stream.getAudioTracks()[0] ?? null;
  }

  readOutputLevel() {
    return this.disposed ? 0 : rms(this.outputAnalyser, this.outputValues);
  }

  getSnapshot(): VoiceCorrectionHeadphoneOutputSnapshot {
    return {
      monitoring: this.monitoring,
      monitoringState: this.monitoringState,
      outputLevel: this.readOutputLevel(),
      localOutputProof: this.localOutputProof,
    };
  }

  async enableMonitoring(options: EnableMonitoringOptions = {}) {
    this.assertUsable();
    if (this.context.state === "suspended") await this.context.resume();
    if (this.context.state !== "running") {
      this.monitoring = false;
      this.monitoringState = "interrupted";
      throw new Error("La sortie audio du navigateur n’est pas active.");
    }

    this.monitoring = false;
    this.monitoringState = "starting";
    this.monitorGain.gain.cancelScheduledValues(this.context.currentTime);
    this.monitorGain.gain.setTargetAtTime(1, this.context.currentTime, 0.012);

    if (options.playProofTone === true) {
      try {
        await this.playAndVerifyProofTone();
        this.localOutputProof = "passed";
      } catch (error) {
        this.localOutputProof = "failed";
        this.monitorGain.gain.setValueAtTime(0, this.context.currentTime);
        this.monitoringState = "interrupted";
        throw error;
      }
    }

    this.monitoring = true;
    this.monitoringState = "active";
    return this.stream;
  }

  disableMonitoring() {
    if (!this.disposed) {
      this.monitorGain.gain.cancelScheduledValues(this.context.currentTime);
      this.monitorGain.gain.setTargetAtTime(0, this.context.currentTime, 0.01);
    }
    this.monitoring = false;
    this.monitoringState = "off";
  }

  dispose() {
    if (this.disposed) return;
    this.disableMonitoring();
    this.disposed = true;
    for (const node of [
      this.source,
      this.outputAnalyser,
      this.streamDestination,
      this.monitorGain,
      this.monitorAnalyser,
    ]) {
      try { node.disconnect(); } catch { /* Already disconnected. */ }
    }
    for (const track of this.stream.getTracks()) track.stop();
  }

  private async playAndVerifyProofTone() {
    const oscillator = this.context.createOscillator();
    const proofGain = this.context.createGain();
    oscillator.frequency.setValueAtTime(PROOF_FREQUENCY_HZ, this.context.currentTime);
    proofGain.gain.setValueAtTime(0, this.context.currentTime);
    proofGain.gain.linearRampToValueAtTime(PROOF_GAIN, this.context.currentTime + 0.012);
    proofGain.gain.setValueAtTime(PROOF_GAIN, this.context.currentTime + PROOF_DURATION_SECONDS - 0.025);
    proofGain.gain.linearRampToValueAtTime(0, this.context.currentTime + PROOF_DURATION_SECONDS);
    oscillator.connect(proofGain);
    // Inject after the DSP on purpose: this is a bus-continuity tone, not an
    // audible proof that pitch correction is working.
    proofGain.connect(this.monitorGain);
    oscillator.start();
    oscillator.stop(this.context.currentTime + PROOF_DURATION_SECONDS);

    let detected = false;
    const deadline = performance.now() + 260;
    try {
      while (performance.now() < deadline) {
        await wait(8);
        if (rms(this.monitorAnalyser, this.monitorValues) >= PROOF_DETECTION_FLOOR) {
          detected = true;
          break;
        }
      }
      if (!detected) {
        throw new Error("Le test sonore local n’a produit aucun signal sur la sortie Web Audio.");
      }
      await wait(Math.ceil(PROOF_DURATION_SECONDS * 1_000));
    } finally {
      try { oscillator.disconnect(); } catch { /* Already disconnected. */ }
      try { proofGain.disconnect(); } catch { /* Already disconnected. */ }
    }
  }

  private assertUsable() {
    if (this.disposed) throw new Error("La sortie casque locale est fermée.");
  }
}
