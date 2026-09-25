import type { User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicSceneOnboardingPayload } from "./musicSceneOnboardingContract";

const supabaseMocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  updateUser: vi.fn(),
  canonicalize: vi.fn(),
}));

vi.mock('./musicSceneSelection', () => ({ canonicalizeMusicSceneSelection: supabaseMocks.canonicalize }));

vi.mock("../../lib/supabaseClient", () => ({
  supabase: {
    rpc: supabaseMocks.rpc,
    auth: { updateUser: supabaseMocks.updateUser },
  },
}));

import { persistMusicSceneProfile } from "./musicSceneProfilePersistence";

const USER_ID = "10000000-0000-4000-8000-0000000abcde";

function user(metadata: Record<string, unknown> = {}): User {
  return {
    id: USER_ID,
    email: "nox@example.test",
    user_metadata: metadata,
  } as User;
}

function payload(overrides: Partial<MusicSceneOnboardingPayload["profile"]> = {}): MusicSceneOnboardingPayload {
  return {
    version: 1,
    createdAt: 1,
    city: {
      communeCode: "75056",
      result: {
        id: "commune-75056",
        label: "Paris",
        subtitle: "Paris · Île-de-France",
        type: "commune",
        center: [2.3522, 48.8566],
        postalCodes: ["75011"],
        departmentCode: "75",
        departmentName: "Paris",
        regionName: "Île-de-France",
        aliases: [],
        source: "test",
      },
    },
    scene: {
      zoneId: "iris-751116501",
      label: "Roquette",
      communeCode: "75056",
      communeName: "Paris",
      center: [2.3811, 48.8576],
      bbox: [2.37, 48.85, 2.39, 48.87],
      source: "iris",
    },
    profile: {
      profileId: USER_ID,
      username: "nox_handle",
      role: "Chanteuse, rappeuse",
      avatarFile: "Chanteuse, rappeuse.png",
      // Deliberately inconsistent: persistence must trust the selected asset
      // contract, not a client-tampered icon identifier.
      avatarIconId: "avatar_4",
      visible: true,
      ...overrides,
    },
  };
}

function installSuccessfulRpc(options: {
  available?: (username: string) => boolean;
  roleKey?: string;
} = {}) {
  supabaseMocks.rpc.mockImplementation(async (name: string, args?: Record<string, unknown>) => {
    if (name === "is_profile_username_available") {
      return {
        data: options.available?.(String(args?.p_username ?? "")) ?? true,
        error: null,
      };
    }
    if (name === "complete_onboarding") {
      return {
        data: {
          ok: true,
          profile: { primary_role_key: options.roleKey ?? "vocalist" },
        },
        error: null,
      };
    }
    if (name === "update_my_public_discovery_profile") {
      return { data: { ok: true }, error: null };
    }
    throw new Error(`unexpected_rpc:${name}`);
  });
  supabaseMocks.updateUser.mockResolvedValue({ data: { user: null }, error: null });
}

