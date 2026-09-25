import { describe, expect, it } from "vitest";
import { createRoomToolsFixture } from "./roomTools.fixtures";
import { reduceCommand, commandAllowed } from "./roomTools.service";
import { waveAttributedFileName } from "./waveQuarantine";

function fixture() {
  const state = createRoomToolsFixture("wave");
  const items = state.wave!.submissions.slice(0, 2);
  for (const item of items) {
    item.status = "received"; item.lifecycleStatus = "RECEIVED"; item.vote = undefined;
    item.mediaUrl = "/original.wav"; item.rightsConfirmed = true;
    item.bpm = state.wave!.baseLoop.bpm; item.key = state.wave!.baseLoop.key; item.bars = state.wave!.baseLoop.bars;
  }
  return { state, items };
}
describe("Quarantaine Wave", () => {
  it("garde plusieurs boucles hors du vote, conserve l’artiste au remplacement puis libère explicitement", () => {
    const { state, items } = fixture();
    const contributor = structuredClone(items[0].contributor), title = items[0].title;
    reduceCommand(state, { type: "wave.submissions.quarantine", submissionIds: items.map(item => item.id) }, "host");
    expect(items.every(item => item.quarantined)).toBe(true);
    expect(() => reduceCommand(state, { type: "wave.vote.open", submissionId: items[0].id, open: true })).toThrow("wave_submission_quarantined");
    const previousVersion = items[0].version;
    const filename = waveAttributedFileName(items[0], "export final.wav", previousVersion + 1);
    reduceCommand(state, { type: "wave.submission.version", submissionId: items[0].id, note: "Retouche", patch: {
      fileName: filename, fileSize: 1000, mimeType: "audio/wav", mediaUrl: "/corrected.wav", bpm: items[0].bpm, key: items[0].key, bars: items[0].bars, durationSeconds: items[0].durationSeconds,
    } }, "host");
    expect(items[0]).toMatchObject({ contributor, title, quarantined: true, version: previousVersion + 1, lifecycleStatus: "NEEDS_REVIEW", fileName: filename });
    expect(items[0].versions.find(version => version.version === previousVersion)?.status).toBe("SUPERSEDED");
    reduceCommand(state, { type: "wave.submission.status", submissionId: items[0].id, status: "analysis" }, "host");
    expect(items[0]).toMatchObject({ quarantined: false, lifecycleStatus: "READY_FOR_VOTE", contributor, title });
    expect(items[1].quarantined).toBe(true);
  });
  it("valide tout le lot avant de déplacer et réserve l’action au contrôle", () => {
    const { state, items } = fixture();
    items[1].status = "accepted"; items[1].lifecycleStatus = "ACCEPTED";
    const command = { type: "wave.submissions.quarantine" as const, submissionIds: items.map(item => item.id) };
    expect(() => reduceCommand(state, command)).toThrow("wave_submission_not_editable");
    expect(items[0].quarantined).not.toBe(true);
    expect(commandAllowed("wave", "viewer", command)).toBe(false);
    expect(commandAllowed("wave", "host", command)).toBe(true);
  });
  it("refuse une sortie au vote sans droits et produit des noms Windows attribués", () => {
    const { state, items } = fixture();
    reduceCommand(state, { type: "wave.submissions.quarantine", submissionIds: [items[0].id] });
    items[0].rightsConfirmed = false;
    expect(() => reduceCommand(state, { type: "wave.submission.status", submissionId: items[0].id, status: "analysis" })).toThrow("wave_rights_unconfirmed");
    expect(items[0].quarantined).toBe(true);
    items[0].contributor.name = "Léa / Nom: artiste";
    const name = waveAttributedFileName(items[0], "export.FLAC", 3);
    expect(name).toContain("Léa Nom artiste");
    expect(name).toMatch(/v3\.flac$/);
    expect(name).not.toMatch(/[<>:"/\\|?*]/);
  });
});
