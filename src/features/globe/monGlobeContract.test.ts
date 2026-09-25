import { describe, expect, it } from "vitest";
import {
  getMonGlobeInitialDestination,
  MON_GLOBE_HOST_POSITION_NAVIGATION_STATE,
} from "./monGlobeContract";

describe("monGlobeContract", () => {
  it("marks an explicit internal return as the host position", () => {
    expect(getMonGlobeInitialDestination(
      MON_GLOBE_HOST_POSITION_NAVIGATION_STATE,
    )).toBe("host-position");
  });

  it.each([undefined, null, {}, { monGlobeDestination: "startup" }])(
    "keeps ordinary arrivals on the standard startup for %o",
    (state) => {
      expect(getMonGlobeInitialDestination(state)).toBe("startup");
    },
  );
});
