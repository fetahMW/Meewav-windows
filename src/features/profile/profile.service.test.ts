import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  createProfileRepository,
  mapNotificationRecord,
  mapProfileRecord,
  toOwnerProfileUpdate,
  type ProfileRecord,
} from "./profile.service";

const baseProfileRecord: ProfileRecord = {
  id: "00000000-0000-4000-8000-000000000001",
  username: "noxamani",
  full_name: "Nox Amani",
  bio: "Textures analogiques et sessions cinématiques.",
  avatar_url: "/avatars/pianiste.png",
  avatar_name: "Pianiste.png",
  artist_type: "producer",
  primary_role_key: "producer",
  city: "Paris",
  country: "France",
  followers_count: 34_500,
  following_count: 248,
  grade: 4,
  is_ghost_mode: false,
  is_verified: true,
  profile_image_url: null,
  public_profile_preferences: {
    show_role: true,
    show_grade: false,
    show_collab: true,
    show_viewer_menu: false,
    profile_completion: 86,
  },
  show_on_public_profile: true,
};

describe("profile service mappings", () => {
  it("maps the canonical owner row without borrowing demo identity values", () => {
    const profile = mapProfileRecord(baseProfileRecord, {
      level: 4,
      total_points: 3_420,
      progress_basis_points: 7_400,
    });

    expect(profile).toMatchObject({
      displayName: "Nox Amani",
      username: "@noxamani",
      role: "Producteur",
      roleKey: "producer",
      city: "Paris",
      country: "France",
      grade: 4,
      gradeProgress: 74,
      pointsToNextGrade: 580,
      isVerified: true,
      visibility: {
        grade: false,
        showOnPublicProfile: true,
        isGhostMode: false,
      },
    });
    expect(profile.followers).toContain("34,5");
  });

  it("uses neutral owner placeholders when database fields are absent", () => {
    const profile = mapProfileRecord({
      ...baseProfileRecord,
      username: null,
      full_name: null,
      bio: null,
      artist_type: null,
      primary_role_key: null,
      city: null,
      country: null,
      avatar_url: null,
      avatar_name: null,
    });

    expect(profile.displayName).toBe("@profil");
    expect(profile.role).toBe("Créateur Meewav");
    expect(profile.avatarUrl).toBe("/avatars/utilisateur.png");
    expect(profile.displayName).not.toBe("Nox Amani");
  });

  it("builds an owner-only update and never sends server-managed counters or grade", () => {
    const profile = mapProfileRecord(baseProfileRecord);
    const update = toOwnerProfileUpdate({
      ...profile,
      username: "@New_Name",
      displayName: "Nouveau nom",
      visibility: { ...profile.visibility, grade: false },
    });

    expect(update).toMatchObject({
      username: "new_name",
      full_name: "Nouveau nom",
      artist_type: "producer",
      primary_role_key: "producer",
      show_on_public_profile: true,
      is_ghost_mode: false,
      public_profile_preferences: expect.objectContaining({ show_grade: false }),
    });
    expect(update).not.toHaveProperty("grade");
    expect(update).not.toHaveProperty("followers_count");
    expect(update).not.toHaveProperty("is_verified");
  });

  it("resolves legacy avatar style filenames to a real Web asset", () => {
    const profile = mapProfileRecord({
      ...baseProfileRecord,
      avatar_url: null,
      profile_image_url: null,
      avatar_name: "avatar_1.png",
    });

    expect(profile.avatarUrl).toBe("/avatars/violoniste.png");
  });

  it("keeps the uploaded portrait ahead of the selected avatar", () => {
    const profile = mapProfileRecord({ ...baseProfileRecord,
      profile_image_url: "https://example.test/portrait.webp",
      avatar_style_key: "avatar_25",
    });
    expect(profile.avatarUrl).toBe("https://example.test/portrait.webp");
  });

  it("uses the selected avatar ahead of the legacy URL", () => {
    const profile = mapProfileRecord({ ...baseProfileRecord,
      profile_image_url: null,
      avatar_url: "https://example.test/old.webp",
      avatar_style_key: "avatar_25",
    });
    expect(profile.avatarUrl).toBe("/images/V4/Beatmaker.png");
  });

  it("falls back to the saved icon id when the style key is unknown", () => {
    const profile = mapProfileRecord({ ...baseProfileRecord,
      profile_image_url: null,
      avatar_url: null,
      avatar_style_key: "unknown",
      avatar_icon_id: "avatar_23",
    });
    expect(profile.avatarUrl).toBe("/images/V4/Chanteuse,%20rappeuse.png");
  });

  it("normalizes a legacy composite role to a stable catalog key", () => {
    const profile = mapProfileRecord({ ...baseProfileRecord, artist_type: "Producteur · Pianiste" });
    const update = toOwnerProfileUpdate(profile);

    expect(profile.roleKey).toBe("producer");
    expect(update.artist_type).toBe("producer");
  });

  it("maps persisted notifications into the compact French panel model", () => {
    const notification = mapNotificationRecord({
      id: "00000000-0000-4000-8000-000000000099",
      type: "follow",
      content: "a commencé à te suivre",
      is_read: false,
      created_at: new Date(Date.now() - 12 * 60_000).toISOString(),
    });

    expect(notification).toMatchObject({
      title: "Nouvel abonnement",
      detail: "a commencé à te suivre",
      time: "12 min",
      unread: true,
    });
  });
});

describe("profile repository", () => {
  it("scopes the profile query to the authenticated owner and tolerates pre-foundation grade schema", async () => {
    const profileMaybeSingle = vi.fn().mockResolvedValue({ data: baseProfileRecord, error: null });
    const gradeMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST205" } });
    const profileEq = vi.fn().mockReturnValue({ maybeSingle: profileMaybeSingle });
    const gradeEq = vi.fn().mockReturnValue({ maybeSingle: gradeMaybeSingle });
    const profileSelect = vi.fn().mockReturnValue({ eq: profileEq });
    const gradeSelect = vi.fn().mockReturnValue({ eq: gradeEq });
    const from = vi.fn((table: string) => table === "profiles"
      ? { select: profileSelect }
      : { select: gradeSelect });
    const repository = createProfileRepository({ from } as unknown as SupabaseClient);

    const profile = await repository.getOwnerProfile(baseProfileRecord.id);

    expect(from).toHaveBeenNthCalledWith(1, "profiles");
    expect(profileSelect).toHaveBeenCalledWith(expect.stringContaining("avatar_style_key"));
    expect(profileSelect).toHaveBeenCalledWith(expect.stringContaining("avatar_icon_id"));
    expect(profileEq).toHaveBeenCalledWith("id", baseProfileRecord.id);
    expect(from).toHaveBeenNthCalledWith(2, "profile_grade_state");
    expect(gradeEq).toHaveBeenCalledWith("profile_id", baseProfileRecord.id);
    expect(profile.username).toBe("@noxamani");
  });
});
