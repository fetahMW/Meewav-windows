import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { parseCageAudienceFundraiser, useCageAudienceFundraiser } from "./useCageAudienceFundraiser";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("../../../../lib/supabaseClient", () => ({ supabase: { rpc } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); });
const fund = { room_id: "room", title: "Studio", beneficiary: "Artistes", target_eur: 1500, status: "open" };
it("accepts only a published fund for the requested room", () => {
  expect(parseCageAudienceFundraiser(fund, "room")).toEqual({ title: "Studio", beneficiary: "Artistes", target: 1500, isOpen: true });
  expect(parseCageAudienceFundraiser({ ...fund, status: "draft" }, "room")).toBeNull();
  expect(parseCageAudienceFundraiser(fund, "other-room")).toBeNull();
  expect(parseCageAudienceFundraiser({ ...fund, target_eur: NaN }, "room")).toBeNull();
});
it("never contacts live services in demo and isolates responses across rooms", async () => {
  rpc.mockResolvedValue({ data: fund, error: null });
  const hook = renderHook(({ enabled, room }) => useCageAudienceFundraiser(room, "viewer", enabled), { initialProps: { enabled: false, room: "room" } });
  expect(rpc).not.toHaveBeenCalled();
  hook.rerender({ enabled: true, room: "room" });
  await waitFor(() => expect(hook.result.current.fundraiser?.title).toBe("Studio"));
  rpc.mockReturnValue(new Promise(() => {}));
  hook.rerender({ enabled: true, room: "other" });
  expect(hook.result.current.fundraiser).toBeNull();
});
it("stops polling an older server without the optional contract", async () => {
  vi.useFakeTimers();
  rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
  const hook = renderHook(() => useCageAudienceFundraiser("room", "viewer", true));
  await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(hook.result.current.fundraiser).toBeNull();
  expect(hook.result.current.error).toBeUndefined();
});

it("reports temporary failure and retries without exposing a stale fund", async () => {
  vi.useFakeTimers();
  rpc.mockResolvedValueOnce({ data: null, error: { code: "NETWORK" } }).mockResolvedValue({ data: fund, error: null });
  const hook = renderHook(() => useCageAudienceFundraiser("room", "viewer", true));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(hook.result.current.error).toMatch(/indisponible/);
  expect(hook.result.current.fundraiser).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(hook.result.current.fundraiser?.title).toBe("Studio");
  expect(hook.result.current.error).toBeUndefined();
});
