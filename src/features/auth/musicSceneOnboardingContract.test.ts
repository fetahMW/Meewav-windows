import { describe, expect, it } from "vitest";
import {
  CANONICAL_ONBOARDING_ROLE_LABELS,
  getCanonicalOnboardingAvatarFile,
  getOnboardingAvatarIconId,
  ONBOARDING_AVATAR_CONTRACT,
  resolveOnboardingRole,
} from "./musicSceneOnboardingContract";

describe("musicSceneOnboardingContract", () => {
  it("couvre les 28 rôles professionnels et le rôle visiteur du catalogue", () => {
    const professionalRoleKeys = new Set(
      Object.values(ONBOARDING_AVATAR_CONTRACT)
        .map((avatar) => avatar.roleKey)
        .filter((roleKey) => roleKey !== "viewer"),
    );

    expect(professionalRoleKeys.size).toBe(28);
    expect(Object.keys(CANONICAL_ONBOARDING_ROLE_LABELS)).toHaveLength(29);
  });

  it.each(Object.entries(ONBOARDING_AVATAR_CONTRACT))(
    "résout %s vers son avatar et sa clé de rôle canoniques",
    (avatarFile, contract) => {
      expect(getOnboardingAvatarIconId(avatarFile)).toBe(contract.avatarIconId);
      expect(resolveOnboardingRole(avatarFile, contract.roleLabel)).toEqual({
        key: contract.roleKey,
        label: contract.roleLabel,
      });
    },
  );

  it("fait gagner l'avatar sur un libellé incohérent ou manipulé", () => {
    expect(resolveOnboardingRole("Beatmaker.png", "DJ")).toEqual({
      key: "beatmaker",
      label: "Beatmaker",
    });
  });

  it("retombe sur l'avatar visiteur sûr pour un fichier inconnu", () => {
    expect(getCanonicalOnboardingAvatarFile("../../avatar-secret.png")).toBe("Utilisateur.png");
    expect(getOnboardingAvatarIconId("../../avatar-secret.png")).toBe("avatar_4");
  });
});
