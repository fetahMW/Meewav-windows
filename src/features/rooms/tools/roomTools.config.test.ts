import { describe, expect, it } from "vitest";
import { PLACE_ROOM_PRESENTATION } from "../roomPresentation";
import { SPECIALIZED_ROOM_TOOL_CONFIGS, canControlRoomTool, resolveRoomActorRole } from "./roomTools.config";

describe("specialized Room tool contracts", () => {
  it("keeps only room-specific tools in each specialized Room", () => {
    for (const tools of Object.values(SPECIALIZED_ROOM_TOOL_CONFIGS)) {
      expect(tools.length).toBeGreaterThan(0);
      expect(new Set(tools.map((tool) => tool.id)).size).toBe(tools.length);
      expect(tools.some((tool) => ["classe-screen", "wave-screen", "loge-audience-choice", "gift"].includes(tool.id))).toBe(false);
    }
    expect(SPECIALIZED_ROOM_TOOL_CONFIGS.wave.map((tool) => tool.id)).toEqual(["wave-gate", "wave-sequencer", "wave-orchestra"]);
    expect(SPECIALIZED_ROOM_TOOL_CONFIGS.cage.map((tool) => tool.id)).toEqual(["cage-competition", "cage-battle", "cage-vote"]);
  });

  it("matches the definitive labels without duplicated mixer features", () => {
    expect(SPECIALIZED_ROOM_TOOL_CONFIGS.scene.map((tool) => tool.label)).toEqual(["Programme", "Prompteur", "Évaluation", "Cagnotte"]);
    expect(SPECIALIZED_ROOM_TOOL_CONFIGS.classe.map((tool) => tool.label)).toEqual(["La Classe", "Questions de la classe"]);
    expect(SPECIALIZED_ROOM_TOOL_CONFIGS.classe.map((tool) => tool.id)).toEqual(["classe-room", "classe-questions"]);
    expect(SPECIALIZED_ROOM_TOOL_CONFIGS.classe.map((tool) => tool.description)).toEqual([
      "Gère tes 24 élèves premium",
      "Choisis les questions auxquelles répondre",
    ]);
    expect(SPECIALIZED_ROOM_TOOL_CONFIGS.wave.map((tool) => tool.label)).toEqual(["Sas des boucles", "Vote du public", "Beat collectif"]);
    expect(SPECIALIZED_ROOM_TOOL_CONFIGS.cage.map((tool) => tool.label)).toEqual(["Bracket", "Régie", "Vote & verdict"]);
    expect(SPECIALIZED_ROOM_TOOL_CONFIGS.loge.map((tool) => tool.label)).toEqual(["VIP", "Questions"]);
    expect(SPECIALIZED_ROOM_TOOL_CONFIGS.loge.map((tool) => tool.id)).toEqual(["loge-dedication", "loge-questions"]);
    const forbidden = /mixeur|auto-tune|reverb|réverb|chronomètre|file d'attente invités/i;
    expect(Object.values(SPECIALIZED_ROOM_TOOL_CONFIGS).flat().some((tool) => forbidden.test(`${tool.label} ${tool.description}`))).toBe(false);
  });

  it("keeps the official Place presentation contract untouched", () => {
    expect(PLACE_ROOM_PRESENTATION).toEqual({ id: "place", label: "La Place", uppercaseLabel: "LA PLACE", theme: "white", toolsReady: true });
    expect("place" in SPECIALIZED_ROOM_TOOL_CONFIGS).toBe(false);
  });

  it("keeps full tool names while exposing compact labels where the shared rail needs them", () => {
    expect(SPECIALIZED_ROOM_TOOL_CONFIGS.wave.map(({ id, label, shortLabel }) => ({ id, label, shortLabel }))).toEqual([
      { id: "wave-gate", label: "Sas des boucles", shortLabel: "Boucle" },
      { id: "wave-sequencer", label: "Vote du public", shortLabel: "Vote" },
      { id: "wave-orchestra", label: "Beat collectif", shortLabel: "Beat" },
    ]);
    expect(SPECIALIZED_ROOM_TOOL_CONFIGS.scene.map((tool) => tool.shortLabel ?? tool.label)).toEqual(["Programme", "Prompteur", "Évaluation", "Cagnotte"]);
    expect(SPECIALIZED_ROOM_TOOL_CONFIGS.classe.map((tool) => tool.shortLabel ?? tool.label)).toEqual(["La Classe", "Questions"]);
    expect(SPECIALIZED_ROOM_TOOL_CONFIGS.cage.map((tool) => tool.shortLabel ?? tool.label)).toEqual(["Bracket", "Régie", "Vote"]);
    expect(SPECIALIZED_ROOM_TOOL_CONFIGS.loge.map((tool) => tool.shortLabel ?? tool.label)).toEqual(["VIP", "Questions"]);
  });

  it("does not grant production controls to viewers", () => {
    expect(canControlRoomTool(SPECIALIZED_ROOM_TOOL_CONFIGS.scene[0], "viewer")).toBe(false);
    expect(canControlRoomTool(SPECIALIZED_ROOM_TOOL_CONFIGS.scene[3], "viewer")).toBe(false);
    expect(resolveRoomActorRole("classe", false, true, "Élève")).toBe("viewer");
    expect(resolveRoomActorRole("wave", false, false, null)).toBe("visitor");
  });

  it("keeps real Classe audio controls aligned with the Host-only media authority", () => {
    const classeRoom = SPECIALIZED_ROOM_TOOL_CONFIGS.classe.find((tool) => tool.id === "classe-room")!;
    expect(canControlRoomTool(classeRoom, "host")).toBe(true);
    expect(canControlRoomTool(classeRoom, "teacher")).toBe(false);
    expect(canControlRoomTool(classeRoom, "regisseur")).toBe(false);
  });
});
