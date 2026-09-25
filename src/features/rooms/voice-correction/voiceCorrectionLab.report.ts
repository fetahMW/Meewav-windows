import type { VoiceCorrectionEngineDiagnostics } from "./VoiceCorrectionEngine";
import type { VoiceCorrectionLoopbackResult } from "./voiceCorrectionLab.media";
import type { VoiceCorrectionCaptureMode } from "./voiceCorrectionLab.utils";
import type { VoiceCorrectionProviderId } from "./voiceCorrection.providers";
import {
  voiceCorrectionKeyLabel,
  voiceCorrectionScaleLabel,
  type VoiceCorrectionPresetId,
  type VoiceCorrectionSettings,
} from "./voiceCorrection.types";

export type VoiceCorrectionComparisonRoute = "dry" | "processed";

export type VoiceCorrectionLabReport = {
  schemaVersion: 2;
  generatedAt: string;
  engineProvider: VoiceCorrectionProviderId;
  labStatus: "idle" | "requesting" | "ready" | "fallback" | "error";
  selectedRoute: VoiceCorrectionComparisonRoute;
  activeProfile: VoiceCorrectionPresetId | null;
  captureMode: VoiceCorrectionCaptureMode;
  uiError: string | null;
  settings: VoiceCorrectionSettings & {
    keyLabel: string;
    scaleLabel: string;
  };
  measurements: {
    inputDb: number;
    outputDb: number;
    recordingDurationMs: number | null;
    loopback: VoiceCorrectionLoopbackResult | null;
  };
  diagnostics: VoiceCorrectionEngineDiagnostics;
};

export function resolveVoiceCorrectionComparisonRoute(options: {
  requestedRoute: VoiceCorrectionComparisonRoute;
  processedAvailable: boolean;
  diagnostics: Pick<VoiceCorrectionEngineDiagnostics, "fallbackActive" | "status">;
}): VoiceCorrectionComparisonRoute {
  if (
    options.requestedRoute === "dry"
    || !options.processedAvailable
    || options.diagnostics.fallbackActive
    || options.diagnostics.status === "fallback"
    || options.diagnostics.status === "error"
  ) return "dry";
  return "processed";
}

export function createVoiceCorrectionLabReport(options: {
  generatedAt?: Date;
  engineProvider: VoiceCorrectionProviderId;
  labStatus: VoiceCorrectionLabReport["labStatus"];
  selectedRoute: VoiceCorrectionComparisonRoute;
  activeProfile: VoiceCorrectionPresetId | null;
  captureMode: VoiceCorrectionCaptureMode;
  uiError: string | null;
  settings: VoiceCorrectionSettings;
  inputDb: number;
  outputDb: number;
  recordingDurationMs: number | null;
  loopback: VoiceCorrectionLoopbackResult | null;
  diagnostics: VoiceCorrectionEngineDiagnostics;
}): VoiceCorrectionLabReport {
  return {
    schemaVersion: 2,
    generatedAt: (options.generatedAt ?? new Date()).toISOString(),
    engineProvider: options.engineProvider,
    labStatus: options.labStatus,
    selectedRoute: options.selectedRoute,
    activeProfile: options.activeProfile,
    captureMode: options.captureMode,
    uiError: options.uiError,
    settings: {
      ...options.settings,
      keyLabel: voiceCorrectionKeyLabel(options.settings.key),
      scaleLabel: voiceCorrectionScaleLabel(options.settings.scale),
    },
    measurements: {
      inputDb: options.inputDb,
      outputDb: options.outputDb,
      recordingDurationMs: options.recordingDurationMs,
      loopback: options.loopback,
    },
    diagnostics: {
      ...options.diagnostics,
      resources: options.diagnostics.resources.map((resource) => ({ ...resource })),
    },
  };
}

export function serializeVoiceCorrectionLabReportJson(report: VoiceCorrectionLabReport) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function csvCell(value: unknown) {
  let text = value === null || value === undefined ? "" : String(value);
  if (typeof value === "string" && /^[=+\-@]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function flattenReport(value: unknown, path: string, rows: Array<[string, unknown]>) {
  if (Array.isArray(value)) {
    if (value.length === 0) rows.push([path, ""]);
    value.forEach((item, index) => flattenReport(item, `${path}[${index}]`, rows));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      flattenReport(child, path ? `${path}.${key}` : key, rows);
    }
    return;
  }
  rows.push([path, value]);
}

export function serializeVoiceCorrectionLabReportCsv(report: VoiceCorrectionLabReport) {
  const rows: Array<[string, unknown]> = [];
  flattenReport(report, "", rows);
  return ["field,value", ...rows.map(([field, value]) => `${csvCell(field)},${csvCell(value)}`)].join("\r\n") + "\r\n";
}
