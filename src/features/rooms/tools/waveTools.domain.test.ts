import { describe, expect, it } from "vitest";
import { createRoomToolsFixture } from "./roomTools.fixtures";
import type { WaveState, WaveSubmission } from "./roomTools.types";
import {
  appendCorrectedWaveVersion,
  assertWaveBeatIntegrity,
  canTransitionWaveLoop,
  finalizeWaveVote,
  integrateAcceptedWaveSubmission,
  normalizeWaveState,
  normalizeWaveSubmission,
  openWaveVote,
  transitionWaveSubmission,
} from "./waveTools.domain";

function submission(id = "domain-loop"): WaveSubmission {
  return {
    id,
    contributor: { id: "contributor-1", name: "Naya", avatarUrl: "", role: "viewer", microphone: "ready", camera: "ready" },
    title: "Quartz Bass",
    instrument: "Bass",
    bpm: 124,
    key: "F# mineur",
    bars: 8,
    durationSeconds: 15.48,
    fileName: `${id}.wav`,
    fileSize: 4_096,
    mimeType: "audio/wav",
    mediaPath: `room/contributor/${id}.wav`,
    submittedAt: "2026-08-22T10:00:00.000Z",
    status: "received",
    rightsConfirmed: true,
    version: 1,
    privateNotes: "",
    creditPublic: true,
    versions: [{
      version: 1,
      receivedAt: "2026-08-22T10:00:00.000Z",
      note: "Version originale",
      fileName: `${id}.wav`,
      fileSize: 4_096,
      mimeType: "audio/wav",
      mediaPath: `room/contributor/${id}.wav`,
      bpm: 124,
      key: "F# mineur",
      bars: 8,
      durationSeconds: 15.48,
    }],
  };
}

function wave(...submissions: WaveSubmission[]): WaveState {
  return {
    title: "Wave Domain",
    baseLoop: { title: "Host Base", bars: 8, bpm: 124, key: "F# mineur", kind: "Beat" },
    submissions,
    activeSubmissionId: submissions[0]?.id ?? null,
    layers: [{ id: "base", title: "Host Base", author: "Host", active: true, solo: false, muted: false }],
    playing: false,
    looping: true,
    history: [],
  };
}

function readyForVote(item: WaveSubmission) {
  normalizeWaveSubmission(item);
  transitionWaveSubmission(item, "READY_FOR_VOTE", { at: "2026-08-22T10:01:00.000Z" });
  return item;
}

