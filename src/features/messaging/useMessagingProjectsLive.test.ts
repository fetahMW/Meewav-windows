import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MessagingProjectsRepository } from "./messaging.projects.service";
import type {
  MessagingProjectInvitationRow,
  MessagingProjectRow,
  MessagingProjectWorkspace,
} from "./messaging.projects.types";
import { useMessagingProjectsLive } from "./useMessagingProjectsLive";

const CURRENT_PROFILE_ID = "70000000-0000-4000-8000-000000000001";
const PROJECT_ID = "71000000-0000-4000-8000-000000000001";
const OTHER_PROFILE_ID = "72000000-0000-4000-8000-000000000001";
const CONVERSATION_ID = "73000000-0000-4000-8000-000000000001";
const INVITATION_ID = "74000000-0000-4000-8000-000000000001";

function projectRow(overrides: Partial<MessagingProjectRow> = {}): MessagingProjectRow {
  return {
    project_id: PROJECT_ID,
    owner_profile_id: CURRENT_PROFILE_ID,
    name: "Aurora Tapes",
    description: "Projet nocturne",
    status: "in_progress",
    genre: "Ambient",
    bpm: 92,
    musical_key: "Dm",
    objective: null,
    delivery_at: null,
    milestone: null,
    conversation_id: CONVERSATION_ID,
    my_authority_role: "owner",
    my_artistic_role: "Producteur",
    can_edit: true,
    can_invite: true,
    can_manage_members: true,
    can_manage_stems: true,
    can_create_tasks: true,
    member_count: 1,
    task_count: 0,
    pending_task_count: 0,
    unread_count: 0,
    created_at: "2026-07-18T10:00:00Z",
    updated_at: "2026-07-18T11:00:00Z",
    activity_at: "2026-07-18T11:00:00Z",
    page_cursor: { activity_at: "2026-07-18T11:00:00Z", project_id: PROJECT_ID },
    ...overrides,
  };
}

function projectWorkspace(): MessagingProjectWorkspace {
  return {
    project_id: PROJECT_ID,
    owner_profile_id: CURRENT_PROFILE_ID,
    name: "Aurora Tapes",
    description: "Projet nocturne",
    status: "in_progress",
    genre: "Ambient",
    bpm: 92,
    musical_key: "Dm",
    objective: null,
    delivery_at: null,
    milestone: null,
    conversation_id: CONVERSATION_ID,
    created_at: "2026-07-18T10:00:00Z",
    updated_at: "2026-07-18T11:00:00Z",
    completed_at: null,
    archived_at: null,
    membership: {
      authority_role: "owner",
      artistic_role: "Producteur",
      can_edit: true,
      can_invite: true,
      can_manage_members: true,
      can_manage_stems: true,
      can_create_tasks: true,
    },
    unread_count: 0,
    members: [],
    tasks: [],
    recent_activity: [],
  };
}

function invitationRow(): MessagingProjectInvitationRow {
  return {
    invitation_id: INVITATION_ID,
    project_id: PROJECT_ID,
    project_name: "Aurora Tapes",
    direction: "received",
    status: "pending",
    other_profile_id: OTHER_PROFILE_ID,
    other_username: "maya",
    other_display_name: "Maya",
    other_avatar_url: null,
    proposed_authority_role: "contributor",
    proposed_artistic_role: "Pianiste",
    proposed_can_edit: true,
    proposed_can_invite: false,
    proposed_can_manage_members: false,
    proposed_can_manage_stems: true,
    proposed_can_create_tasks: true,
    created_at: "2026-07-18T10:00:00Z",
    expires_at: "2026-08-18T10:00:00Z",
    responded_at: null,
    page_cursor: { created_at: "2026-07-18T10:00:00Z", invitation_id: INVITATION_ID },
  };
}

