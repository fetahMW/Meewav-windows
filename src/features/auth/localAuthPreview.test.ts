import { afterEach, describe, expect, it, vi } from "vitest";
import {
  disableLocalAuthPreview,
  enableLocalAuthPreview,
  getLocalPreviewFollowState,
  isLocalDevHost,
  isLocalAuthPreviewEnabled,
  LOCAL_PREVIEW_FETAH_HOST,
  setLocalPreviewFollowState,
} from "./localAuthPreview";

afterEach(() => { disableLocalAuthPreview(); vi.unstubAllGlobals(); });

describe("localAuthPreview", () => {
  it("reste désactivé par défaut", () => {
    expect(isLocalAuthPreviewEnabled()).toBe(false);
  });

  it("autorise le bypass depuis une adresse réseau privée en développement", () => {
    expect(isLocalDevHost("172.20.10.3")).toBe(true);
    expect(isLocalDevHost("192.168.1.20")).toBe(true);
    expect(isLocalDevHost("10.0.0.8")).toBe(true);
    expect(isLocalDevHost("172.32.0.1")).toBe(false);
    expect(isLocalDevHost("8.8.8.8")).toBe(false);
  });

  it("autorise un aperçu temporaire dans la session locale", () => {
    expect(enableLocalAuthPreview()).toBe(true);
    expect(isLocalAuthPreviewEnabled()).toBe(true);
    disableLocalAuthPreview();
    expect(isLocalAuthPreviewEnabled()).toBe(false);
  });

  it("exige une vraie session dans l'application Desktop", () => {
    expect(enableLocalAuthPreview()).toBe(true);
    vi.stubGlobal("meewavDesktop", { version: 1 });
    expect(isLocalAuthPreviewEnabled()).toBe(false);
    expect(enableLocalAuthPreview()).toBe(false);
  });

  it("utilise toujours Fetah et le Beatmaker comme persona locale", () => {
    expect(LOCAL_PREVIEW_FETAH_HOST).toMatchObject({
      profileId: "current_user_fetah",
      displayName: "Fetah",
      role: "Beatmaker",
      avatarFile: "Beatmaker.png",
      avatarIconId: "avatar_25",
    });
  });

  it("mémorise les suivis locaux sans écrire dans Supabase", () => {
    enableLocalAuthPreview();
    expect(getLocalPreviewFollowState("artist-1")).toBe(false);
    expect(setLocalPreviewFollowState("artist-1", true)).toBe(true);
    expect(getLocalPreviewFollowState("artist-1")).toBe(true);
    expect(setLocalPreviewFollowState("artist-1", false)).toBe(false);
    expect(getLocalPreviewFollowState("artist-1")).toBe(false);
  });
});
