import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PlaceGiftDrawOverlay from "./PlaceGiftDrawOverlay";
import type { RoomGiftDraw } from "./place.types";

function draw(overrides: Partial<RoomGiftDraw> = {}): RoomGiftDraw {
  const now = Date.now();
  return {
    id: "draw-1",
    giftCode: "vip-pass",
    giftLabel: "Pass VIP",
    poolMode: "selected",
    status: "spinning",
    eligibleCount: 24,
    scheduledAt: null,
    startedAt: new Date(now).toISOString(),
    revealAt: new Date(now + 1_000).toISOString(),
    revealedAt: null,
    winner: null,
    createdAt: new Date(now).toISOString(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("PlaceGiftDrawOverlay", () => {
  it("n’affiche que le compteur public sans déclencher de mutation", async () => {
    vi.useFakeTimers();
    render(<PlaceGiftDrawOverlay draw={draw()} />);

    expect(screen.getByText("24 personnes participent")).toBeInTheDocument();
    expect(screen.queryByText("Aïcha Sol")).not.toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(1_050);
    expect(screen.getByTestId("place-gift-draw-overlay")).toHaveAttribute("aria-live", "off");
  });

  it("révèle uniquement l’identité gagnante publiée", () => {
    render(<PlaceGiftDrawOverlay draw={draw({
      status: "revealed",
      revealAt: new Date(Date.now()).toISOString(),
      revealedAt: new Date(Date.now()).toISOString(),
      winner: {
        key: "profile-1",
        profileId: "profile-1",
        displayName: "Aïcha Sol",
        avatarUrl: null,
        source: "room",
      },
    })} />);
    expect(screen.getByText("Aïcha Sol")).toBeInTheDocument();
    expect(screen.getByText("LE CADEAU EST POUR")).toBeInTheDocument();
  });

  it("retire le résultat avec un timeout unique après douze secondes", async () => {
    vi.useFakeTimers();
    render(<PlaceGiftDrawOverlay draw={draw({
      status: "revealed",
      revealAt: new Date(Date.now() - 30_000).toISOString(),
      revealedAt: new Date(Date.now()).toISOString(),
      winner: { key: "profile-1", profileId: "profile-1", displayName: "Aïcha Sol", avatarUrl: null, source: "room" },
    })} />);
    expect(screen.getByTestId("place-gift-draw-overlay")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_050);
    });
    expect(screen.queryByTestId("place-gift-draw-overlay")).not.toBeInTheDocument();
  });

  it("laisse douze secondes complètes après une révélation Realtime en retard", async () => {
    vi.useFakeTimers();
    render(<PlaceGiftDrawOverlay draw={draw({
      status: "revealed",
      // This reproduces the real failure: without `revealedAt`, the old code
      // started the visibility window at the planned deadline, before the
      // delayed public payload had even reached this client.
      revealAt: new Date(Date.now() - 30_000).toISOString(),
      revealedAt: null,
      winner: { key: "profile-1", profileId: "profile-1", displayName: "Aïcha Sol", avatarUrl: null, source: "room" },
    })} />);

    expect(screen.getByText("Aïcha Sol")).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_999);
    });
    expect(screen.getByTestId("place-gift-draw-overlay")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.queryByTestId("place-gift-draw-overlay")).not.toBeInTheDocument();
  });
});
