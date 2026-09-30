import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearMusicSceneOnboardingPreview, peekPendingMusicSceneArrival, saveMusicSceneOnboarding,
  type MusicSceneOnboardingPayload,
} from "./musicSceneOnboardingContract";

function draft(createdAt = Date.now()): MusicSceneOnboardingPayload {
  return {
    version: 1, createdAt, auth: { flow: "oauth", provider: "google" },
    city: { communeCode: "75056" },
    scene: { zoneId: "test-scene", source: "iris", center: [2.35, 48.85] },
    profile: { profileId: "onboarding-current-user", avatarFile: "Utilisateur.png" },
  } as MusicSceneOnboardingPayload;
}
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); vi.restoreAllMocks(); });

describe("OAuth selection recovery", () => {
  it("recovers only the pending OAuth selection when a desktop window is reopened", () => {
    const pending = draft();
    saveMusicSceneOnboarding(pending);
    sessionStorage.clear();
    expect(peekPendingMusicSceneArrival()).toEqual(pending);
  });
  it("discards an expired selection after a restart", () => {
    saveMusicSceneOnboarding(draft(Date.now() - 31 * 60 * 1000));
    sessionStorage.clear();
    expect(peekPendingMusicSceneArrival()).toBeNull();
    expect(localStorage.length).toBe(0);
  });
  it("clears the persistent draft once the authenticated profile is finalized", () => {
    const pending = draft();
    saveMusicSceneOnboarding(pending);
    saveMusicSceneOnboarding({ ...pending, auth: undefined, profile: { ...pending.profile, profileId: "account-id" } });
    sessionStorage.clear();
    expect(peekPendingMusicSceneArrival()).toBeNull();
  });
  it("clears the draft when signing out or abandoning account creation", () => {
    saveMusicSceneOnboarding(draft());
    clearMusicSceneOnboardingPreview();
    expect(peekPendingMusicSceneArrival()).toBeNull();
  });
});
