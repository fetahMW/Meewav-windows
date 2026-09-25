import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlaceConversationState } from "./placeConversationTools.domain";
import { usePlaceConversationTools } from "./placeConversationTools.store";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), refresh: null as null | (() => void), removeChannel: vi.fn() }));
vi.mock("../../../lib/supabaseClient", () => ({ supabase: {
  rpc: mocks.rpc, removeChannel: mocks.removeChannel,
  channel: () => {
    const channel = { on: (_event: string, _filter: unknown, callback: () => void) => { mocks.refresh = callback; return channel; }, subscribe: () => channel };
    return channel;
  },
} }));
afterEach(cleanup);
beforeEach(() => { mocks.rpc.mockReset(); mocks.refresh = null; });
const options = () => ({ roomId: crypto.randomUUID(), source: "live" as const, actorId: "host", isHost: true, canEngage: true, peopleIds: ["host"] });

describe("Place conversation state synchronization", () => {
  it("never substitutes a demo for an unavailable live contract", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "missing RPC" } });
    const input = options();
    const { result } = renderHook(() => usePlaceConversationTools(input));
    await waitFor(() => expect(result.current.error).toMatch(/indisponibles/));
    expect(result.current.state).toBeNull();
  });

  it("does not let an older acknowledgement overwrite a newer realtime revision", async () => {
    const initial = createPlaceConversationState();
    const committed = { ...initial, revision: 1, floor: { ...initial.floor, open: false } };
    const latest = { ...committed, revision: 2, floor: { ...committed.floor, prompt: "Un nouveau sujet" } };
    let acknowledge!: (result: unknown) => void;
    mocks.rpc.mockResolvedValueOnce({ data: initial, error: null })
      .mockImplementationOnce(() => new Promise((resolve) => { acknowledge = resolve; }))
      .mockResolvedValueOnce({ data: latest, error: null });
    const input = options();
    const { result } = renderHook(() => usePlaceConversationTools(input));
    await waitFor(() => expect(result.current.state?.revision).toBe(0));
    let request!: Promise<boolean>;
    act(() => { request = result.current.execute({ type: "floor.open", open: false }); });
    act(() => mocks.refresh?.());
    await waitFor(() => expect(result.current.state?.revision).toBe(2));
    await act(async () => { acknowledge({ data: committed, error: null }); await request; });
    expect(result.current.state?.floor.prompt).toBe("Un nouveau sujet");
    expect(result.current.state?.revision).toBe(2);
  });

  it("reloads conflicting state and reports a failed action without retrying it", async () => {
    const initial = createPlaceConversationState();
    mocks.rpc.mockResolvedValueOnce({ data: initial, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "place_tools_revision_conflict" } })
      .mockResolvedValueOnce({ data: { ...initial, revision: 2 }, error: null });
    const input = options();
    const { result } = renderHook(() => usePlaceConversationTools(input));
    await waitFor(() => expect(result.current.state).not.toBeNull());
    await act(async () => { expect(await result.current.execute({ type: "floor.open", open: false })).toBe(false); });
    expect(result.current.state?.revision).toBe(2);
    expect(result.current.error).toMatch(/Room a changé/);
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "rooms_apply_place_tools_v1")).toHaveLength(1);
  });
});