function fakeRepository(overrides: Partial<MessagingProjectsRepository> = {}) {
  return {
    listProjects: vi.fn().mockResolvedValue([projectRow()]),
    getProject: vi.fn().mockResolvedValue(projectWorkspace()),
    listInvitations: vi.fn().mockImplementation(({ scope }) => (
      Promise.resolve(scope === "received" ? [invitationRow()] : [])
    )),
    createProject: vi.fn().mockResolvedValue({
      ok: true,
      idempotent: false,
      project_id: PROJECT_ID,
      conversation_id: CONVERSATION_ID,
    }),
    updateProject: vi.fn(),
    inviteMember: vi.fn(),
    respondToInvitation: vi.fn(),
    cancelInvitation: vi.fn(),
    updateMember: vi.fn(),
    transferOwnership: vi.fn(),
    removeOrLeave: vi.fn(),
    upsertTask: vi.fn(),
    deleteTask: vi.fn(),
    setStatus: vi.fn(),
    deleteProject: vi.fn(),
    listProjectMessages: vi.fn().mockResolvedValue([]),
    sendProjectText: vi.fn(),
    ...overrides,
  } as unknown as MessagingProjectsRepository;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("useMessagingProjectsLive", () => {
  it("stays empty while live mode is disabled instead of restoring session demo projects", () => {
    const repository = fakeRepository();
    const { result } = renderHook(() => useMessagingProjectsLive({
      enabled: false,
      currentProfileId: CURRENT_PROFILE_ID,
      repository,
      pollIntervalMs: 0,
    }));

    expect(result.current.status).toBe("idle");
    expect(result.current.items).toEqual([]);
    expect(repository.listProjects).not.toHaveBeenCalled();
  });

  it("loads the project list and both invitation directions from Supabase", async () => {
    const repository = fakeRepository();
    const { result } = renderHook(() => useMessagingProjectsLive({
      enabled: true,
      currentProfileId: CURRENT_PROFILE_ID,
      repository,
      pollIntervalMs: 0,
    }));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]).toMatchObject({ name: "Aurora Tapes", role: "owner" });
    expect(result.current.invitations).toHaveLength(1);
    expect(repository.listInvitations).toHaveBeenCalledTimes(2);
  });

  it("loads project authority, tasks, activity and linked text chat together", async () => {
    const repository = fakeRepository();
    const { result } = renderHook(() => useMessagingProjectsLive({
      enabled: true,
      currentProfileId: CURRENT_PROFILE_ID,
      repository,
      pollIntervalMs: 0,
    }));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(() => result.current.selectProject(PROJECT_ID));

    expect(result.current.detailStatus).toBe("ready");
    expect(result.current.selectedProject?.conversation_id).toBe(CONVERSATION_ID);
    expect(repository.getProject).toHaveBeenCalledWith(PROJECT_ID);
    expect(repository.listProjectMessages).toHaveBeenCalledWith(CONVERSATION_ID, null, 50);
  });

  it("deduplicates repeated mutations with the same durable idempotency key", async () => {
    const create = deferred<{
      ok: boolean;
      idempotent: boolean;
      project_id: string;
      conversation_id: string;
    }>();
    const createProject = vi.fn().mockReturnValue(create.promise);
    const repository = fakeRepository({ createProject });
    const { result } = renderHook(() => useMessagingProjectsLive({
      enabled: true,
      currentProfileId: CURRENT_PROFILE_ID,
      repository,
      pollIntervalMs: 0,
    }));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    const input = { name: "Aurora Tapes", idempotencyKey: "project:create:stable-0001" };
    let first!: ReturnType<typeof result.current.createProject>;
    let second!: ReturnType<typeof result.current.createProject>;
    act(() => {
      first = result.current.createProject(input);
      second = result.current.createProject(input);
    });
    expect(createProject).toHaveBeenCalledTimes(1);

    await act(async () => {
      create.resolve({
        ok: true,
        idempotent: false,
        project_id: PROJECT_ID,
        conversation_id: CONVERSATION_ID,
      });
      await Promise.all([first, second]);
    });
    expect(result.current.actionError).toBeNull();
  });

  it("keeps a caller-generated task id unchanged across the hook boundary", async () => {
    const upsertTask = vi.fn().mockResolvedValue({ ok: true, project_id: PROJECT_ID });
    const repository = fakeRepository({ upsertTask });
    const { result } = renderHook(() => useMessagingProjectsLive({
      enabled: true,
      currentProfileId: CURRENT_PROFILE_ID,
      repository,
      pollIntervalMs: 0,
    }));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(() => result.current.upsertTask({
      projectId: PROJECT_ID,
      taskId: INVITATION_ID,
      title: "Valider le mix",
    }));

    expect(upsertTask).toHaveBeenCalledWith(expect.objectContaining({ taskId: INVITATION_ID }));
  });
});
