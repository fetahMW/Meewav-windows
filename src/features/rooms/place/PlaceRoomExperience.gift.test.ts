import { describe, expect, it } from "vitest";
import experienceSource from "./PlaceRoomExperience.tsx?raw";
import studioSource from "./PlaceStudioPanel.tsx?raw";

describe("Place direct gift wiring", () => {
  it("propagates the Room delivery callback from Experience through Studio to GiftTool", () => {
    expect(experienceSource).toMatch(/onSubmitGift=\{place\.submitGift\}/);
    expect(studioSource).toMatch(/onSubmitGift=\{props\.onSubmitGift\}/);
    expect(studioSource).toMatch(/onSubmit=\{onSubmitGift \? submitDirectGift : undefined\}/);
  });
});