describe("Wave lifecycle domain", () => {
  it("normalizes every legacy status while retaining the presentation mirror", () => {
    const fixture = createRoomToolsFixture("wave").wave!;
    normalizeWaveState(fixture);

    expect(fixture.submissions.find((item) => item.status === "accepted")?.lifecycleStatus).toBe("ACCEPTED");
    expect(fixture.submissions.find((item) => item.status === "rework")?.lifecycleStatus).toBe("NEEDS_CORRECTION");
    expect(fixture.submissions.find((item) => item.vote?.open)?.lifecycleStatus).toBe("VOTING");
    expect(fixture.submissions.every((item) => item.originalContributorId === item.contributor.id)).toBe(true);
    expect(fixture.submissions.every((item) => item.statusHistory?.length)).toBe(true);
  });

  it("exposes explicit allowed transitions and rejects lifecycle shortcuts", () => {
    expect(canTransitionWaveLoop("RECEIVED", "NEEDS_CORRECTION")).toBe(true);
    expect(canTransitionWaveLoop("READY_FOR_VOTE", "VOTING")).toBe(true);
    expect(canTransitionWaveLoop("REJECTED", "READY_FOR_VOTE")).toBe(false);
    expect(() => transitionWaveSubmission(normalizeWaveSubmission(submission()), "ACCEPTED")).toThrow(
      "wave_status_transition_forbidden:RECEIVED:ACCEPTED",
    );
  });

  it("keeps the original immutable and supersedes only its version when a correction arrives", () => {
    const item = submission();
    normalizeWaveSubmission(item);
    transitionWaveSubmission(item, "NEEDS_CORRECTION", { actorId: "host", reason: "timing" });

    appendCorrectedWaveVersion(item, {
      fileName: "domain-loop-v2.wav",
      fileSize: 5_120,
      mimeType: "audio/wav",
      mediaPath: "room/host/domain-loop-v2.wav",
      mediaUrl: undefined,
      bpm: 124,
      key: "F# mineur",
      bars: 8,
      durationSeconds: 15.5,
    }, {
      at: "2026-08-22T10:02:00.000Z",
      correctedBy: "host",
      correctionReason: "Recalage sur le premier temps",
      note: "BPM recalé",
    });

    expect(item).toMatchObject({
      version: 2,
      lifecycleStatus: "NEEDS_REVIEW",
      status: "to-review",
      contributor: { id: "contributor-1" },
      originalContributorId: "contributor-1",
    });
    expect(item.versions).toEqual([
      expect.objectContaining({ version: 1, status: "SUPERSEDED", contributorId: "contributor-1", fileName: "domain-loop.wav" }),
      expect.objectContaining({ version: 2, status: "NEEDS_REVIEW", contributorId: "contributor-1", correctedBy: "host", fileName: "domain-loop-v2.wav" }),
    ]);
    expect(item.statusHistory?.map((entry) => entry.status)).toEqual(["RECEIVED", "NEEDS_CORRECTION", "NEEDS_REVIEW"]);
  });

  it("locks one precise version and permits only one public vote at a time", () => {
    const first = readyForVote(submission("first"));
    const second = readyForVote(submission("second"));
    const state = wave(first, second);
    openWaveVote(state, first, { at: "2026-08-22T10:03:00.000Z", roundId: "round-1" });

    expect(first).toMatchObject({ lifecycleStatus: "VOTING", vote: { roundId: "round-1", submissionVersion: 1, open: true } });
    expect(() => openWaveVote(state, second, { roundId: "round-2" })).toThrow("wave_vote_already_open");
    first.version = 2;
    expect(() => finalizeWaveVote(state, first)).toThrow("wave_vote_version_mismatch");
  });

  it("finalizes atomically and idempotently, then integrates the exact accepted version", () => {
    const item = readyForVote(submission());
    const state = wave(item);
    openWaveVote(state, item, { at: "2026-08-22T10:03:00.000Z", roundId: "round-accepted" });
    item.vote!.votes = { a: "yes", b: "yes", c: "no" };

    const first = finalizeWaveVote(state, item, {
      at: "2026-08-22T10:04:00.000Z",
      finalizationKey: "close-round-accepted",
    });
    const revisionSnapshot = JSON.stringify(state);
    const retry = finalizeWaveVote(state, item, {
      at: "2026-08-22T10:05:00.000Z",
      finalizationKey: "close-round-accepted",
    });

    expect(first).toBe("accepted");
    expect(retry).toBe("accepted");
    expect(JSON.stringify(state)).toBe(revisionSnapshot);
    expect(item).toMatchObject({ lifecycleStatus: "ACCEPTED", status: "accepted", vote: { submissionVersion: 1, open: false } });
    expect(state.layers).toContainEqual(expect.objectContaining({ submissionId: item.id, submissionVersion: 1 }));
    expect(() => finalizeWaveVote(state, item, { finalizationKey: "different-command" })).toThrow("wave_vote_already_finalized");
  });

  it("returns a failed public verdict to NOT_SELECTED and never adds it to the beat", () => {
    const item = readyForVote(submission());
    const state = wave(item);
    openWaveVote(state, item, { roundId: "round-rejected" });
    item.vote!.votes = { a: "yes", b: "no", c: "no" };
    expect(finalizeWaveVote(state, item)).toBe("rejected");
    expect(item).toMatchObject({ lifecycleStatus: "NOT_SELECTED", status: "rejected" });
    expect(state.layers).toHaveLength(1);
    expect(() => integrateAcceptedWaveSubmission(state, item)).toThrow("wave_layer_public_approval_required");
  });

  it("sanitizes a legacy rejected layer and enforces beat integrity", () => {
    const item = normalizeWaveSubmission(submission());
    transitionWaveSubmission(item, "REJECTED", { reason: "rights" });
    const state = wave(item);
    state.layers.push({ id: "invalid", submissionId: item.id, title: item.title, author: item.contributor.name, active: true, solo: false, muted: false });
    normalizeWaveState(state);
    expect(state.layers).toHaveLength(1);
    expect(() => {
      state.layers.push({ id: "invalid-again", submissionId: item.id, title: item.title, author: item.contributor.name, active: true, solo: false, muted: false });
      assertWaveBeatIntegrity(state);
    }).toThrow("wave_layer_public_approval_required");
  });
});
