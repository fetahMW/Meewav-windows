import { describe, expect, it } from "vitest";
import {
  classifyStageAspectRatio,
  compositionToStageMode,
  createInitialProgramLayout,
  createInitialViewerLayout,
  resolveLayoutRecipe,
  resolveStageDisplaySize,
  stageModeToComposition,
  type PlaceStageAspectRatio,
  type PlaceStageComposition,
  type PlaceStageDisplaySize,
  type PlaceStageLayoutRecipe,
  type PlaceStageParticipant,
} from "./placeStageLayoutEngine";

const FORMATS = ["16:9", "9:16"] as const;
const COMPOSITIONS = ["ensemble", "focus", "solo"] as const satisfies readonly PlaceStageComposition[];
const DISPLAY_SIZES = ["normal", "expanded", "fullscreen"] as const satisfies readonly PlaceStageDisplaySize[];

function formatCombinations(length: number): PlaceStageAspectRatio[][] {
  if (length === 0) return [[]];
  return formatCombinations(length - 1).flatMap((prefix) => FORMATS.map((format) => [...prefix, format]));
}

function expectedRecipe(
  ratios: PlaceStageAspectRatio[],
  composition: PlaceStageComposition,
): PlaceStageLayoutRecipe {
  const count = ratios.length;
  if (count <= 1 || composition === "solo") return "solo";
  if (composition === "focus") {
    if (count === 2) return "stage-pip";
    if (count === 3) return "stage-plus-two";
    return "stage-plus-three";
  }
  const shortCount = ratios.filter((ratio) => ratio === "9:16").length;
  if (shortCount === count) return "vertical-gallery";
  if (shortCount > 0) return "mixed-grid";
  if (count === 2) return "grid-two";
  if (count === 3) return "grid-three";
  return "grid-2x2";
}

const MATRIX = Array.from({ length: 4 }, (_, index) => formatCombinations(index + 1)).flat().flatMap((ratios) => (
  COMPOSITIONS.flatMap((composition) => DISPLAY_SIZES.map((displaySize) => ({ ratios, composition, displaySize })))
));

describe("placeStageLayoutEngine — matrice Normal / Short", () => {
  it.each(MATRIX)(
    "$ratios · $composition · $displaySize",
    ({ ratios, composition, displaySize }) => {
      const viewer = createInitialViewerLayout();
      const mode = compositionToStageMode(composition);
      const recipe = resolveLayoutRecipe({
        participantCount: ratios.length,
        mode,
        viewer,
        allVertical: ratios.every((ratio) => ratio === "9:16"),
        participantAspectRatios: ratios,
      });

      expect(recipe).toBe(expectedRecipe(ratios, composition));
      expect(stageModeToComposition(mode)).toBe(composition);
      expect(resolveStageDisplaySize({
        panelCollapsed: displaySize === "expanded",
        fullscreen: displaySize === "fullscreen",
      })).toBe(displaySize);
    },
  );

  it("garde la composition quand la scène passe en plein écran", () => {
    const viewer = { ...createInitialViewerLayout(), fullscreenParticipantId: "participant-1" };
    expect(resolveLayoutRecipe({
      participantCount: 4,
      mode: "grid",
      viewer,
      allVertical: false,
      participantAspectRatios: ["16:9", "16:9", "9:16", "9:16"],
    })).toBe("mixed-grid");
  });

  it("démarre en Solo avec le host comme participant de référence", () => {
    const host = {
      id: "host",
      status: "host",
      profile: { id: "host-profile", displayName: "Host", handle: "@host", role: "Host", city: "Paris", avatarUrl: "/images/host.webp", gradeLevel: 1 },
      joinedAt: new Date(0).toISOString(),
      isCameraEnabled: true,
      isMicrophoneEnabled: true,
      isSpeaking: false,
      latencyMs: 20,
    } satisfies PlaceStageParticipant;
    const layout = createInitialProgramLayout([host], host.profile.id);
    expect(layout.mode).toBe("solo");
    expect(layout.primaryParticipantId).toBe(host.id);
  });

  it.each([
    [1080, 1920, "9:16"],
    [1920, 1080, "16:9"],
    [1280, 960, "4:3"],
    [0, 1080, undefined],
  ] as const)("classe %s × %s en %s", (width, height, expected) => {
    expect(classifyStageAspectRatio(width, height)).toBe(expected);
  });
});
