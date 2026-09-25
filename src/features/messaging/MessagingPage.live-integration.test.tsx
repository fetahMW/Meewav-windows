import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";

type RuntimeMode = "supabase" | "demo";

type MessagingPageHarness = {
  runtime: RuntimeMode;
  user: { id: string } | null;
  live: Record<string, unknown>;
  collaborations: Record<string, unknown>;
  groups: Record<string, unknown>;
  projects: Record<string, unknown>;
  attachments: Record<string, unknown>;
  messageWorkspaceProps: Record<string, unknown> | null;
  collabsWorkspaceProps: Record<string, unknown> | null;
  groupsWorkspaceProps: Record<string, unknown> | null;
  projectsWorkspaceProps: Record<string, unknown> | null;
  useMessagingLive: (...args: unknown[]) => unknown;
  useMessagingCollaborationsLive: (...args: unknown[]) => unknown;
  useMessagingGroupsLive: (...args: unknown[]) => unknown;
  useMessagingProjectsLive: (...args: unknown[]) => unknown;
  useMessagingAttachmentsLive: (...args: unknown[]) => unknown;
  useMessagingRealtime: (...args: unknown[]) => unknown;
  realtimeOnChange: ((change: Record<string, unknown>) => void) | null;
  createSignedAttachmentUrl: (...args: unknown[]) => unknown;
  getLocalCollaborationRequests: Mock<() => unknown[]>;
};

const harness = vi.hoisted(() => ({
  runtime: "supabase",
  user: null,
  live: {},
  collaborations: {},
  groups: {},
  projects: {},
  attachments: {},
  messageWorkspaceProps: null,
  collabsWorkspaceProps: null,
  groupsWorkspaceProps: null,
  projectsWorkspaceProps: null,
  useMessagingLive: vi.fn(),
  useMessagingCollaborationsLive: vi.fn(),
  useMessagingGroupsLive: vi.fn(),
  useMessagingProjectsLive: vi.fn(),
  useMessagingAttachmentsLive: vi.fn(),
  useMessagingRealtime: vi.fn(),
  realtimeOnChange: null,
  createSignedAttachmentUrl: vi.fn(async () => ({ url: "https://signed.example.test/file", expiresAt: null })),
  getLocalCollaborationRequests: vi.fn(() => []),
}) as MessagingPageHarness);

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ user: harness.user }),
}));

vi.mock("./messaging.flags", () => ({
  resolveMessagingRuntimeMode: () => harness.runtime,
}));

vi.mock("./useMessagingLive", () => ({
  useMessagingLive: (options: unknown) => {
    harness.useMessagingLive(options);
    return harness.live;
  },
}));

vi.mock("./useMessagingCollaborationsLive", () => ({
  useMessagingCollaborationsLive: (options: unknown) => {
    harness.useMessagingCollaborationsLive(options);
    return harness.collaborations;
  },
}));

vi.mock("./useMessagingGroupsLive", () => ({
  useMessagingGroupsLive: (options: unknown) => {
    harness.useMessagingGroupsLive(options);
    return harness.groups;
  },
}));

vi.mock("./useMessagingProjectsLive", () => ({
  useMessagingProjectsLive: (options: unknown) => {
    harness.useMessagingProjectsLive(options);
    return harness.projects;
  },
}));

vi.mock("./useMessagingAttachmentsLive", () => ({
  useMessagingAttachmentsLive: (options: unknown) => {
    harness.useMessagingAttachmentsLive(options);
    return harness.attachments;
  },
}));

vi.mock("./useMessagingRealtime", () => ({
  useMessagingRealtime: (options: { onChange: (change: Record<string, unknown>) => void }) => {
    harness.useMessagingRealtime(options);
    harness.realtimeOnChange = options.onChange;
  },
}));

vi.mock("./messaging.attachments.service", () => ({
  messagingAttachmentsRepository: {
    createSignedAttachmentUrl: (...args: unknown[]) => harness.createSignedAttachmentUrl(...args),
  },
}));

vi.mock("./MessageWorkspace", () => ({
  default: (props: Record<string, unknown>) => {
    harness.messageWorkspaceProps = props;
    return props.rightPane ?? null;
  },
}));

vi.mock("./CollabsWorkspace", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./CollabsWorkspace")>()),
  default: (props: Record<string, unknown>) => {
    harness.collabsWorkspaceProps = props;
    return null;
  },
  getCollabAvatar: (collab: { avatar?: string }) => collab.avatar ?? "/avatars/utilisateur.png",
}));

vi.mock("./ProjectsWorkspace", () => ({
  default: (props: Record<string, unknown>) => {
    harness.projectsWorkspaceProps = props;
    return null;
  },
  getInitialProjectItemsSnapshot: () => [],
  mapMessagingProjectToWorkspaceItem: (project: Record<string, unknown>) => ({
    id: project.id,
    name: project.name ?? "Projet live",
    description: project.description ?? "Projet Supabase",
    cover: project.cover ?? "/avatars/utilisateur.png",
    members: project.memberCount ?? 1,
    status: "inProgress",
    unreadMessages: 0,
    newTasks: 0,
    newStems: 0,
  }),
  linkProjectToArtistGroup: vi.fn(),
}));

