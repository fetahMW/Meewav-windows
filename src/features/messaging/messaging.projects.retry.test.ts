import { describe, expect, it, vi } from "vitest";
import {
  createMessagingProjectCreationAttempt,
  createMessagingProjectInvitationAttempt,
  type MessagingProjectInviteDraft,
} from "./messaging.projects.retry";

const permissions = {
  can_edit: true,
  can_invite: false,
  can_manage_members: false,
  can_manage_stems: true,
  can_create_tasks: true,
};

function invitee(profileId: string): MessagingProjectInviteDraft {
  return {
    profileId,
    authorityRole: "contributor",
    artisticRole: "Artiste",
    permissions,
  };
}

describe("messaging project retry attempts", () => {
  it("partage la même opération lors d’un double-clic de création", async () => {
    let resolveCreate!: (value: {
      ok: boolean;
      idempotent: boolean;
      project_id: string;
      conversation_id: string;
    }) => void;
    const createProject = vi.fn(() => new Promise<{
      ok: boolean;
      idempotent: boolean;
      project_id: string;
      conversation_id: string;
    }>((resolve) => { resolveCreate = resolve; }));
    const attempt = createMessagingProjectCreationAttempt({ name: "Aurora" }, []);
    const actions = { createProject, inviteMember: vi.fn() };

    const first = attempt.run(actions);
    const second = attempt.run(actions);
    expect(createProject).toHaveBeenCalledTimes(1);
    resolveCreate({
      ok: true,
      idempotent: false,
      project_id: "project-1",
      conversation_id: "conversation-1",
    });

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ project_id: "project-1" }),
      expect.objectContaining({ project_id: "project-1" }),
    ]);
    expect(createProject).toHaveBeenCalledTimes(1);
  });

  it("rejoue une création ambiguë avec la même clé et le même payload", async () => {
    const createProject = vi.fn()
      .mockRejectedValueOnce(new Error("network_lost_after_commit"))
      .mockResolvedValueOnce({
        ok: true,
        idempotent: true,
        project_id: "project-1",
        conversation_id: "conversation-1",
      });
    const attempt = createMessagingProjectCreationAttempt(
      { name: "Aurora", description: "Album" },
      [],
    );

    await expect(attempt.run({ createProject, inviteMember: vi.fn() })).rejects.toThrow(
      "network_lost_after_commit",
    );
    await attempt.run({ createProject, inviteMember: vi.fn() });

    expect(createProject).toHaveBeenCalledTimes(2);
    expect(createProject.mock.calls[1][0]).toEqual(createProject.mock.calls[0][0]);
  });

  it("ne recrée pas le projet et ne réinvite pas les membres déjà confirmés", async () => {
    const createProject = vi.fn().mockResolvedValue({
      ok: true,
      idempotent: false,
      project_id: "project-1",
      conversation_id: "conversation-1",
    });
    const inviteMember = vi.fn()
      .mockResolvedValueOnce({ ok: true, idempotent: false, invitation_id: "invite-a", status: "pending" })
      .mockRejectedValueOnce(new Error("temporary_failure"))
      .mockResolvedValueOnce({ ok: true, idempotent: true, invitation_id: "invite-b", status: "pending" });
    const attempt = createMessagingProjectCreationAttempt(
      { name: "Aurora" },
      [invitee("profile-a"), invitee("profile-b")],
    );

    await expect(attempt.run({ createProject, inviteMember })).rejects.toThrow("temporary_failure");
    expect(attempt.pendingProfileIds).toEqual(["profile-b"]);
    const failedInput = inviteMember.mock.calls[1][0];

    await attempt.run({ createProject, inviteMember });

    expect(createProject).toHaveBeenCalledTimes(1);
    expect(inviteMember).toHaveBeenCalledTimes(3);
    expect(inviteMember.mock.calls[2][0]).toEqual(failedInput);
    expect(inviteMember.mock.calls.filter(([input]) => input.profileId === "profile-a")).toHaveLength(1);
    expect(attempt.pendingProfileIds).toEqual([]);
  });

  it("reprend une invitation multiple à la première étape manquante avec sa clé stable", async () => {
    const inviteMember = vi.fn()
      .mockResolvedValueOnce({ ok: true, idempotent: false, invitation_id: "invite-a", status: "pending" })
      .mockRejectedValueOnce(new Error("temporary_failure"))
      .mockResolvedValueOnce({ ok: true, idempotent: true, invitation_id: "invite-b", status: "pending" });
    const attempt = createMessagingProjectInvitationAttempt([
      invitee("profile-a"),
      invitee("profile-b"),
    ]);

    await expect(attempt.run("project-1", inviteMember)).rejects.toThrow("temporary_failure");
    const failedInput = inviteMember.mock.calls[1][0];
    await attempt.run("project-1", inviteMember);

    expect(inviteMember).toHaveBeenCalledTimes(3);
    expect(inviteMember.mock.calls[2][0]).toEqual(failedInput);
    expect(inviteMember.mock.calls.filter(([input]) => input.profileId === "profile-a")).toHaveLength(1);
  });
});
