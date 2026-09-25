import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { usePlaceRoom } from "./usePlaceRoom";
afterEach(cleanup);
it("adds and withdraws exactly one viewer Like", async () => {
  const { result } = renderHook(() => usePlaceRoom({ demoRole: "viewer" }));
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  const initial = result.current.room.likesCount;
  await act(() => result.current.toggleLike());
  expect(result.current.room.currentUserHasLiked).toBe(true);
  expect(result.current.room.likesCount).toBe(initial + 1);
  await act(() => result.current.toggleLike());
  expect(result.current.room.currentUserHasLiked).toBe(false);
  expect(result.current.room.likesCount).toBe(initial);
});
it("keeps the host Like counter read-only", async () => {
  const { result } = renderHook(() => usePlaceRoom({ demoRole: "host" }));
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  const initial = result.current.room.likesCount;
  await act(() => result.current.toggleLike());
  expect(result.current.room.likesCount).toBe(initial);
});
