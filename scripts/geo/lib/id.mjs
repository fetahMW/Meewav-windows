import { createHash } from "node:crypto";

export const MEEWAV_GEOGRAPHY_NAMESPACE = "7f8da20d-f3d2-5e73-94f2-52fda65537ce";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function uuidToBytes(uuid) {
  if (!isUuid(uuid)) {
    throw new TypeError(`Invalid UUID namespace: ${String(uuid)}`);
  }

  return Buffer.from(uuid.replaceAll("-", ""), "hex");
}

function bytesToUuid(bytes) {
  const hex = Buffer.from(bytes).toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

export function createUuidV5(name, namespace = MEEWAV_GEOGRAPHY_NAMESPACE) {
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new TypeError("A non-empty registry key is required to create a stable UUID");
  }

  const digest = createHash("sha1")
    .update(uuidToBytes(namespace))
    .update(Buffer.from(name, "utf8"))
    .digest();

  const bytes = Uint8Array.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytesToUuid(bytes);
}

export function createStableZoneId(registryKey) {
  return createUuidV5(`music-zone:${registryKey}`);
}

export function createStableAdministrativeZoneId(registryKey) {
  return createUuidV5(`administrative-zone:${registryKey}`);
}

export function createStableDatasetId(scope) {
  return createUuidV5(`dataset:${scope}`);
}
