import {
  AUDIO_ENGINE_API_MAJOR,
  AUDIO_ENGINE_WEB_CLIENT_VERSION,
  type AudioEngineCompatibility,
  type AudioEngineHealth,
} from "./audioEngine.types";

type ParsedVersion = { major: number; minor: number; patch: number };

function parseVersion(value: string): ParsedVersion | null {
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?(?:[-+][0-9A-Za-z.-]+)?$/.exec(value.trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3] ?? 0),
  };
}

function compareVersions(left: ParsedVersion, right: ParsedVersion) {
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  return left.patch - right.patch;
}

export function checkAudioEngineCompatibility(health: AudioEngineHealth): AudioEngineCompatibility {
  const api = parseVersion(health.apiVersion);
  const webClient = parseVersion(AUDIO_ENGINE_WEB_CLIENT_VERSION);
  const minimum = parseVersion(health.minWebClientVersion);
  const maximum = health.maxWebClientVersion ? parseVersion(health.maxWebClientVersion) : null;

  if (!api || !webClient || !minimum || (health.maxWebClientVersion && !maximum)) {
    return {
      compatible: false,
      code: "invalid_version",
      reason: "Le moteur local a renvoyé un contrat de version invalide.",
    };
  }
  if (api.major !== AUDIO_ENGINE_API_MAJOR) {
    return {
      compatible: false,
      code: "api_major_mismatch",
      reason: `API locale ${health.apiVersion} incompatible avec le client Web v${AUDIO_ENGINE_API_MAJOR}.x.`,
    };
  }
  if (compareVersions(webClient, minimum) < 0) {
    return {
      compatible: false,
      code: "client_too_old",
      reason: `MeeWav Web ${AUDIO_ENGINE_WEB_CLIENT_VERSION} doit être mis à jour (minimum ${health.minWebClientVersion}).`,
    };
  }
  if (maximum && compareVersions(webClient, maximum) > 0) {
    return {
      compatible: false,
      code: "client_too_new",
      reason: `MeeWav Audio Engine doit être mis à jour (client maximal ${health.maxWebClientVersion}).`,
    };
  }
  return {
    compatible: true,
    code: "compatible",
    reason: `MeeWav Audio Engine ${health.engineVersion} est compatible.`,
  };
}
