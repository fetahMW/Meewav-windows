import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultRoomsHomeSessionSnapshot,
  readRoomsHomeSessionSnapshot,
  resetRoomsHomeSessionSnapshot,
  ROOMS_HOME_SESSION_STORAGE_KEY,
  updateRoomsHomeSessionSnapshot,
  writeRoomsHomeSessionSnapshot,
} from "./roomsHome.session";

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("Rooms home session snapshot", () => {
  it("returns a fresh deterministic default when no snapshot exists", () => {
    expect(readRoomsHomeSessionSnapshot()).toEqual(createDefaultRoomsHomeSessionSnapshot());
    expect(readRoomsHomeSessionSnapshot().railScrollLeftBySlug)
      .not.toBe(readRoomsHomeSessionSnapshot().railScrollLeftBySlug);
  });

  it("round-trips the filter and every navigation position", () => {
    const snapshot = writeRoomsHomeSessionSnapshot({
      format: "vertical",
      homeScrollTop: 912.5,
      railScrollLeftBySlug: { buzz: 480, "pour-toi": 1220.25 },
      collectionScrollTopBySlug: { buzz: 2060 },
    });

    expect(snapshot).toEqual({
      format: "vertical",
      homeScrollTop: 912.5,
      railScrollLeftBySlug: { buzz: 480, "pour-toi": 1220.25 },
      collectionScrollTopBySlug: { buzz: 2060 },
    });
    expect(readRoomsHomeSessionSnapshot()).toEqual(snapshot);
  });

  it("repairs corrupt or stale persisted values instead of breaking the home", () => {
    window.sessionStorage.setItem(ROOMS_HOME_SESSION_STORAGE_KEY, JSON.stringify({
      format: "square",
      homeScrollTop: -30,
      railScrollLeftBySlug: { valid: 42, negative: -1, infinite: Number.POSITIVE_INFINITY },
      collectionScrollTopBySlug: "invalid",
    }));

    expect(readRoomsHomeSessionSnapshot()).toEqual({
      format: "all",
      homeScrollTop: 0,
      railScrollLeftBySlug: { valid: 42 },
      collectionScrollTopBySlug: {},
    });

    window.sessionStorage.setItem(ROOMS_HOME_SESSION_STORAGE_KEY, "{broken-json");
    expect(readRoomsHomeSessionSnapshot()).toEqual(createDefaultRoomsHomeSessionSnapshot());
  });

  it("merges position updates independently and can remove one saved rail", () => {
    updateRoomsHomeSessionSnapshot({
      format: "horizontal",
      homeScrollTop: 300,
      railScrollLeftBySlug: { buzz: 100, classe: 200 },
      collectionScrollTopBySlug: { buzz: 900 },
    });
    const updated = updateRoomsHomeSessionSnapshot({
      railScrollLeftBySlug: { buzz: 640, classe: null },
      collectionScrollTopBySlug: { "pour-toi": 1200 },
    });

    expect(updated).toEqual({
      format: "horizontal",
      homeScrollTop: 300,
      railScrollLeftBySlug: { buzz: 640 },
      collectionScrollTopBySlug: { buzz: 900, "pour-toi": 1200 },
    });
  });

  it("resets the persisted workspace state", () => {
    updateRoomsHomeSessionSnapshot({ homeScrollTop: 500 });

    expect(resetRoomsHomeSessionSnapshot()).toEqual(createDefaultRoomsHomeSessionSnapshot());
    expect(window.sessionStorage.getItem(ROOMS_HOME_SESSION_STORAGE_KEY)).toBeNull();
  });

  it("stays safe when browser storage access fails", () => {
    const unavailableStorage = {
      getItem: vi.fn(() => { throw new Error("blocked"); }),
      setItem: vi.fn(() => { throw new Error("blocked"); }),
      removeItem: vi.fn(() => { throw new Error("blocked"); }),
    };

    expect(readRoomsHomeSessionSnapshot(unavailableStorage))
      .toEqual(createDefaultRoomsHomeSessionSnapshot());
    expect(writeRoomsHomeSessionSnapshot({
      format: "all",
      homeScrollTop: 12,
      railScrollLeftBySlug: {},
      collectionScrollTopBySlug: {},
    }, unavailableStorage).homeScrollTop).toBe(12);
    expect(resetRoomsHomeSessionSnapshot(unavailableStorage))
      .toEqual(createDefaultRoomsHomeSessionSnapshot());
  });
});
