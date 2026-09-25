let localMediaSequence = 0;

export function createMarketLocalMediaId() {
  localMediaSequence += 1;
  const randomPart = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${localMediaSequence.toString(36)}`;
  return `market-media-${randomPart}-${localMediaSequence.toString(36)}`;
}
