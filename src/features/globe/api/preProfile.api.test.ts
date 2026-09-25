import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  getUser: vi.fn(),
  storageFrom: vi.fn(),
}));

vi.mock("../../../lib/supabaseClient", () => ({
  supabase: {
    from: supabaseMocks.from,
    rpc: supabaseMocks.rpc,
    auth: { getUser: supabaseMocks.getUser },
    storage: { from: supabaseMocks.storageFrom },
  },
}));

import {
  getFollowState,
  getFollowStates,
  getMyPrivatePreProfile,
  getPreProfileGoldenLikeState,
  getPublicPreProfile,
  getPublishedPreProfileMedia,
  givePreProfileGoldenLike,
  requestProfileCollaboration,
  setMyPublicProfileVisibility,
  setFollowState,
  trackPreProfileAnalytics,
} from "./preProfile.api";

const VIEWER_ID = "10000000-0000-4000-8000-000000000001";
const ARTIST_ID = "20000000-0000-4000-8000-000000000002";

describe("preProfile.api", () => {
  beforeEach(() => {
    supabaseMocks.from.mockReset();
    supabaseMocks.rpc.mockReset();
    supabaseMocks.getUser.mockReset();
    supabaseMocks.storageFrom.mockReset();
  });

  it("ignore un identifiant de démonstration sans interroger la base", async () => {
    await expect(getPublicPreProfile("demo-avatar-12")).resolves.toBeNull();
    expect(supabaseMocks.from).not.toHaveBeenCalled();
  });

  it("lit uniquement la projection publique PII-free", async () => {
    const row = {
      id: ARTIST_ID,
      username: "nox",
      display_name: "Nox",
      grade: null,
      golden_likes_count: 0,
    };
    const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    supabaseMocks.from.mockReturnValue({ select });

    const publicProfile = await getPublicPreProfile(ARTIST_ID);
    expect(publicProfile).toEqual(row);
    expect(publicProfile?.grade).toBeNull();
    expect(supabaseMocks.from).toHaveBeenCalledWith("public_profiles");
    expect(select.mock.calls[0][0]).not.toContain("email");
    expect(select.mock.calls[0][0]).not.toContain("latitude");
  });

  it("hydrate le host uniquement via son RPC privé", async () => {
    const owner = {
      id: VIEWER_ID,
      username: "host",
      display_name: "Host Meewav",
      city: "Paris",
      country_code: "FR",
      is_ghost_mode: false,
      show_on_public_profile: true,
      onboarding_completed_at: "2026-07-16T20:00:00Z",
      profile_version: 3,
    };
    supabaseMocks.rpc.mockResolvedValue({ data: owner, error: null });

    await expect(getMyPrivatePreProfile()).resolves.toEqual(owner);
    expect(supabaseMocks.rpc).toHaveBeenCalledWith("get_my_private_profile");
    expect(supabaseMocks.from).not.toHaveBeenCalledWith("profiles");
  });

  it("résout une URL signée pour un média publié stocké dans le bucket privé", async () => {
    const media = {
      id: "media-1",
      owner_profile_id: ARTIST_ID,
      type: "audio",
      name: "Nocturne",
      file_url: null,
      storage_bucket: "profile-media",
      storage_path: `${ARTIST_ID}/audio/nocturne.mp3`,
    };
    const limit = vi.fn().mockResolvedValue({ data: [media], error: null });
    const order = vi.fn().mockReturnValue({ limit });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    supabaseMocks.from.mockReturnValue({ select });
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: "https://signed.example/nocturne.mp3" },
      error: null,
    });
    supabaseMocks.storageFrom.mockReturnValue({ createSignedUrl });

    const result = await getPublishedPreProfileMedia(ARTIST_ID);
    expect(result[0].file_url).toBe("https://signed.example/nocturne.mp3");
    expect(supabaseMocks.from).toHaveBeenCalledWith("published_media_files");
  });

  it("hydrate et persiste le follow avec l'identité de la session", async () => {
    supabaseMocks.getUser.mockResolvedValue({ data: { user: { id: VIEWER_ID } }, error: null });

    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "follow-1" }, error: null });
    const secondEq = vi.fn().mockReturnValue({ maybeSingle });
    const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
    const select = vi.fn().mockReturnValue({ eq: firstEq });
    supabaseMocks.from.mockReturnValueOnce({ select });

    await expect(getFollowState(ARTIST_ID)).resolves.toEqual({
      authenticated: true,
      viewerProfileId: VIEWER_ID,
      following: true,
    });

    const upsert = vi.fn().mockResolvedValue({ error: null });
    supabaseMocks.from.mockReturnValueOnce({ upsert });
    await expect(setFollowState(ARTIST_ID, true)).resolves.toEqual({
      authenticated: true,
      viewerProfileId: VIEWER_ID,
      following: true,
    });
    expect(upsert).toHaveBeenCalledWith(
      { follower_id: VIEWER_ID, following_id: ARTIST_ID },
      { onConflict: "follower_id,following_id", ignoreDuplicates: true },
    );
  });

  it("hydrate plusieurs follows en une seule requête", async () => {
    const secondArtistId = "30000000-0000-4000-8000-000000000003";
    supabaseMocks.getUser.mockResolvedValue({ data: { user: { id: VIEWER_ID } }, error: null });
    const inFilter = vi.fn().mockResolvedValue({ data: [{ following_id: ARTIST_ID }], error: null });
    const eq = vi.fn().mockReturnValue({ in: inFilter });
    const select = vi.fn().mockReturnValue({ eq });
    supabaseMocks.from.mockReturnValue({ select });

    const result = await getFollowStates([ARTIST_ID, secondArtistId, "fixture-slug", ARTIST_ID]);
    expect(result.authenticated).toBe(true);
    expect([...result.followingProfileIds]).toEqual([ARTIST_ID]);
    expect(inFilter).toHaveBeenCalledWith("following_id", [ARTIST_ID, secondArtistId]);
    expect(supabaseMocks.from).toHaveBeenCalledTimes(1);
  });

  it("persiste la visibilité du host et son mode fantôme en une seule mise à jour", async () => {
    supabaseMocks.getUser.mockResolvedValue({ data: { user: { id: VIEWER_ID } }, error: null });
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    supabaseMocks.from.mockReturnValue({ update });

    await expect(setMyPublicProfileVisibility(true)).resolves.toBe(true);
    expect(supabaseMocks.from).toHaveBeenCalledWith("profiles");
    expect(update).toHaveBeenCalledWith({
      show_on_public_profile: true,
      is_ghost_mode: false,
    });
    expect(eq).toHaveBeenCalledWith("id", VIEWER_ID);
  });

  it("conserve explicitement un compteur Golden Like à zéro", async () => {
    supabaseMocks.rpc
      .mockResolvedValueOnce({
        data: {
          ok: true,
          goldenLikesCount: 0,
          authenticated: true,
          usedToday: false,
          availableToday: true,
          givenToThisArtistToday: false,
          givenArtistId: ARTIST_ID,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { ok: true, reason: "golden_like_sent", goldenLikesCount: 1 },
        error: null,
      });

    await expect(getPreProfileGoldenLikeState(ARTIST_ID)).resolves.toMatchObject({
      goldenLikesCount: 0,
      givenArtistId: ARTIST_ID,
    });
    await expect(givePreProfileGoldenLike(ARTIST_ID)).resolves.toMatchObject({ goldenLikesCount: 1 });
  });

  it("envoie une demande de collaboration idempotente depuis le Globe", async () => {
    supabaseMocks.rpc.mockResolvedValue({
      data: {
        ok: true,
        requestId: "request-1",
        senderProfileId: VIEWER_ID,
        recipientProfileId: ARTIST_ID,
        status: "pending",
        source: "globe",
        createdAt: "2026-07-16T20:00:00Z",
        idempotentReplay: false,
      },
      error: null,
    });

    await expect(requestProfileCollaboration({
      recipientProfileId: ARTIST_ID,
      message: "  Faisons une session live.  ",
      idempotencyKey: "request-idempotency-001",
    })).resolves.toMatchObject({ ok: true, status: "pending" });

    expect(supabaseMocks.rpc).toHaveBeenCalledWith("request_profile_collaboration", {
      p_recipient_profile_id: ARTIST_ID,
      p_message: "Faisons une session live.",
      p_idempotency_key: "request-idempotency-001",
      p_source: "globe",
    });
  });

  it("transmet explicitement la source Shorts au RPC de collaboration", async () => {
    supabaseMocks.rpc.mockResolvedValue({
      data: {
        ok: true,
        requestId: "request-shorts-1",
        senderProfileId: VIEWER_ID,
        recipientProfileId: ARTIST_ID,
        status: "pending",
        source: "shorts",
        createdAt: "2026-07-31T20:00:00Z",
        idempotentReplay: false,
      },
      error: null,
    });

    await requestProfileCollaboration({
      recipientProfileId: ARTIST_ID,
      message: "Session découverte via Shorts.",
      idempotencyKey: "shorts:idempotency-001",
      source: "shorts",
    });

    expect(supabaseMocks.rpc).toHaveBeenCalledWith("request_profile_collaboration", {
      p_recipient_profile_id: ARTIST_ID,
      p_message: "Session découverte via Shorts.",
      p_idempotency_key: "shorts:idempotency-001",
      p_source: "shorts",
    });
  });

  it("émet un événement analytics sans PII pour le profil consulté", async () => {
    supabaseMocks.rpc.mockResolvedValue({
      data: "40000000-0000-4000-8000-000000000004",
      error: null,
    });

    await expect(trackPreProfileAnalytics(ARTIST_ID, "globe_profile_open", {
      surface: "globe_preprofile",
    })).resolves.toBe("40000000-0000-4000-8000-000000000004");

    expect(supabaseMocks.rpc).toHaveBeenCalledWith("track_analytics_event", expect.objectContaining({
      p_subject_profile_id: ARTIST_ID,
      p_source_pillar: "globe",
      p_event_name: "globe_profile_open",
      p_properties: { surface: "globe_preprofile" },
    }));
  });
});
