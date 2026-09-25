import { describe, expect, it } from "vitest";
import type { VoiceCorrectionEngineDiagnostics } from "./VoiceCorrectionEngine";
import {
  createVoiceCorrectionLabReport,
  resolveVoiceCorrectionComparisonRoute,
  serializeVoiceCorrectionLabReportCsv,
  serializeVoiceCorrectionLabReportJson,
} from "./voiceCorrectionLab.report";

const diagnostics: VoiceCorrectionEngineDiagnostics = {
  status: "processing",
  engineReady: true,
  workletReady: true,
  crossOriginIsolated: true,
  sampleRate: 48_000,
  baseLatencyMs: 4,
  outputLatencyMs: 8,
  estimatedDspLatencyMs: 26.67,
  cpuLoadPercent: 12.5,
  inputTrackState: "live",
  outputTrackState: "live",
  bypass: false,
  monitoring: false,
  fallbackActive: false,
  fallbackReason: null,
  error: null,
  resources: [{ path: "/opendaw/engine.wasm", mediaType: "application/wasm", status: "loaded", httpStatus: 200, error: null }],
};

describe("voice correction lab report", () => {
  it("forces the dry route whenever the processed path is unavailable or in fallback", () => {
    expect(resolveVoiceCorrectionComparisonRoute({ requestedRoute: "processed", processedAvailable: false, diagnostics })).toBe("dry");
    expect(resolveVoiceCorrectionComparisonRoute({ requestedRoute: "processed", processedAvailable: true, diagnostics: { ...diagnostics, fallbackActive: true } })).toBe("dry");
    expect(resolveVoiceCorrectionComparisonRoute({ requestedRoute: "processed", processedAvailable: true, diagnostics: { ...diagnostics, status: "error" } })).toBe("dry");
    expect(resolveVoiceCorrectionComparisonRoute({ requestedRoute: "processed", processedAvailable: true, diagnostics })).toBe("processed");
  });

  it("exports the same state and measurements as structured JSON and flattened CSV", () => {
    const report = createVoiceCorrectionLabReport({
      generatedAt: new Date("2026-08-11T01:02:03.000Z"),
      engineProvider: "opendaw",
      labStatus: "ready",
      selectedRoute: "processed",
      activeProfile: "precise",
      captureMode: "music",
      uiError: null,
      settings: { enabled: true, key: 6, scale: 2, amount: 1, retune: 0.72, shift: 0, smooth: 0.45 },
      inputDb: -18.2,
      outputDb: -14.8,
      recordingDurationMs: 4_250,
      loopback: null,
      diagnostics,
    });

    expect(JSON.parse(serializeVoiceCorrectionLabReportJson(report))).toMatchObject({
      generatedAt: "2026-08-11T01:02:03.000Z",
      engineProvider: "opendaw",
      selectedRoute: "processed",
      activeProfile: "precise",
      settings: { keyLabel: "F#", scaleLabel: "Mineure", retune: 0.72, smooth: 0.45 },
      measurements: { inputDb: -18.2, outputDb: -14.8, recordingDurationMs: 4_250 },
    });
    const csv = serializeVoiceCorrectionLabReportCsv(report);
    expect(csv).toContain('"selectedRoute","processed"');
    expect(csv).toContain('"engineProvider","opendaw"');
    expect(csv).toContain('"diagnostics.resources[0].status","loaded"');
    expect(csv).toContain('"measurements.recordingDurationMs","4250"');
    expect(csv).not.toContain("[object Object]");
  });

  it("preserves the error and dry-fallback reason in an export", () => {
    const fallbackDiagnostics: VoiceCorrectionEngineDiagnostics = {
      ...diagnostics,
      status: "fallback",
      fallbackActive: true,
      fallbackReason: "worklet_failed",
      error: "Le processeur audio s’est arrêté.",
    };
    const report = createVoiceCorrectionLabReport({
      engineProvider: "meewav_test",
      labStatus: "fallback",
      selectedRoute: resolveVoiceCorrectionComparisonRoute({
        requestedRoute: "processed",
        processedAvailable: true,
        diagnostics: fallbackDiagnostics,
      }),
      activeProfile: null,
      captureMode: "music",
      uiError: "Le processeur audio s’est arrêté.",
      settings: { enabled: true, key: 0, scale: 0, amount: 1, retune: 0.5, shift: 0, smooth: 0.6 },
      inputDb: -20,
      outputDb: -72,
      recordingDurationMs: null,
      loopback: null,
      diagnostics: fallbackDiagnostics,
    });

    expect(report).toMatchObject({
      schemaVersion: 2,
      engineProvider: "meewav_test",
      labStatus: "fallback",
      selectedRoute: "dry",
      uiError: "Le processeur audio s’est arrêté.",
      diagnostics: {
        fallbackActive: true,
        fallbackReason: "worklet_failed",
        error: "Le processeur audio s’est arrêté.",
      },
    });
    const formulaSafeCsv = serializeVoiceCorrectionLabReportCsv({
      ...report,
      uiError: "=HYPERLINK(\"https://example.invalid\")",
    });
    expect(formulaSafeCsv).toContain('"uiError","\'=HYPERLINK(""https://example.invalid"")"');
  });
});
