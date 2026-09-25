import { describe, expect, it } from "vitest";
import { getSafeAuthReturnRoute } from "./authReturnRoute";

describe("getSafeAuthReturnRoute", () => {
  it("revient au profil demandé après une connexion", () => {
    expect(getSafeAuthReturnRoute({ returnTo: "/profile" })).toBe("/profile");
  });

  it("conserve une sous-route interne et ses paramètres", () => {
    expect(getSafeAuthReturnRoute({ returnTo: "/profile/media?type=audio#item-2" }))
      .toBe("/profile/media?type=audio#item-2");
  });

  it("conserve le contexte d'une Room après authentification", () => {
    expect(getSafeAuthReturnRoute({ returnTo: "/rooms/wave?room=51000000-0000-4000-8000-000000000090" }))
      .toBe("/rooms/wave?room=51000000-0000-4000-8000-000000000090");
  });

  it.each([
    undefined,
    null,
    {},
    { returnTo: "https://example.com" },
    { returnTo: "//example.com/profile" },
    { returnTo: "/auth" },
  ])("refuse une destination absente, externe ou récursive", (state) => {
    expect(getSafeAuthReturnRoute(state)).toBe("/globe");
  });
});
