import { describe, expect, it } from "vitest";
import {
  mapArtistGroupActivityRow,
  mapArtistGroupInvitationRow,
  mapArtistGroupRow,
} from "./messaging.groups.adapters";
import type {
  MessagingArtistGroupActivityRow,
  MessagingArtistGroupInvitationRow,
  MessagingArtistGroupRow,
} from "./messaging.groups.types";

const GROUP_ID = "81000000-0000-4000-8000-000000000001";
const CONVERSATION_ID = "82000000-0000-4000-8000-000000000001";

function groupRow(): MessagingArtistGroupRow {
  return {
    group_id: GROUP_ID,
    name: " Collectif Horizon ",
    description: " Création collaborative ",
    visibility: "discoverable",
    lifecycle_status: "active",
    conversation_id: CONVERSATION_ID,
    member_limit: 50,
    active_member_count: 6,
    pending_invitation_count: 2,
    my_authority_role: "admin",
    my_artistic_role: "Beatmaker",
    my_notifications_enabled: false,
    my_roster_visibility: "hidden",
    my_archived_at: "2026-07-18T10:00:00Z",
    created_at: "2026-07-17T10:00:00Z",
    updated_at: "2026-07-18T10:00:00Z",
    page_cursor: { updated_at: "2026-07-18T10:00:00Z", group_id: GROUP_ID },
  };
}

describe("messaging artist group adapters", () => {
  it("maps the safe list projection without mixing authority and artistic roles", () => {
    const mapped = mapArtistGroupRow(groupRow());
    expect(mapped).toMatchObject({
      id: GROUP_ID,
      name: "Collectif Horizon",
      authorityRole: "admin",
      artisticRole: "Beatmaker",
      memberCount: 6,
      pendingInvitationCount: 2,
      notificationsEnabled: false,
      rosterVisibility: "hidden",
      personallyArchived: true,
    });
  });

  it("normalizes a safe invitation with a local avatar fallback", () => {
    const row: MessagingArtistGroupInvitationRow = {
      invitation_id: "83000000-0000-4000-8000-000000000001",
      group_id: GROUP_ID,
      group_name: "Horizon",
      conversation_id: CONVERSATION_ID,
      invited_by_profile_id: null,
      inviter_username: null,
      inviter_display_name: "",
      inviter_avatar_url: null,
      artistic_role: null,
      message: null,
      status: "pending",
      created_at: "2026-07-18T10:00:00Z",
      expires_at: "2026-08-18T10:00:00Z",
      page_cursor: {
        created_at: "2026-07-18T10:00:00Z",
        invitation_id: "83000000-0000-4000-8000-000000000001",
      },
    };
    expect(mapArtistGroupInvitationRow(row)).toMatchObject({
      inviterName: "Membre Meewav",
      inviterAvatar: "/avatars/utilisateur.png",
      message: "Invitation à rejoindre le groupe",
    });
  });

  it("maps an append-only activity event to stable UI copy", () => {
    const row: MessagingArtistGroupActivityRow = {
      activity_id: "84000000-0000-4000-8000-000000000001",
      event_type: "ownership_transferred",
      actor_profile_id: null,
      actor_display_name: "",
      subject_profile_id: "85000000-0000-4000-8000-000000000001",
      payload: { previous_owner_role: "admin" },
      created_at: "2026-07-18T10:00:00Z",
      page_cursor: {
        created_at: "2026-07-18T10:00:00Z",
        activity_id: "84000000-0000-4000-8000-000000000001",
      },
    };
    expect(mapArtistGroupActivityRow(row)).toMatchObject({
      label: "Propriété transférée",
      actorName: "Compte supprimé",
      subjectProfileId: "85000000-0000-4000-8000-000000000001",
    });
  });
});
