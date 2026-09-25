import { describe, expect, it } from "vitest";
import { mapMessagingProjectRow, parseMessagingProjectWorkspace } from "./messaging.projects.adapters";
import type { MessagingProjectRow } from "./messaging.projects.types";

const PROJECT_ID = "71000000-0000-4000-8000-000000000001";
const PROFILE_ID = "72000000-0000-4000-8000-000000000001";
const CONVERSATION_ID = "73000000-0000-4000-8000-000000000001";

function projectRow(overrides: Partial<MessagingProjectRow> = {}): MessagingProjectRow {
  return {
    project_id: PROJECT_ID,
    owner_profile_id: PROFILE_ID,
    name: "Aurora Tapes",
    description: "Projet nocturne",
    status: "in_progress",
    genre: "Ambient",
    bpm: 92,
    musical_key: "Dm",
    objective: "Finaliser le master",
    delivery_at: "2026-08-01T12:00:00Z",
    milestone: "Mix v2",
    conversation_id: CONVERSATION_ID,
    my_authority_role: "owner",
    my_artistic_role: "Producteur",
    can_edit: true,
    can_invite: true,
    can_manage_members: true,
    can_manage_stems: true,
    can_create_tasks: true,
    member_count: 3,
    task_count: 5,
    pending_task_count: 2,
    unread_count: 4,
    created_at: "2026-07-18T10:00:00Z",
    updated_at: "2026-07-18T11:00:00Z",
    activity_at: "2026-07-18T12:00:00Z",
    page_cursor: { activity_at: "2026-07-18T12:00:00Z", project_id: PROJECT_ID },
    ...overrides,
  };
}

describe("messaging project adapters", () => {
  it("maps the safe list projection to the existing project card vocabulary", () => {
    expect(mapMessagingProjectRow(projectRow())).toEqual(expect.objectContaining({
      id: PROJECT_ID,
      name: "Aurora Tapes",
      conversationId: CONVERSATION_ID,
      role: "owner",
      permissions: expect.objectContaining({ can_manage_members: true }),
      members: 3,
      tasks: 5,
      pendingTasks: 2,
      unread: 4,
      musicalKey: "Dm",
    }));
  });

  it("normalizes nullable aggregate arrays in a valid workspace payload", () => {
    const workspace = parseMessagingProjectWorkspace({
      ...projectRow(),
      membership: {
        authority_role: "owner",
        artistic_role: "Producteur",
        can_edit: true,
        can_invite: true,
        can_manage_members: true,
        can_manage_stems: true,
        can_create_tasks: true,
      },
      completed_at: null,
      archived_at: null,
      members: null,
      tasks: null,
      recent_activity: null,
    });

    expect(workspace.members).toEqual([]);
    expect(workspace.tasks).toEqual([]);
    expect(workspace.recent_activity).toEqual([]);
    expect(workspace.unread_count).toBe(4);
  });

  it("rejects malformed workspace projections instead of inventing demo data", () => {
    expect(() => parseMessagingProjectWorkspace({ project_id: PROJECT_ID }))
      .toThrow(expect.objectContaining({ code: "load_failed" }));
  });
});
