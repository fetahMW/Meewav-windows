import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createPlaceRepository } from "./place.service";
import type { PlaceHostAudioStateCommitInput, RoomGiftDeliveryAction } from "./place.types";

const ROOM_ID = "52000000-0000-4000-8000-000000000001";
const GUEST_ID = "51000000-0000-4000-8000-000000000002";
const INVITATION_ID = "53000000-0000-4000-8000-000000000001";
const AUDIO_GENERATION = "54000000-0000-4000-8000-000000000001";
const AUDIO_COMMAND: PlaceHostAudioStateCommitInput = {
  route: "preview",
  playbackState: "ready",
  previewReady: true,
  generation: AUDIO_GENERATION,
  expectedRevision: 7,
  idempotencyKey: "audio-command-0001",
  title: "Nouvelle prise",
  artist: "Naya Oris",
  durationSeconds: 142,
};

describe("La Place Supabase repository", () => {
  it("uses the narrow RPC contracts for chat, gains and Host moderation", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const repository = createPlaceRepository({ rpc } as unknown as SupabaseClient);

    await repository.sendMessage(ROOM_ID, "On garde cette prise.");
    await repository.setOwnMicGain(ROOM_ID, 0.74);
    await repository.setOwnMusicGain(ROOM_ID, 0.62);
    await repository.setHostForcedMute(ROOM_ID, GUEST_ID, true);
    await repository.setHostCameraForcedOff(ROOM_ID, GUEST_ID, true);

    expect(rpc).toHaveBeenNthCalledWith(1, "rooms_send_message_v2", { p_room_id: ROOM_ID, p_content: "On garde cette prise." });
    expect(rpc).toHaveBeenNthCalledWith(2, "rooms_set_own_mic_gain_v2", { p_room_id: ROOM_ID, p_gain: 0.74 });
    expect(rpc).toHaveBeenNthCalledWith(3, "rooms_set_own_music_gain_v2", { p_room_id: ROOM_ID, p_gain: 0.62 });
    expect(rpc).toHaveBeenNthCalledWith(4, "rooms_set_host_mic_forced_muted_v2", { p_room_id: ROOM_ID, p_guest_id: GUEST_ID, p_is_forced_muted: true });
    expect(rpc).toHaveBeenNthCalledWith(5, "rooms_set_host_camera_forced_off_v1", { p_room_id: ROOM_ID, p_guest_id: GUEST_ID, p_is_forced_off: true });
  });

  it("preserves the already wired Like and Golden Like actions", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { likes_count: 12, golden_likes_count: 2 }, error: null });
    const repository = createPlaceRepository({ rpc } as unknown as SupabaseClient);

    await repository.like(ROOM_ID);
    await repository.goldenLike(ROOM_ID);
    await repository.like(ROOM_ID, false);

    expect(rpc).toHaveBeenNthCalledWith(1, "rooms_like_v1", { p_room_id: ROOM_ID });
    expect(rpc).toHaveBeenNthCalledWith(2, "rooms_give_golden_like_v1", { p_room_id: ROOM_ID });
    expect(rpc).toHaveBeenNthCalledWith(3, "rooms_unlike_v1", { p_room_id: ROOM_ID });
  });

  it("commits the complete Host player state through one revisioned RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        audio_route: "preview",
        audio_playback_state: "ready",
        audio_preview_ready: true,
        audio_generation: AUDIO_GENERATION,
        audio_revision: 8,
        audio_track_title: "Nouvelle prise",
        audio_track_artist: "Naya Oris",
        audio_track_duration_seconds: 142,
      },
      error: null,
    });
    const repository = createPlaceRepository({ rpc } as unknown as SupabaseClient);

    const result = await repository.commitHostAudioState(ROOM_ID, GUEST_ID, AUDIO_COMMAND);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("rooms_commit_host_audio_state_v1", {
      p_room_id: ROOM_ID,
      p_route: "preview",
      p_playback_state: "ready",
      p_preview_ready: true,
      p_generation: AUDIO_GENERATION,
      p_expected_revision: 7,
      p_idempotency_key: "audio-command-0001",
      p_track_title: "Nouvelle prise",
      p_track_artist: "Naya Oris",
      p_duration_seconds: 142,
    });
    expect(result).toMatchObject({ revision: 8, generation: AUDIO_GENERATION, transport: "atomic" });
  });

  it("uses legacy player RPCs only when the atomic function is absent", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "function missing from schema cache" } })
      .mockResolvedValue({ data: null, error: null });
    const repository = createPlaceRepository({ rpc } as unknown as SupabaseClient);

    const result = await repository.commitHostAudioState(ROOM_ID, GUEST_ID, AUDIO_COMMAND);

    expect(rpc).toHaveBeenNthCalledWith(2, "rooms_set_own_audio_playback_state_v2", {
      p_room_id: ROOM_ID,
      p_playback_state: "paused",
    });
    expect(rpc).toHaveBeenNthCalledWith(3, "rooms_set_audio_live_enabled_v2", {
      p_room_id: ROOM_ID,
      p_guest_id: GUEST_ID,
      p_live_enabled: false,
    });
    expect(rpc).toHaveBeenNthCalledWith(4, "rooms_set_own_audio_preview_v2", {
      p_room_id: ROOM_ID,
      p_preview_ready: true,
      p_track_title: "Nouvelle prise",
      p_track_artist: "Naya Oris",
      p_duration_seconds: 142,
    });
    expect(result.transport).toBe("legacy");
  });

  it("never hides an atomic Host audio permission error behind legacy writes", async () => {
    const error = { code: "42501", message: "Only the room Host can commit program audio." };
    const rpc = vi.fn().mockResolvedValue({ data: null, error });
    const repository = createPlaceRepository({ rpc } as unknown as SupabaseClient);

    await expect(repository.commitHostAudioState(ROOM_ID, GUEST_ID, AUDIO_COMMAND)).rejects.toEqual(error);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["backstage", "rooms_move_invitation_to_backstage_v2", { p_invitation_id: INVITATION_ID }],
    ["onstage", "rooms_move_invitation_to_stage_v2", { p_invitation_id: INVITATION_ID }],
    ["accepted", "rooms_move_invitation_to_invitations_v2", { p_invitation_id: INVITATION_ID, p_requires_setup: true }],
  ] as const)("moves an invitation to %s through the canonical workflow", async (destination, rpcName, args) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const repository = createPlaceRepository({ rpc } as unknown as SupabaseClient);

    await repository.moveInvitation(INVITATION_ID, destination);

    expect(rpc).toHaveBeenCalledWith(rpcName, args);
  });

  it("propagates server errors instead of pretending a live mutation succeeded", async () => {
    const error = { code: "P0001", message: "Room terminée" };
    const repository = createPlaceRepository({ rpc: vi.fn().mockResolvedValue({ data: null, error }) } as unknown as SupabaseClient);

    await expect(repository.sendMessage(ROOM_ID, "Test")).rejects.toEqual(error);
  });

  it("uses the idempotent gift draw RPC workflow", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const repository = createPlaceRepository({ rpc } as unknown as SupabaseClient);
    const candidate = {
      key: GUEST_ID,
      profileId: GUEST_ID,
      displayName: "Lior Sane",
      avatarUrl: "/lior.webp",
      source: "stage" as const,
    };

    await repository.createGiftDraw(ROOM_ID, {
      giftCode: "vip-pass",
      giftLabel: "Pass VIP",
      poolMode: "selected",
      candidates: [candidate],
      animationDurationSeconds: 7,
    });
    await repository.startGiftDraw("draw-1");
    await repository.revealGiftDraw("draw-1");
    await repository.cancelGiftDraw("draw-1");

    expect(rpc).toHaveBeenNthCalledWith(1, "rooms_create_gift_draw_v1", {
      p_room_id: ROOM_ID,
      p_gift_code: "vip-pass",
      p_gift_label: "Pass VIP",
      p_pool_mode: "selected",
      p_candidates: [{
        key: GUEST_ID,
        profile_id: GUEST_ID,
        display_name: "Lior Sane",
        avatar_url: null,
        source: "stage",
      }],
      p_scheduled_at: null,
      p_animation_duration_seconds: 7,
      p_idempotency_key: null,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "rooms_start_gift_draw_v1", { p_draw_id: "draw-1" });
    expect(rpc).toHaveBeenNthCalledWith(3, "rooms_reveal_gift_draw_v1", { p_draw_id: "draw-1" });
    expect(rpc).toHaveBeenNthCalledWith(4, "rooms_cancel_gift_draw_v1", { p_draw_id: "draw-1" });
  });

  it.each([
    ["send_now", null, null, "sent"],
    ["schedule", "2026-08-20T17:15:00.000Z", null, "scheduled"],
    ["round", null, "Finale du vendredi", "ready"],
  ] as const)("submits a direct gift with the exact %s RPC contract", async (
    action,
    scheduledAt,
    roundLabel,
    status,
  ) => {
    const idempotencyKey = `room-gift:test-${action}`;
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        id: `delivery-${action}`,
        room_id_snapshot: ROOM_ID,
        gift_code: "vip-pass",
        gift_label: "Pass VIP",
        action,
        status,
        round_label: roundLabel,
        recipient_profile_id_snapshot: GUEST_ID,
        recipient_display_name_snapshot: "Lior Sane",
        recipient_avatar_url_snapshot: "/lior.webp",
        recipient_source: "stage",
        scheduled_at: scheduledAt,
        sent_at: action === "send_now" ? "2026-08-14T08:00:00.000Z" : null,
        created_at: "2026-08-14T08:00:00.000Z",
      }],
      error: null,
    });
    const repository = createPlaceRepository({ rpc } as unknown as SupabaseClient);

    const delivery = await repository.submitGift(ROOM_ID, {
      giftCode: "vip-pass",
      giftLabel: "Pass VIP",
      recipientProfileId: GUEST_ID,
      recipientDisplayName: "Étiquette locale ignorée en live",
      recipientAvatarUrl: null,
      recipientSource: "messaging",
      action: action as RoomGiftDeliveryAction,
      scheduledAt,
      roundLabel,
      idempotencyKey,
    });

    expect(rpc).toHaveBeenCalledWith("rooms_submit_gift_v1", {
      p_room_id: ROOM_ID,
      p_gift_code: "vip-pass",
      p_gift_label: "Pass VIP",
      p_recipient_profile_id: GUEST_ID,
      p_action: action,
      p_scheduled_at: scheduledAt,
      p_round_label: roundLabel,
      p_idempotency_key: idempotencyKey,
    });
    expect(delivery).toMatchObject({
      id: `delivery-${action}`,
      roomId: ROOM_ID,
      action,
      status,
      recipientProfileId: GUEST_ID,
      recipientDisplayName: "Lior Sane",
      recipientSource: "stage",
    });
  });

  it.each(["queue", "room"] as const)("keeps the live %s pool server-authoritative", async (poolMode) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const repository = createPlaceRepository({ rpc } as unknown as SupabaseClient);

    await repository.createGiftDraw(ROOM_ID, {
      giftCode: "vip-pass",
      giftLabel: "Pass VIP",
      poolMode,
      // Defense-in-depth: even a stale caller cannot turn a server pool into
      // a client supplied identity list.
      candidates: [{
        key: GUEST_ID,
        profileId: GUEST_ID,
        displayName: "Stale client identity",
        avatarUrl: null,
        source: "room",
      }],
    });

    expect(rpc).toHaveBeenCalledWith("rooms_create_gift_draw_v1", expect.objectContaining({
      p_room_id: ROOM_ID,
      p_pool_mode: poolMode,
      p_candidates: [],
    }));
  });
});
