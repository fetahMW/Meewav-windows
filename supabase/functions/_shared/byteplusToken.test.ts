import { generateBytePlusToken } from "./byteplusToken.ts";

function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
const config = { appId: "testApp", appKey: "unit-test-only-secret", roomId: "room-123", userId: "user.456", expiresAt: Math.floor(Date.now() / 1000) + 120 };

async function decode(canPublish: boolean, audioOnly = false) {
  const token = await generateBytePlusToken({ ...config, canPublish, audioOnly });
  assert(token.startsWith("001testApp"));
  const bytes = Uint8Array.from(atob(token.slice(10)), c => c.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  const messageSize = view.getUint16(0, true);
  const message = bytes.slice(2, 2 + messageSize);
  const signatureSize = view.getUint16(messageSize + 2, true);
  const signature = bytes.slice(messageSize + 4);
  assert(signatureSize === 32 && signature.length === 32);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(config.appKey), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  assert(await crypto.subtle.verify("HMAC", key, signature, message), "Token signature does not authenticate payload");
  const data = new DataView(message.buffer);
  assert(data.getUint32(8, true) === config.expiresAt);
  let offset = 12;
  const string = () => {
    const size = data.getUint16(offset, true); offset += 2;
    const value = new TextDecoder().decode(message.slice(offset, offset + size)); offset += size;
    return value;
  };
  assert(string() === config.roomId && string() === config.userId, "Token identity mismatch");
  const count = data.getUint16(offset, true); offset += 2;
  const privileges: number[] = [];
  for (let index = 0; index < count; index++) {
    privileges.push(data.getUint16(offset, true)); offset += 2;
    assert(data.getUint32(offset, true) === config.expiresAt); offset += 4;
  }
  assert(offset === message.length);
  return privileges;
}

Deno.test("listener token is authenticated and cannot publish", async () => {
  assert(JSON.stringify(await decode(false)) === "[4]");
});
Deno.test("public publisher token grants audio/video and subscription", async () => {
  assert(JSON.stringify(await decode(true)) === "[0,1,2,3,4]");
});
Deno.test("private audio token excludes video, data and all-stream privilege", async () => {
  assert(JSON.stringify(await decode(true, true)) === "[1,4]");
});
Deno.test("invalid wire identities and expired grants are rejected", async () => {
  for (const patch of [{ userId: "legacy:colon" }, { roomId: "x".repeat(129) }, { expiresAt: 1 }, { appKey: "" }]) {
    let rejected = false;
    try { await generateBytePlusToken({ ...config, canPublish: true, ...patch }); } catch { rejected = true; }
    assert(rejected);
  }
});
