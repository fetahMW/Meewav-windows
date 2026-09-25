import { describe, expect, it, vi } from "vitest";
import { createRoomToolsFixture } from "./roomTools.fixtures";
import { DemoRoomToolsRepository, canOpenSpecializedRoom, reduceCommand } from "./roomTools.service";
import type { RoomToolsCommand, SpecializedRoomId, WaveSubmission } from "./roomTools.types";

function repository(room: SpecializedRoomId) {
  return { repository: new DemoRoomToolsRepository(), roomId: `test-${room}-${crypto.randomUUID()}` };
}

describe("room tools fixtures", () => {
  it("provides investor-ready data volumes", () => {
    expect(createRoomToolsFixture("scene").scene?.program).toHaveLength(6);
    expect(createRoomToolsFixture("scene").scene?.prompter.texts).toHaveLength(3);
    expect(createRoomToolsFixture("classe").classe?.seats).toHaveLength(24);
    expect(createRoomToolsFixture("classe").classe?.seats.filter((seat) => seat.person)).toHaveLength(19);
    expect(createRoomToolsFixture("classe").classe?.seats.filter((seat) => seat.person && seat.status !== "disconnected")).toHaveLength(19);
    expect(createRoomToolsFixture("classe").classe?.raisedHands).toHaveLength(3);
    expect(createRoomToolsFixture("classe").classe?.questions).toHaveLength(6);
    expect(createRoomToolsFixture("classe").classe?.resources).toEqual([]);
    expect(createRoomToolsFixture("wave").wave?.submissions).toHaveLength(36);
    expect(createRoomToolsFixture("wave").wave?.layers).toHaveLength(1);
    expect(createRoomToolsFixture("cage").cage?.matches).toHaveLength(15);
    expect(new Set(createRoomToolsFixture("cage").cage?.matches.slice(0, 8).flatMap((match) => [match.competitorA.id, match.competitorB.id])).size).toBe(16);
    expect(createRoomToolsFixture("loge").loge?.questions).toHaveLength(6);
    expect(createRoomToolsFixture("loge").loge?.moments.filter((moment) => moment.kind === "dedication")).toHaveLength(3);
  });
});

describe("La Scène", () => {
  it("reopens a finished evaluation without losing responses and keeps upcoming evaluations closed", async () => {
    const { repository: repo, roomId } = repository("scene");
    const initial = await repo.load("scene", roomId);
    const count = initial.scene!.evaluation.byPerformance["perf-6"].responseCount;
    let state = await repo.execute("scene", roomId, "host", { type: "scene.evaluation.configure", performanceId: "perf-6", enabled: false });
    expect(state.scene!.evaluation.byPerformance["perf-6"].open).toBe(false);
    state = await repo.execute("scene", roomId, "host", { type: "scene.evaluation.configure", performanceId: "perf-6", enabled: true });
    expect(state.scene!.evaluation.byPerformance["perf-6"]).toMatchObject({ open: true, responseCount: count });
    state = await repo.execute("scene", roomId, "host", { type: "scene.evaluation.configure", performanceId: "perf-2", enabled: true });
    expect(state.scene!.evaluation.byPerformance["perf-2"].open).toBe(false);
  });

  it("opens evaluation for a new passage when the Host advances to the next passage", () => {
    const state = createRoomToolsFixture("scene");
    const first = state.scene!.program[0];
    first.evaluationEnabled = true;
    delete state.scene!.evaluation.byPerformance[first.id];
    reduceCommand(state, { type: "scene.program.status", entryId: "perf-2", status: "live" });
    expect(first.status).toBe("done");
    expect(state.scene!.evaluation.byPerformance[first.id]).toMatchObject({ open: true, responseCount: 0 });
    expect(state.scene!.program.filter(entry => entry.status === "live").map(entry => entry.id)).toEqual(["perf-2"]);
  });

  it("projects a Host program change to a second Viewer client without leaking the Prompter", async () => {
    const { repository: repo, roomId } = repository("scene");
    const viewerSignal = vi.fn();
    const subscription = repo.subscribe("scene", roomId, viewerSignal);
    await repo.execute("scene", roomId, "host", { type: "scene.program.status", entryId: "perf-2", status: "live" });
    expect(viewerSignal).toHaveBeenCalledOnce();
    const projected = viewerSignal.mock.calls[0][0];
    expect(projected.scene.program.find((entry: { id: string }) => entry.id === "perf-2")?.status).toBe("live");
    expect(projected.scene.prompter.texts).toEqual([]);
    expect(JSON.stringify(projected)).not.toContain("La ville s'endort");
    subscription.unsubscribe();
  });

  it("plays, pauses, navigates markers and reorders the program", async () => {
    const { repository: repo, roomId } = repository("scene");
    await repo.execute("scene", roomId, "host", { type: "scene.prompter.patch", patch: { playing: true, line: 2 } });
    let state = await repo.execute("scene", roomId, "host", { type: "scene.prompter.patch", patch: { playing: false } });
    expect(state.scene?.prompter).toMatchObject({ playing: false, line: 2 });
    state = await repo.execute("scene", roomId, "host", { type: "scene.prompter.marker", markerId: "m-3" });
    expect(state.scene?.prompter.line).toBe(4);
    state = await repo.execute("scene", roomId, "host", { type: "scene.program.move", entryId: "perf-2", direction: -1 });
    expect(state.scene?.program[0].id).toBe("perf-2");
  });

  it("never exposes prompter text in the public projection", async () => {
    const { repository: repo, roomId } = repository("scene");
    const projection = await repo.publicProjection("scene", roomId);
    expect(projection.scene?.prompter.texts).toEqual([]);
    expect(JSON.stringify(projection)).not.toContain("La ville s'endort");
  });

  it("projects only the assigned text to an artist and no text to a viewer", async () => {
    const { repository: repo, roomId } = repository("scene");
    const viewer = await repo.projectionForRole("scene", roomId, "viewer", "viewer-1");
    const artist = await repo.projectionForRole("scene", roomId, "artist", "scene-a");
    expect(viewer.scene?.prompter.texts).toEqual([]);
    expect(artist.scene?.prompter.texts.map((text) => text.id)).toEqual(["text-1"]);
    expect(JSON.stringify(viewer)).not.toContain("La ville s'endort");
    expect(viewer.scene?.prompter).toMatchObject({ playing: false, line: 0, fontSize: 0 });
    expect(JSON.stringify(viewer)).not.toContain('"access"');
  });

  it("opens evaluation only after the performance, accepts one voluntary response and keeps private results private", async () => {
    const { repository: repo, roomId } = repository("scene");
    await repo.execute("scene", roomId, "viewer", { type: "scene.evaluation.cast", performanceId: "perf-6", accountId: "viewer-eval", rating: 5, reactions: ["energy", "presence"] }, "viewer-eval");
    await expect(repo.execute("scene", roomId, "viewer", { type: "scene.evaluation.cast", performanceId: "perf-6", accountId: "viewer-eval", rating: 4, reactions: [] }, "viewer-eval")).rejects.toThrow("scene_evaluation_already_submitted");
    await expect(repo.execute("scene", roomId, "viewer", { type: "scene.evaluation.cast", performanceId: "perf-1", accountId: "viewer-other", rating: 4, reactions: [] }, "viewer-other")).rejects.toThrow("scene_evaluation_unavailable");

    const viewer = await repo.projectionForRole("scene", roomId, "viewer", "viewer-eval");
    const privateResult = viewer.scene!.evaluation.byPerformance["perf-6"];
    expect(viewer.scene?.evaluation.viewerCompletedPerformanceIds).toContain("perf-6");
    expect(Object.keys(privateResult.responses)).toEqual(["viewer-eval"]);
    expect(privateResult.ratingTotal).toBe(0);
    expect(privateResult.reactionCounts).toEqual({ energy: 0, presence: 0, originality: 0, mastery: 0 });

    const host = await repo.projectionForRole("scene", roomId, "host", "host-profile");
    expect(host.scene?.evaluation.byPerformance["perf-6"]).toMatchObject({ responseCount: 9, ratingTotal: 41 });
  });

  it("does not let the Scene fundraiser invent payment totals", async () => {
    const { repository: repo, roomId } = repository("scene");
    const before = await repo.projectionForRole("scene", roomId, "host", "host-profile");
    const state = await repo.execute("scene", roomId, "host", { type: "scene.fundraiser.patch", patch: { title: "Captation indépendante", targetAmount: 3200, status: "live", visibleInLive: true } });
    expect(state.scene?.fundraiser).toMatchObject({ collectedAmount: before.scene?.fundraiser.collectedAmount, contributionCount: before.scene?.fundraiser.contributionCount, paymentAvailable: false });
  });
});

