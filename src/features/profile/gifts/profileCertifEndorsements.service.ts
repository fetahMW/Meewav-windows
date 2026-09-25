import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabaseClient";

type JsonRecord = Record<string, unknown>;

export type ProfileCertifPublicEndorser = {
  displayName: string;
  avatarUrl: string | null;
  gradeLevelAtEndorsement: number;
  followersAtEndorsement: number;
  wasVerifiedAtEndorsement: boolean;
  endorsedAt: string;
  snapshotQuality: "source_time" | "backfill_current";
};

export type ProfileCertifSummary = {
  profileId: string;
  displayLabel: string;
  officialMeewavVerification: false;
  uniqueEndorsers: number;
  highGradeEndorsers: number;
  verifiedEndorsers: number;
  signalContextVersion: "profile-signals-v1";
  recentPublicEndorsers: ProfileCertifPublicEndorser[];
  disclaimer: string;
};

export type ProfileCertifState = "active" | "withdrawn" | "hidden_by_recipient" | "moderated";
export type ProfileCertifStateAction = "withdraw" | "hide" | "restore_visibility";
export type ProfileCertifEndorsement = {
  id: string;
  direction: "sent" | "received";
  state: ProfileCertifState;
  roomIdSnapshot: string;
  counterpartDisplayName: string;
  counterpartAvatarUrl: string | null;
  senderGradeLevelSnapshot: number;
  senderFollowersCountSnapshot: number;
  senderVerifiedSnapshot: boolean;
  endorsedAt: string;
};

export type ProfileCertifServiceErrorCode =
  | "not-authenticated"
  | "owner-mismatch"
  | "summary-load-failed"
  | "endorsements-load-failed"
  | "state-update-failed";

export class ProfileCertifServiceError extends Error {
  readonly code: ProfileCertifServiceErrorCode;

  constructor(code: ProfileCertifServiceErrorCode, message: string) {
    super(message);
    this.name = "ProfileCertifServiceError";
    this.code = code;
  }
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function textValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function wholeNumber(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, Math.trunc(value)))
    : minimum;
}

function isMissingCertifInfrastructure(error: { code?: string | null; message?: string | null } | null) {
  if (!error) return false;
  if (["PGRST202", "PGRST205", "42883", "42P01"].includes(error.code ?? "")) return true;
  return /(?:get_profile_certif_summary_v1|profile_set_my_certif_state_v1|profile_certif_endorsements_v1).*(?:not found|schema cache|does not exist)/i
    .test(error.message ?? "");
}

const ENDORSEMENT_SELECT = [
  "id",
  "room_id_snapshot",
  "sender_profile_id_snapshot",
  "recipient_profile_id_snapshot",
  "sender_display_name_snapshot",
  "sender_avatar_url_snapshot",
  "recipient_display_name_snapshot",
  "recipient_avatar_url_snapshot",
  "sender_grade_level_snapshot",
  "sender_followers_count_snapshot",
  "sender_verified_snapshot",
  "state",
  "endorsed_at",
].join(",");

export function mapProfileCertifSummary(value: unknown): ProfileCertifSummary | null {
  const record = asRecord(value);
  const profileId = textValue(record.profile_id);
  if (!profileId) return null;
  const recent = Array.isArray(record.recent_public_endorsers)
    ? record.recent_public_endorsers.flatMap((candidate): ProfileCertifPublicEndorser[] => {
      const endorser = asRecord(candidate);
      const displayName = textValue(endorser.display_name);
      const endorsedAt = textValue(endorser.endorsed_at);
      if (!displayName || !endorsedAt) return [];
      return [{
        displayName,
        avatarUrl: textValue(endorser.avatar_url) || null,
        gradeLevelAtEndorsement: wholeNumber(endorser.grade_level_at_endorsement, 1, 6),
        followersAtEndorsement: wholeNumber(endorser.followers_at_endorsement),
        wasVerifiedAtEndorsement: endorser.was_verified_at_endorsement === true,
        endorsedAt,
        snapshotQuality: endorser.snapshot_quality === "backfill_current"
          ? "backfill_current"
          : "source_time",
      }];
    })
    : [];

  return {
    profileId,
    displayLabel: textValue(record.display_label, "Validations reçues"),
    // Deliberately constant: a member endorsement cannot verify an account.
    officialMeewavVerification: false,
    uniqueEndorsers: wholeNumber(record.unique_endorsers),
    highGradeEndorsers: wholeNumber(record.high_grade_endorsers),
    verifiedEndorsers: wholeNumber(record.verified_endorsers),
    signalContextVersion: "profile-signals-v1",
    recentPublicEndorsers: recent,
    disclaimer: textValue(
      record.disclaimer,
      "Éloges signées par des membres ; ne constituent pas une vérification officielle MeeWav.",
    ),
  };
}

