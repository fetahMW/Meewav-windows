import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ProjectsWorkspace,
  mapMessagingProjectToWorkspaceItem,
  type ProjectsWorkspaceLiveController,
} from "./ProjectsWorkspace";
import type {
  MessagingProjectListItem,
  MessagingProjectWorkspace,
} from "./messaging.projects.types";
import type { MessagingMessageRow } from "./messaging.types";

const currentProfileId = "11111111-1111-4111-8111-111111111111";
const otherProfileId = "22222222-2222-4222-8222-222222222222";
const projectId = "33333333-3333-4333-8333-333333333333";
const secondProjectId = "33333333-3333-4333-8333-333333333334";

const permissions = {
  can_edit: true,
  can_invite: true,
  can_manage_members: true,
  can_manage_stems: true,
  can_create_tasks: true,
};

const item: MessagingProjectListItem = {
  id: projectId,
  name: "Nocturne réel",
  description: "Projet chargé depuis Supabase",
  status: "in_progress",
  conversationId: "44444444-4444-4444-8444-444444444444",
  role: "owner",
  artisticRole: "Producteur",
  permissions,
  members: 2,
  tasks: 1,
  pendingTasks: 1,
  unread: 0,
  genre: "Ambient",
  bpm: 92,
  musicalKey: "Dm",
  deliveryAt: "2026-08-10T12:00:00.000Z",
  milestone: "Master",
  updatedAt: "2026-07-18T12:00:00.000Z",
};

const workspace: MessagingProjectWorkspace = {
  project_id: projectId,
  owner_profile_id: currentProfileId,
  name: item.name,
  description: item.description,
  status: "in_progress",
  genre: item.genre,
  bpm: item.bpm,
  musical_key: item.musicalKey,
  objective: "Livrer le master",
  delivery_at: item.deliveryAt,
  milestone: item.milestone,
  conversation_id: item.conversationId,
  created_at: "2026-07-01T12:00:00.000Z",
  updated_at: item.updatedAt,
  completed_at: null,
  archived_at: null,
  membership: { authority_role: "owner", artistic_role: "Producteur", ...permissions },
  unread_count: 0,
  members: [
    {
      profile_id: currentProfileId,
      username: "fetah",
      display_name: "Fetah",
      avatar_url: null,
      avatar_style_key: null,
      primary_role_key: "beatmaker",
      authority_role: "owner",
      artistic_role: "Producteur",
      joined_at: "2026-07-01T12:00:00.000Z",
      ...permissions,
    },
    {
      profile_id: otherProfileId,
      username: "maya",
      display_name: "Maya",
      avatar_url: null,
      avatar_style_key: null,
      primary_role_key: "singer",
      authority_role: "contributor",
      artistic_role: "Chanteuse",
      joined_at: "2026-07-02T12:00:00.000Z",
      ...permissions,
    },
  ],
  tasks: [{
    task_id: "55555555-5555-4555-8555-555555555555",
    title: "Valider le refrain",
    description: "Écoute finale",
    assigned_profile_id: otherProfileId,
    assigned_display_name: "Maya",
    status: "todo",
    due_at: null,
    created_by_profile_id: currentProfileId,
    created_at: "2026-07-18T10:00:00.000Z",
    updated_at: "2026-07-18T10:00:00.000Z",
    completed_at: null,
  }],
  recent_activity: [],
};

const secondItem: MessagingProjectListItem = {
  ...item,
  id: secondProjectId,
  name: "Aurora réel",
  conversationId: "44444444-4444-4444-8444-444444444445",
  updatedAt: "2026-07-19T12:00:00.000Z",
};

const secondWorkspace: MessagingProjectWorkspace = {
  ...workspace,
  project_id: secondProjectId,
  name: secondItem.name,
  conversation_id: secondItem.conversationId,
  updated_at: secondItem.updatedAt,
};

const messages: MessagingMessageRow[] = [{
  id: "66666666-6666-4666-8666-666666666666",
  conversation_id: item.conversationId,
  sender_profile_id: otherProfileId,
  client_message_id: "77777777-7777-4777-8777-777777777777",
  sequence: 1,
  kind: "text",
  body: "Le refrain est prêt",
  payload: {},
  reply_to_message_id: null,
  edited_at: null,
  deleted_at: null,
  moderation_status: "visible",
  reactions: [],
  created_at: "2026-07-18T11:00:00.000Z",
  updated_at: "2026-07-18T11:00:00.000Z",
}];

