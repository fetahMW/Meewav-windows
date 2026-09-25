import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoomToolsFixture } from "../roomTools.fixtures";
import type { LogeState } from "../roomTools.types";
import { LogePreviewPlayer } from "./RoomAudienceInteractions";

const requestLogePreviewMediaUrl = vi.hoisted(() => vi.fn());

vi.mock("../audio/logePreviewMedia.service", () => ({ requestLogePreviewMediaUrl }));

const ROOM_ID = "51000000-0000-4000-8000-000000000097";

function activePreview(): LogeState["preview"] {
  const preview = createRoomToolsFixture("loge", ROOM_ID).loge!.preview;
  return {
    ...preview,
    mediaName: "exclusive.wav",
    mediaPath: `${ROOM_ID}/52000000-0000-4000-8000-000000000097/53000000-0000-4000-8000-000000000097.wav`,
    mediaKind: "audio",
    durationSeconds: 300,
    transportStatus: "playing",
    sessionId: "preview:session-1",
    startedAt: "2026-08-21T18:00:00.000Z",
    playing: true,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-21T18:00:00.000Z"));
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("LogePreviewPlayer signed URL renewal", () => {
  it("renews a short viewer URL before it expires while the session stays live", async () => {
    requestLogePreviewMediaUrl
      .mockResolvedValueOnce({ signedUrl: "https://media.example.test/exclusive.wav?token=first", expiresAt: "2026-08-21T18:00:10.000Z" })
      .mockResolvedValueOnce({ signedUrl: "https://media.example.test/exclusive.wav?token=renewed", expiresAt: "2026-08-21T18:02:00.000Z" });

    const { container } = render(<LogePreviewPlayer roomId={ROOM_ID} source="live" preview={activePreview()} available />);
    await act(async () => { await Promise.resolve(); });
    expect(requestLogePreviewMediaUrl).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(5_001);
      await Promise.resolve();
      vi.advanceTimersByTime(20);
    });

    expect(requestLogePreviewMediaUrl).toHaveBeenCalledTimes(2);
    expect(container.querySelector("audio")).toHaveAttribute("src", "https://media.example.test/exclusive.wav?token=renewed");
  });
});
