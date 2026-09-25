import { describe, expect, it } from "vitest";
import { createGlobeMessagingPath } from "./messagingNavigation";

describe("createGlobeMessagingPath", () => {
  it("ouvre une conversation ciblée depuis une pop-up du Globe", () => {
    expect(createGlobeMessagingPath("artist/42", "message")).toBe(
      "/messages?space=messages&intent=message&source=globe&mode=demo&mockArtistId=artist%2F42",
    );
  });

  it("ouvre les collaborations avec le profil ciblé", () => {
    expect(createGlobeMessagingPath(
      "20000000-0000-4000-8000-000000000002",
      "collaboration",
      "real",
      "30000000-0000-4000-8000-000000000003",
    )).toBe(
      "/messages?space=collabs&intent=collaboration&source=globe&mode=real&profileId=20000000-0000-4000-8000-000000000002&request=30000000-0000-4000-8000-000000000003",
    );
  });
});