function controller(overrides: Partial<ProjectsWorkspaceLiveController> = {}) {
  return {
    currentProfileId,
    inviteCandidates: [{ id: otherProfileId, displayName: "Maya", username: "maya", avatar: null, role: "Chanteuse" }],
    items: [item],
    invitations: [],
    selectedProjectId: projectId,
    selectedProject: workspace,
    messages,
    status: "ready",
    detailStatus: "ready",
    error: null,
    actionError: null,
    mutations: {},
    refresh: vi.fn().mockResolvedValue([]),
    selectProject: vi.fn().mockResolvedValue(workspace),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    inviteMember: vi.fn(),
    respondToInvitation: vi.fn(),
    cancelInvitation: vi.fn(),
    updateMember: vi.fn(),
    transferOwnership: vi.fn(),
    removeMember: vi.fn(),
    leaveProject: vi.fn(),
    upsertTask: vi.fn(),
    deleteTask: vi.fn(),
    setProjectStatus: vi.fn(),
    deleteProject: vi.fn(),
    sendText: vi.fn().mockResolvedValue({ ok: true }),
    clearActionError: vi.fn(),
    ...overrides,
  } as unknown as ProjectsWorkspaceLiveController;
}

afterEach(cleanup);

describe("ProjectsWorkspace live", () => {

  it("termine une tâche par sa case et attend l’état confirmé du serveur", async () => {
    const upsertTask = vi.fn().mockResolvedValue({});
    const live = controller({ upsertTask });
    const { rerender } = render(<ProjectsWorkspace liveController={live} />);
    fireEvent.click(screen.getByRole("button", { name: "Tâches" }));
    const checkbox = screen.getByRole("checkbox", { name: "Valider le refrain", checked: false });
    fireEvent.click(checkbox);
    await waitFor(() => expect(upsertTask).toHaveBeenCalledWith(expect.objectContaining({
      projectId, taskId: workspace.tasks[0].task_id, title: "Valider le refrain", status: "done",
    })));
    expect(checkbox).toHaveAttribute("aria-checked", "false");
    rerender(<ProjectsWorkspace liveController={controller({
      upsertTask,
      selectedProject: { ...workspace, tasks: [{ ...workspace.tasks[0], status: "done" }] },
    })} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Valider le refrain", checked: true }));
    await waitFor(() => expect(upsertTask).toHaveBeenLastCalledWith(expect.objectContaining({ status: "todo" })));
  });

  it("garde la case de tâche désactivée pour un membre sans permission", () => {
    const denied = Object.fromEntries(Object.keys(permissions).map(key => [key, false])) as typeof permissions;
    const live = controller({
      items: [{ ...item, role: "contributor", permissions: denied }],
      selectedProject: { ...workspace, owner_profile_id: otherProfileId, membership: { authority_role: "contributor", artistic_role: "Chanteur", ...denied } },
    });
    render(<ProjectsWorkspace liveController={live} />);
    fireEvent.click(screen.getByRole("button", { name: "Tâches" }));
    const checkbox = screen.getByRole("checkbox", { name: "Valider le refrain" });
    expect(checkbox).toBeDisabled();
    fireEvent.click(checkbox);
    expect(live.upsertTask).not.toHaveBeenCalled();
  });

  it("présente les infos utiles et garde la gestion derrière une confirmation", async () => {
    const setProjectStatus = vi.fn().mockResolvedValue({});
    const live = controller({ setProjectStatus });
    render(<ProjectsWorkspace liveController={live} />);
    fireEvent.click(screen.getByRole("button", { name: "Infos" }));
    const overview = screen.getByRole("region", { name: "Informations du projet" });
    expect(within(overview).getByText("92 BPM")).toBeInTheDocument();
    expect(within(overview).queryByText("Avancement")).not.toBeInTheDocument();
    expect(within(overview).getByText("Détails de production").closest("details")).not.toHaveAttribute("open");
    expect(within(overview).queryByRole("button", { name: /Supprimer le projet/ })).not.toBeInTheDocument();
    fireEvent.click(within(overview).getByRole("button", { name: "Gérer le projet" }));
    fireEvent.click(screen.getByRole("button", { name: /Terminer le projet/ }));
    expect(screen.queryByRole("dialog", { name: "Gestion du projet" })).not.toBeInTheDocument();
    expect(setProjectStatus).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Terminer", exact: true }));
    await waitFor(() => expect(setProjectStatus).toHaveBeenCalledWith(projectId, "completed", workspace.updated_at));
  });

  it("conserve les accès membres sans afficher les commandes réservées au propriétaire", () => {
    const denied = Object.fromEntries(Object.keys(permissions).map(key => [key, false])) as typeof permissions;
    const live = controller({
      items: [{ ...item, role: "contributor", permissions: denied }],
      selectedProject: { ...workspace, owner_profile_id: otherProfileId, membership: { authority_role: "contributor", artistic_role: "Chanteur", ...denied } },
    });
    render(<ProjectsWorkspace liveController={live} />);
    fireEvent.click(screen.getByRole("button", { name: "Infos" }));
    const overview = screen.getByRole("region", { name: "Informations du projet" });
    expect(within(overview).queryByRole("button", { name: "Modifier", exact: true })).not.toBeInTheDocument();
    expect(within(overview).queryByRole("button", { name: "Inviter", exact: true })).not.toBeInTheDocument();
    expect(within(overview).queryByRole("button", { name: /Options de/ })).not.toBeInTheDocument();
    fireEvent.click(within(overview).getByRole("button", { name: "Gérer le projet" }));
    const menu = screen.getByRole("dialog", { name: "Gestion du projet" });
    expect(within(menu).getByRole("button", { name: /Quitter le projet/ })).toBeInTheDocument();
    expect(within(menu).queryByRole("button", { name: /Terminer|Archiver|Supprimer/ })).not.toBeInTheDocument();
  });

  it("ne remplace pas les informations musicales absentes par des valeurs inventées", () => {
    const live = controller({
      items: [{ ...item, genre: null, bpm: null, musicalKey: null, deliveryAt: null }],
      selectedProject: { ...workspace, genre: null, bpm: null, musical_key: null, delivery_at: null, milestone: null },
    });
    render(<ProjectsWorkspace liveController={live} />);
    fireEvent.click(screen.getByRole("button", { name: "Infos" }));
    const overview = screen.getByRole("region", { name: "Informations du projet" });
    expect(within(overview).getByText("Non fixée")).toBeInTheDocument();
    expect(within(overview).queryByText("Tempo")).not.toBeInTheDocument();
    expect(within(overview).queryByText("Tonalité")).not.toBeInTheDocument();
    expect(within(overview).queryByText("À définir")).not.toBeInTheDocument();
  });

  it("mappe le projet Supabase sans inventer de stems, mixes ou feedbacks", () => {
    const mapped = mapMessagingProjectToWorkspaceItem(item, currentProfileId, workspace, messages);

    expect(mapped.name).toBe("Nocturne réel");
    expect(mapped.creatorId).toBe(currentProfileId);
    expect(mapped.memberDetails?.map((member) => member.name)).toEqual(["Fetah", "Maya"]);
    expect(mapped.tasks?.[0]).toMatchObject({ title: "Valider le refrain", status: "todo", assignment: "Maya" });
    expect(mapped.messages?.[0]).toMatchObject({ sender: "Maya", body: "Le refrain est prêt", mine: false });
    expect(mapped.stemCount).toBe(0);
    expect(mapped.mixes).toEqual([]);
    expect(mapped.feedbacks).toEqual([]);
  });

  it("envoie le texte par le contrôleur live et conserve les capacités non câblées honnêtes", async () => {
    const live = controller();
    render(<ProjectsWorkspace liveController={live} />);

    const input = screen.getByLabelText("Message du projet");
    fireEvent.input(input, { target: { textContent: "On valide ce soir" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => expect(live.sendText).toHaveBeenCalledWith("On valide ce soir"));
    expect(screen.queryByText("On valide ce soir")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Track Packs/ }));
    expect(screen.getByText("Stems bientôt disponibles")).toBeInTheDocument();
    expect(screen.getByText(/Aucune fausse sauvegarde/)).toBeInTheDocument();
  });

  it("ouvre un projet demandé avec selectProject sans modifier les snapshots mock", async () => {
    const live = controller({ selectedProjectId: null, selectedProject: null, messages: [] });
    render(<ProjectsWorkspace liveController={live} openProjectRequest={{ token: 9, projectId }} />);

    await waitFor(() => expect(live.selectProject).toHaveBeenCalledWith(projectId));
  });

  it("conserve Track Packs quand la liste sélectionne un autre projet", () => {
    const firstController = controller({ items: [item, secondItem] });
    const { rerender } = render(<ProjectsWorkspace liveController={firstController} />);

    fireEvent.click(screen.getByRole("button", { name: /Track Packs/ }));
    expect(screen.getByRole("button", { name: /Track Packs/ })).toHaveAttribute("aria-current", "page");

    const nextController = controller({
      items: [item, secondItem],
      selectedProjectId: secondProjectId,
      selectedProject: secondWorkspace,
      messages: [],
    });
    rerender(<ProjectsWorkspace liveController={nextController} />);

    expect(screen.getByRole("region", { name: "Projet Aurora réel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Track Packs/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Stems bientôt disponibles")).toBeInTheDocument();
  });

  it("reprend le wizard sans recréer le projet ni réinviter le membre déjà confirmé", async () => {
    const createProject = vi.fn().mockResolvedValue({
      ok: true,
      idempotent: false,
      project_id: projectId,
      conversation_id: item.conversationId,
    });
    const inviteMember = vi.fn()
      .mockResolvedValueOnce({ ok: true, idempotent: false, invitation_id: "invite-a", status: "pending" })
      .mockRejectedValueOnce(new Error("Invitation temporairement indisponible"))
      .mockResolvedValueOnce({ ok: true, idempotent: true, invitation_id: "invite-b", status: "pending" });
    const live = controller({
      items: [],
      selectedProjectId: null,
      selectedProject: null,
      messages: [],
      inviteCandidates: [
        { id: otherProfileId, displayName: "Maya", username: "maya", avatar: null, role: "Chanteuse" },
        { id: "88888888-8888-4888-8888-888888888888", displayName: "Nadir", username: "nadir", avatar: null, role: "Pianiste" },
      ],
      createProject,
      inviteMember,
    });
    render(<ProjectsWorkspace liveController={live} />);

    fireEvent.click(screen.getByRole("button", { name: "Nouveau projet" }));
    fireEvent.change(screen.getByPlaceholderText("Nom du projet"), { target: { value: "Aurora" } });
    fireEvent.click(screen.getByRole("button", { name: /Suivant/ }));
    fireEvent.click(screen.getByRole("button", { name: /Maya/, pressed: false }));
    fireEvent.click(screen.getByRole("button", { name: /Nadir/, pressed: false }));
    fireEvent.click(screen.getByRole("button", { name: /Suivant/ }));
    fireEvent.click(screen.getByRole("button", { name: /Suivant/ }));
    fireEvent.click(screen.getByRole("button", { name: "Créer le projet" }));

    await screen.findByText("Invitation temporairement indisponible");
    const failedInput = inviteMember.mock.calls[1][0];
    fireEvent.click(screen.getByRole("button", { name: "Créer le projet" }));

    await waitFor(() => expect(live.selectProject).toHaveBeenCalledWith(projectId));
    expect(createProject).toHaveBeenCalledTimes(1);
    expect(inviteMember).toHaveBeenCalledTimes(3);
    expect(inviteMember.mock.calls[2][0]).toEqual(failedInput);
    expect(inviteMember.mock.calls.filter(([input]) => input.profileId === otherProfileId)).toHaveLength(1);
  });
});


it("affiche directement la console Track Pack dans le projet sans ouvrir de modale", async () => {
  const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  const load = vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  const view = render(<ProjectsWorkspace openProjectRequest={{ token: 1, projectId: "project_1" }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Track Packs" }));
  expect(screen.getByRole("region", { name: /Track Pack –/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Lire toutes les pistes ensemble" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Pistes du Track Pack" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Fermer le Track Pack" })).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog", { name: /Track Pack/ })).not.toBeInTheDocument();
  expect(screen.getByText("Gérer les pistes")).toBeInTheDocument();
  view.unmount();
  pause.mockRestore(); load.mockRestore();
});
