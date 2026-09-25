import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const MEDIA_ROOT = "public/media/preprofile-demo";
const MANIFEST_PATH = path.join(MEDIA_ROOT, "media-license-manifest.json");

async function readManifest() {
  return JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
}

test("the avatar demo catalog ships two licensed local audios and two local videos", async () => {
  const manifest = await readManifest();

  assert.equal(manifest.provider, "Mixkit");
  assert.match(manifest.usageNote, /Royalty-free demo content/u);
  assert.equal(manifest.items.length, 4);
  assert.equal(manifest.items.filter(({ type }) => type === "audio").length, 2);
  assert.equal(manifest.items.filter(({ type }) => type === "video").length, 2);

  let totalBytes = 0;
  for (const item of manifest.items) {
    assert.match(item.sourcePage, /^https:\/\/mixkit\.co\//u);
    assert.match(item.originalFile, /^https:\/\/assets\.mixkit\.co\//u);
    assert.match(item.licenseName, /^Mixkit Stock (?:Music|Video) Free License$/u);
    assert.match(item.licenseUrl, /^https:\/\/mixkit\.co\/license\/#(?:musicFree|videoFree)$/u);
    assert.ok(Number.isInteger(item.mixkitItemId));
    assert.ok(item.title);
    assert.ok(item.creator);
    assert.ok(item.durationSeconds > 0);

    const localPath = path.join(MEDIA_ROOT, item.file);
    const localStat = await stat(localPath);
    assert.ok(localStat.size > 0, `${item.file} must not be empty`);
    assert.ok(localStat.size < 5 * 1024 * 1024, `${item.file} must remain lighter than 5 MB`);
    totalBytes += localStat.size;

    const digest = createHash("sha256")
      .update(await readFile(localPath))
      .digest("hex")
      .toUpperCase();
    assert.equal(digest, item.sha256, `${item.file} must match the licensed source recorded in the manifest`);
  }

  assert.ok(totalBytes < 10 * 1024 * 1024, "the complete popup media demo must remain lighter than 10 MB");
});

test("every generated avatar receives the same local demo media catalog", async () => {
  const source = await readFile(
    "src/features/globe/components/preProfile/demoPreProfileArtist.ts",
    "utf8",
  );

  assert.match(source, /mediaUrl:\s*string/u);
  assert.match(source, /export const DEMO_PREPROFILE_SHORTS/u);
  assert.match(source, /export const DEMO_PREPROFILE_AUDIOS/u);
  assert.match(source, /mediaUrl:\s*"\/media\/preprofile-demo\/dj-turntable\.mp4"/u);
  assert.match(source, /mediaUrl:\s*"\/media\/preprofile-demo\/female-guitarist\.mp4"/u);
  assert.match(source, /mediaUrl:\s*"\/media\/preprofile-demo\/tech-house-vibes\.mp3"/u);
  assert.match(source, /mediaUrl:\s*"\/media\/preprofile-demo\/hazy-after-hours\.mp3"/u);
  assert.match(
    source,
    /getPreProfileArtistForSeed[\s\S]*shorts:\s*DEMO_PREPROFILE_SHORTS,[\s\S]*audios:\s*DEMO_PREPROFILE_AUDIOS/u,
  );
});

test("the popup uses one lazy audio player and one interaction-triggered video player", async () => {
  const source = await readFile(
    "src/features/globe/components/preProfile/HoverPreProfileContent.tsx",
    "utf8",
  );

  assert.equal(source.match(/<audio\b/gu)?.length, 1);
  assert.equal(source.match(/<video\b/gu)?.length, 1);
  assert.match(source, /<audio[\s\S]{0,500}preload="metadata"/u);
  assert.match(source, /<video[\s\S]{0,500}preload="metadata"/u);
  assert.match(source, /<video[\s\S]{0,500}playsInline/u);
  assert.match(source, /activeShort\.mediaUrl/u);
  assert.match(source, /activeAudio\.mediaUrl/u);
  assert.match(source, /const baseShortRailItems = sourceShorts\.map/u);
  assert.match(source, /const baseAudioRailItems = sourceAudios\.map/u);
  assert.doesNotMatch(source, /Array\.from\(\{ length: 6 \}/u);
  assert.match(source, /onConsult\?\.\(artist\.id, "video"\)/u);
  assert.match(source, /onConsult\?\.\(artist\.id, "audio"\)/u);
});
