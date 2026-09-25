import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceRoot = new URL("../../src/features/rooms/place/", import.meta.url);

test("the player propagates one UUID generation through preview, route and playback", async () => {
  const player = await readFile(new URL("PlaceMixerAudioPlayer.tsx", sourceRoot), "utf8");

  assert.match(player, /generation:\s*string/u);
  assert.match(player, /onPreviewPrepare\(\{[\s\S]*?generation,/u);
  assert.match(player, /onRouteChange\(nextRoute,\s*programGenerationRef\.current\)/u);
  assert.match(player, /onPlaybackStateChange\(playbackState,\s*programGenerationRef\.current\)/u);
});

test("the live RTC acknowledgement fails public playback closed without auto-resume", async () => {
  const player = await readFile(new URL("PlaceMixerAudioPlayer.tsx", sourceRoot), "utf8");
  const experience = await readFile(new URL("PlaceRoomExperience.tsx", sourceRoot), "utf8");

  assert.match(player, /status:\s*PlaceLiveKitStatus/u);
  assert.match(player, /musicAudible:\s*boolean/u);
  assert.match(player, /programAudio\.status === "reconnecting"/u);
  assert.match(player, /!programAudio\.musicAudible[\s\S]*programAudio\.musicGeneration !== generation/u);
  assert.match(player, /setPublicGain\(0, true\)[\s\S]*audioRef\.current\?\.pause\(\)[\s\S]*onPlaybackStateChange\("ready", generation\)/u);
  assert.match(player, /failedTransportGenerationRef\.current = null[\s\S]*const graphReady = ensureAudioGraph/u);
  assert.match(experience, /musicAudible: rtcMediaMatchesRoom && roomMedia\.musicAudible/u);
  assert.match(experience, /status: rtcMediaMatchesRoom \? roomMedia\.status : "disconnected"/u);
});

test("loaded local metadata recommits the same preview generation without changing transport state", async () => {
  const player = await readFile(new URL("PlaceMixerAudioPlayer.tsx", sourceRoot), "utf8");
  const hook = await readFile(new URL("usePlaceRoom.ts", sourceRoot), "utf8");

  assert.match(player, /onLoadedMetadata=\{[\s\S]*currentTrack\?\.localObjectUrl[\s\S]*onPreviewMetadata\(\{[\s\S]*durationSeconds,[\s\S]*generation,/u);
  assert.match(hook, /current\.route !== "preview" \|\| current\.generation !== preview\.generation/u);
  assert.match(hook, /route: current\.route,\s*playbackState: current\.playbackState,\s*previewReady: current\.previewReady,\s*generation: current\.generation/iu);
  assert.match(hook, /durationSeconds: input\.durationSeconds/u);
});

test("the live hook uses one atomic command and retains its idempotency key for retry", async () => {
  const hook = await readFile(new URL("usePlaceRoom.ts", sourceRoot), "utf8");

  assert.match(hook, /repository\.commitHostAudioState\(roomId,\s*participantId,\s*input\)/u);
  assert.match(hook, /pendingAudioCommit\.current\?\.signature === signature[\s\S]*?pendingAudioCommit\.current\.idempotencyKey/u);
  assert.doesNotMatch(hook, /repository\.setOwnPlaybackState\(/u);
  assert.doesNotMatch(hook, /repository\.setAudioLiveEnabled\(/u);
  assert.doesNotMatch(hook, /repository\.setOwnAudioPreview\(/u);
});

test("legacy fallback is limited to a missing atomic RPC and Realtime resyncs on subscribe", async () => {
  const service = await readFile(new URL("place.service.ts", sourceRoot), "utf8");

  assert.match(service, /error\.code === "PGRST202" \|\| error\.code === "42883"/u);
  assert.match(service, /if \(!isMissingHostAudioCommitRpc\(error\)\) throw error/u);
  assert.match(service, /table:\s*"room_public_audio_state_v1"/u);
  assert.match(service, /status === "SUBSCRIBED"\) onEvent\(\{ table: "realtime", eventType: "\*" \}\)/u);
});

test("the Host CAS cursor comes from its private mixer row, never the public projection", async () => {
  const service = await readFile(new URL("place.service.ts", sourceRoot), "utf8");

  assert.match(
    service,
    /privateHostAudioQuery[\s\S]*?audio_route,audio_generation,audio_revision[\s\S]*?guest_id", room\.host_id/u,
  );
  assert.match(service, /hostPlayerState = ownsHostPlayer \? \(privateHostAudioState \?\? hostMixer\) : null/u);
  assert.match(service, /audioGeneration: ownsHostPlayer \? hostPlayerState\?\.audio_generation \?\? null : null/u);
  assert.doesNotMatch(
    service,
    /room_public_audio_state_v1"\)\.select\("[^"]*(?:audio_generation|audio_revision)/u,
  );
});
