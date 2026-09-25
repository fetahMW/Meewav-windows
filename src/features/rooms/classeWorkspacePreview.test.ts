import { describe, expect, it } from "vitest";
import {
  CLASSE_WORKSPACE_PREVIEW_PATH,
  getClasseWorkspacePreviewRedirect,
  isClasseWorkspacePreviewEnabled,
  isClasseWorkspacePreviewPath,
} from "./classeWorkspacePreview";

describe("classe workspace preview", () => {
  it("cannot bypass authentication outside development", () => {
    expect(isClasseWorkspacePreviewEnabled(false, "true")).toBe(false);
    expect(isClasseWorkspacePreviewEnabled(true, "false")).toBe(false);
    expect(isClasseWorkspacePreviewEnabled(true, "true")).toBe(true);
  });

  it("allows only the exact isolated Classe path", () => {
    expect(isClasseWorkspacePreviewPath("/rooms/classe")).toBe(true);
    expect(isClasseWorkspacePreviewPath("/rooms/classe/")).toBe(false);
    expect(isClasseWorkspacePreviewPath("/rooms/place")).toBe(false);
  });

  it("redirects every other app route back to La Classe while isolated", () => {
    expect(getClasseWorkspacePreviewRedirect("/auth", true)).toBe(CLASSE_WORKSPACE_PREVIEW_PATH);
    expect(getClasseWorkspacePreviewRedirect("/rooms/place", true)).toBe(CLASSE_WORKSPACE_PREVIEW_PATH);
    expect(getClasseWorkspacePreviewRedirect(CLASSE_WORKSPACE_PREVIEW_PATH, true)).toBeNull();
    expect(getClasseWorkspacePreviewRedirect("/auth", false)).toBeNull();
  });
});