describe("La Classe", () => {
  it("synchronizes hands and speaking rights between teacher, Host view and participant view", async () => {
    const { repository: repo, roomId } = repository("classe");
    const viewerSignal = vi.fn();
    const subscription = repo.subscribe("classe", roomId, viewerSignal);
    await repo.execute("classe", roomId, "teacher", { type: "classe.hands.open", open: true });
    await repo.execute("classe", roomId, "premium_participant", { type: "classe.hand.raise", personId: "class-08" }, "class-08");
    expect(viewerSignal.mock.calls[viewerSignal.mock.calls.length - 1]?.[0].classe.raisedHands.some((hand: { personId: string }) => hand.personId === "class-08")).toBe(true);
    const hostState = await repo.load("classe", roomId);
    expect(hostState.classe?.raisedHands.some((hand) => hand.personId === "class-08")).toBe(true);
    await repo.execute("classe", roomId, "teacher", { type: "classe.speaker", personId: "class-08" });
    const participant = await repo.projectionForRole("classe", roomId, "premium_participant", "class-08");
    expect(participant.classe?.activeSpeakerId).toBe("class-08");
    expect(participant.classe?.seats.find((seat) => seat.person?.id === "class-08")?.canSpeak).toBe(true);
    subscription.unsubscribe();
  });

  it("never projects another participant's payment/access or media permissions", async () => {
    const { repository: repo, roomId } = repository("classe");
    const state = await repo.projectionForRole("classe", roomId, "premium_participant", "class-01");
    expect(JSON.stringify(state)).not.toContain('"access"');
    expect(state.classe?.seats.find((seat) => seat.person?.id === "class-01")?.canSpeak).toBe(true);
    expect(state.classe?.seats.filter((seat) => seat.person?.id !== "class-01").every((seat) => !seat.canSpeak && !seat.canShareScreen)).toBe(true);
  });
  it("enforces access, hand locks, speaking and lowering", async () => {
    const { repository: repo, roomId } = repository("classe");
    await expect(repo.execute("classe", roomId, "viewer", { type: "classe.hand.raise", personId: "class-01" })).rejects.toThrow("room_tool_forbidden");
    let state = await repo.execute("classe", roomId, "premium_participant", { type: "classe.hand.raise", personId: "class-08" }, "class-08");
    expect(state.classe?.raisedHands.some((hand) => hand.personId === "class-08")).toBe(true);
    state = await repo.execute("classe", roomId, "teacher", { type: "classe.speaker", personId: "class-02" });
    expect(state.classe?.activeSpeakerId).toBe("class-02");
    expect(state.classe?.seats.find((seat) => seat.person?.id === "class-02")?.canSpeak).toBe(true);
    state = await repo.execute("classe", roomId, "teacher", { type: "classe.hands.open", open: false });
    expect(state.classe?.handsOpen).toBe(false);
    expect(state.classe?.raisedHands).toHaveLength(0);
    expect(state.classe?.seats.every((seat) => !seat.handRaised)).toBe(true);
    expect(state.classe?.seats.every((seat) => seat.status !== "hand-raised")).toBe(true);
    expect(state.classe?.activeSpeakerId).toBe("class-02");
    expect(state.classe?.seats.find((seat) => seat.person?.id === "class-02")?.canSpeak).toBe(true);
    await expect(repo.execute("classe", roomId, "premium_participant", { type: "classe.hand.raise", personId: "class-03" }, "class-03")).rejects.toThrow("class_hands_closed");
  });

  it("keeps the 24 seat permission model distinct from the mixer", async () => {
    const { repository: repo, roomId } = repository("classe");
    const state = await repo.execute("classe", roomId, "teacher", { type: "classe.seat.patch", seat: 2, patch: { canShareScreen: true, canSpeak: false } });
    expect(state.classe?.seats).toHaveLength(24);
    expect(state.classe?.seats[1]).toMatchObject({ canShareScreen: true, canSpeak: false });
  });

  it("accepts questions from the 24 places and counts one private support per student", async () => {
    const { repository: repo, roomId } = repository("classe");
    const author = createRoomToolsFixture("classe").classe!.seats.find((seat) => seat.person?.id === "class-08")!.person!;
    const question = { id: "class-question-live", author, text: "  Peux-tu refaire ce passage ?  ", status: "pending" as const, sentAt: new Date().toISOString(), supports: 99, supporterIds: ["forged"] };
    let state = await repo.execute("classe", roomId, "premium_participant", { type: "classe.question.add", question }, "class-08");
    expect(state.classe?.questions?.find((item) => item.id === question.id)).toMatchObject({ text: "Peux-tu refaire ce passage ?", supports: 0, supporterIds: [] });
    state = await repo.execute("classe", roomId, "premium_participant", { type: "classe.question.support", questionId: question.id, accountId: "class-09" }, "class-09");
    expect(state.classe?.questions?.find((item) => item.id === question.id)).toMatchObject({ supports: 1, supporterIds: ["class-09"] });
    await expect(repo.execute("classe", roomId, "premium_participant", { type: "classe.question.support", questionId: question.id, accountId: "class-09" }, "class-09")).rejects.toThrow("class_question_already_supported");
    await expect(repo.execute("classe", roomId, "premium_participant", { type: "classe.question.support", questionId: question.id, accountId: "class-08" }, "class-08")).rejects.toThrow("class_question_self_support");
    state = await repo.execute("classe", roomId, "teacher", { type: "classe.questions.open", open: false });
    expect(state.classe?.questionsOpen).toBe(false);
    await expect(repo.execute("classe", roomId, "premium_participant", { type: "classe.question.support", questionId: question.id, accountId: "class-10" }, "class-10")).rejects.toThrow("class_questions_closed");
  });

  it("projects only a student's own support and private conversation target", async () => {
    const { repository: repo, roomId } = repository("classe");
    await repo.execute("classe", roomId, "teacher", { type: "classe.private", personId: "class-06" });
    const target = await repo.projectionForRole("classe", roomId, "premium_participant", "class-06");
    const other = await repo.projectionForRole("classe", roomId, "premium_participant", "class-07");
    expect(target.classe?.privateTalkStudentId).toBe("class-06");
    expect(other.classe?.privateTalkStudentId).toBeNull();
    const votedQuestion = target.classe?.questions?.find((question) => question.supporterIds.includes("class-06"));
    expect(votedQuestion?.supporterIds).toEqual(["class-06"]);
    expect(other.classe?.questions?.every((question) => question.supporterIds.every((id) => id === "class-07"))).toBe(true);
  });

  it("lets only the teacher publish validated downloadable resources", async () => {
    const { repository: repo, roomId } = repository("classe");
    const resource = {
      id: crypto.randomUUID(),
      name: "  fiche-accords.png  ",
      kind: "image" as const,
      mimeType: "image/png",
      size: 2_048,
      addedAt: new Date().toISOString(),
      mediaUrl: "blob:fiche-accords",
    };
    const state = await repo.execute("classe", roomId, "teacher", { type: "classe.resource.add", resource });
    expect(state.classe?.resources).toHaveLength(1);
    expect(state.classe?.resources?.[0]).toMatchObject({ name: "fiche-accords.png", mediaUrl: "blob:fiche-accords" });
    const participant = await repo.projectionForRole("classe", roomId, "premium_participant", "class-01");
    expect(participant.classe?.resources?.[0].name).toBe("fiche-accords.png");
    await expect(repo.execute("classe", roomId, "premium_participant", { type: "classe.resource.add", resource }, "class-01"))
      .rejects.toThrow("room_tool_forbidden");
  });

  it("rejects unsafe or malformed Class resource metadata", () => {
    const state = createRoomToolsFixture("classe", "demo-class-resource");
    const base = {
      id: crypto.randomUUID(),
      name: "cours.png",
      kind: "image" as const,
      mimeType: "image/png",
      size: 100,
      addedAt: new Date().toISOString(),
      mediaUrl: "blob:cours",
    };
    expect(() => reduceCommand(state, { type: "classe.resource.add", resource: { ...base, mediaUrl: "javascript:alert(1)" } }))
      .toThrow("class_resource_invalid");
    expect(() => reduceCommand(state, { type: "classe.resource.add", resource: { ...base, id: "not-a-uuid" } }))
      .toThrow("class_resource_invalid");
    expect(() => reduceCommand(state, { type: "classe.resource.add", resource: { ...base, size: Number.NaN } }))
      .toThrow("class_resource_invalid");
    expect(() => reduceCommand(state, { type: "classe.resource.add", resource: { ...base, kind: "audio" } }))
      .toThrow("class_resource_invalid");
    expect(() => reduceCommand(state, { type: "classe.resource.add", resource: { ...base, addedAt: "not-a-date" } }))
      .toThrow("class_resource_invalid");
  });

  it("requires a room-bound canonical path in live Class state", () => {
    const roomId = "870f6601-0a9e-4d74-b89c-63be031b3936";
    const userId = "74ee19ba-ad26-43a6-8574-7fb2977199a4";
    const resourceId = "8e21be33-e5e6-4d60-b741-19dedeb0a5d9";
    const state = createRoomToolsFixture("classe", roomId);
    const resource = {
      id: resourceId,
      name: "cours.mp3",
      kind: "audio" as const,
      mimeType: "audio/mpeg",
      size: 10,
      addedAt: new Date().toISOString(),
      mediaPath: `${roomId}/${userId}/${resourceId}.mp3`,
    };
    expect(() => reduceCommand(state, { type: "classe.resource.add", resource })).not.toThrow();
    const foreign = createRoomToolsFixture("classe", roomId);
    expect(() => reduceCommand(foreign, { type: "classe.resource.add", resource: { ...resource, mediaPath: `00000000-0000-4000-8000-000000000000/${userId}/${resourceId}.mp3` } }))
      .toThrow("class_resource_invalid");
  });
});