export function createProfileCertifEndorsementsRepository(client: SupabaseClient = supabase) {
  return {
    async getSummary(profileId: string): Promise<ProfileCertifSummary | null> {
      const { data, error } = await client.rpc("get_profile_certif_summary_v1", {
        p_profile_id: profileId,
      });
      if (error) {
        // Additive rollout: a Profile remains usable until its environment has
        // received the endorsement migration.
        if (isMissingCertifInfrastructure(error)) return null;
        throw new ProfileCertifServiceError(
          "summary-load-failed",
          "Les validations reçues n’ont pas pu être chargées.",
        );
      }
      return mapProfileCertifSummary(data);
    },

    async listMine(expectedOwnerUserId?: string): Promise<ProfileCertifEndorsement[]> {
      const { data: authData, error: authError } = await client.auth.getUser();
      const user = authData.user;
      if (authError || !user) {
        throw new ProfileCertifServiceError(
          "not-authenticated",
          "Ta session a expiré. Reconnecte-toi pour retrouver tes validations.",
        );
      }
      if (expectedOwnerUserId && expectedOwnerUserId !== user.id) {
        throw new ProfileCertifServiceError(
          "owner-mismatch",
          "Cette session ne peut pas lire les validations de ce profil.",
        );
      }

      const { data, error } = await client
        .from("profile_certif_endorsements_v1")
        .select(ENDORSEMENT_SELECT)
        .or(`sender_profile_id_snapshot.eq.${user.id},recipient_profile_id_snapshot.eq.${user.id}`)
        .order("endorsed_at", { ascending: false });
      if (error) {
        if (isMissingCertifInfrastructure(error)) return [];
        throw new ProfileCertifServiceError(
          "endorsements-load-failed",
          "Tes validations n’ont pas pu être chargées.",
        );
      }

      return (data ?? []).flatMap((value): ProfileCertifEndorsement[] => {
        const record = asRecord(value);
        const id = textValue(record.id);
        const senderId = textValue(record.sender_profile_id_snapshot);
        const recipientId = textValue(record.recipient_profile_id_snapshot);
        const state = textValue(record.state) as ProfileCertifState;
        const endorsedAt = textValue(record.endorsed_at);
        if (
          !id
          || !senderId
          || !recipientId
          || !endorsedAt
          || !["active", "withdrawn", "hidden_by_recipient", "moderated"].includes(state)
        ) return [];
        const sent = senderId === user.id;
        return [{
          id,
          direction: sent ? "sent" : "received",
          state,
          roomIdSnapshot: textValue(record.room_id_snapshot),
          counterpartDisplayName: sent
            ? textValue(record.recipient_display_name_snapshot, "Membre MeeWav")
            : textValue(record.sender_display_name_snapshot, "Membre MeeWav"),
          counterpartAvatarUrl: textValue(
            sent ? record.recipient_avatar_url_snapshot : record.sender_avatar_url_snapshot,
          ) || null,
          senderGradeLevelSnapshot: wholeNumber(record.sender_grade_level_snapshot, 1, 6),
          senderFollowersCountSnapshot: wholeNumber(record.sender_followers_count_snapshot),
          senderVerifiedSnapshot: record.sender_verified_snapshot === true,
          endorsedAt,
        }];
      });
    },

    async setMyEndorsementState(
      endorsementId: string,
      action: ProfileCertifStateAction,
    ): Promise<{ id: string; state: ProfileCertifState }> {
      const { data, error } = await client.rpc("profile_set_my_certif_state_v1", {
        p_endorsement_id: endorsementId,
        p_action: action,
      });
      const result = asRecord(data);
      const id = textValue(result.id);
      const state = textValue(result.state) as ProfileCertifState;
      if (error || !id || !["active", "withdrawn", "hidden_by_recipient", "moderated"].includes(state)) {
        throw new ProfileCertifServiceError(
          "state-update-failed",
          "La visibilité de cette validation n’a pas pu être modifiée.",
        );
      }
      return { id, state };
    },
  };
}

export const profileCertifEndorsementsRepository = createProfileCertifEndorsementsRepository();
