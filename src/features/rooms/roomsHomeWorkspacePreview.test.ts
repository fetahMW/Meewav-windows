import { describe, expect, it } from "vitest";
import {
  getRoomsHomeWorkspacePreviewRedirect,
  isRoomsHomeWorkspacePreviewEnabled,
  isPillarWorkspacePreviewPath,
  isRoomsHomeWorkspacePreviewPath,
  ROOMS_HOME_WORKSPACE_PREVIEW_PATH,
} from "./roomsHomeWorkspacePreview";

describe("Rooms home workspace preview", () => {
  it("cannot bypass authentication outside development", () => {
    expect(isRoomsHomeWorkspacePreviewEnabled(false, "true")).toBe(false);
    expect(isRoomsHomeWorkspacePreviewEnabled(true, "false")).toBe(false);
    expect(isRoomsHomeWorkspacePreviewEnabled(true, "true")).toBe(true);
  });

  it("allows the home and every canonical Room destination", () => {
    [
      ROOMS_HOME_WORKSPACE_PREVIEW_PATH,
      "/rooms/loge",
      "/rooms/place",
      "/rooms/wave",
      "/rooms/cage",
      "/rooms/classe",
      "/rooms/scene",
    ].forEach((pathname) => {
      expect(isRoomsHomeWorkspacePreviewPath(pathname)).toBe(true);
    });

    expect(isRoomsHomeWorkspacePreviewPath("/rooms/home/")).toBe(false);
    expect(isRoomsHomeWorkspacePreviewPath("/rooms")).toBe(false);
    expect(isRoomsHomeWorkspacePreviewPath("/rooms/inconnue")).toBe(false);
    expect(isRoomsHomeWorkspacePreviewPath("/auth")).toBe(false);
  });

  it("allows collection walls to stay in the isolated workspace", () => {
    expect(isRoomsHomeWorkspacePreviewPath("/rooms/collections/buzz-maintenant")).toBe(true);
    expect(isRoomsHomeWorkspacePreviewPath("/rooms/collections/pour-toi/")).toBe(true);
    expect(isRoomsHomeWorkspacePreviewPath("/rooms/collections/pour-toi?format=vertical")).toBe(true);
    expect(isRoomsHomeWorkspacePreviewPath("/rooms/collections")).toBe(false);
    expect(isRoomsHomeWorkspacePreviewPath("/rooms/collections/pour-toi/details")).toBe(false);
  });

  it("redirects entry and external routes without blocking valid Rooms", () => {
    expect(getRoomsHomeWorkspacePreviewRedirect("/rooms", true))
      .toBe(ROOMS_HOME_WORKSPACE_PREVIEW_PATH);
    expect(getRoomsHomeWorkspacePreviewRedirect("/auth", true)).toBeNull();
    expect(getRoomsHomeWorkspacePreviewRedirect("/rooms/inconnue", true))
      .toBe(ROOMS_HOME_WORKSPACE_PREVIEW_PATH);
    expect(getRoomsHomeWorkspacePreviewRedirect(ROOMS_HOME_WORKSPACE_PREVIEW_PATH, true))
      .toBeNull();
    expect(getRoomsHomeWorkspacePreviewRedirect("/rooms/place", true)).toBeNull();
    expect(getRoomsHomeWorkspacePreviewRedirect("/rooms/loge", true)).toBeNull();
    expect(getRoomsHomeWorkspacePreviewRedirect("/rooms/wave", true)).toBeNull();
    expect(getRoomsHomeWorkspacePreviewRedirect("/rooms/cage", true)).toBeNull();
    expect(getRoomsHomeWorkspacePreviewRedirect("/rooms/classe", true)).toBeNull();
    expect(getRoomsHomeWorkspacePreviewRedirect("/rooms/scene", true)).toBeNull();
    expect(getRoomsHomeWorkspacePreviewRedirect("/rooms/collections/pour-toi", true)).toBeNull();
    expect(getRoomsHomeWorkspacePreviewRedirect("/auth", false)).toBeNull();
  });
});


describe("local pillar navigation", () => {
  it.each(["/globe", "/messages", "/messages/thread/123", "/messagerie", "/scene", "/shorts", "/market", "/marketplace/item/123", "/tremplin", "/profile", "/profil/settings"])("keeps %s accessible without bouncing to Rooms", path => {
    expect(isPillarWorkspacePreviewPath(path)).toBe(true);
    expect(getRoomsHomeWorkspacePreviewRedirect(path, true)).toBeNull();
  });
  it.each(["/messages-private", "/admin", "/auth", "/auth/callback", "/internal/audio-engine"])("does not give %s a preview auth exemption", path => {
    expect(isPillarWorkspacePreviewPath(path)).toBe(false);
  });
});