describe("La Wave", () => {
  const submission = (id: string, contributorId: string): WaveSubmission => ({
    id, contributor: { ...createRoomToolsFixture("wave").wave!.submissions[0].contributor, id: contributorId },
    title: `Loop ${id}`, instrument: "Synthé", bpm: 100, key: "Am", bars: 8,
    durationSeconds: 19.2, fileName: `${id}.wav`, fileSize: 1_024, mimeType: "audio/wav", mediaUrl: `blob:${id}`,
    status: "received", rightsConfirmed: true, version: 1, privateNotes: "message privé", creditPublic: true,
    versions: [{ version: 1, receivedAt: new Date().toISOString(), note: "Original" }],
  });
  const versionPatch = (id: string) => ({ fileName: `${id}-v2.wav`, fileSize: 2_048, mimeType: "audio/wav", mediaUrl: `blob:${id}-v2`, mediaPath: undefined, bpm: 100, key: "Am", bars: 8 as const, durationSeconds: 19.2 });
  const closeFixtureVote = async (repo: DemoRoomToolsRepository, roomId: string) => {
    const current = await repo.load("wave", roomId);
    const open = current.wave?.submissions.find((item) => item.vote?.open);
    if (open) await repo.execute("wave", roomId, "host", { type: "wave.vote.open", submissionId: open.id, open: false });
  };

  it("réduit atomiquement Mute, Solo et gain sur la couche demandée", () => {
    const state = createRoomToolsFixture("wave", "wave-layer-reducer");
    const layer = state.wave!.layers[0];
    reduceCommand(state, {
      type: "wave.sequence.layer",
      layerId: layer.id,
      patch: { muted: true, solo: true, gain: .37 },
    });
    expect(layer).toMatchObject({ muted: true, solo: true, gain: .37 });

    const snapshot = structuredClone(layer);
    expect(() => reduceCommand(state, {
      type: "wave.sequence.layer",
      layerId: layer.id,
      patch: { muted: false, solo: false, gain: 1.01 },
    })).toThrow("wave_layer_gain_invalid");
    expect(layer).toEqual(snapshot);
    expect(() => reduceCommand(state, {
      type: "wave.sequence.layer",
      layerId: "unknown-layer",
      patch: { muted: true },
    })).toThrow("wave_layer_not_found");
  });

  it("persiste et projette les réglages de couche avec une nouvelle révision", async () => {
    const { repository: repo, roomId } = repository("wave");
    const before = await repo.projectionForRole("wave", roomId, "host", "host");
    const layer = before.wave!.layers[0];
    const signal = vi.fn();
    const subscription = repo.subscribe("wave", roomId, signal);
    const committed = await repo.execute("wave", roomId, "host", {
      type: "wave.sequence.layer",
      layerId: layer.id,
      patch: { muted: true, solo: true, gain: .41 },
    }, "host");

    expect(committed.revision).toBe(before.revision + 1);
    expect(committed.wave?.layers.find((item) => item.id === layer.id)).toMatchObject({ muted: true, solo: true, gain: .41 });
    const hostProjection = await repo.projectionForRole("wave", roomId, "host", "host");
    const publicProjection = await repo.publicProjection("wave", roomId);
    expect(hostProjection.wave?.layers.find((item) => item.id === layer.id)).toMatchObject({ muted: true, solo: true, gain: .41 });
    expect(publicProjection.wave?.layers.find((item) => item.id === layer.id)).toMatchObject({ muted: true, solo: true, gain: .41 });
    expect(signal).toHaveBeenCalledOnce();
    expect(signal.mock.calls[0][0].wave.layers.find((item: { id: string }) => item.id === layer.id)).toMatchObject({ muted: true, solo: true, gain: .41 });
    subscription.unsubscribe();
  });

  it("synchronizes a public verdict and integrates the approved layer automatically", async () => {
    const { repository: repo, roomId } = repository("wave");
    await closeFixtureVote(repo, roomId);
    const viewerSignal = vi.fn();
    const subscription = repo.subscribe("wave", roomId, viewerSignal);
    const candidate = submission("realtime-loop", "realtime-contributor");
    await repo.execute("wave", roomId, "contributor", { type: "wave.submission.add", submission: candidate }, "realtime-contributor");
    await repo.execute("wave", roomId, "host", { type: "wave.vote.open", submissionId: candidate.id, open: true });
    const voteProjection = viewerSignal.mock.calls[viewerSignal.mock.calls.length - 1]?.[0];
    expect(voteProjection.wave.submissions.find((item: { id: string }) => item.id === candidate.id)?.privateNotes).toBe("");
    await repo.execute("wave", roomId, "viewer", { type: "wave.vote.cast", submissionId: candidate.id, accountId: "realtime-viewer", choice: "yes" }, "realtime-viewer");
    await repo.execute("wave", roomId, "host", { type: "wave.vote.open", submissionId: candidate.id, open: false });
    const latest = viewerSignal.mock.calls[viewerSignal.mock.calls.length - 1]?.[0];
    expect(latest.wave.layers.filter((layer: { submissionId?: string }) => layer.submissionId === candidate.id)).toHaveLength(1);
    const publicResult = await repo.projectionForRole("wave", roomId, "viewer", "another-viewer");
    expect(publicResult.wave?.submissions.find((item) => item.id === candidate.id)?.vote).toMatchObject({ votes: {}, totalVotes: 1, yesCount: 1, noCount: 0 });
    subscription.unsubscribe();
  });

  it("requires the base loop before launch", () => {
    const state = createRoomToolsFixture("wave");
    expect(canOpenSpecializedRoom("wave", state, "host")).toBe(true);
    state.wave!.baseLoop.title = "";
    expect(canOpenSpecializedRoom("wave", state, "host")).toBe(false);
    state.wave!.baseLoop.title = "Metro Base 08";
    state.wave!.baseLoop.mediaUrl = undefined;
    expect(canOpenSpecializedRoom("wave", state, "host")).toBe(false);
  });

  it("locks the configured public listening mode and vote duration", async () => {
    const { repository: repo, roomId } = repository("wave");
    await closeFixtureVote(repo, roomId);
    const candidate = submission("configured-vote", "configured-contributor");
    await repo.execute("wave", roomId, "contributor", { type: "wave.submission.add", submission: candidate }, "configured-contributor");
    const state = await repo.execute("wave", roomId, "host", {
      type: "wave.vote.open",
      submissionId: candidate.id,
      open: true,
      durationSeconds: 45,
      listeningMode: "solo",
    });

    expect(state.wave?.submissions.find((item) => item.id === candidate.id)?.vote).toMatchObject({ durationSeconds: 45, listeningMode: "solo" });
  });

  it("configures and then locks the launch base", () => {
    const state = createRoomToolsFixture("wave");
    state.wave = { title: "", baseLoop: { title: "", bars: 4, bpm: 0, key: "", kind: "" }, submissions: [], activeSubmissionId: null, layers: [], playing: false, looping: true, history: [] };
    const configure: RoomToolsCommand = { type: "wave.base.configure", waveTitle: "Nouvelle Wave", baseLoop: { title: "Base Drums", kind: "Drums", bars: 8, bpm: 128, key: "Sans tonalité", fileName: "base.wav", fileSize: 4_096, mimeType: "audio/wav", mediaUrl: "blob:base", durationSeconds: 15 } };
    reduceCommand(state, configure);
    expect(state.wave).toMatchObject({ title: "Nouvelle Wave", baseLoop: { title: "Base Drums", bars: 8, bpm: 128, key: "Sans tonalité" }, layers: [{ id: "base" }] });
    expect(() => reduceCommand(state, configure)).toThrow("wave_base_locked");
  });

  it("remplace explicitement la base sans transformer l’import en candidate", async () => {
    const { repository: repo, roomId } = repository("wave");
    const before = await repo.load("wave", roomId);
    const layerIds = before.wave!.layers.map((layer) => layer.id);
    const state = await repo.execute("wave", roomId, "host", {
      type: "wave.base.replace",
      baseLoop: {
        ...before.wave!.baseLoop,
        title: "Production retravaillée",
        fileName: "production-v2.wav",
        fileSize: 4_096,
        mimeType: "audio/wav",
        mediaUrl: "blob:production-v2",
        mediaPath: undefined,
      },
    });
    expect(state.wave?.baseLoop).toMatchObject({ title: "Production retravaillée", mediaUrl: "blob:production-v2" });
    expect(state.wave?.layers.map((layer) => layer.id)).toEqual(layerIds);
    expect(state.wave?.layers.find((layer) => !layer.submissionId)?.title).toBe("Production retravaillée");
  });

  it("place une boucle normale importée par le host directement dans Vote, jamais dans le Sas ni dans le Beat", async () => {
    const { repository: repo, roomId } = repository("wave");
    const candidate = submission("host-rework", "host-profile");
    candidate.category = "melody";
    candidate.bars = 4;
    const state = await repo.execute("wave", roomId, "host", { type: "wave.submission.importToVote", submission: candidate }, "host-profile");
    const imported = state.wave?.submissions.find((item) => item.id === candidate.id);
    expect(imported).toMatchObject({ bars: 4, status: "analysis", lifecycleStatus: "READY_FOR_VOTE", vote: undefined });
    expect(state.wave?.activeSubmissionId).toBe(candidate.id);
    expect(state.wave?.layers.some((layer) => layer.submissionId === candidate.id)).toBe(false);
  });

  it("reinjects a real version, invalidates its former vote and preserves the contributor", async () => {
    const { repository: repo, roomId } = repository("wave");
    await closeFixtureVote(repo, roomId);
    const candidate = submission("new-loop", "new-contributor");
    await repo.execute("wave", roomId, "contributor", { type: "wave.submission.add", submission: candidate }, "new-contributor");
    let state = await repo.execute("wave", roomId, "host", { type: "wave.submission.version", submissionId: candidate.id, note: "BPM recalé", patch: versionPatch(candidate.id) });
    expect(state.wave?.submissions.find((item) => item.id === candidate.id)).toMatchObject({ version: 2, status: "to-review", contributor: { id: "new-contributor" }, fileName: "new-loop-v2.wav", vote: undefined });
    await repo.execute("wave", roomId, "host", { type: "wave.vote.open", submissionId: candidate.id, open: true });
    await repo.execute("wave", roomId, "viewer", { type: "wave.vote.cast", submissionId: candidate.id, accountId: "viewer-1", choice: "yes" }, "viewer-1");
    await expect(repo.execute("wave", roomId, "viewer", { type: "wave.vote.cast", submissionId: candidate.id, accountId: "viewer-1", choice: "yes" }, "viewer-1")).rejects.toThrow("wave_vote_already_cast");
    state = await repo.execute("wave", roomId, "host", { type: "wave.vote.open", submissionId: candidate.id, open: false });
    expect(state.wave?.submissions.find((item) => item.id === candidate.id)).toMatchObject({ status: "accepted", decisionSource: "public", vote: { outcome: "accepted", submissionVersion: 2 } });
    expect(state.wave?.layers.filter((layer) => layer.submissionId === candidate.id)).toHaveLength(1);
  });

  it("never lets the Host bypass or cast the public verdict", async () => {
    const { repository: repo, roomId } = repository("wave");
    await closeFixtureVote(repo, roomId);
    const candidate = submission("verdict-loop", "verdict-contributor");
    await repo.execute("wave", roomId, "contributor", { type: "wave.submission.add", submission: candidate }, "verdict-contributor");
    await expect(repo.execute("wave", roomId, "host", { type: "wave.submission.status", submissionId: candidate.id, status: "accepted" })).rejects.toThrow("wave_vote_required");
    await repo.execute("wave", roomId, "host", { type: "wave.vote.open", submissionId: candidate.id, open: true });
    await expect(repo.execute("wave", roomId, "host", { type: "wave.vote.cast", submissionId: candidate.id, accountId: "host", choice: "yes" }, "host")).rejects.toThrow("room_tool_forbidden");
    await expect(repo.execute("wave", roomId, "host", { type: "wave.submission.status", submissionId: candidate.id, status: "accepted" })).rejects.toThrow("wave_vote_open");
    await repo.execute("wave", roomId, "viewer", { type: "wave.vote.cast", submissionId: candidate.id, accountId: "public-a", choice: "yes" }, "public-a");
    await repo.execute("wave", roomId, "viewer", { type: "wave.vote.cast", submissionId: candidate.id, accountId: "public-b", choice: "no" }, "public-b");
    await repo.execute("wave", roomId, "viewer", { type: "wave.vote.cast", submissionId: candidate.id, accountId: "public-c", choice: "no" }, "public-c");
    const state = await repo.execute("wave", roomId, "host", { type: "wave.vote.open", submissionId: candidate.id, open: false });
    expect(state.wave?.submissions.find((item) => item.id === candidate.id)).toMatchObject({ status: "rejected", decisionSource: "public", reviewReason: "public", vote: { outcome: "rejected" } });
    expect(state.wave?.layers.some((layer) => layer.submissionId === candidate.id)).toBe(false);
  });

  it("requires a humane reason and projects it privately to the contributor", async () => {
    const { repository: repo, roomId } = repository("wave");
    const candidate = submission("feedback-loop", "feedback-contributor");
    await repo.execute("wave", roomId, "contributor", { type: "wave.submission.add", submission: candidate }, "feedback-contributor");
    await expect(repo.execute("wave", roomId, "host", { type: "wave.submission.status", submissionId: candidate.id, status: "rejected" })).rejects.toThrow("wave_review_reason_required");
    await repo.execute("wave", roomId, "host", { type: "wave.submission.status", submissionId: candidate.id, status: "rework", reason: "timing" });
    const own = await repo.projectionForRole("wave", roomId, "contributor", "feedback-contributor");
    expect(own.wave?.submissions.find((item) => item.id === candidate.id)).toMatchObject({ status: "rework", reviewReason: "timing", reviewFeedback: expect.stringMatching(/BPM|calage/) });
    expect(own.wave?.submissions.find((item) => item.id === candidate.id)?.privateNotes).toBe("");
  });

  it("removes gifts from the Wave command contract", async () => {
    const { repository: repo, roomId } = repository("wave");
    await expect(repo.execute("wave", roomId, "viewer", { type: "gift.send", accountId: "viewer-2", recipientId: "wave-a", giftCode: "force-card", origin: "SYSTEM", idempotencyKey: "wave-gift" }, "viewer-2")).rejects.toThrow("room_tool_forbidden");
  });

  it("allows only one public vote at a time", async () => {
    const { repository: repo, roomId } = repository("wave");
    const first = submission("first-open", "first-contributor");
    await repo.execute("wave", roomId, "contributor", { type: "wave.submission.add", submission: first }, "first-contributor");
    await repo.execute("wave", roomId, "host", { type: "wave.vote.open", submissionId: first.id, open: true });
    const candidate = submission("second-open", "second-contributor");
    await repo.execute("wave", roomId, "contributor", { type: "wave.submission.add", submission: candidate }, "second-contributor");
    await expect(repo.execute("wave", roomId, "host", { type: "wave.vote.open", submissionId: candidate.id, open: true })).rejects.toThrow("wave_vote_already_open");
  });

  it("keeps every production layer backed by an approved public vote", () => {
    const wave = createRoomToolsFixture("wave").wave!;
    for (const layer of wave.layers.slice(1)) {
      const approved = wave.submissions.find((item) => item.id === layer.submissionId);
      expect(approved).toMatchObject({ status: "accepted", decisionSource: "public", vote: { open: false, outcome: "accepted" } });
    }
  });

  it("shows an open public vote without leaking private notes or other ballots", async () => {
    const { repository: repo, roomId } = repository("wave");
    const candidate = submission("public-projection", "projection-contributor");
    await repo.execute("wave", roomId, "contributor", { type: "wave.submission.add", submission: candidate }, "projection-contributor");
    await repo.execute("wave", roomId, "host", { type: "wave.vote.open", submissionId: candidate.id, open: true });
    const projection = await repo.projectionForRole("wave", roomId, "viewer", "viewer-safe");
    const openVote = projection.wave?.submissions.find((item) => item.vote?.open);
    expect(openVote).toBeDefined();
    expect(openVote?.privateNotes).toBe("");
    expect(openVote?.vote?.votes).toEqual({});
  });

  it("closes an expired Wave vote and rejects a late ballot", async () => {
    vi.useFakeTimers();
    try {
      const { repository: repo, roomId } = repository("wave");
      const candidate = submission("expiring-vote", "expiring-contributor");
      await repo.execute("wave", roomId, "contributor", { type: "wave.submission.add", submission: candidate }, "expiring-contributor");
      await repo.execute("wave", roomId, "host", { type: "wave.vote.open", submissionId: candidate.id, open: true, durationSeconds: 30 });
      const state = await repo.load("wave", roomId);
      const openVote = state.wave?.submissions.find((item) => item.vote?.open);
      expect(openVote?.vote).toBeDefined();
      vi.setSystemTime(Date.now() + 31_000);
      const projected = await repo.projectionForRole("wave", roomId, "viewer", "late-wave-voter");
      expect(projected.wave?.submissions.find((item) => item.id === openVote!.id)).toBeUndefined();
      await expect(repo.execute("wave", roomId, "viewer", { type: "wave.vote.cast", submissionId: openVote!.id, accountId: "late-wave-voter", choice: "yes" }, "late-wave-voter")).rejects.toThrow("wave_vote_expired");
    } finally { vi.useRealTimers(); }
  });
});

