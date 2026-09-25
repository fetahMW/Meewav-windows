import { describe, expect, it } from "vitest";
import {
  MEEWAV_PILLAR_SEMANTIC_ACCENTS,
  resolveMeewavPillarAccent,
} from "./MeewavPillarTabs";

describe("resolveMeewavPillarAccent", () => {
  it("keeps Accueil white even when a local configuration supplies another color", () => {
    expect(resolveMeewavPillarAccent({
      id: "home",
      label: "Accueil",
      accent: "#7E48EE",
    })).toBe(MEEWAV_PILLAR_SEMANTIC_ACCENTS.home);
  });

  it("reserves green for Statistique and pink-violet for Médias", () => {
    expect(resolveMeewavPillarAccent({
      id: "stats",
      label: "Statistique",
      accent: "#ffffff",
    })).toBe(MEEWAV_PILLAR_SEMANTIC_ACCENTS.statistics);

    expect(resolveMeewavPillarAccent({
      id: "media",
      label: "Médias",
      accent: "#ffffff",
    })).toBe(MEEWAV_PILLAR_SEMANTIC_ACCENTS.media);
  });

  it("preserves the chosen accent for every other section", () => {
    expect(resolveMeewavPillarAccent({
      id: "rental",
      label: "Location",
      accent: "#27C2D1",
    })).toBe("#27C2D1");
  });
});