describe("persistMusicSceneProfile", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    supabaseMocks.rpc.mockReset();
    supabaseMocks.updateUser.mockReset();
    supabaseMocks.canonicalize.mockImplementation(async (city, scene) => ({ city, scene }));
  });

  it("sépare handle et nom public, canonicalise le rôle et garde les coordonnées exactes privées", async () => {
    installSuccessfulRpc();

    const result = await persistMusicSceneProfile(user({
      username: "nox_handle",
      full_name: "Nox Amani",
      onboarding_completed: true,
    }), payload());

    const completeCall = supabaseMocks.rpc.mock.calls.find(([name]) => name === "complete_onboarding");
    expect(completeCall?.[1]).toEqual(expect.objectContaining({
      p_username: "nox_handle",
      p_display_name: "Nox Amani",
      p_avatar_style_key: "avatar_23",
      p_primary_role_key: "vocalist",
      p_latitude: 48.8576,
      p_longitude: 2.3811,
    }));

    const discoveryCall = supabaseMocks.rpc.mock.calls.find(
      ([name]) => name === "update_my_public_discovery_profile",
    );
    expect(discoveryCall?.[1]).toEqual({
      p_scene_name: "Roquette",
      p_commune_code: "75056",
      p_zone_id: "iris-751116501",
      p_district_name: "Roquette",
      p_avatar_icon_id: "avatar_23",
    });
    expect(discoveryCall?.[1]).not.toHaveProperty("p_latitude");
    expect(discoveryCall?.[1]).not.toHaveProperty("p_longitude");

    expect(supabaseMocks.updateUser).toHaveBeenCalledWith({
      data: expect.objectContaining({
        username: "nox_handle",
        display_name: "Nox Amani",
        full_name: "Nox Amani",
        artist_type: "Chanteuse, rappeuse",
        primary_role_key: "vocalist",
        avatar_name: "Chanteuse, rappeuse.png",
        avatar_icon_id: "avatar_23",
        latitude: 48.86,
        longitude: 2.38,
      }),
    });
    expect(result.profile).toEqual(expect.objectContaining({
      username: "Nox Amani",
      role: "Chanteuse, rappeuse",
      avatarIconId: "avatar_23",
    }));
  });

  it('persiste le quartier du globe actuel après conversion du choix sauvegardé', async () => {
    installSuccessfulRpc();
    const current = payload();
    current.scene = { ...current.scene, zoneId: 'fr-paris-7511143', label: 'La Roquette', center: [2.38,48.86], geographyVersion: 'vinyl-v1' };
    supabaseMocks.canonicalize.mockResolvedValue({ city: current.city, scene: current.scene });
    const saved = await persistMusicSceneProfile(user(), payload());
    expect(saved.scene.zoneId).toBe('fr-paris-7511143');
    expect(supabaseMocks.rpc).toHaveBeenCalledWith('update_my_public_discovery_profile', expect.objectContaining({ p_zone_id:'fr-paris-7511143', p_scene_name:'La Roquette' }));
  });

  it('ne sauvegarde pas une scène disparue ou indisponible', async () => {
    supabaseMocks.canonicalize.mockRejectedValue(new Error('Choisis à nouveau ton quartier.'));
    await expect(persistMusicSceneProfile(user(),payload())).rejects.toThrow('Choisis à nouveau');
    expect(supabaseMocks.rpc).not.toHaveBeenCalled();
    expect(supabaseMocks.updateUser).not.toHaveBeenCalled();
  });

  it("conserve le handle canonique existant lors de persistance répétée", async () => {
    installSuccessfulRpc();
    const existingUser = user({
      username: "nox_canonical",
      display_name: "Nox Amani",
      onboarding_completed: true,
    });

    await persistMusicSceneProfile(existingUser, payload({ username: "Nox Amani" }));
    await persistMusicSceneProfile(existingUser, payload({ username: "Nox Amani" }));

    const completedHandles = supabaseMocks.rpc.mock.calls
      .filter(([name]) => name === "complete_onboarding")
      .map(([, args]) => args.p_username);
    expect(completedHandles).toEqual(["nox_canonical", "nox_canonical"]);
  });

  it("fabrique un handle OAuth déterministe quand le premier candidat est pris", async () => {
    installSuccessfulRpc({ available: (candidate) => candidate !== "nox" });
    const oauthPayload = payload({ username: "Mon profil" });
    oauthPayload.auth = { flow: "oauth", provider: "google" };

    await persistMusicSceneProfile(user({ full_name: "Zoé Amani" }), oauthPayload);

    const completeCall = supabaseMocks.rpc.mock.calls.find(([name]) => name === "complete_onboarding");
    expect(completeCall?.[1]).toEqual(expect.objectContaining({
      p_username: "nox_abcde",
      p_display_name: "Zoé Amani",
    }));
  });

  it("résiste à une collision concurrente entre le contrôle et l'upsert", async () => {
    let onboardingAttempt = 0;
    supabaseMocks.rpc.mockImplementation(async (name: string, args?: Record<string, unknown>) => {
      if (name === "is_profile_username_available") return { data: true, error: null };
      if (name === "complete_onboarding") {
        onboardingAttempt += 1;
        if (onboardingAttempt === 1) {
          return { data: null, error: { code: "23505", message: "username_unavailable" } };
        }
        return {
          data: { ok: true, profile: { primary_role_key: "vocalist" } },
          error: null,
        };
      }
      if (name === "update_my_public_discovery_profile") return { data: { ok: true }, error: null };
      throw new Error(`unexpected_rpc:${name}:${String(args)}`);
    });
    supabaseMocks.updateUser.mockResolvedValue({ data: { user: null }, error: null });

    await persistMusicSceneProfile(user(), payload());

    const completedHandles = supabaseMocks.rpc.mock.calls
      .filter(([name]) => name === "complete_onboarding")
      .map(([, args]) => args.p_username);
    expect(completedHandles).toEqual(["nox_handle", "nox_handle_abcde"]);
  });

  it("rejette des coordonnées invalides avant tout appel Supabase", async () => {
    const invalidPayload = payload();
    invalidPayload.scene.center = [2.3811, Number.NaN];

    await expect(persistMusicSceneProfile(user(), invalidPayload))
      .rejects.toThrow("invalid_scene_coordinates");
    expect(supabaseMocks.rpc).not.toHaveBeenCalled();
    expect(supabaseMocks.updateUser).not.toHaveBeenCalled();
  });
});