describe("La Cage", () => {
  it("selects a match and publishes countdown then passage A to the Cage program state", async () => {
    vi.useFakeTimers();
    try {
      const now = new Date("2026-08-21T20:00:00.000Z");
      vi.setSystemTime(now);
      const { repository: repo, roomId } = repository("cage");
      const initial = await repo.load("cage", roomId);
      const previousMatchId = initial.cage!.currentMatchId;
      const selectedMatch = initial.cage!.matches.find((match) => match.id === "match-6")!;

      let state = await repo.execute("cage", roomId, "host", { type: "cage.match.select", matchId: selectedMatch.id });
      expect(state.cage).toMatchObject({
        currentMatchId: selectedMatch.id,
        currentRound: selectedMatch.round,
        battleRound: 1,
        battleStatus: "ready",
        battleStartedAt: null,
        battleElapsedSeconds: 0,
        battleActiveSide: null,
        battleCountdownEndsAt: null,
      });
      expect(state.cage?.matches.find((match) => match.id === previousMatchId)?.status).toBe("ready");

      state = await repo.execute("cage", roomId, "host", { type: "cage.battle", status: "countdown" });
      expect(state.cage).toMatchObject({
        battleStatus: "countdown",
        battleActiveSide: null,
        battleStartedAt: null,
        battleCountdownEndsAt: "2026-08-21T20:00:03.000Z",
      });

      state = await repo.execute("cage", roomId, "host", { type: "cage.battle", status: "live-a" });
      expect(state.cage).toMatchObject({
        battleStatus: "live-a",
        battleActiveSide: "A",
        battleStartedAt: now.toISOString(),
        battleCountdownEndsAt: null,
        event: { status: "live" },
      });
      expect(state.cage?.matches.find((match) => match.id === selectedMatch.id)?.status).toBe("live");
      expect(state.cage?.matches.filter((match) => match.status === "live").map((match) => match.id)).toEqual([selectedMatch.id]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the active side through pause or incident and switches the timed passage from A to B", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-21T20:10:00.000Z"));
      const { repository: repo, roomId } = repository("cage");
      await repo.execute("cage", roomId, "host", { type: "cage.match.select", matchId: "match-6" });
      await repo.execute("cage", roomId, "host", { type: "cage.battle", status: "live-a" });

      vi.setSystemTime(new Date("2026-08-21T20:10:01.900Z"));
      let state = await repo.execute("cage", roomId, "host", { type: "cage.battle", status: "paused" });
      expect(state.cage).toMatchObject({
        battleStatus: "paused",
        battleActiveSide: "A",
        battleStartedAt: null,
        battleElapsedSeconds: 1,
        battleCountdownEndsAt: null,
      });

      vi.setSystemTime(new Date("2026-08-21T20:10:05.000Z"));
      state = await repo.execute("cage", roomId, "host", { type: "cage.battle", status: "live-a" });
      expect(state.cage).toMatchObject({
        battleStatus: "live-a",
        battleActiveSide: "A",
        battleStartedAt: "2026-08-21T20:10:05.000Z",
        battleElapsedSeconds: 1,
      });

      vi.setSystemTime(new Date("2026-08-21T20:10:07.400Z"));
      state = await repo.execute("cage", roomId, "host", { type: "cage.battle", status: "live-b" });
      expect(state.cage).toMatchObject({
        battleStatus: "live-b",
        battleActiveSide: "B",
        battleStartedAt: "2026-08-21T20:10:07.400Z",
        battleElapsedSeconds: 0,
        event: { status: "live" },
      });
      expect(state.cage?.matches.find((match) => match.id === "match-6")?.status).toBe("live");

      vi.setSystemTime(new Date("2026-08-21T20:10:09.900Z"));
      state = await repo.execute("cage", roomId, "host", { type: "cage.battle", status: "incident" });
      expect(state.cage).toMatchObject({
        battleStatus: "incident",
        battleActiveSide: "B",
        battleStartedAt: null,
        battleElapsedSeconds: 2,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("progresses each battle round and finalizes the selected match after the last one", async () => {
    const { repository: repo, roomId } = repository("cage");
    await repo.execute("cage", roomId, "host", { type: "cage.match.select", matchId: "match-6" });

    await repo.execute("cage", roomId, "host", { type: "cage.battle", status: "live-a" });
    await repo.execute("cage", roomId, "host", { type: "cage.battle", status: "live-b" });
    let state = await repo.execute("cage", roomId, "host", { type: "cage.battle", status: "done" });
    expect(state.cage).toMatchObject({ battleRound: 2, battleStatus: "ready", battleActiveSide: null });

    await repo.execute("cage", roomId, "host", { type: "cage.battle", status: "live-b" });
    state = await repo.execute("cage", roomId, "host", { type: "cage.battle", status: "done" });
    expect(state.cage).toMatchObject({ battleRound: 3, battleStatus: "ready", battleActiveSide: null });

    await repo.execute("cage", roomId, "host", { type: "cage.battle", status: "live-a" });
    state = await repo.execute("cage", roomId, "host", { type: "cage.battle", status: "done" });
    expect(state.cage).toMatchObject({ battleRound: 3, battleStatus: "done" });
    expect(state.cage?.matches.find((match) => match.id === "match-6")?.status).toBe("live");

    const selected = state.cage!.matches.find((match) => match.id === "match-6")!;
    state = await repo.execute("cage", roomId, "host", { type: "cage.result", winnerId: selected.competitorA.id });
    expect(state.cage).toMatchObject({
      battleRound: 3,
      battleStatus: "done",
      battleStartedAt: null,
      battleElapsedSeconds: 0,
      battleActiveSide: null,
      battleCountdownEndsAt: null,
    });
    expect(state.cage?.matches.find((match) => match.id === selected.id)).toMatchObject({
      status: "done",
      winnerId: selected.competitorA.id,
    });
  });

  it("generates and manages a real Open mic order without inventing a duel", async () => {
    const { repository: repo, roomId } = repository("cage");
    let state = await repo.execute("cage", roomId, "host", { type: "cage.structure.generate", format: "open-mic", seeding: "ranking" });
    expect(state.cage?.format).toBe("open-mic");
    expect(state.cage?.openMicEntries).toHaveLength(16);
    expect(state.cage).toMatchObject({
      battleStatus: "ready",
      battleStartedAt: null,
      battleElapsedSeconds: 0,
      votingOpen: false,
    });
    const first = state.cage!.openMicEntries![0];
    const second = state.cage!.openMicEntries![1];
    state = await repo.execute("cage", roomId, "host", { type: "cage.open-mic.move", entryId: second.id, direction: -1 });
    expect(state.cage?.openMicEntries?.[0].id).toBe(second.id);
    expect(state.cage?.openMicEntries?.slice(0, 2).map((entry) => entry.slot)).toEqual(["21:00", "21:04"]);
    state = await repo.execute("cage", roomId, "host", { type: "cage.open-mic.status", entryId: first.id, status: "live" });
    expect(state.cage?.openMicEntries?.find((entry) => entry.id === first.id)?.status).toBe("live");
    expect(state.cage?.event?.status).toBe("live");
    state = await repo.execute("cage", roomId, "host", { type: "cage.open-mic.score", entryId: first.id, score: 112 });
    expect(state.cage?.openMicEntries?.find((entry) => entry.id === first.id)?.score).toBe(100);
  });

  it("generates a complete championship calendar and keeps battle rounds separate", async () => {
    const { repository: repo, roomId } = repository("cage");
    let state = await repo.execute("cage", roomId, "host", { type: "cage.structure.generate", format: "championship", seeding: "ranking" });
    expect(new Set(state.cage?.matches.map((match) => match.round)).size).toBe(15);
    expect(state.cage?.matches).toHaveLength(120);
    const competitionRound = state.cage!.currentRound;
    state = await repo.execute("cage", roomId, "host", { type: "cage.battle.round", round: 2 });
    expect(state.cage?.battleRound).toBe(2);
    expect(state.cage?.currentRound).toBe(competitionRound);
    state = await repo.execute("cage", roomId, "host", { type: "cage.battle", status: "done" });
    expect(state.cage?.battleRound).toBe(3);
    expect(state.cage?.currentRound).toBe(competitionRound);
  });

  it("synchronizes vote opening and the revealed result without exposing early ballots", async () => {
    const { repository: repo, roomId } = repository("cage");
    const viewerSignal = vi.fn();
    const subscription = repo.subscribe("cage", roomId, viewerSignal);
    await repo.execute("cage", roomId, "host", { type: "cage.vote.open", open: false });
    await repo.execute("cage", roomId, "host", { type: "cage.vote.open", open: true });
    expect(viewerSignal.mock.calls[viewerSignal.mock.calls.length - 1]?.[0].cage.votingOpen).toBe(true);
    await repo.execute("cage", roomId, "viewer", { type: "cage.vote.cast", accountId: "audience-c", choice: "B" }, "audience-c");
    expect(viewerSignal.mock.calls[viewerSignal.mock.calls.length - 1]?.[0].cage.votes).toEqual({});
    const current = await repo.load("cage", roomId);
    const match = current.cage!.matches.find((item) => item.id === current.cage!.currentMatchId)!;
    await repo.execute("cage", roomId, "host", { type: "cage.result", winnerId: match.competitorB.id });
    await repo.execute("cage", roomId, "host", { type: "cage.vote.reveal", hidden: false });
    const revealed = viewerSignal.mock.calls[viewerSignal.mock.calls.length - 1]?.[0];
    expect(revealed.cage.matches.find((item: { id: string }) => item.id === match.id)?.winnerId).toBe(match.competitorB.id);
    subscription.unsubscribe();
  });

  it("hides only the current result and ballots while preserving the public bracket history", async () => {
    const { repository: repo, roomId } = repository("cage");
    const state = await repo.projectionForRole("cage", roomId, "viewer", "safe-viewer");
    const current = state.cage?.matches.find((match) => match.id === state.cage?.currentMatchId);
    expect(current).toMatchObject({ scoreA: 0, scoreB: 0 });
    expect(current?.winnerId).toBeUndefined();
    expect(state.cage?.matches.some((match) => match.id !== state.cage?.currentMatchId && Boolean(match.winnerId))).toBe(true);
    expect(state.cage?.votes).toEqual({});
    expect(state.cage?.resultHistory.every((entry) => entry.matchId !== state.cage?.currentMatchId)).toBe(true);
    expect(state.cage?.resultHistory.length).toBeGreaterThan(0);
  });
  it("limits voting to one account and keeps results hidden", async () => {
    const { repository: repo, roomId } = repository("cage");
    let state = await repo.execute("cage", roomId, "viewer", { type: "cage.vote.cast", accountId: "unique-voter", choice: "A" }, "unique-voter");
    expect(state.cage?.resultsHidden).toBe(true);
    await expect(repo.execute("cage", roomId, "viewer", { type: "cage.vote.cast", accountId: "unique-voter", choice: "B" }, "unique-voter")).rejects.toThrow("cage_vote_already_cast");
    state = await repo.execute("cage", roomId, "host", { type: "cage.vote.reveal", hidden: false });
    expect(state.cage?.resultsHidden).toBe(false);
  });

  it("closes an expired Cage vote and rejects a late ballot", async () => {
    vi.useFakeTimers();
    try {
      const { repository: repo, roomId } = repository("cage");
      await repo.load("cage", roomId);
      vi.setSystemTime(Date.now() + 31_000);
      const projected = await repo.projectionForRole("cage", roomId, "viewer", "late-cage-voter");
      expect(projected.cage?.votingOpen).toBe(false);
      await expect(repo.execute("cage", roomId, "viewer", { type: "cage.vote.cast", accountId: "late-cage-voter", choice: "A" }, "late-cage-voter")).rejects.toThrow("cage_vote_expired");
    } finally { vi.useRealTimers(); }
  });

  it("moves a winner forward and gifts never touch scores", async () => {
    const { repository: repo, roomId } = repository("cage");
    const before = await repo.load("cage", roomId);
    const match = before.cage!.matches.find((item) => item.id === before.cage!.currentMatchId)!;
    let state = await repo.execute("cage", roomId, "host", { type: "cage.result", winnerId: match.competitorA.id });
    expect(state.cage?.matches.find((item) => item.id === "quarter-3")?.competitorA.id).toBe(match.competitorA.id);
    const scores = state.cage?.matches.map((item) => [item.scoreA, item.scoreB]);
    state = await repo.execute("cage", roomId, "viewer", { type: "gift.send", accountId: "fan", recipientId: match.competitorA.id, giftCode: "supporter-bonus", origin: "EARNED", idempotencyKey: "cage-gift" }, "fan");
    expect(state.cage?.matches.map((item) => [item.scoreA, item.scoreB])).toEqual(scores);
  });

  it("validates the same result idempotently and rejects a silent correction", async () => {
    const { repository: repo, roomId } = repository("cage");
    const before = await repo.load("cage", roomId);
    const match = before.cage!.matches.find((item) => item.id === before.cage!.currentMatchId)!;
    await repo.execute("cage", roomId, "host", { type: "cage.result", winnerId: match.competitorA.id });
    const replay = await repo.execute("cage", roomId, "host", { type: "cage.result", winnerId: match.competitorA.id });
    expect(replay.cage?.resultHistory.filter((entry) => entry.matchId === match.id)).toHaveLength(1);
    await expect(repo.execute("cage", roomId, "host", { type: "cage.result", winnerId: match.competitorB.id })).rejects.toThrow("cage_result_correction_confirmation_required");
  });
});

describe("La Loge", () => {
  it("synchronizes a selected VIP question and scopes a Face-to-face invitation to its beneficiary", async () => {
    const { repository: repo, roomId } = repository("loge");
    const vipSignal = vi.fn();
    const subscription = repo.subscribe("loge", roomId, vipSignal);
    await repo.execute("loge", roomId, "viewer", { type: "loge.question.add", question: { id: "question-live", author: { ...createRoomToolsFixture("loge").loge!.questions[0].author, id: "loge-a" }, text: "Peux-tu raconter la première maquette ?", status: "pending", invited: false, sentAt: new Date().toISOString() } }, "loge-a");
    await repo.execute("loge", roomId, "host", { type: "loge.question.status", questionId: "question-live", status: "selected" });
    const selected = await repo.projectionForRole("loge", roomId, "viewer", "loge-a");
    expect(selected.loge?.questions.find((question) => question.id === "question-live")?.status).toBe("selected");
    const otherViewer = await repo.projectionForRole("loge", roomId, "viewer", "loge-b");
    expect(otherViewer.loge?.moments.some((moment) => moment.id === "moment-1")).toBe(false);
    const beneficiary = await repo.projectionForRole("loge", roomId, "viewer", "loge-a");
    expect(beneficiary.loge?.moments.some((moment) => moment.id === "moment-1")).toBe(true);
    expect(vipSignal).toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it("does not project preview metadata, questions or moments to an ineligible Viewer", async () => {
    const { repository: repo, roomId } = repository("loge");
    const projection = await repo.projectionForRole("loge", roomId, "viewer", "ordinary-viewer");
    expect(projection.audience?.eligible).toBe(false);
    expect(projection.loge?.preview).toMatchObject({ title: "Accès privé", mediaName: "", playing: false });
    expect(projection.loge?.preview).toMatchObject({ mediaPath: null, durationSeconds: null, channels: null, sampleRate: null, waveformPeaks: [] });
    expect(projection.loge?.questions).toEqual([]);
    expect(projection.loge?.moments).toEqual([]);
  });

  it("removes an expired preview media reference from an eligible Viewer projection", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(new Date("2026-09-19T00:00:00.000Z").getTime());
    try {
      const { repository: repo, roomId } = repository("loge");
      const projection = await repo.projectionForRole("loge", roomId, "viewer", "loge-a");
      expect(projection.audience?.eligible).toBe(true);
      expect(projection.loge?.preview.mediaName).toBe("");
      expect(projection.loge?.preview.playing).toBe(false);
      expect(projection.loge?.preview).toMatchObject({ mediaPath: null, durationSeconds: null, channels: null, sampleRate: null, waveformPeaks: [] });
    } finally { now.mockRestore(); }
  });

  it("keeps replay and live-only access mutually exclusive for every preview patch", async () => {
    const { repository: repo, roomId } = repository("loge");

    let state = await repo.execute("loge", roomId, "host", { type: "loge.preview.patch", patch: { liveOnly: true } });
    expect(state.loge?.preview).toMatchObject({ liveOnly: true, replayIncluded: false });

    state = await repo.execute("loge", roomId, "host", { type: "loge.preview.patch", patch: { replayIncluded: true } });
    expect(state.loge?.preview).toMatchObject({ liveOnly: false, replayIncluded: true });

    state = await repo.execute("loge", roomId, "host", { type: "loge.preview.patch", patch: { liveOnly: true, replayIncluded: true } });
    expect(state.loge?.preview).toMatchObject({ liveOnly: true, replayIncluded: false });
  });

  it("sanitizes and persists compact PCM metadata and int16 min/max peaks", async () => {
    const { repository: repo, roomId } = repository("loge");
    const oversized: number[] = Array.from({ length: 1_200 }, (_, index) => index % 2 === 0 ? -40_000.8 : 40_000.8);
    oversized[4] = Number.NaN;
    oversized[5] = 123;

    const state = await repo.execute("loge", roomId, "host", {
      type: "loge.preview.patch",
      patch: {
        durationSeconds: 99_999.9999,
        channels: 12.7,
        sampleRate: 500_000.4,
        waveformPeaks: oversized,
      },
    });

    expect(state.loge?.preview).toMatchObject({
      durationSeconds: 86_400,
      channels: 8,
      sampleRate: 384_000,
    });
    expect(state.loge?.preview.waveformPeaks).toHaveLength(1_022);
    expect(state.loge?.preview.waveformPeaks.slice(0, 6)).toEqual([
      -32_768, 32_767,
      -32_768, 32_767,
      -32_768, 32_767,
    ]);
    expect(state.loge?.preview.waveformPeaks.every(Number.isInteger)).toBe(true);
  });

  it("rejects stale preview analysis by media name or path and accepts an exact media compare-and-swap", async () => {
    const { repository: repo, roomId } = repository("loge");
    const mediaPath = "51000000-0000-4000-8000-000000000094/52000000-0000-4000-8000-000000000094/53000000-0000-4000-8000-000000000094.wav";
    const otherMediaPath = "51000000-0000-4000-8000-000000000094/52000000-0000-4000-8000-000000000094/54000000-0000-4000-8000-000000000094.wav";

    await repo.execute("loge", roomId, "host", {
      type: "loge.preview.patch",
      patch: { mediaName: "private-master.wav", mediaPath },
    });

    await expect(repo.execute("loge", roomId, "host", {
      type: "loge.preview.patch",
      expectedMedia: { mediaName: "stale-name.wav", mediaPath },
      patch: { durationSeconds: 11, channels: 2, sampleRate: 48_000, waveformPeaks: [-1, 1] },
    })).rejects.toThrow("loge_preview_media_changed");

    await expect(repo.execute("loge", roomId, "host", {
      type: "loge.preview.patch",
      expectedMedia: { mediaName: "private-master.wav", mediaPath: otherMediaPath },
      patch: { durationSeconds: 11, channels: 2, sampleRate: 48_000, waveformPeaks: [-1, 1] },
    })).rejects.toThrow("loge_preview_media_changed");

    const exact = await repo.execute("loge", roomId, "host", {
      type: "loge.preview.patch",
      expectedMedia: { mediaName: "private-master.wav", mediaPath },
      patch: { durationSeconds: 11.1254, channels: 2, sampleRate: 48_000, waveformPeaks: [-1_024.2, 2_048.8] },
    });
    expect(exact.loge?.preview).toMatchObject({
      mediaName: "private-master.wav",
      mediaPath,
      durationSeconds: 11.125,
      channels: 2,
      sampleRate: 48_000,
      waveformPeaks: [-1_024, 2_049],
    });
  });

  it("drops stale PCM metadata on replacement and clears every private media reference on removal", async () => {
    const { repository: repo, roomId } = repository("loge");
    const firstMediaPath = "51000000-0000-4000-8000-000000000095/52000000-0000-4000-8000-000000000095/53000000-0000-4000-8000-000000000095.wav";
    const replacementMediaPath = "51000000-0000-4000-8000-000000000095/52000000-0000-4000-8000-000000000095/54000000-0000-4000-8000-000000000095.mp3";
    await repo.execute("loge", roomId, "host", {
      type: "loge.preview.patch",
      patch: {
        mediaName: "first.wav",
        mediaPath: firstMediaPath,
        durationSeconds: 18.25,
        channels: 2,
        sampleRate: 48_000,
        waveformPeaks: [-1_000, 2_000, -3_000, 4_000],
      },
    });

    let state = await repo.execute("loge", roomId, "host", {
      type: "loge.preview.patch",
      expectedMedia: { mediaName: "first.wav", mediaPath: firstMediaPath },
      patch: { mediaName: "replacement.mp3", mediaPath: replacementMediaPath },
    });
    expect(state.loge?.preview).toMatchObject({
      mediaName: "replacement.mp3",
      mediaPath: replacementMediaPath,
      durationSeconds: null,
      channels: null,
      sampleRate: null,
      waveformPeaks: [],
    });

    state = await repo.execute("loge", roomId, "host", {
      type: "loge.preview.patch",
      expectedMedia: { mediaName: "replacement.mp3", mediaPath: replacementMediaPath },
      patch: { mediaName: "" },
    });
    expect(state.loge?.preview).toMatchObject({
      mediaName: "",
      mediaPath: null,
      playing: false,
      durationSeconds: null,
      channels: null,
      sampleRate: null,
      waveformPeaks: [],
    });
  });

  it("never exposes a private media path in an eligible Viewer projection", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(new Date("2026-08-17T00:00:00.000Z").getTime());
    try {
      const { repository: repo, roomId } = repository("loge");
      const mediaPath = "51000000-0000-4000-8000-000000000096/52000000-0000-4000-8000-000000000096/53000000-0000-4000-8000-000000000096.flac";
      await repo.execute("loge", roomId, "host", {
        type: "loge.preview.patch",
        patch: {
          mediaName: "eligible-private.flac",
          mediaPath,
          replayIncluded: true,
          durationSeconds: 42,
          channels: 2,
          sampleRate: 44_100,
          waveformPeaks: [-4_096, 8_192, -16_384, 24_576],
        },
      });
      await repo.execute("loge", roomId, "host", {
        type: "loge.preview.launch",
        expectedMedia: { mediaName: "eligible-private.flac", mediaPath },
        sessionId: "preview:private-path-test",
        positionSeconds: 0,
        volume: 1,
      });

      const projection = await repo.projectionForRole("loge", roomId, "viewer", "loge-a");
      expect(projection.audience?.eligible).toBe(true);
      expect(projection.loge?.preview.mediaName).toBe("eligible-private.flac");
      expect(projection.loge?.preview.mediaPath).toBeNull();
      expect(projection.loge?.preview.waveformPeaks).toEqual([-4_096, 8_192, -16_384, 24_576]);
      expect(JSON.stringify(projection)).not.toContain(mediaPath);
    } finally { now.mockRestore(); }
  });

  it("clears stale PCM analysis when the media changes without replacement peaks", async () => {
    const { repository: repo, roomId } = repository("loge");
    const state = await repo.execute("loge", roomId, "host", {
      type: "loge.preview.patch",
      patch: { mediaName: "nouvelle-version.wav" },
    });

    expect(state.loge?.preview).toMatchObject({
      mediaName: "nouvelle-version.wav",
      durationSeconds: null,
      channels: null,
      sampleRate: null,
      waveformPeaks: [],
    });
  });

  it("projects a preview only while its transport session is live or paused", async () => {
    const { repository: repo, roomId } = repository("loge");
    const expectedMedia = { mediaName: "eclipse-premix-v7.wav", mediaPath: null };
    const sessionId = "preview:projection-test";

    let projection = await repo.projectionForRole("loge", roomId, "viewer", "loge-a");
    expect(projection.loge?.preview.mediaName).toBe("");

    await repo.execute("loge", roomId, "host", {
      type: "loge.preview.patch",
      expectedMedia,
      patch: {
        durationSeconds: 127.224,
        channels: 2,
        sampleRate: 48_000,
        waveformPeaks: [-3_932, 5_898, -7_864, 9_503, -23_264, 22_282, -26_541, 24_903],
      },
    });
    await repo.execute("loge", roomId, "host", { type: "loge.preview.launch", expectedMedia, sessionId, positionSeconds: 0, volume: 1 });
    projection = await repo.projectionForRole("loge", roomId, "viewer", "loge-a");
    expect(projection.loge?.preview.mediaName).toBe("eclipse-premix-v7.wav");
    expect(projection.loge?.preview).toMatchObject({ durationSeconds: 127.224, channels: 2, sampleRate: 48_000, transportStatus: "playing" });
    expect(projection.loge?.preview.waveformPeaks.length).toBeGreaterThan(0);

    await repo.execute("loge", roomId, "host", { type: "loge.preview.pause", expectedMedia, sessionId });
    projection = await repo.projectionForRole("loge", roomId, "viewer", "loge-a");
    expect(projection.loge?.preview).toMatchObject({ mediaName: "eclipse-premix-v7.wav", transportStatus: "paused" });

    await repo.execute("loge", roomId, "host", { type: "loge.preview.finish", expectedMedia, sessionId });
    projection = await repo.projectionForRole("loge", roomId, "viewer", "loge-a");
    expect(projection.loge?.preview).toMatchObject({ mediaName: "", mediaPath: null, durationSeconds: null, channels: null, sampleRate: null, waveformPeaks: [] });
  });

  it("requires legendary Host creation and supports preview/questions/moments", async () => {
    const fixture = createRoomToolsFixture("loge");
    expect(canOpenSpecializedRoom("loge", fixture, "host")).toBe(true);
    fixture.loge!.legendaryHost = false;
    expect(canOpenSpecializedRoom("loge", fixture, "host")).toBe(false);
    const { repository: repo, roomId } = repository("loge");
    let state = await repo.execute("loge", roomId, "host", {
      type: "loge.preview.launch",
      expectedMedia: { mediaName: "eclipse-premix-v7.wav", mediaPath: null },
      sessionId: "preview:loge-tools-test",
      positionSeconds: 0,
      volume: 1,
    });
    expect(state.loge?.preview).toMatchObject({ playing: true, transportStatus: "playing", sessionId: "preview:loge-tools-test" });
    state = await repo.execute("loge", roomId, "host", { type: "loge.question.status", questionId: "q-2", status: "selected" });
    expect(state.loge?.questions.find((question) => question.id === "q-2")?.status).toBe("selected");
    await repo.execute("loge", roomId, "host", { type: "loge.moment.status", momentId: "moment-1", status: "live" });
    state = await repo.execute("loge", roomId, "host", { type: "loge.moment.status", momentId: "moment-1", status: "completed" });
    expect(state.loge?.moments.find((moment) => moment.id === "moment-1")?.status).toBe("completed");
  });

  it("creates a real Moments VIP redemption for experiential gifts", async () => {
    const { repository: repo, roomId } = repository("loge");
    const state = await repo.execute("loge", roomId, "viewer", { type: "gift.send", accountId: "vip-fan", recipientId: "loge-a", giftCode: "vip-pass", origin: "EARNED", idempotencyKey: "loge-vip" }, "vip-fan");
    expect(state.gifts.redemptions[0]).toMatchObject({ kind: "vip-moment", status: "pending" });
    expect(state.loge?.moments.some((moment) => moment.kind === "gift-redemption")).toBe(true);
  });

  it("uses an experiential reward exactly once and closes its VIP moment", async () => {
    const { repository: repo, roomId } = repository("loge");
    const delivered = await repo.execute("loge", roomId, "viewer", { type: "gift.send", accountId: "vip-fan", recipientId: "loge-a", giftCode: "private-access", origin: "EARNED", idempotencyKey: "loge-use-once" }, "vip-fan");
    const redemption = delivered.gifts.redemptions.find((item) => item.transactionId === delivered.gifts.transactions.find((item) => item.idempotencyKey === "loge-use-once")?.id)!;
    await repo.execute("loge", roomId, "viewer", { type: "gift.redemption.use", accountId: "loge-a", redemptionId: redemption.id }, "loge-a");
    const replay = await repo.execute("loge", roomId, "viewer", { type: "gift.redemption.use", accountId: "loge-a", redemptionId: redemption.id }, "loge-a");
    expect(replay.gifts.redemptions.find((item) => item.id === redemption.id)?.status).toBe("redeemed");
    expect(replay.loge?.moments.find((moment) => moment.id === `moment-${redemption.transactionId}`)?.status).toBe("completed");
  });
});

describe("shared gifts", () => {
  it("ships rich stock, completed and pending transaction fixtures", () => {
    const state = createRoomToolsFixture("scene", "gift-fixture-room");
    expect(new Set(state.gifts.stock.map((item) => item.origin))).toEqual(new Set(["SYSTEM", "EARNED", "PURCHASED"]));
    expect(state.gifts.transactions.some((item) => item.status === "COMPLETED")).toBe(true);
    expect(state.gifts.transactions.some((item) => item.status === "PENDING")).toBe(true);
    expect(state.gifts.redemptions.some((item) => item.kind === "vip-moment")).toBe(true);
  });
  it("decrements stock once and treats a double click idempotently", async () => {
    const { repository: repo, roomId } = repository("scene");
    const command: RoomToolsCommand = { type: "gift.send", accountId: "fan", recipientId: "scene-a", giftCode: "force-card", origin: "SYSTEM", idempotencyKey: "one-click" };
    const first = await repo.execute("scene", roomId, "viewer", command, "fan");
    const second = await repo.execute("scene", roomId, "viewer", command, "fan");
    expect(first.gifts.stock.find((item) => item.giftCode === "force-card" && item.origin === "SYSTEM")?.quantity).toBe(2);
    expect(second.gifts.transactions.filter((item) => item.idempotencyKey === "one-click")).toHaveLength(1);
    expect(second.gifts.stock.find((item) => item.giftCode === "force-card" && item.origin === "SYSTEM")?.quantity).toBe(2);
  });

  it("rejects exhausted stock and empty raffles without consuming", async () => {
    const { repository: repo, roomId } = repository("scene");
    await expect(repo.execute("scene", roomId, "viewer", { type: "gift.send", accountId: "fan", recipientId: "scene-a", giftCode: "force-card", origin: "PURCHASED", idempotencyKey: "empty-stock" }, "fan")).rejects.toThrow("room_gift_inventory_empty");
    const before = await repo.load("scene", roomId);
    await expect(repo.execute("scene", roomId, "viewer", { type: "gift.raffle", accountId: "fan", eligibleRecipientIds: [], giftCode: "force-card", origin: "SYSTEM", idempotencyKey: "empty-raffle" }, "fan")).rejects.toThrow("room_gift_raffle_empty");
    const after = await repo.load("scene", roomId);
    expect(after.gifts.stock).toEqual(before.gifts.stock);
  });

  it("rejects an ineligible recipient", async () => {
    const { repository: repo, roomId } = repository("scene");
    await expect(repo.execute("scene", roomId, "viewer", { type: "gift.send", accountId: "fan", recipientId: "bot-or-departed", giftCode: "force-card", origin: "SYSTEM", idempotencyKey: "bad-recipient" }, "fan")).rejects.toThrow("room_gift_recipient_ineligible");
  });
});


describe("Classe demo ticket", () => {
  it("honors the host price and rejects duplicate seats and stale prices", async () => {
    const {repository: repo, roomId} = repository("classe");
    const initial = await repo.load("classe", roomId);
    const person = {...initial.classe!.people[1], id:"ticket-student", name:"Test élève"};
    expect(initial.classe!.seats.filter(s => !s.person).map(s => s.number)).toEqual([20,21,22,23,24]);
    await repo.execute("classe",roomId,"host",{type:"classe.seat.price",cents:699});
    await expect(repo.execute("classe",roomId,"viewer",{type:"classe.demo.seat.purchase",seat:20,person,cents:499},person.id)).rejects.toThrow("class_price_changed");
    const result = await repo.execute("classe",roomId,"viewer",{type:"classe.demo.seat.purchase",seat:20,person,cents:699},person.id);
    expect(result.classe!.seats[19].person?.id).toBe(person.id);
    await expect(repo.execute("classe",roomId,"viewer",{type:"classe.demo.seat.purchase",seat:21,person,cents:699},person.id)).rejects.toThrow("class_seat_unavailable");
    await expect(repo.execute("classe",roomId,"viewer",{type:"classe.seat.price",cents:1},person.id)).rejects.toThrow("room_tool_forbidden");
  });
});

 it("records a demo fundraiser contribution once and rejects a closed campaign",()=>{
  const state=createRoomToolsFixture("scene");
  const campaign=state.scene!.fundraiser;
  campaign.status="live";campaign.visibleInLive=true;campaign.endAt="";
  const before=campaign.collectedAmount, count=campaign.contributionCount;
  const command={type:"scene.fundraiser.demo.contribute" as const,campaignId:campaign.id,amountCents:1000,contributionId:"donation-test"};
  reduceCommand(state,command);reduceCommand(state,command);
  expect(campaign.collectedAmount).toBe(before+10);expect(campaign.contributionCount).toBe(count+1);
  campaign.status="closed";
  expect(()=>reduceCommand(state,{...command,contributionId:"other"})).toThrow("scene_campaign_unavailable");
 });

it("lets the demo grant the floor after migration without turning on the device",()=>{
 const state=createRoomToolsFixture("classe","migration");const seat=state.classe!.seats[0];
 seat.person!.microphone="off";seat.status="reserved";
 reduceCommand(state,{type:"classe.speaker",personId:seat.person!.id});
 expect(state.classe!.activeSpeakerId).toBe(seat.person!.id);expect(seat.person!.microphone).toBe("off");
 reduceCommand(state,{type:"classe.speaker",personId:null});expect(seat.status).toBe("listening");
});
