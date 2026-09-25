export const OPENDAW_VOICE_CORRECTION_FLAG = "VITE_OPENDAW_VOICE_CORRECTION_LAB" as const;

type VoiceCorrectionFlagValue = string | boolean | null | undefined;

export type VoiceCorrectionFeatureEnvironment = {
  VITE_OPENDAW_VOICE_CORRECTION_LAB?: VoiceCorrectionFlagValue;
};

function configuredEnvironment(): VoiceCorrectionFeatureEnvironment {
  return import.meta.env as unknown as VoiceCorrectionFeatureEnvironment;
}

export function resolveOpenDawVoiceCorrectionFlag(
  environment: VoiceCorrectionFeatureEnvironment = configuredEnvironment(),
): boolean {
  const value = environment[OPENDAW_VOICE_CORRECTION_FLAG];
  return value === true || value === "true";
}

/** Shared gate for the isolated lab route and the Room mixer entry. */
export function isOpenDawVoiceCorrectionEnabled(): boolean {
  return import.meta.env.MODE === "audio-lab" && resolveOpenDawVoiceCorrectionFlag();
}

export const isVoiceCorrectionLabEnabled = isOpenDawVoiceCorrectionEnabled;
export const isVoiceCorrectionRoomEntryEnabled = isOpenDawVoiceCorrectionEnabled;
