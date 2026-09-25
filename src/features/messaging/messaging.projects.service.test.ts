import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createMessagingProjectsRepository } from "./messaging.projects.service";

const PROJECT_ID = "71000000-0000-4000-8000-000000000001";
const PROFILE_ID = "72000000-0000-4000-8000-000000000001";
const CONVERSATION_ID = "73000000-0000-4000-8000-000000000001";
const TASK_ID = "74000000-0000-4000-8000-000000000001";
const MESSAGE_ID = "75000000-0000-4000-8000-000000000001";

describe("messaging projects Supabase repository", () => {
  it("creates a project through the atomic project-and-chat RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ok: true,
        idempotent: false,
        project_id: PROJECT_ID,
        conversation_id: CONVERSATION_ID,
      },
      error: null,
    });
    const repository = createMessagingProjectsRepository({ rpc } as unknown as SupabaseClient);

    await repository.createProject({
      name: "  Aurora Tapes  ",
      description: "  Session de nuit  ",
      genre: " Ambient ",
      bpm: 92,
      musicalKey: " Dm ",
      objective: " Master final ",
      milestone: " Mix v2 ",
      idempotencyKey: "project:create:stable-0001",
    });

    expect(rpc).toHaveBeenCalledWith("create_creative_project_v1", {
      p_name: "Aurora Tapes",
      p_description: "Session de nuit",
      p_genre: "Ambient",
      p_bpm: 92,
      p_musical_key: "Dm",
      p_objective: "Master final",
      p_delivery_at: null,
      p_milestone: "Mix v2",
      p_idempotency_key: "project:create:stable-0001",
    });
  });

  it("carries the full invitation permission proposal to the server", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: true, idempotent: false, invitation_id: MESSAGE_ID, status: "pending" },
      error: null,
    });
    const repository = createMessagingProjectsRepository({ rpc } as unknown as SupabaseClient);

    await repository.inviteMember({
      projectId: PROJECT_ID,
      profileId: PROFILE_ID,
      authorityRole: "contributor",
      artisticRole: "Pianiste",
      permissions: {
        can_edit: true,
        can_invite: false,
        can_manage_members: false,
        can_manage_stems: true,
        can_create_tasks: true,
      },
      idempotencyKey: "project:invite:stable-0001",
    });

    expect(rpc).toHaveBeenCalledWith("invite_creative_project_member_v1", expect.objectContaining({
      p_project_id: PROJECT_ID,
      p_invited_profile_id: PROFILE_ID,
      p_artistic_role: "Pianiste",
      p_can_edit: true,
      p_can_manage_members: false,
      p_can_manage_stems: true,
      p_idempotency_key: "project:invite:stable-0001",
    }));
  });

  it("requires a client task id and uses it as the durable retry identity", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: true, idempotent: false, project_id: PROJECT_ID, task_id: TASK_ID },
      error: null,
    });
    const repository = createMessagingProjectsRepository({ rpc } as unknown as SupabaseClient);

    await repository.upsertTask({
      projectId: PROJECT_ID,
      taskId: TASK_ID,
      title: "  Valider le mix  ",
      status: "in_progress",
    });

    expect(rpc).toHaveBeenCalledWith("upsert_creative_project_task_v1", {
      p_project_id: PROJECT_ID,
      p_task_id: TASK_ID,
      p_title: "Valider le mix",
      p_description: "",
      p_assigned_profile_id: null,
      p_status: "in_progress",
      p_due_at: null,
      p_expected_updated_at: null,
    });
  });

  it("sends project text through the shared durable conversation contract", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: true, idempotent: false, message_id: MESSAGE_ID, sequence: 2 },
      error: null,
    });
    const repository = createMessagingProjectsRepository({ rpc } as unknown as SupabaseClient);

    await repository.sendProjectText(CONVERSATION_ID, "  Le mix est prêt  ", MESSAGE_ID);

    expect(rpc).toHaveBeenCalledWith("send_message_v1", {
      p_conversation_id: CONVERSATION_ID,
      p_client_message_id: MESSAGE_ID,
      p_kind: "text",
      p_body: "Le mix est prêt",
      p_payload: { domain: "creative_project" },
      p_reply_to_message_id: null,
    });
  });

  it("rejects invalid client payloads before invoking Supabase", async () => {
    const rpc = vi.fn();
    const repository = createMessagingProjectsRepository({ rpc } as unknown as SupabaseClient);

    await expect(repository.createProject({
      name: "",
      bpm: 900,
      idempotencyKey: "project:create:stable-0002",
    })).rejects.toMatchObject({ code: "invalid_request" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps private SQL permission failures to a stable public error", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42501", message: "owner_permission_required", details: "private row state" },
    });
    const repository = createMessagingProjectsRepository({ rpc } as unknown as SupabaseClient);

    await expect(repository.deleteProject(PROJECT_ID)).rejects.toMatchObject({
      code: "permission_denied",
      message: "Tu n’as pas l’autorisation d’effectuer cette action.",
    });
  });
});