vi.mock("./ArtistGroupsWorkspace", () => ({
  default: (props: Record<string, unknown>) => {
    harness.groupsWorkspaceProps = props;
    return null;
  },
  getInitialArtistGroupsSnapshot: () => [],
  linkProjectToArtistGroup: vi.fn(),
}));

vi.mock("../globe/components/MeewavPrimaryNav", () => ({
  default: () => null,
}));

vi.mock("./collaborationRequestBridge", () => ({
  getGlobeCollaborationRequests: () => harness.getLocalCollaborationRequests(),
  subscribeToGlobeCollaborationRequests: () => () => undefined,
}));

import MessagingPage from "./MessagingPage";

const CURRENT_PROFILE_ID = "51000000-0000-4000-8000-000000000001";
const TARGET_PROFILE_ID = "51000000-0000-4000-8000-000000000002";
const CONVERSATION_ID = "52000000-0000-4000-8000-000000000001";
const GROUP_ID = "71000000-0000-4000-8000-000000000001";
const GROUP_CONVERSATION_ID = "72000000-0000-4000-8000-000000000001";
const REQUEST_ID = "55000000-0000-4000-8000-000000000001";
const MARKET_LISTING_ID = "73000000-0000-4000-8000-000000000001";

function liveConversation(id = CONVERSATION_ID) {
  return {
    id,
    name: "Live Artist",
    handle: "@live_artist",
    role: "Artiste",
    avatar: "/avatars/utilisateur.png",
    status: "Conversation directe",
    online: true,
    unread: 2,
    preview: "Conversation Supabase",
    time: "Maintenant",
    messages: [],
  };
}

function liveCollaboration(id = REQUEST_ID) {
  return {
    id,
    userId: TARGET_PROFILE_ID,
    name: "Live Artist",
    role: "Artiste",
    avatar: "/avatars/utilisateur.png",
    verified: true,
    message: "On collabore ?",
    meta: "À l'instant",
    rank: 4,
    gradeLevel: 4,
    status: "pending",
    isReceived: true,
    requestStatus: "pending",
    attachments: [],
    origin: "globe",
  };
}

function createLiveController() {
  const conversation = liveConversation();
  return {
    conversations: [conversation],
    selectedConversationId: null as string | null,
    selectedConversation: null as (ReturnType<typeof liveConversation> & {
      conversationKind: "direct" | "group";
      server: { counterpartProfileId: string | null; reactionRows: unknown[] };
    }) | null,
    selectedMessages: [] as Array<Record<string, unknown>>,
    inboxStatus: "ready",
    messagesStatus: "idle",
    inboxError: null,
    messagesError: null,
    actionError: null,
    contacts: [],
    contactsStatus: "idle",
    contactsError: null,
    clearActionError: vi.fn(),
    refreshInbox: vi.fn(async () => [conversation]),
    openConversation: vi.fn(async () => []),
    refreshSelectedConversation: vi.fn(async () => []),
    sendText: vi.fn(async () => null),
    retryMessage: vi.fn(async () => null),
    setMessageReaction: vi.fn(async () => true),
    updateConversationPreferences: vi.fn(async () => true),
    setConversationHidden: vi.fn(async () => true),
    searchContacts: vi.fn(async () => []),
    createDirectConversation: vi.fn(async () => CONVERSATION_ID),
    createCollaborationConversation: vi.fn(async () => CONVERSATION_ID),
    createGroupConversation: vi.fn(async () => CONVERSATION_ID),
    leaveGroupConversation: vi.fn(async () => true),
    conversationInvitations: [],
    invitationStatus: "ready",
    invitationError: null,
    invitationMutations: {},
    refreshConversationInvitations: vi.fn(async () => []),
    respondToConversationInvitation: vi.fn(async () => true),
    safetyMutations: {},
    setUserBlocked: vi.fn(async () => true),
    reportContent: vi.fn(async () => ({ reportId: "report-1" })),
  };
}

function createCollaborationsController() {
  return {
    items: [] as unknown[],
    status: "ready",
    error: null,
    actionError: null,
    markViewed: vi.fn(async () => null),
    acceptRequest: vi.fn(async () => ({
      request_id: REQUEST_ID,
      status: "accepted",
      conversation_id: CONVERSATION_ID,
    })),
    declineRequest: vi.fn(async () => null),
    cancelRequest: vi.fn(async () => null),
    isMutating: vi.fn(() => false),
    clearActionError: vi.fn(),
    refresh: vi.fn(async () => []),
  };
}

