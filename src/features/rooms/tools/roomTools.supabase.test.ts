import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { migrateCageDemoCompetition } from "./cageCompetition";
import { createRoomToolsFixture } from "./roomTools.fixtures";
import { SupabaseRoomToolsRepository } from "./roomTools.supabase";

describe("SupabaseRoomToolsRepository", () => {
  it("commits Host changes with the revision it actually loaded", async () => {
    const current = createRoomToolsFixture("scene", "51000000-0000-4000-8000-000000000090");
    const committed = { ...current, revision: current.revision + 1 };
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: current, error: null })
      .mockResolvedValueOnce({ data: committed, error: null });
    const repository = new SupabaseRoomToolsRepository({ rpc } as unknown as SupabaseClient);
    const result = await repository.execute("scene", current.roomId, "host", { type: "scene.program.status", entryId: "perf-2", status: "live" }, "host");
    expect(result.revision).toBe(committed.revision);
    expect(rpc).toHaveBeenNthCalledWith(2, "rooms_commit_specialized_state_v1", expect.objectContaining({ p_expected_revision: current.revision, p_room_type: "scene" }));
  });

  it("persists the sanitized Loge waveform analysis in authoritative JSONB state", async () => {
    const current = createRoomToolsFixture("loge", "51000000-0000-4000-8000-000000000094");
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: current, error: null })
      .mockImplementationOnce(async (_name, parameters) => ({
        data: { ...(parameters as { p_next_state: typeof current }).p_next_state, revision: current.revision + 1 },
        error: null,
      }));
    const repository = new SupabaseRoomToolsRepository({ rpc } as unknown as SupabaseClient);

    await repository.execute("loge", current.roomId, "host", {
      type: "loge.preview.patch",
      patch: {
        durationSeconds: 15.6254,
        channels: 2,
        sampleRate: 48_000,
        waveformPeaks: [-40_000, 40_000, -8_192.4, 12_288.7],
      },
    }, "host");

    const commit = rpc.mock.calls[1]?.[1] as { p_next_state: typeof current };
    expect(commit.p_next_state.loge?.preview).toMatchObject({
      durationSeconds: 15.625,
      channels: 2,
      sampleRate: 48_000,
      waveformPeaks: [-32_768, 32_767, -8_192, 12_289],
    });
  });

  it("initializes a live Loge without the demo audio asset", async () => {
    const roomId = "51000000-0000-4000-8000-000000000095";
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockImplementationOnce(async (_name, parameters) => ({
        data: (parameters as { p_initial_state: ReturnType<typeof createRoomToolsFixture> }).p_initial_state,
        error: null,
      }));
    const repository = new SupabaseRoomToolsRepository({ rpc } as unknown as SupabaseClient);

    await repository.projectionForRole("loge", roomId, "host", "host");

    const initialization = rpc.mock.calls[1]?.[1] as {
      p_initial_state: ReturnType<typeof createRoomToolsFixture>;
    };
    expect(initialization.p_initial_state.loge?.preview).toMatchObject({
      mediaName: "",
      mediaPath: null,
      playing: false,
      durationSeconds: null,
      channels: null,
      sampleRate: null,
      waveformPeaks: [],
    });
  });

  it("never initializes a live Wave in the legacy whole-state JSONB store", async () => {
    const roomId = "51000000-0000-4000-8000-000000000097";
    const rpc = vi.fn();
    const repository = new SupabaseRoomToolsRepository({ rpc } as unknown as SupabaseClient);

    await expect(repository.projectionForRole("wave", roomId, "host", "host"))
      .rejects.toThrow("wave_normalized_repository_required");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("initializes a live Classe without investor identities or scripted activity", async () => {
    const roomId = "51000000-0000-4000-8000-000000000098";
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockImplementationOnce(async (_name, parameters) => ({
        data: (parameters as { p_initial_state: ReturnType<typeof createRoomToolsFixture> }).p_initial_state,
        error: null,
      }))
      .mockResolvedValueOnce({ data: { room: { hands_open: true, media_consent_version: "1" }, floor_requests: [] }, error: null });
    const repository = new SupabaseRoomToolsRepository({ rpc } as unknown as SupabaseClient);

    await repository.projectionForRole("classe", roomId, "host", "host");

    const initialization = rpc.mock.calls[1]?.[1] as {
      p_initial_state: ReturnType<typeof createRoomToolsFixture>;
    };
    const classe = initialization.p_initial_state.classe;
    expect(classe?.people).toEqual([]);
    expect(classe?.seats).toHaveLength(24);
    expect(classe?.seats.every((seat) => !seat.person && seat.status === "free")).toBe(true);
    expect(classe?.raisedHands).toEqual([]);
    expect(classe?.activeSpeakerId).toBeNull();
    expect(classe?.publicCallStudentId).toBeNull();
    expect(classe?.privateTalkStudentId).toBeNull();
    expect(classe?.questions).toEqual([]);
    expect(JSON.stringify(classe)).not.toMatch(/class-(?:\d+|question)/);
    expect(rpc).toHaveBeenLastCalledWith("rooms_classe_host_state_v1", { p_room_id: roomId });
  });

  it("sends a Viewer only through the narrow action RPC", async () => {
    const projected = createRoomToolsFixture("cage", "51000000-0000-4000-8000-000000000091");
    migrateCageDemoCompetition(projected.cage!);
    const rpc = vi.fn().mockResolvedValue({ data: projected, error: null });
    const repository = new SupabaseRoomToolsRepository({ rpc } as unknown as SupabaseClient);
    await repository.execute("cage", projected.roomId, "viewer", { type: "cage.vote.cast", accountId: "viewer-a", choice: "A" }, "viewer-a");
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledWith("rooms_get_cage_state_v1", {p_room_id:projected.roomId});
    expect(rpc).toHaveBeenCalledWith("rooms_apply_cage_command_v1", expect.objectContaining({ p_action: "vote.cast", p_payload: { choice: "A" }, p_expected_match_id: projected.cage!.runtime!.activeMatchId }));
  });

  it("routes a Classe question through its server-authoritative RPC without trusting client identity fields", async () => {
    const projected = createRoomToolsFixture("classe", "51000000-0000-4000-8000-000000000096");
    const student = projected.classe?.seats.find((seat) => seat.person)?.person;
    if (!student) throw new Error("classe_fixture_student_missing");
    const rpc = vi.fn().mockResolvedValue({ data: projected, error: null });
    const repository = new SupabaseRoomToolsRepository({ rpc } as unknown as SupabaseClient);

    await repository.execute("classe", projected.roomId, "premium_participant", {
      type: "classe.question.add",
      question: {
        id: "client-question-id",
        author: student,
        text: "  Peux-tu rejouer ce passage ?  ",
        status: "answered",
        sentAt: "2000-01-01T00:00:00.000Z",
        supports: 99,
        supporterIds: [student.id],
      },
    }, student.id);

    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("rooms_apply_classe_question_action_v1", expect.objectContaining({
      p_action: "classe.question.add",
      p_payload: { text: "Peux-tu rejouer ce passage ?" },
    }));
  });

  it("fails closed for every live Wave before consulting the legacy contract", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST202", message: "schema cache" } });
    const repository = new SupabaseRoomToolsRepository({ rpc } as unknown as SupabaseClient);
    await expect(repository.projectionForRole("wave", "live-wave", "viewer", "viewer-safe"))
      .rejects.toThrow("wave_normalized_repository_required");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reloads the safe projection whenever Realtime subscribes or signals a revision", async () => {
    const projected = createRoomToolsFixture("scene", "51000000-0000-4000-8000-000000000092");
    projected.scene!.prompter.texts = [];
    let postgresChange: (() => void) | undefined;
    let statusChange: ((status: string) => void) | undefined;
    const channel = {
      on: vi.fn((_kind, _filter, listener) => { postgresChange = listener; return channel; }),
      subscribe: vi.fn((listener) => { statusChange = listener; return channel; }),
    };
    const rpc = vi.fn().mockResolvedValue({ data: projected, error: null });
    const removeChannel = vi.fn().mockResolvedValue(undefined);
    const client = { rpc, channel: vi.fn(() => channel), removeChannel } as unknown as SupabaseClient;
    const repository = new SupabaseRoomToolsRepository(client);
    const listener = vi.fn();
    const subscription = repository.subscribe("scene", projected.roomId, listener);
    statusChange?.("SUBSCRIBED");
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
    postgresChange?.();
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));
    expect(listener.mock.calls.every(([state]) => state.scene?.prompter.texts.length === 0)).toBe(true);
    subscription.unsubscribe();
    expect(removeChannel).toHaveBeenCalledWith(channel);
  });

  it("rejects a projection for a different specialized Room", async () => {
    const projected = createRoomToolsFixture("scene", "51000000-0000-4000-8000-000000000093");
    const rpc = vi.fn().mockResolvedValue({ data: projected, error: null });
    const repository = new SupabaseRoomToolsRepository({ rpc } as unknown as SupabaseClient);
    await expect(repository.projectionForRole("wave", projected.roomId, "viewer", "viewer-a"))
      .rejects.toThrow("wave_normalized_repository_required");
  });
});

