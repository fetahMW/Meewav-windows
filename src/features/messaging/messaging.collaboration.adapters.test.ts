import { describe, expect, it } from "vitest";
import { mapCollaborationRowToViewModel } from "./messaging.collaboration.adapters";
import type { MessagingCollaborationRequestRow } from "./messaging.collaboration.types";

const CURRENT_PROFILE_ID = "60000000-0000-4000-8000-000000000001";
const OTHER_PROFILE_ID = "60000000-0000-4000-8000-000000000002";
const REQUEST_ID = "61000000-0000-4000-8000-000000000001";

function row(overrides: Partial<MessagingCollaborationRequestRow> = {}): MessagingCollaborationRequestRow {
  return {
    request_id: REQUEST_ID,
    direction: "received",
    status: "pending",
    message: "On construit un titre ensemble ?",
    source: "globe",
    created_at: "2026-07-18T10:00:00Z",
    updated_at: "2026-07-18T10:00:00Z",
    responded_at: null,
    conversation_id: null,
    viewed_at: null,
    is_unread: true,
    can_accept: true,
    can_decline: true,
    can_cancel: false,
    relationship_blocked: false,
    other_profile_id: OTHER_PROFILE_ID,
    other_username: "maya",
    other_display_name: "Maya",
    other_avatar_url: null,
    other_avatar_style_key: "producer",
    other_primary_role_key: "beat_maker",
    other_city: "Paris",
    other_country_code: "FR",
    other_is_verified: true,
    other_grade_level: 4,
    other_grade_code: "elite",
    other_grade_label: "Élite",
    other_grade_visual_key: "grade-elite",
    page_cursor: { sort_at: "2026-07-18T10:00:00Z", request_id: REQUEST_ID },
    ...overrides,
  };
}

describe("messaging collaboration adapter", () => {
  it("maps a real received request to the existing visual model without inventing attachments", () => {
    const result = mapCollaborationRowToViewModel(
      row(),
      CURRENT_PROFILE_ID,
      new Date("2026-07-18T12:00:00Z"),
    );

    expect(result).toMatchObject({
      id: REQUEST_ID,
      userId: OTHER_PROFILE_ID,
      name: "Maya",
      role: "Beat maker",
      gradeLevel: 4,
      rank: 4,
      status: "pending",
      requestStatus: "pending",
      isReceived: true,
      senderProfileId: OTHER_PROFILE_ID,
      recipientProfileId: CURRENT_PROFILE_ID,
      meta: "Il y a 2 h",
    });
    expect(result.attachments).toEqual([]);
    expect(result.server.canAccept).toBe(true);
  });

  it("does not claim a sent request was read because the RPC does not expose that receipt", () => {
    const result = mapCollaborationRowToViewModel(row({
      direction: "sent",
      is_unread: false,
      viewed_at: "2026-07-18T10:00:00Z",
      can_accept: false,
      can_decline: false,
      can_cancel: true,
    }), CURRENT_PROFILE_ID);

    expect(result.status).toBe("sent");
    expect(result.sentState).toBeUndefined();
    expect(result.senderProfileId).toBe(CURRENT_PROFILE_ID);
    expect(result.recipientProfileId).toBe(OTHER_PROFILE_ID);
  });

  it("keeps the canonical terminal status in server metadata", () => {
    const result = mapCollaborationRowToViewModel(row({
      status: "cancelled",
      direction: "sent",
      can_accept: false,
      can_decline: false,
      can_cancel: false,
    }), CURRENT_PROFILE_ID);

    expect(result.server.status).toBe("cancelled");
    expect(result.requestStatus).toBe("rejected");
    expect(result.sentState).toBeUndefined();
  });

  it("projects Shorts provenance without mislabelling other live sources as Globe", () => {
    expect(mapCollaborationRowToViewModel(
      row({ source: "shorts" }),
      CURRENT_PROFILE_ID,
    ).requestSource).toBe("shorts");

    expect(mapCollaborationRowToViewModel(
      row({ source: "profile" }),
      CURRENT_PROFILE_ID,
    ).requestSource).toBe("profile");
  });
});
