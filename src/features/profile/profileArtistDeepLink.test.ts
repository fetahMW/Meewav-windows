import { describe, expect, it } from "vitest";
import {
  getProfileArtistDeepLink,
  safeProfileArtistReference,
} from "./profileArtistDeepLink";

describe("profile artist deep-link contract", () => {
  it("accepts canonical profile ids and local demo slugs", () => {
    expect(safeProfileArtistReference("51000000-0000-4000-8000-000000000001"))
      .toBe("51000000-0000-4000-8000-000000000001");
    expect(getProfileArtistDeepLink("?artist=shorts-naya-k"))
      .toBe("shorts-naya-k");
  });

  it("rejects paths, query injection and oversized references", () => {
    expect(safeProfileArtistReference("../market" )).toBeNull();
    expect(getProfileArtistDeepLink("?artist=%2Frooms%3Fadmin%3D1")).toBeNull();
    expect(safeProfileArtistReference(`artist-${"x".repeat(220)}`)).toBeNull();
  });
});
