import { describe, expect, it } from "vitest";
import {
  getMonGlobeInitialDestination,
  MON_GLOBE_AUTH_NAVIGATION_STATE,
  MON_GLOBE_AUTH_RETURN_ROUTE,
  MON_GLOBE_HOST_POSITION_NAVIGATION_STATE,
} from "./monGlobeContract";

describe("monGlobeContract", () => {
  it("keeps the auth flight across local navigation and a full OAuth return", () => {
    expect(getMonGlobeInitialDestination(MON_GLOBE_AUTH_NAVIGATION_STATE)).toBe("authentication");
    expect(getMonGlobeInitialDestination(null, new URL(MON_GLOBE_AUTH_RETURN_ROUTE, "https://meewav.test").search)).toBe("authentication");
    expect(getMonGlobeInitialDestination(null, "?intro=other")).toBe("startup");
  });

  it("prioritizes an explicit host return over a previous auth query", () => {
    expect(getMonGlobeInitialDestination(MON_GLOBE_HOST_POSITION_NAVIGATION_STATE, "?intro=auth")).toBe("host-position");
  });

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