it("routes Loge requests to authenticated RPC without sending a client identity or falling back to fake success", async () => {
  const rpc = vi.fn().mockResolvedValue({data:null,error:{code:"PGRST202",message:"loge request migration missing"}});
  const repository=new SupabaseRoomToolsRepository({rpc} as unknown as SupabaseClient);
  const viewer=createRoomToolsFixture("loge").loge!.questions[0].author;
  await expect(repository.execute("loge","51000000-0000-4000-8000-000000000094","viewer",{type:"loge.request.join",kind:"dedication",person:viewer},viewer.id)).rejects.toThrow("migration missing");
  expect(rpc).toHaveBeenCalledWith("rooms_apply_loge_request_v1",expect.objectContaining({p_action:"loge.request.join",p_payload:{kind:"dedication"}}));
});

 it("routes a format change to the serialized Cage RPC without a whole-state commit", async () => {
  const projected = createRoomToolsFixture("cage"); migrateCageDemoCompetition(projected.cage!);
  const rpc = vi.fn().mockResolvedValue({data:projected,error:null});
  const repo = new SupabaseRoomToolsRepository({rpc} as unknown as SupabaseClient);
  const command = {type:"cage.competition.command",action:"competition.configure",payload:{format:"open-mic",participantCount:8},idempotencyKey:crypto.randomUUID(),expectedRevision:42} as const;
  await repo.execute("cage",projected.roomId,"host",command,"host");
  expect(rpc).toHaveBeenCalledExactlyOnceWith("rooms_configure_cage_v1", {p_room_id:projected.roomId,p_payload:command.payload,p_idempotency_key:command.idempotencyKey,p_expected_revision:42});
  await expect(repo.execute("cage",projected.roomId,"viewer",command,"viewer")).rejects.toThrow("room_tool_forbidden");
 });
 it("does not replace a failed live Cage with demo state", async () => {
  const rpc=vi.fn().mockResolvedValue({data:null,error:{code:"PGRST202",message:"missing Cage RPC"}});
  const repo=new SupabaseRoomToolsRepository({rpc} as unknown as SupabaseClient);
  await expect(repo.projectionForRole("cage","live-room","host","host")).rejects.toThrow("missing Cage RPC");
  expect(rpc).toHaveBeenCalledOnce();
 });

it("publishes Cage results through its authenticated revisioned RPC", async () => {
 const projected=createRoomToolsFixture("cage"); migrateCageDemoCompetition(projected.cage!);
 const rpc=vi.fn().mockResolvedValue({data:projected,error:null});
 const repo=new SupabaseRoomToolsRepository({rpc} as unknown as SupabaseClient);
 const command={type:"cage.competition.command",action:"broadcast.results",payload:{enabled:true},idempotencyKey:crypto.randomUUID(),expectedRevision:7} as const;
 await repo.execute("cage",projected.roomId,"host",command,"host");
 expect(rpc).toHaveBeenCalledExactlyOnceWith("rooms_publish_cage_results_v1",{p_room_id:projected.roomId,p_payload:command.payload,p_idempotency_key:command.idempotencyKey,p_expected_revision:7});
 await expect(repo.execute("cage",projected.roomId,"viewer",command,"viewer")).rejects.toThrow("room_tool_forbidden");
});
