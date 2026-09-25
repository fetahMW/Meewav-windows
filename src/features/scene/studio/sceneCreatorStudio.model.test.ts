import { describe, expect, it } from "vitest";
import {
  getSceneStudioSection,
  getSceneStudioContentId,
  getSceneStudioSummary,
  getSceneStudioVisibleContent,
} from "./sceneCreatorStudio.model";

describe("sceneCreatorStudio.model", () => {
  it("résout les routes du Studio sans les confondre avec les onglets publics", () => {
    expect(getSceneStudioSection("/scene/studio")).toBe("dashboard");
    expect(getSceneStudioSection("/scene/studio/analytics/")).toBe("analytics");
    expect(getSceneStudioSection("/scene/studio/rights")).toBe("rights");
    expect(getSceneStudioSection("/scene/studio/content/sous-la-lumiere-naya-k")).toBe("content");
    expect(getSceneStudioContentId("/scene/studio/content/sous-la-lumiere-naya-k")).toBe("sous-la-lumiere-naya-k");
  });

  it("garde le catalogue complet dans la section Contenus", () => {
    expect(getSceneStudioVisibleContent("content")).toHaveLength(20);
  });

  it("calcule le résumé depuis les contenus plutôt que depuis des compteurs décoratifs", () => {
    expect(getSceneStudioSummary()).toMatchObject({
      contentCount: 20,
      publishedCount: 14,
      draftCount: 3,
      processingCount: 1,
      scheduledCount: 2,
      rightsToCompleteCount: 3,
      totalViews: 184_260,
    });
  });
});
