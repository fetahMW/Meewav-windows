// Adapted from sipiyou39/Meewav main aea7251a60a2b61d775901fcf39a62036fd108c4.
// supabase/functions/byteplus-token/index.ts — token format shared with iOS.
const BYTEPLUS_TOKEN_VERSION = '001'
const PRIV_PUBLISH_STREAM = 0
const PRIV_PUBLISH_AUDIO_STREAM = 1
const PRIV_PUBLISH_VIDEO_STREAM = 2
const PRIV_PUBLISH_DATA_STREAM = 3
const PRIV_SUBSCRIBE_STREAM = 4

export async function generateBytePlusToken({
  appId,
  appKey,
  roomId,
  userId,
  canPublish,
  audioOnly = false,
  expiresAt,
}: {
  appId: string
  appKey: string
  roomId: string
  userId: string
  canPublish: boolean
  audioOnly?: boolean
  expiresAt: number
}) {
  if (!/^[A-Za-z0-9_@.-]{1,128}$/.test(roomId) || !/^[A-Za-z0-9_@.-]{1,128}$/.test(userId)
    || !/^[A-Za-z0-9_-]{1,128}$/.test(appId) || !appKey
    || !Number.isInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
    throw new Error('invalid_byteplus_token_parameters')
  }
  const privileges = new Map<number, number>([
    [PRIV_SUBSCRIBE_STREAM, expiresAt],
  ])

  if (canPublish) {
    privileges.set(PRIV_PUBLISH_AUDIO_STREAM, expiresAt)
    if (!audioOnly) {
      privileges.set(PRIV_PUBLISH_STREAM, expiresAt)
      privileges.set(PRIV_PUBLISH_VIDEO_STREAM, expiresAt)
      privileges.set(PRIV_PUBLISH_DATA_STREAM, expiresAt)
    }
  }

  const message = new BytePlusTokenWriter()
    .putUint32(crypto.getRandomValues(new Uint32Array(1))[0])
    .putUint32(Math.floor(Date.now() / 1000))
    .putUint32(expiresAt)
    .putString(roomId)
    .putString(userId)
    .putUInt32Map(privileges)
    .pack()

  const signature = await hmacSha256(appKey, message)
  const content = new BytePlusTokenWriter()
    .putBytes(message)
    .putBytes(signature)
    .pack()

  return BYTEPLUS_TOKEN_VERSION + appId + base64(content)
}

class BytePlusTokenWriter {
  private bytes: number[] = []
  private encoder = new TextEncoder()

  putUint16(value: number) {
    this.bytes.push(value & 0xff, (value >>> 8) & 0xff)
    return this
  }

  putUint32(value: number) {
    this.bytes.push(
      value & 0xff,
      (value >>> 8) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 24) & 0xff,
    )
    return this
  }

  putBytes(value: Uint8Array) {
    this.putUint16(value.length)
    this.bytes.push(...value)
    return this
  }

  putString(value: string) {
    return this.putBytes(this.encoder.encode(value))
  }

  putUInt32Map(value: Map<number, number>) {
    const entries = Array.from(value.entries()).sort(([left], [right]) => left - right)
    this.putUint16(entries.length)
    for (const [key, mapValue] of entries) {
      this.putUint16(key)
      this.putUint32(mapValue)
    }
    return this
  }

  pack() {
    return new Uint8Array(this.bytes)
  }
}

async function hmacSha256(key: string, message: Uint8Array) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new Uint8Array(message)))
}

function base64(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}