function liveGroupSummary() {
  const id = GROUP_ID;
  const conversationId = GROUP_CONVERSATION_ID;
  return {
    id,
    name: "Midnight Echo",
    description: "Collectif live",
    visibility: "private",
    lifecycle: "active",
    conversationId,
    memberCount: 2,
    memberLimit: 50,
    pendingInvitationCount: 0,
    authorityRole: "owner",
    artisticRole: "beatmaker",
    notificationsEnabled: true,
    rosterVisibility: "visible",
    personallyArchived: false,
    updatedAt: "2026-07-18T12:00:00Z",
    cursor: { updated_at: "2026-07-18T12:00:00Z", group_id: id },
    server: {},
  };
}

function createGroupsController() {
  return {
    groups: [liveGroupSummary()],
    invitations: [],
    selectedGroupId: null as string | null,
    selectedSummary: null as ReturnType<typeof liveGroupSummary> | null,
    selectedGroup: null,
    activity: [],
    status: "ready",
    detailStatus: "idle",
    error: null,
    actionError: null,
    refresh: vi.fn(async () => []),
    refreshSelected: vi.fn(async () => null),
    openGroup: vi.fn(async (groupId: string) => ({
      group_id: groupId,
      conversation_id: GROUP_CONVERSATION_ID,
    })),
    createGroup: vi.fn(async () => null),
    updateGroup: vi.fn(async () => null),
    inviteMember: vi.fn(async () => null),
    respondInvitation: vi.fn(async () => null),
    cancelInvitation: vi.fn(async () => null),
    setPreferences: vi.fn(async () => null),
    setAuthorityRole: vi.fn(async () => null),
    setArtisticRole: vi.fn(async () => null),
    removeMember: vi.fn(async () => null),
    leaveGroup: vi.fn(async () => null),
    setGroupArchived: vi.fn(async () => null),
    deleteGroup: vi.fn(async () => null),
    clearActionError: vi.fn(),
  };
}

function createProjectsController() {
  return {
    items: [],
    invitations: [],
    selectedProjectId: null,
    selectedProject: null,
    messages: [],
    status: "ready",
    detailStatus: "idle",
    error: null,
    actionError: null,
    mutations: {},
    refresh: vi.fn(async () => []),
    refreshSelected: vi.fn(async () => null),
    selectProject: vi.fn(async () => null),
    createProject: vi.fn(async () => null),
    updateProject: vi.fn(async () => null),
    inviteMember: vi.fn(async () => null),
    respondToInvitation: vi.fn(async () => null),
    cancelInvitation: vi.fn(async () => null),
    updateMember: vi.fn(async () => null),
    transferOwnership: vi.fn(async () => null),
    removeMember: vi.fn(async () => null),
    leaveProject: vi.fn(async () => null),
    upsertTask: vi.fn(async () => null),
    deleteTask: vi.fn(async () => null),
    setProjectStatus: vi.fn(async () => null),
    deleteProject: vi.fn(async () => null),
    sendText: vi.fn(async () => null),
    isMutating: vi.fn(() => false),
    clearActionError: vi.fn(),
  };
}

function createAttachmentsController() {
  return {
    items: [],
    enqueue: vi.fn(() => "queue-1"),
    retry: vi.fn(async () => true),
    discard: vi.fn(async () => true),
    sendReadyMessage: vi.fn(async (): Promise<unknown> => null),
    clearSent: vi.fn(),
    pendingCount: 0,
    readyCount: 0,
    hasErrors: false,
  };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function NavigationProbe() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate("/market")}>Quitter la messagerie</button>;
}

function renderPage(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <NavigationProbe />
      <Routes>
        <Route
          path="/messages"
          element={(
            <>
              <MessagingPage />
              <LocationProbe />
            </>
          )}
        />
        <Route path="/market" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  harness.runtime = "supabase";
  harness.user = { id: CURRENT_PROFILE_ID };
  harness.live = createLiveController();
  harness.collaborations = createCollaborationsController();
  harness.groups = createGroupsController();
  harness.projects = createProjectsController();
  harness.attachments = createAttachmentsController();
  harness.messageWorkspaceProps = null;
  harness.collabsWorkspaceProps = null;
  harness.groupsWorkspaceProps = null;
  harness.projectsWorkspaceProps = null;
  harness.realtimeOnChange = null;
  harness.getLocalCollaborationRequests.mockReturnValue([]);
});

afterEach(() => {
  cleanup();
});

