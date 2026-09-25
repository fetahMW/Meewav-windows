import { describe, expect, it } from "vitest";
import { resolveTremplinViewer } from "./tremplinViewer";

describe("resolveTremplinViewer", () => {
  it("conserve un visiteur anonyme sans inventer un statut artiste", () => {
    expect(resolveTremplinViewer({ user: null, authStatus: "anonymous", localPreviewEnabled: false })).toMatchObject({
      storageScope: "guest",
      userState: "visitor",
      authenticated: false,
    });
  });

  it("utilise l’identité et le statut de jeton fournis par la session", () => {
    const viewer = resolveTremplinViewer({
      authStatus: "authenticated",
      localPreviewEnabled: false,
      user: {
        id: "10000000-0000-4000-8000-000000000001",
        email: "maya@example.test",
        user_metadata: {
          display_name: "Maya",
          profile_image_url: "https://cdn.example.test/maya.webp",
          primary_role_key: "chanteuse",
          tremplin_token_status: "active",
        },
      },
    });
    expect(viewer).toMatchObject({
      displayName: "Maya",
      avatarUrl: "https://cdn.example.test/maya.webp",
      userState: "token-active",
      authenticated: true,
    });
    expect(viewer.storageScope).toContain("10000000-0000-4000-8000-000000000001");
  });

  it("distingue une demande en cours d’un artiste simplement éligible", () => {
    const pending = resolveTremplinViewer({
      authStatus: "authenticated",
      localPreviewEnabled: false,
      user: { id: "pending", user_metadata: { primary_role_key: "dj", grade: 4, tremplin_application_status: "verification" } },
    });
    const eligible = resolveTremplinViewer({
      authStatus: "authenticated",
      localPreviewEnabled: false,
      user: { id: "eligible", user_metadata: { primary_role_key: "dj", grade: 2 } },
    });
    expect(pending.userState).toBe("application-pending");
    expect(eligible.userState).toBe("talent-eligible");
  });
});
