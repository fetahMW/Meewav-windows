import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  createProfileCertifEndorsementsRepository,
  mapProfileCertifSummary,
} from "./profileCertifEndorsements.service";

const PROFILE_ID = "00000000-0000-4000-8000-000000000001";
const ENDORSEMENT_ID = "00000000-0000-4000-8000-000000000002";

const summary = {
  profile_id: PROFILE_ID,
  display_label: "Validations reçues",
  official_meewav_verification: false,
  unique_endorsers: 3,
  high_grade_endorsers: 1,
  verified_endorsers: 1,
  signal_context_version: "profile-signals-v1",
  recent_public_endorsers: [{
    display_name: "Naya Oris",
    avatar_url: "https://cdn.example/naya.webp",
    grade_level_at_endorsement: 5,
    followers_at_endorsement: 12000,
    was_verified_at_endorsement: true,
    endorsed_at: "2026-08-15T12:00:00.000Z",
    snapshot_quality: "source_time",
  }],
  disclaimer: "Éloges signées par des membres ; ne constituent pas une vérification officielle MeeWav.",
};

describe("Profile Certif repository", () => {
  it("maps only the signed community context and never promotes it to official verification", () => {
    expect(mapProfileCertifSummary({ ...summary, official_meewav_verification: true })).toEqual({
      profileId: PROFILE_ID,
      displayLabel: "Validations reçues",
      officialMeewavVerification: false,
      uniqueEndorsers: 3,
      highGradeEndorsers: 1,
      verifiedEndorsers: 1,
      signalContextVersion: "profile-signals-v1",
      recentPublicEndorsers: [{
        displayName: "Naya Oris",
        avatarUrl: "https://cdn.example/naya.webp",
        gradeLevelAtEndorsement: 5,
        followersAtEndorsement: 12000,
        wasVerifiedAtEndorsement: true,
        endorsedAt: "2026-08-15T12:00:00.000Z",
        snapshotQuality: "source_time",
      }],
      disclaimer: summary.disclaimer,
    });
  });

  it("loads the safe Profile projection through the dedicated RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: summary, error: null });
    const repository = createProfileCertifEndorsementsRepository({ rpc } as unknown as SupabaseClient);

    await expect(repository.getSummary(PROFILE_ID)).resolves.toMatchObject({
      profileId: PROFILE_ID,
      uniqueEndorsers: 3,
      officialMeewavVerification: false,
    });
    expect(rpc).toHaveBeenCalledWith("get_profile_certif_summary_v1", { p_profile_id: PROFILE_ID });
  });

  it("keeps Profile usable while the additive RPC is not deployed yet", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "function missing from schema cache" },
    });
    const repository = createProfileCertifEndorsementsRepository({ rpc } as unknown as SupabaseClient);

    await expect(repository.getSummary(PROFILE_ID)).resolves.toBeNull();
  });

  it("lists sender and recipient actions only inside the authenticated owner scope", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [{
        id: ENDORSEMENT_ID,
        room_id_snapshot: "00000000-0000-4000-8000-000000000003",
        sender_profile_id_snapshot: PROFILE_ID,
        recipient_profile_id_snapshot: "00000000-0000-4000-8000-000000000004",
        sender_display_name_snapshot: "Naya Oris",
        sender_avatar_url_snapshot: null,
        recipient_display_name_snapshot: "Malik",
        recipient_avatar_url_snapshot: null,
        sender_grade_level_snapshot: 5,
        sender_followers_count_snapshot: 12000,
        sender_verified_snapshot: true,
        state: "active",
        endorsed_at: "2026-08-15T12:00:00.000Z",
      }],
      error: null,
    });
    const or = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ or });
    const from = vi.fn().mockReturnValue({ select });
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { id: PROFILE_ID } },
      error: null,
    });
    const repository = createProfileCertifEndorsementsRepository({
      from,
      auth: { getUser },
    } as unknown as SupabaseClient);

    await expect(repository.listMine(PROFILE_ID)).resolves.toEqual([
      expect.objectContaining({
        id: ENDORSEMENT_ID,
        direction: "sent",
        counterpartDisplayName: "Malik",
        state: "active",
      }),
    ]);
    expect(from).toHaveBeenCalledWith("profile_certif_endorsements_v1");
    expect(or).toHaveBeenCalledWith(
      `sender_profile_id_snapshot.eq.${PROFILE_ID},recipient_profile_id_snapshot.eq.${PROFILE_ID}`,
    );
    expect(order).toHaveBeenCalledWith("endorsed_at", { ascending: false });
  });

  it("wires sender withdrawal and recipient visibility actions to the scoped RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: ENDORSEMENT_ID, state: "hidden_by_recipient" },
      error: null,
    });
    const repository = createProfileCertifEndorsementsRepository({ rpc } as unknown as SupabaseClient);

    await expect(repository.setMyEndorsementState(ENDORSEMENT_ID, "hide")).resolves.toEqual({
      id: ENDORSEMENT_ID,
      state: "hidden_by_recipient",
    });
    expect(rpc).toHaveBeenCalledWith("profile_set_my_certif_state_v1", {
      p_endorsement_id: ENDORSEMENT_ID,
      p_action: "hide",
    });
  });
});