describe("MessagingPage live integration", () => {
  it("branche la base authentifiée sur le contrôleur live sans exposer les mutations démo", () => {
    renderPage("/messages?space=messages");

    expect(harness.useMessagingLive).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
      currentProfileId: CURRENT_PROFILE_ID,
      pollIntervalMs: 120_000,
    }));
    expect(harness.useMessagingCollaborationsLive).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
      currentProfileId: CURRENT_PROFILE_ID,
      pollIntervalMs: 0,
    }));
    expect(harness.useMessagingGroupsLive).toHaveBeenCalledWith(expect.objectContaining({ pollIntervalMs: 0 }));
    expect(harness.useMessagingProjectsLive).toHaveBeenCalledWith(expect.objectContaining({ pollIntervalMs: 0 }));

    const props = harness.messageWorkspaceProps;
    expect(props?.liveController).toEqual(expect.objectContaining({
      conversations: (harness.live as { conversations: unknown }).conversations,
    }));
    expect(props?.onConversationsChange).toBeUndefined();
    expect(props?.railItems).toEqual([
      expect.objectContaining({ id: CONVERSATION_ID, name: "Live Artist" }),
    ]);
  });

  it("crée une conversation directe depuis un profileId réel avec une clé stable puis canonise l'URL", async () => {
    renderPage(`/messages?space=messages&intent=message&mode=real&profileId=${TARGET_PROFILE_ID}&source=globe`);

    const live = harness.live as {
      createDirectConversation: ReturnType<typeof vi.fn>;
    };
    await waitFor(() => {
      expect(live.createDirectConversation).toHaveBeenCalledWith(
        TARGET_PROFILE_ID,
        `direct-route:${TARGET_PROFILE_ID}`,
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(
        `/messages?space=messages&conversation=${CONVERSATION_ID}&mode=real&source=globe`,
      );
    });
  });

  it("ne ramène pas dans la conversation si l’utilisateur quitte la Messagerie pendant sa création", async () => {
    let resolveConversation!: (conversationId: string) => void;
    const live = createLiveController();
    live.createDirectConversation = vi.fn(() => new Promise<string>((resolve) => {
      resolveConversation = resolve;
    }));
    harness.live = live;

    renderPage(`/messages?space=messages&intent=message&mode=real&profileId=${TARGET_PROFILE_ID}&source=marketplace`);
    await waitFor(() => expect(live.createDirectConversation).toHaveBeenCalledTimes(1));

    act(() => screen.getByRole("button", { name: "Quitter la messagerie" }).click());
    expect(screen.getByTestId("location")).toHaveTextContent("/market");

    await act(async () => resolveConversation(CONVERSATION_ID));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/market"));
  });

  it("conserve le retour exact vers l’annonce Market après la canonisation live", async () => {
    renderPage(
      `/messages?space=messages&intent=message&mode=real&profileId=${TARGET_PROFILE_ID}`
      + `&source=marketplace&listing=${MARKET_LISTING_ID}&listingTitle=Moog+Subsequent`
      + `&returnTo=${encodeURIComponent(`/market?listing=${MARKET_LISTING_ID}`)}`,
    );

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(
        `/messages?space=messages&conversation=${CONVERSATION_ID}&mode=real&source=marketplace`
        + `&listing=${MARKET_LISTING_ID}&listingTitle=Moog+Subsequent`
        + `&returnTo=${encodeURIComponent(`/market?listing=${MARKET_LISTING_ID}`)}`,
      );
    });
    expect(harness.messageWorkspaceProps?.marketplaceContext).toEqual(expect.objectContaining({
      listingTitle: "Moog Subsequent",
      onBack: expect.any(Function),
    }));
  });

  it("ouvre une demande de collaboration ciblée par le deep-link", async () => {
    harness.collaborations = {
      ...createCollaborationsController(),
      items: [liveCollaboration()],
    };

    renderPage(`/messages?space=collabs&request=${REQUEST_ID}&mode=real&source=globe`);

    await waitFor(() => {
      expect(harness.collabsWorkspaceProps?.openCollabRequest).toEqual({
        token: expect.any(Number),
        id: REQUEST_ID,
      });
    });
    expect(harness.collabsWorkspaceProps?.liveController).toBeDefined();
  });

  it("identifie une demande locale Shorts dans le rail des collaborations", async () => {
    harness.runtime = "demo";
    harness.user = null;
    harness.getLocalCollaborationRequests.mockReturnValue([{
      id: "shorts-local-request",
      userId: "shorts-maya",
      name: "Maya Nova",
      role: "Beatmaker",
      avatar: "/images/shorts/maya.webp",
      verified: true,
      message: "On crée une session live ?",
      meta: "À l’instant",
      rank: 5,
      gradeLevel: 5,
      status: "sent",
      isReceived: false,
      requestStatus: "pending",
      sentState: "unread",
      attachments: [],
      origin: "globe",
      requestSource: "shorts",
    }]);

    renderPage("/messages?space=collabs&mode=demo&source=shorts");

    await waitFor(() => {
      expect(harness.messageWorkspaceProps?.railItems).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "shorts-local-request",
          name: "Maya Nova",
          status: "Demande envoyée depuis La Scène",
        }),
      ]));
    });
  });

  it("conserve le mode démo pour l'aperçu local et pour une cible Globe explicitement mockée", async () => {
    harness.runtime = "demo";
    const localPreview = renderPage("/messages?space=messages");

    expect(harness.useMessagingLive).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
    expect(
      (harness.messageWorkspaceProps as Record<string, unknown> | null)?.liveController,
    ).toBeNull();
    expect(harness.messageWorkspaceProps?.onConversationsChange).toEqual(expect.any(Function));

    localPreview.unmount();
    harness.runtime = "supabase";
    harness.messageWorkspaceProps = null;
    renderPage("/messages?space=messages&intent=message&mode=demo&mockArtistId=echo-flow&source=globe");

    await waitFor(() => {
      expect(harness.messageWorkspaceProps?.openRequest).toEqual(expect.objectContaining({
        id: "echo-flow",
        conversation: expect.objectContaining({ id: "echo-flow" }),
      }));
    });
    expect(harness.useMessagingLive).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
    expect(
      (harness.messageWorkspaceProps as Record<string, unknown> | null)?.liveController,
    ).toBeNull();
  });

  it("ouvre le chat du demandeur depuis le rail sans accepter sa collab ni exiger un contact existant", async () => {
    const live = createLiveController();
    live.contacts = [];
    Object.assign(live.conversations[0], { collaborationRequestId: REQUEST_ID });
    harness.live = live;
    const collaborations = createCollaborationsController();
    collaborations.items = [liveCollaboration()];
    harness.collaborations = collaborations;
    renderPage("/messages?space=collabs&mode=real");
    await waitFor(() => expect(harness.messageWorkspaceProps?.onRailItemSelect).toBeDefined());
    const props = harness.messageWorkspaceProps!;
    const item = (props.railItems as Array<{ id: string }>).find((entry) => entry.id === REQUEST_ID)!;
    await act(async () => { (props.onRailItemSelect as (item: unknown) => void)(item); });
    await waitFor(() => expect(live.createCollaborationConversation).toHaveBeenCalledWith(REQUEST_ID));
    expect(collaborations.acceptRequest).not.toHaveBeenCalled();
    expect(live.createDirectConversation).not.toHaveBeenCalled();
    expect(harness.messageWorkspaceProps?.activeSpace).toBe("collabs");
    expect(harness.messageWorkspaceProps?.showCollabConversation).toBe(true);
    expect(harness.messageWorkspaceProps?.selectedRailKey).toBe(`collabs:${REQUEST_ID}`);
    expect(harness.messageWorkspaceProps?.contentSpace).toBe("collabs");
    expect(live.openConversation).toHaveBeenCalledWith(CONVERSATION_ID);
    const pinned = render(<MemoryRouter>{harness.messageWorkspaceProps?.conversationHeader as ReactNode}</MemoryRouter>);
    expect(harness.collabsWorkspaceProps?.pinnedCollabId).toBe(REQUEST_ID);
    fireEvent.click(screen.getByRole("button", { name: "Toutes les demandes" }));
    expect(harness.messageWorkspaceProps?.activeSpace).toBe("collabs");
    expect(harness.messageWorkspaceProps?.contentSpace).toBe("collabs");
    expect(harness.messageWorkspaceProps?.showCollabConversation).toBe(false);
    expect(harness.messageWorkspaceProps?.conversationHeader).toBeNull();
    expect(harness.messageWorkspaceProps?.rightPane).toBeTruthy();
    pinned.unmount();
    await act(async () => { (harness.messageWorkspaceProps!.onSpaceChange as (space: string) => void)("messages"); });
    expect(harness.messageWorkspaceProps?.activeSpace).toBe("messages");
    expect(harness.messageWorkspaceProps?.railItems).toEqual([]);
    expect((harness.messageWorkspaceProps?.liveController as { conversations: unknown[] }).conversations).toEqual([]);
  });

  it("rafraîchit l'inbox puis ouvre la conversation créée quand une collaboration est acceptée", async () => {
    const order: string[] = [];
    const live = createLiveController();
    live.refreshInbox = vi.fn(async () => {
      order.push("refresh");
      return [];
    });
    live.openConversation = vi.fn(async () => {
      order.push("open");
      return [];
    });
    harness.live = live;

    const collaborations = createCollaborationsController();
    collaborations.items = [liveCollaboration()];
    collaborations.acceptRequest = vi.fn(async () => {
      order.push("accept");
      return {
        request_id: REQUEST_ID,
        status: "accepted",
        conversation_id: CONVERSATION_ID,
      };
    });
    harness.collaborations = collaborations;

    renderPage(`/messages?space=collabs&request=${REQUEST_ID}&mode=real`);

    await waitFor(() => expect(harness.collabsWorkspaceProps?.liveController).toBeDefined());
    const controller = harness.collabsWorkspaceProps?.liveController as {
      acceptRequest: (requestId: string) => Promise<unknown>;
    };
    await act(async () => {
      await controller.acceptRequest(REQUEST_ID);
    });

    expect(collaborations.acceptRequest).toHaveBeenCalledWith(REQUEST_ID);
    expect(live.refreshInbox).toHaveBeenCalledWith({ silent: true });
    expect(live.openConversation).toHaveBeenCalledWith(CONVERSATION_ID);
    expect(order.slice(0, 3)).toEqual(["accept", "refresh", "open"]);
    expect(screen.getByTestId("location")).toHaveTextContent(
      `/messages?space=messages&conversation=${CONVERSATION_ID}&mode=real&source=messaging`,
    );
  });

  it("branche les groupes Supabase dans le workspace sans mutation de la collection démo", async () => {
    const live = createLiveController();
    live.selectedConversationId = GROUP_CONVERSATION_ID;
    live.messagesStatus = "ready";
    live.selectedMessages = [{ id: "group-message", body: "Message groupe Supabase" }];
    harness.live = live;
    const groups = createGroupsController();
    groups.selectedGroupId = GROUP_ID;
    groups.selectedSummary = liveGroupSummary();
    harness.groups = groups;
    harness.attachments = {
      ...createAttachmentsController(),
      items: [
        { id: "group-upload", conversationId: GROUP_CONVERSATION_ID },
        { id: "other-upload", conversationId: CONVERSATION_ID },
      ],
    };
    renderPage("/messages?space=groups&mode=real");

    expect(harness.useMessagingGroupsLive).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
      currentProfileId: CURRENT_PROFILE_ID,
    }));
    await waitFor(() => expect(harness.groupsWorkspaceProps).not.toBeNull());
    expect(harness.groupsWorkspaceProps?.liveController).toEqual(expect.objectContaining({
      groups: [expect.objectContaining({
        id: "71000000-0000-4000-8000-000000000001",
        name: "Midnight Echo",
        server: expect.objectContaining({
          conversationId: "72000000-0000-4000-8000-000000000001",
        }),
      })],
      chat: expect.objectContaining({
        selectedConversationId: GROUP_CONVERSATION_ID,
        messages: [{ id: "group-message", body: "Message groupe Supabase" }],
        attachments: expect.objectContaining({
          queue: [{ id: "group-upload", conversationId: GROUP_CONVERSATION_ID }],
        }),
      }),
    }));
    expect(harness.groupsWorkspaceProps?.onItemsChange).toBeUndefined();
    expect(harness.groupsWorkspaceProps?.onOpenProject).toBeUndefined();
    expect(harness.groupsWorkspaceProps?.onCreateProject).toBeUndefined();
    expect(harness.groupsWorkspaceProps?.createGroupSignal).toBe(0);
    act(() => {
      (harness.messageWorkspaceProps?.onCreateGroup as (() => void) | undefined)?.();
    });
    await waitFor(() => expect(harness.groupsWorkspaceProps?.createGroupSignal).toBe(1));
  });

  it("ouvre une cible Shorts inconnue avec son identité transmise et sans contrôleur live", async () => {
    const params = new URLSearchParams({
      space: "messages",
      intent: "message",
      mode: "demo",
      source: "shorts",
      mockArtistId: "shorts-maya-nova",
      mockArtistName: "Maya Nova",
      mockArtistRole: "Beatmaker · Productrice",
      mockArtistAvatar: "/images/shorts/maya-nova.webp",
      mockArtistGradeLevel: "5",
    });
    renderPage(`/messages?${params.toString()}`);

    await waitFor(() => {
      expect(harness.messageWorkspaceProps?.openRequest).toEqual(expect.objectContaining({
        id: "globe-shorts-maya-nova",
        conversation: expect.objectContaining({
          name: "Maya Nova",
          handle: "Profil découvert sur La Scène",
          role: "Beatmaker · Productrice",
          avatar: "/images/shorts/maya-nova.webp",
          gradeLevel: 5,
          online: false,
        }),
      }));
    });
    expect(harness.useMessagingLive).toHaveBeenLastCalledWith(expect.objectContaining({
      enabled: false,
    }));
    expect(harness.messageWorkspaceProps?.liveController).toBeNull();
  });

  it("ouvre la conversation serveur d’un groupe et crée une discussion membre avec leurs vrais identifiants", async () => {
    renderPage("/messages?space=groups&mode=real");
    await waitFor(() => expect(harness.groupsWorkspaceProps).not.toBeNull());
    const live = harness.live as ReturnType<typeof createLiveController>;
    const props = harness.groupsWorkspaceProps as {
      liveController: { openGroup: (groupId: string) => Promise<unknown> };
      onOpenMemberChat: (member: { id: string; name: string; role: string; avatar: string }) => void;
    };
    const shellController = harness.messageWorkspaceProps?.liveController as {
      selectConversation: (conversationId: string) => Promise<unknown>;
    };

    await act(async () => {
      await shellController.selectConversation(CONVERSATION_ID);
    });
    expect(screen.getByTestId("location")).toHaveTextContent("/messages?space=groups&mode=real");
    live.openConversation.mockClear();

    await act(async () => {
      await props.liveController.openGroup(GROUP_ID);
    });
    expect((harness.groups as ReturnType<typeof createGroupsController>).openGroup).toHaveBeenCalledWith(GROUP_ID);
    expect(live.openConversation).toHaveBeenCalledWith(GROUP_CONVERSATION_ID);
    expect(screen.getByTestId("location")).toHaveTextContent("/messages?space=groups&mode=real");

    act(() => props.onOpenMemberChat({
      id: TARGET_PROFILE_ID,
      name: "Live Artist",
      role: "Artiste",
      avatar: "/avatars/utilisateur.png",
    }));
    await waitFor(() => expect(live.createDirectConversation).toHaveBeenCalledWith(
      TARGET_PROFILE_ID,
      `group-member:${TARGET_PROFILE_ID}`,
    ));
  });

  it("branche Projets sur le profil courant et la recherche de contacts Supabase", async () => {
    renderPage("/messages?space=projects&mode=real");

    expect(harness.useMessagingProjectsLive).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
      currentProfileId: CURRENT_PROFILE_ID,
      pollIntervalMs: 180_000,
    }));
    await waitFor(() => expect(harness.projectsWorkspaceProps).not.toBeNull());
    const controller = harness.projectsWorkspaceProps?.liveController as Record<string, unknown>;
    expect(controller).toEqual(expect.objectContaining({
      currentProfileId: CURRENT_PROFILE_ID,
      searchInviteCandidates: (harness.live as { searchContacts: unknown }).searchContacts,
    }));
    expect(harness.projectsWorkspaceProps?.onItemsChange).toBeUndefined();
  });

  it("branche les pièces jointes privées puis rafraîchit la conversation après envoi", async () => {
    const attachments = createAttachmentsController();
    attachments.sendReadyMessage = vi.fn(async () => ({
      messageId: "53000000-0000-4000-8000-000000000001",
    }));
    harness.attachments = attachments;
    renderPage("/messages?space=messages&mode=real");

    expect(harness.useMessagingAttachmentsLive).toHaveBeenCalledWith({
      enabled: true,
      profileId: CURRENT_PROFILE_ID,
    });
    const workspace = harness.messageWorkspaceProps?.liveController as {
      attachments: {
        enqueue: (...args: unknown[]) => unknown;
        resolveUrl: (attachment: unknown) => Promise<unknown>;
        sendReadyMessage: (input: Record<string, unknown>) => Promise<unknown>;
      };
    };
    expect(workspace.attachments.enqueue).toBe(attachments.enqueue);
    await act(async () => {
      await workspace.attachments.resolveUrl({ mediaFileId: "media-1" });
      await workspace.attachments.sendReadyMessage({
        conversationId: CONVERSATION_ID,
        attachmentItemIds: ["queue-1"],
      });
    });
    expect(harness.createSignedAttachmentUrl).toHaveBeenCalledWith({ mediaFileId: "media-1" });
    expect((harness.live as ReturnType<typeof createLiveController>).refreshInbox)
      .toHaveBeenCalledWith({ silent: true });
    expect((harness.live as ReturnType<typeof createLiveController>).openConversation)
      .toHaveBeenCalledWith(CONVERSATION_ID);
  });

  it("publie une pièce jointe dans le chat Groupe sans quitter l’espace Groupes", async () => {
    const attachments = createAttachmentsController();
    attachments.sendReadyMessage = vi.fn(async () => ({
      messageId: "53000000-0000-4000-8000-000000000002",
    }));
    harness.attachments = attachments;
    const live = createLiveController();
    live.selectedConversationId = GROUP_CONVERSATION_ID;
    live.messagesStatus = "ready";
    harness.live = live;
    const groups = createGroupsController();
    groups.selectedGroupId = GROUP_ID;
    groups.selectedSummary = liveGroupSummary();
    harness.groups = groups;
    renderPage("/messages?space=groups&mode=real");

    const groupController = harness.groupsWorkspaceProps?.liveController as {
      chat: {
        attachments: {
          sendReadyMessage: (input: Record<string, unknown>) => Promise<unknown>;
        };
      };
    };
    await act(async () => {
      await groupController.chat.attachments.sendReadyMessage({
        conversationId: GROUP_CONVERSATION_ID,
        clientMessageId: "77000000-0000-4000-8000-000000000003",
        kind: "audio",
        body: "stems.wav",
        attachmentItemIds: ["77000000-0000-4000-8000-000000000003"],
      });
    });

    expect(attachments.sendReadyMessage).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: GROUP_CONVERSATION_ID,
    }));
    expect(live.refreshInbox).toHaveBeenCalledWith({ silent: true });
    expect(live.openConversation).toHaveBeenCalledWith(GROUP_CONVERSATION_ID);
    expect(screen.getByTestId("location")).toHaveTextContent("/messages?space=groups&mode=real");
  });

  it("expose le blocage et le signalement uniquement pour le correspondant direct réel", async () => {
    const live = createLiveController();
    live.selectedConversationId = CONVERSATION_ID;
    live.selectedConversation = {
      ...liveConversation(),
      conversationKind: "direct",
      server: {
        counterpartProfileId: TARGET_PROFILE_ID,
        reactionRows: [],
      },
    };
    harness.live = live;
    renderPage("/messages?space=messages&mode=real");

    const controller = harness.messageWorkspaceProps?.liveController as {
      canModerateCounterpart: boolean;
      blockCounterpart: () => Promise<unknown>;
      reportConversation: (category: string, comment: string) => Promise<boolean>;
    };
    expect(controller.canModerateCounterpart).toBe(true);
    await act(async () => {
      await controller.blockCounterpart();
      await controller.reportConversation("harassment", "Message agressif");
    });
    expect(live.setUserBlocked).toHaveBeenCalledWith(
      TARGET_PROFILE_ID,
      true,
      "conversation_safety",
    );
    expect(live.reportContent).toHaveBeenCalledWith({
      subjectType: "conversation",
      subjectId: CONVERSATION_ID,
      category: "harassment",
      comment: "Message agressif",
    });
  });

  it("conserve le signal contenu dans un burst Realtime sans réécrire le curseur de lecture", async () => {
    vi.useFakeTimers();
    try {
      const live = createLiveController();
      live.selectedConversationId = CONVERSATION_ID;
      harness.live = live;
      const projects = createProjectsController();
      harness.projects = projects;
      renderPage("/messages?space=messages&mode=real");
      live.refreshInbox.mockClear();

      act(() => {
        harness.realtimeOnChange?.({
          version: 1,
          domain: "conversation",
          entityId: CONVERSATION_ID,
          operation: "insert",
          sourceTable: "messaging_messages",
          occurredAt: "2026-07-18T12:00:00Z",
        });
        // Le trigger membre peut arriver après le message dans le même burst.
        // Il ne doit ni masquer le contenu, ni rouvrir la conversation (ce qui
        // réécrirait implicitement le curseur de lecture).
        harness.realtimeOnChange?.({
          version: 1,
          domain: "conversation",
          entityId: CONVERSATION_ID,
          operation: "update",
          sourceTable: "messaging_conversation_members",
          occurredAt: "2026-07-18T12:00:01Z",
        });
      });
      await act(async () => vi.advanceTimersByTimeAsync(130));
      expect(live.refreshInbox).toHaveBeenCalledTimes(1);
      expect(live.refreshInbox).toHaveBeenCalledWith({ silent: true });
      expect(live.refreshSelectedConversation).toHaveBeenCalledTimes(1);
      expect(live.openConversation).not.toHaveBeenCalled();

      live.refreshInbox.mockClear();
      live.refreshSelectedConversation.mockClear();
      act(() => harness.realtimeOnChange?.({
        version: 1,
        domain: "conversation",
        entityId: CONVERSATION_ID,
        operation: "update",
        sourceTable: "messaging_conversation_members",
        occurredAt: "2026-07-18T12:00:02Z",
      }));
      await act(async () => vi.advanceTimersByTimeAsync(130));
      expect(live.refreshInbox).toHaveBeenCalledWith({ silent: true });
      expect(live.refreshSelectedConversation).not.toHaveBeenCalled();
      expect(live.openConversation).not.toHaveBeenCalled();

      act(() => harness.realtimeOnChange?.({
        version: 1,
        domain: "project",
        entityId: "73000000-0000-4000-8000-000000000001",
        operation: "update",
        sourceTable: "creative_projects",
        occurredAt: "2026-07-18T12:00:03Z",
      }));
      await act(async () => vi.advanceTimersByTimeAsync(130));
      expect(projects.refresh).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("rafraîchit uniquement le chat Groupe sélectionné lors d’un message Realtime", async () => {
    vi.useFakeTimers();
    try {
      const live = createLiveController();
      live.selectedConversationId = GROUP_CONVERSATION_ID;
      live.messagesStatus = "ready";
      harness.live = live;
      const groups = createGroupsController();
      groups.selectedGroupId = GROUP_ID;
      groups.selectedSummary = liveGroupSummary();
      harness.groups = groups;
      renderPage("/messages?space=groups&mode=real");
      live.openConversation.mockClear();
      live.refreshSelectedConversation.mockClear();

      act(() => harness.realtimeOnChange?.({
        version: 1,
        domain: "conversation",
        entityId: GROUP_CONVERSATION_ID,
        operation: "insert",
        sourceTable: "messaging_messages",
        occurredAt: "2026-07-18T12:30:00Z",
      }));
      await act(async () => vi.advanceTimersByTimeAsync(130));

      expect(live.refreshSelectedConversation).toHaveBeenCalledTimes(1);
      expect(live.openConversation).not.toHaveBeenCalled();
      expect(live.refreshInbox).not.toHaveBeenCalled();
      expect(screen.getByTestId("location")).toHaveTextContent("/messages?space=groups&mode=real");
    } finally {
      vi.useRealTimers();
    }
  });
});
