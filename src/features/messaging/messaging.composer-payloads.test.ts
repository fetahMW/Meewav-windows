import { describe, expect, it } from "vitest";
import {
  buildMessagingBriefPayload,
  buildMessagingTrackPackPayload,
} from "./messaging.composer-payloads";

describe("messaging composer payloads", () => {
  it("produit le schéma serveur v1 d’un brief sans inventer de valeurs", () => {
    expect(buildMessagingBriefPayload("Trap", 140)).toEqual({
      schema_version: 1,
      style_key: "Trap",
      bpm: 140,
    });
    expect(buildMessagingBriefPayload(null, null)).toEqual({ schema_version: 1 });
  });

  it("produit le schéma serveur v1 d’un Track Pack dans l’ordre des pistes", () => {
    expect(buildMessagingTrackPackPayload(
      ["drums.wav", "bass.wav"],
      ["3:28", "3:15"],
    )).toEqual({
      schema_version: 1,
      tracks: ["drums.wav", "bass.wav"],
      durations: ["3:28", "3:15"],
    });
  });
});
