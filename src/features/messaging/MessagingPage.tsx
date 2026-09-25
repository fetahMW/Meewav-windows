import { getDesktopApplicationMode } from "../../runtime/applicationMode";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import MeewavPrimaryNav from "../globe/components/MeewavPrimaryNav";
import {
  MON_GLOBE_HOST_POSITION_NAVIGATION_STATE,
  MON_GLOBE_ROUTE,
} from "../globe/monGlobeContract";
import { SCENE_NAME } from "../shorts/sceneContract";
import ArtistGroupsWorkspace, {
  getInitialArtistGroupsSnapshot,
  linkProjectToArtistGroup,
  type ArtistGroup,
  type ArtistGroupsWorkspaceLiveController,
} from "./ArtistGroupsWorkspace";
import CollabsWorkspace, {
  buildCollabConversation,
  getCollabAvatar,
  type CollabsWorkspaceLiveController,
} from "./CollabsWorkspace";
import MessageWorkspace, {
  type ConversationRequest,
  type MessagingWorkspaceAttachmentsController,
  type MessagingWorkspaceLiveController,
} from "./MessageWorkspace";
import ProjectsWorkspace, {
  getInitialProjectItemsSnapshot,
  mapMessagingProjectToWorkspaceItem,
  type ProjectWorkspaceItem,
  type ProjectsWorkspaceLiveController,
} from "./ProjectsWorkspace";
import {
  demoCollabs,
  demoConversations,
  type DemoCollab,
  type DemoConversation,
  type MessagingSidebarItem,
  type MessagingSpace,
  type MessagingTab,
} from "./messagingDemoData";
import { getGlobeCollaborationRequests, subscribeToGlobeCollaborationRequests } from "./collaborationRequestBridge";
import { resolveMessagingRuntimeMode } from "./messaging.flags";
import {
  buildMessagingRoute,
  getDemoConversationTarget,
  getDirectConversationTarget,
  parseMessagingRoute,
} from "./messaging.route";
import { useMessagingLive } from "./useMessagingLive";
import { useMessagingCollaborationsLive } from "./useMessagingCollaborationsLive";
import { useMessagingGroupsLive } from "./useMessagingGroupsLive";
import { useMessagingProjectsLive } from "./useMessagingProjectsLive";
import { useMessagingAttachmentsLive } from "./useMessagingAttachmentsLive";
import { messagingAttachmentsRepository } from "./messaging.attachments.service";
import {
  useMessagingRealtime,
  type MessagingRealtimeChange,
  type MessagingRealtimeDomain,
} from "./useMessagingRealtime";
import { mapMessagingArtistGroupToWorkspace } from "./messaging.groups.workspace-adapters";
import "./messaging-page.css";
import "./messaging-premium.css";

function requestFromConversation(conversation: DemoConversation, token: number): ConversationRequest {
  return {
    token,
    id: conversation.id,
    name: conversation.name,
    role: conversation.role,
    status: conversation.status,
    avatar: conversation.avatar,
    group: conversation.role.toLocaleLowerCase("fr-FR").includes("groupe"),
    conversation,
  };
}

function selectionRequestFromConversation(conversation: DemoConversation, token: number): ConversationRequest {
  return {
    token,
    id: conversation.id,
    name: conversation.name,
    role: conversation.role,
    status: conversation.status,
    avatar: conversation.avatar,
    group: conversation.role.toLocaleLowerCase("fr-FR").includes("groupe"),
  };
}

function conversationSidebarItem(conversation: DemoConversation): MessagingSidebarItem {
  return {
    key: `messages:${conversation.id}`,
    id: conversation.id,
    space: "messages",
    name: conversation.name,
    avatar: conversation.avatar,
    role: conversation.role,
    status: conversation.status,
    preview: conversation.preview,
    time: conversation.time,
    online: conversation.online,
    unread: conversation.unread,
    gradeLevel: conversation.gradeLevel,
  };
}

function collabSidebarItem(collab: DemoCollab): MessagingSidebarItem {
  const sourceLabel = collab.requestSource === "shorts" ? SCENE_NAME
    : collab.requestSource === "profile" ? "le Profil"
      : collab.requestSource === "marketplace" ? "le Market"
        : collab.requestSource === "tremplin" ? "le Tremplin"
          : collab.requestSource === "rooms" ? "les Rooms"
            : collab.requestSource === "messaging" ? "la Messagerie"
              : "le Globe";
  const status = collab.status === "accepted"
    ? "Collaboration acceptée"
    : collab.isReceived ? `Demande reçue depuis ${sourceLabel}` : `Demande envoyée depuis ${sourceLabel}`;
  return {
    key: `collabs:${collab.id}`,
    id: collab.id,
    space: "collabs",
    name: collab.name,
    avatar: getCollabAvatar(collab),
    role: collab.role,
    status,
    preview: collab.message,
    time: collab.meta,
    online: collab.status === "accepted",
    unread: collab.status === "pending" && collab.isReceived ? 1 : 0,
    gradeLevel: collab.gradeLevel ?? collab.rank,
  };
}

function projectSidebarItem(project: ProjectWorkspaceItem): MessagingSidebarItem {
  const statusLabels: Record<ProjectWorkspaceItem["status"], string> = {
    inProgress: "Projet en cours",
    completed: "Projet terminé",
    archived: "Projet archivé",
  };
  return {
    key: `projects:${project.id}`,
    id: project.id,
    space: "projects",
    name: project.name,
    avatar: project.cover,
    role: `${project.members} membre${project.members > 1 ? "s" : ""}`,
    status: statusLabels[project.status],
    preview: project.description,
    time: project.deadline ?? project.createdAt ?? "",
    unread: project.unreadMessages + project.newTasks + project.newStems,
  };
}

function groupSidebarItem(group: ArtistGroup): MessagingSidebarItem {
  return {
    key: `groups:${group.id}`,
    id: group.id,
    space: "groups",
    name: group.name,
    avatar: group.cover,
    role: group.style,
    status: group.statusInfo,
    preview: group.lastMessage,
    time: group.nextSessionTime ?? "",
    online: group.members.some((member) => member.online),
    unread: group.waitingCount ?? 0,
  };
}

export default function MessagingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const routeState = useMemo(() => parseMessagingRoute(location.search), [location.search]);
  const explicitDemoTarget = getDesktopApplicationMode() !== "live" && routeState.mode === "demo" && Boolean(routeState.mockArtistId);
  const messagingRuntime = explicitDemoTarget ? "demo" : resolveMessagingRuntimeMode();
  const liveEnabled = messagingRuntime === "supabase" && Boolean(user?.id);
  const liveMessaging = useMessagingLive({
    enabled: liveEnabled,
    currentProfileId: user?.id ?? null,
    pollIntervalMs: routeState.space === "messages" || routeState.space === "all" ? 120_000 : 0,
  });
  const liveCollaborations = useMessagingCollaborationsLive({
    enabled: liveEnabled,
    currentProfileId: user?.id ?? null,
    pollIntervalMs: routeState.space === "collabs" ? 120_000 : 0,
  });
  const liveGroups = useMessagingGroupsLive({
    enabled: liveEnabled,
    currentProfileId: user?.id ?? null,
    pollIntervalMs: routeState.space === "groups" ? 180_000 : 0,
  });
  const liveProjects = useMessagingProjectsLive({
    enabled: liveEnabled,
    currentProfileId: user?.id ?? null,
    pollIntervalMs: routeState.space === "projects" ? 180_000 : 0,
  });
  const liveAttachments = useMessagingAttachmentsLive({
    enabled: liveEnabled,
    profileId: user?.id ?? null,
  });
  const refreshMessagingInbox = liveMessaging.refreshInbox;
  const openLiveConversation = liveMessaging.openConversation;
  const createLiveDirectConversation = liveMessaging.createDirectConversation;
  const liveInboxStatus = liveMessaging.inboxStatus;
  const refreshLiveCollaborations = liveCollaborations.refresh;
  const refreshLiveGroups = liveGroups.refresh;
  const refreshLiveProjects = liveProjects.refresh;
  const realtimeTimersRef = useRef<Partial<Record<MessagingRealtimeDomain, ReturnType<typeof setTimeout>>>>({});
  const realtimeEntitiesRef = useRef<Record<MessagingRealtimeDomain, Set<string>>>({
    conversation: new Set(),
    collaboration: new Set(),
    project: new Set(),
    group: new Set(),
  });
  const realtimeConversationContentRef = useRef(new Set<string>());
  const previousLiveSpaceRef = useRef(routeState.space);
  const groupConversationRequestRef = useRef(0);

  const handleRealtimeChange = useCallback((change: MessagingRealtimeChange) => {
    realtimeEntitiesRef.current[change.domain].add(change.entityId);
    if (change.domain === "conversation" && change.sourceTable !== "messaging_conversation_members") {
      realtimeConversationContentRef.current.add(change.entityId);
    }
    if (realtimeTimersRef.current[change.domain]) return;

    realtimeTimersRef.current[change.domain] = setTimeout(() => {
      const entityIds = realtimeEntitiesRef.current[change.domain];
      realtimeEntitiesRef.current[change.domain] = new Set();
      delete realtimeTimersRef.current[change.domain];

      if (change.domain === "conversation") {
        const contentEntityIds = new Set(realtimeConversationContentRef.current);
        realtimeConversationContentRef.current.clear();
        if (routeState.space === "groups") {
          const selectedGroupConversationId = liveGroups.selectedGroup?.conversation_id
            ?? liveGroups.groups.find((group) => group.id === liveGroups.selectedGroupId)?.conversationId
            ?? null;
          if (
            selectedGroupConversationId
            && liveMessaging.selectedConversationId === selectedGroupConversationId
            && contentEntityIds.has(selectedGroupConversationId)
          ) {
            void liveMessaging.refreshSelectedConversation().catch(() => undefined);
          }
          return;
        }
        if (routeState.space !== "messages" && routeState.space !== "all") return;
        void liveMessaging.refreshInbox({ silent: true }).catch(() => undefined);
        const selectedId = liveMessaging.selectedConversationId;
        if (selectedId && contentEntityIds.has(selectedId)) {
          void liveMessaging.refreshSelectedConversation().catch(() => undefined);
        }
        return;
      }
      if (change.domain === "collaboration") {
        if (routeState.space !== "collabs") return;
        void liveCollaborations.refresh({ silent: true }).catch(() => undefined);
        return;
      }
      if (change.domain === "project") {
        if (routeState.space !== "projects") return;
        void liveProjects.refresh({ silent: true }).catch(() => undefined);
        if (liveProjects.selectedProjectId && entityIds.has(liveProjects.selectedProjectId)) {
          void liveProjects.refreshSelected().catch(() => undefined);
        }
        return;
      }

      if (routeState.space !== "groups") return;
      void liveGroups.refresh({ silent: true }).catch(() => undefined);
      if (liveGroups.selectedGroupId && entityIds.has(liveGroups.selectedGroupId)) {
        void liveGroups.refreshSelected().catch(() => undefined);
      }
    }, 120);
  }, [liveCollaborations, liveGroups, liveMessaging, liveProjects, routeState.space]);

  useMessagingRealtime({
    enabled: liveEnabled,
    profileId: user?.id ?? null,
    onChange: handleRealtimeChange,
  });

  useEffect(() => () => {
    Object.values(realtimeTimersRef.current).forEach((timer) => {
      if (timer) clearTimeout(timer);
    });
    realtimeTimersRef.current = {};
    Object.values(realtimeEntitiesRef.current).forEach((entities) => entities.clear());
    realtimeConversationContentRef.current.clear();
  }, []);

  useEffect(() => {
    if (!liveEnabled) {
      previousLiveSpaceRef.current = routeState.space;
      return;
    }
    if (previousLiveSpaceRef.current === routeState.space) return;
    previousLiveSpaceRef.current = routeState.space;
    if (routeState.space === "messages" || routeState.space === "all") {
      void refreshMessagingInbox({ silent: true }).catch(() => undefined);
      return;
    }
    if (routeState.space === "collabs") {
      void refreshLiveCollaborations({ silent: true }).catch(() => undefined);
      return;
    }
    if (routeState.space === "projects") {
      void refreshLiveProjects({ silent: true }).catch(() => undefined);
      return;
    }
    if (routeState.space === "groups") {
      void refreshLiveGroups({ silent: true }).catch(() => undefined);
    }
  }, [
    liveEnabled,
    refreshLiveCollaborations,
    refreshLiveGroups,
    refreshLiveProjects,
    refreshMessagingInbox,
    routeState.space,
  ]);
  const requestTokenRef = useRef(0);
  const activeRouteSignatureRef = useRef<string | null>(null);
  const processedLiveRouteRef = useRef<string | null>(null);
  const processedDemoRouteRef = useRef<string | null>(null);
  const processedCollaborationRouteRef = useRef<string | null>(null);
  const [activeSpace, setActiveSpace] = useState<MessagingSpace>("messages");
  const [contentSpace, setContentSpace] = useState<MessagingTab>("messages");
  const [collabChatId, setCollabChatId] = useState<string | null>(null);
  const [collabConversationIds, setCollabConversationIds] = useState<Record<string, string>>({});
  const [selectedRailKey, setSelectedRailKey] = useState<string | null>(null);
  const [newConversationSignal] = useState(0);
  const [createGroupSignal, setCreateGroupSignal] = useState(0);
  const [openRequest, setOpenRequest] = useState<ConversationRequest | null>(null);
  const [openCollabRequest, setOpenCollabRequest] = useState<{ token: number; id: string } | null>(null);
  const [openProjectRequest, setOpenProjectRequest] = useState<{ token: number; projectId: string } | null>(null);
  const [createProjectRequest, setCreateProjectRequest] = useState<{ token: number; groupId: string; name: string } | null>(null);
  const [openGroupRequest, setOpenGroupRequest] = useState<{ token: number; groupId: string } | null>(null);
  const [globeCollabs, setGlobeCollabs] = useState(getGlobeCollaborationRequests);
  const [messageItems, setMessageItems] = useState<DemoConversation[]>(() => demoConversations.map((conversation) => ({
    ...conversation,
    messages: [...conversation.messages],
  })));

  useEffect(() => {
    if (liveEnabled) return undefined;
    return subscribeToGlobeCollaborationRequests(() => {
    setGlobeCollabs(getGlobeCollaborationRequests());
    });
  }, [liveEnabled]);

  const allCollabs = useMemo(
    () => liveEnabled
      ? liveCollaborations.items
      : [...globeCollabs, ...demoCollabs.filter((collab) => !globeCollabs.some((item) => item.id === collab.id))],
    [globeCollabs, liveCollaborations.items, liveEnabled],
  );
  const [collabItems, setCollabItems] = useState<DemoCollab[]>(() => allCollabs);
  const [projectItems, setProjectItems] = useState<ProjectWorkspaceItem[]>(getInitialProjectItemsSnapshot);
  const [groupItems, setGroupItems] = useState<ArtistGroup[]>(getInitialArtistGroupsSnapshot);

  useEffect(() => {
    setCollabItems((current) => {
      const incomingGlobeIds = new Set(globeCollabs.map((collab) => collab.id));
      return [
        ...globeCollabs,
        ...current.filter((collab) => collab.origin !== "globe" || incomingGlobeIds.has(collab.id))
          .filter((collab) => !incomingGlobeIds.has(collab.id)),
      ];
    });
  }, [globeCollabs]);

  const nextRequestToken = () => {
    requestTokenRef.current += 1;
    return requestTokenRef.current;
  };

  const displayedMessageItems = useMemo(() => (liveEnabled ? liveMessaging.conversations : messageItems)
    .filter((conversation) => !conversation.collaborationRequestId), [liveEnabled, liveMessaging.conversations, messageItems]);
  const messageRailItems = useMemo(
    () => displayedMessageItems.map(conversationSidebarItem),
    [displayedMessageItems],
  );
  const displayedCollabItems = liveEnabled ? liveCollaborations.items : collabItems;
  const collabRailItems = useMemo(
    () => displayedCollabItems.map((collab) => {
      const chat = (liveEnabled ? liveMessaging.conversations : messageItems)
        .find((conversation) => conversation.collaborationRequestId === collab.id);
      return { ...collabSidebarItem(collab), ...(chat ? { preview: chat.preview, time: chat.time, unread: chat.unread } : {}) };
    }),
    [displayedCollabItems, liveEnabled, liveMessaging.conversations, messageItems],
  );
  const displayedProjectItems = useMemo(
    () => liveEnabled && user?.id
      ? liveProjects.items.map((project) => mapMessagingProjectToWorkspaceItem(
        project,
        user.id,
        liveProjects.selectedProjectId === project.id ? liveProjects.selectedProject : null,
        liveProjects.selectedProjectId === project.id ? liveProjects.messages : [],
      ))
      : projectItems,
    [
      liveEnabled,
      liveProjects.items,
      liveProjects.messages,
      liveProjects.selectedProject,
      liveProjects.selectedProjectId,
      projectItems,
      user?.id,
    ],
  );
  const projectRailItems = useMemo(
    () => displayedProjectItems.map(projectSidebarItem),
    [displayedProjectItems],
  );
  const displayedGroupItems = useMemo(
    () => liveEnabled
      ? liveGroups.groups.map((group) => mapMessagingArtistGroupToWorkspace(
        group,
        liveGroups.selectedGroupId === group.id ? liveGroups.selectedGroup : null,
      ))
      : groupItems,
    [groupItems, liveEnabled, liveGroups.groups, liveGroups.selectedGroup, liveGroups.selectedGroupId],
  );
  const groupRailItems = useMemo(() => displayedGroupItems.map(groupSidebarItem), [displayedGroupItems]);
  const railItems = useMemo(() => {
    if (activeSpace === "messages") return messageRailItems;
    if (activeSpace === "collabs") return collabRailItems;
    if (activeSpace === "projects") return projectRailItems;
    if (activeSpace === "groups") return groupRailItems;
    return [...messageRailItems, ...collabRailItems, ...projectRailItems, ...groupRailItems];
  }, [activeSpace, collabRailItems, groupRailItems, messageRailItems, projectRailItems]);

  const clearContextRequests = () => {
    setCollabChatId(null);
    setOpenCollabRequest(null);
    setOpenProjectRequest(null);
    setCreateProjectRequest(null);
    setOpenGroupRequest(null);
  };

  const changeSpace = (space: MessagingSpace) => {
    nextRequestToken();
    setActiveSpace(space);
    navigate(buildMessagingRoute({
      space,
      mode: liveEnabled ? "real" : "demo",
      source: "messaging",
    }), { replace: true });
    clearContextRequests();
    setContentSpace(space === "all" ? "messages" : space);
    if (space === "projects") {
      const firstProject = projectRailItems[0];
      if (firstProject) {
        setSelectedRailKey(firstProject.key);
        setOpenProjectRequest({ token: nextRequestToken(), projectId: firstProject.id });
        return;
      }
    }
    if (space === "groups") {
      const firstGroup = groupRailItems[0];
      if (firstGroup) {
        setSelectedRailKey(firstGroup.key);
        setOpenGroupRequest({ token: nextRequestToken(), groupId: firstGroup.id });
        return;
      }
    }
    setSelectedRailKey(null);
  };

  useEffect(() => {
    const signature = `${location.pathname}${location.search}`;
    activeRouteSignatureRef.current = signature;
    return () => {
      if (activeRouteSignatureRef.current === signature) {
        activeRouteSignatureRef.current = null;
      }
    };
  }, [location.pathname, location.search]);

  useEffect(() => {
    setActiveSpace(routeState.space);
    setCollabChatId(null);
    setContentSpace(routeState.space === "all" ? "messages" : routeState.space);
    setOpenCollabRequest(null);
    setOpenProjectRequest(null);
    setCreateProjectRequest(null);
    setOpenGroupRequest(null);
  }, [routeState.space]);

  useEffect(() => {
    if (!liveEnabled || routeState.space !== "messages") return;
    if (liveInboxStatus === "loading") return;

    const targetProfileId = getDirectConversationTarget(routeState);
    const requestedConversationId = routeState.conversationId;
    if (!targetProfileId && !requestedConversationId) return;

    const signature = `${location.pathname}${location.search}`;
    if (processedLiveRouteRef.current === signature) return;
    processedLiveRouteRef.current = signature;

    if (requestedConversationId) {
      void openLiveConversation(requestedConversationId);
      return;
    }

    if (!targetProfileId) return;
    void (async () => {
      const conversationId = await createLiveDirectConversation(
        targetProfileId,
        `direct-route:${targetProfileId}`,
      );
      const requestedRouteIsStillActive = (
        activeRouteSignatureRef.current === signature
        && processedLiveRouteRef.current === signature
      );
      if (!requestedRouteIsStillActive) return;
      if (!conversationId) {
        processedLiveRouteRef.current = null;
        return;
      }
      const destination = buildMessagingRoute({
        space: "messages",
        conversationId,
        mode: "real",
        source: routeState.source ?? "messaging",
        marketListingId: routeState.marketListingId,
        marketListingTitle: routeState.marketListingTitle,
        returnTo: routeState.returnTo,
      });
      processedLiveRouteRef.current = destination;
      navigate(destination, { replace: true });
    })();
  }, [
    liveEnabled,
    createLiveDirectConversation,
    liveInboxStatus,
    location.pathname,
    location.search,
    navigate,
    openLiveConversation,
    routeState,
  ]);

  useEffect(() => {
    if (!explicitDemoTarget || routeState.space !== "messages") return;
    const targetId = getDemoConversationTarget(routeState);
    if (!targetId) return;
    const signature = `${location.pathname}${location.search}`;
    if (processedDemoRouteRef.current === signature) return;
    processedDemoRouteRef.current = signature;

    const normalizedTarget = targetId.toLocaleLowerCase("fr-FR").replace(/[^a-z0-9]+/g, "-");
    const existing = demoConversations.find((conversation) => (
      conversation.id === targetId
      || conversation.id === normalizedTarget
      || conversation.handle.replace(/^@/, "").replace(/_/g, "-") === normalizedTarget
    ));
    const conversation: DemoConversation = existing ?? {
      id: `globe-${normalizedTarget || "artist"}`,
      name: routeState.mockArtistName ?? "Artiste du Globe",
      handle: routeState.source === "shorts"
        ? `Profil découvert sur ${SCENE_NAME}`
        : "Profil découvert sur le Globe",
      role: routeState.mockArtistRole ?? "Artiste Meewav",
      avatar: routeState.mockArtistAvatar ?? "/avatars/utilisateur.png",
      status: "Conversation directe",
      online: false,
      gradeLevel: routeState.mockArtistGradeLevel ?? undefined,
      unread: 0,
      preview: "Commence la conversation.",
      time: "Maintenant",
      messages: [],
    };
    const token = nextRequestToken();
    setOpenRequest(requestFromConversation(conversation, token));
    setSelectedRailKey(`messages:${conversation.id}`);
  }, [explicitDemoTarget, location.pathname, location.search, routeState]);

  useEffect(() => {
    if (!liveEnabled || routeState.space !== "collabs" || !routeState.requestId) return;
    if (liveCollaborations.status !== "ready") return;
    const requested = liveCollaborations.items.find((item) => item.id === routeState.requestId);
    if (!requested) return;
    const signature = `${location.pathname}${location.search}`;
    if (processedCollaborationRouteRef.current === signature) return;
    processedCollaborationRouteRef.current = signature;
    const token = nextRequestToken();
    setSelectedRailKey(`collabs:${requested.id}`);
    setOpenCollabRequest({ token, id: requested.id });
  }, [
    liveCollaborations.items,
    liveCollaborations.status,
    liveEnabled,
    location.pathname,
    location.search,
    routeState.requestId,
    routeState.space,
  ]);

  const selectRailItem = (item: MessagingSidebarItem) => {
    const token = nextRequestToken();
    setSelectedRailKey(item.key);
    setContentSpace(item.space);
    clearContextRequests();
    if (item.space === "messages") {
      if (liveEnabled) {
        void selectLiveConversation(item.id);
        return;
      }
      const conversation = messageItems.find((candidate) => candidate.id === item.id);
      if (conversation) setOpenRequest(selectionRequestFromConversation(conversation, token));
      return;
    }
    if (item.space === "collabs") {
      const collab = displayedCollabItems.find((request) => request.id === item.id);
      if (!collab) return;
      setActiveSpace("collabs");
      setCollabChatId(collab.id);
      if (liveEnabled) {
        void liveMessaging.createCollaborationConversation(collab.id).then((conversationId) => {
          if (!conversationId) return;
          setCollabConversationIds((current) => ({ ...current, [collab.id]: conversationId }));
          if (requestTokenRef.current === token) void openLiveConversation(conversationId);
        });
      } else {
        const existing = messageItems.find((conversation) => conversation.collaborationRequestId === collab.id);
        const conversation = existing ?? buildCollabConversation(collab);
        setOpenRequest(existing ? selectionRequestFromConversation(existing, token) : requestFromConversation(conversation, token));
      }
      return;
    }
    if (item.space === "projects") {
      setOpenProjectRequest({ token, projectId: item.id });
      return;
    }
    setOpenGroupRequest({ token, groupId: item.id });
  };

  const openAcceptedCollab = (conversation: DemoConversation, _collab: DemoCollab) => {
    const token = nextRequestToken();
    const existing = displayedMessageItems.find((item) => item.id === conversation.id || item.name === conversation.name);
    setOpenRequest(requestFromConversation(existing ? { ...existing, status: conversation.status } : conversation, token));
    setActiveSpace("messages");
    setContentSpace("messages");
    setSelectedRailKey(null);
  };

  const openMemberChat = (member: { id: string; name: string; role: string; avatar: string }) => {
    if (liveEnabled) {
      setActiveSpace("messages");
      setContentSpace("messages");
      void liveMessaging.createDirectConversation(member.id, `group-member:${member.id}`).then((conversationId) => (
        conversationId ? selectLiveConversation(conversationId) : undefined
      )).catch(() => undefined);
      return;
    }
    const token = nextRequestToken();
    setOpenRequest({
      token,
      id: `artist-${member.id}`,
      name: member.name,
      role: member.role,
      status: "Conversation directe",
      avatar: member.avatar,
      group: false,
      gradeLevel: 1,
    });
    setActiveSpace("messages");
    setContentSpace("messages");
    setSelectedRailKey(null);
  };

  const openGroupProject = (projectId: string) => {
    const token = nextRequestToken();
    setOpenProjectRequest({ token, projectId });
    setActiveSpace("projects");
    setContentSpace("projects");
    setSelectedRailKey(`projects:${projectId}`);
  };

  const createGroupProject = (groupId: string, name: string) => {
    const token = nextRequestToken();
    setCreateProjectRequest({ token, groupId, name });
    setActiveSpace("projects");
    setContentSpace("projects");
    setSelectedRailKey(null);
  };

  const selectLiveConversation = useCallback(async (conversationId: string) => {
    setSelectedRailKey(`messages:${conversationId}`);
    await openLiveConversation(conversationId);
    const destination = buildMessagingRoute({
      space: "messages",
      conversationId,
      mode: "real",
      source: "messaging",
    });
    processedLiveRouteRef.current = destination;
    navigate(destination, { replace: true });
  }, [navigate, openLiveConversation]);

  const liveAttachmentsController = useMemo<MessagingWorkspaceAttachmentsController | null>(() => {
    if (!liveEnabled) return null;
    return {
      queue: liveAttachments.items,
      enqueue: liveAttachments.enqueue,
      retry: liveAttachments.retry,
      discard: liveAttachments.discard,
      sendReadyMessage: async (input) => {
        const result = await liveAttachments.sendReadyMessage(input);
        if (result) {
          await Promise.all([
            liveMessaging.refreshInbox({ silent: true }),
            liveMessaging.openConversation(input.conversationId),
          ]);
        }
        return result;
      },
      resolveUrl: (attachment) => messagingAttachmentsRepository.createSignedAttachmentUrl(attachment),
      clearSent: liveAttachments.clearSent,
    };
  }, [liveAttachments, liveEnabled, liveMessaging]);

  const liveController = useMemo<MessagingWorkspaceLiveController | null>(() => {
    if (!liveEnabled) return null;
    const inScope = (conversation: DemoConversation) => contentSpace === "collabs"
      ? conversation.collaborationRequestId === collabChatId
      : !conversation.collaborationRequestId;
    const scopedConversations = liveMessaging.conversations.filter(inScope);
    const selectedInScope = Boolean(liveMessaging.selectedConversationId && (
      contentSpace === "collabs" && collabChatId
        ? collabConversationIds[collabChatId] === liveMessaging.selectedConversationId
          || scopedConversations.some((conversation) => conversation.id === liveMessaging.selectedConversationId)
        : scopedConversations.some((conversation) => conversation.id === liveMessaging.selectedConversationId)
    ));
    const pendingCollab = contentSpace === "collabs" ? displayedCollabItems.find((collab) => collab.id === collabChatId) : null;
    const pendingConversation = pendingCollab ? {
      ...buildCollabConversation(pendingCollab), messages: [],
      id: selectedInScope ? liveMessaging.selectedConversationId! : `pending-collab-${pendingCollab.id}`,
      readOnlyReason: selectedInScope ? undefined : liveMessaging.actionError ? "La conversation n’a pas pu être ouverte." : "Ouverture de la conversation…",
    } : null;
    const currentProfileId = user?.id ?? null;
    const selectedConversationId = liveMessaging.selectedConversationId;
    const counterpartProfileId = liveMessaging.selectedConversation?.server.counterpartProfileId ?? null;
    const canModerateCounterpart = Boolean(
      counterpartProfileId
      && liveMessaging.selectedConversation?.conversationKind === "direct",
    );
    return {
      conversations: scopedConversations,
      selectedConversationId: selectedInScope ? liveMessaging.selectedConversationId : null,
      selectedConversation: selectedInScope ? liveMessaging.selectedConversation ?? pendingConversation : pendingConversation,
      messages: selectedInScope ? liveMessaging.selectedMessages : [],
      inboxStatus: liveMessaging.inboxStatus,
      messagesStatus: liveMessaging.messagesStatus,
      inboxError: liveMessaging.inboxError?.message ?? null,
      messagesError: liveMessaging.messagesError?.message ?? null,
      actionError: liveMessaging.actionError?.message ?? null,
      contacts: liveMessaging.contacts,
      contactsStatus: liveMessaging.contactsStatus,
      contactsError: liveMessaging.contactsError?.message ?? null,
      clearActionError: liveMessaging.clearActionError,
      // MessageWorkspace stays mounted behind the specialized right panes. Its
      // initial-selection effect must never canonicalize Groups back to Messages.
      selectConversation: contentSpace === "messages"
        ? selectLiveConversation
        : openLiveConversation,
      retryInbox: liveMessaging.refreshInbox,
      retryMessages: () => liveMessaging.selectedConversationId
        ? liveMessaging.openConversation(liveMessaging.selectedConversationId)
        : Promise.resolve([]),
      sendText: liveMessaging.sendText,
      retryMessage: liveMessaging.retryMessage,
      isReactionActiveByMe: (messageId, emoji) => Boolean(
        currentProfileId
        && liveMessaging.selectedMessages
          .find((message) => message.id === messageId)
          ?.server.reactionRows.some((reaction) => (
            reaction.profile_id === currentProfileId && reaction.emoji === emoji
          )),
      ),
      setReaction: liveMessaging.setMessageReaction,
      pinMessage: liveMessaging.setMessagePinned,
      deleteMessage: liveMessaging.deleteMessage,
      forwardMessage: liveMessaging.forwardMessage,
      togglePinned: (conversationId, pinned) => liveMessaging.updateConversationPreferences(
        conversationId,
        { pinned },
      ),
      toggleMuted: (conversationId, muted) => liveMessaging.updateConversationPreferences(
        conversationId,
        {
          mutedUntil: muted
            ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000).toISOString()
            : null,
        },
      ),
      archiveConversation: (conversationId) => liveMessaging.updateConversationPreferences(
        conversationId,
        { archived: true },
      ),
      hideConversation: (conversationId) => liveMessaging.setConversationHidden(conversationId, true),
      leaveGroupConversation: liveMessaging.leaveGroupConversation,
      searchContacts: liveMessaging.searchContacts,
      createDirectConversation: liveMessaging.createDirectConversation,
      createGroupConversation: liveMessaging.createGroupConversation,
      conversationInvitations: liveMessaging.conversationInvitations,
      invitationStatus: liveMessaging.invitationStatus,
      invitationError: liveMessaging.invitationError?.message ?? null,
      isInvitationMutating: (conversationId) => Boolean(liveMessaging.invitationMutations[conversationId]),
      retryInvitations: liveMessaging.refreshConversationInvitations,
      respondToInvitation: liveMessaging.respondToConversationInvitation,
      canModerateCounterpart,
      safetyMutating: Boolean(
        (counterpartProfileId && liveMessaging.safetyMutations[`block:${counterpartProfileId}`])
        || (selectedConversationId && liveMessaging.safetyMutations[`report:conversation:${selectedConversationId}`]),
      ),
      blockCounterpart: canModerateCounterpart && counterpartProfileId
        ? () => liveMessaging.setUserBlocked(counterpartProfileId, true, "conversation_safety")
        : undefined,
      reportConversation: selectedConversationId
        ? async (category, comment) => Boolean(await liveMessaging.reportContent({
          subjectType: "conversation",
          subjectId: selectedConversationId,
          category,
          comment,
        }))
        : undefined,
      attachments: liveAttachmentsController ?? undefined,
    };
  }, [
    liveAttachmentsController,
    collabChatId,
    collabConversationIds,
    displayedCollabItems,
    contentSpace,
    liveEnabled,
    liveMessaging,
    openLiveConversation,
    selectLiveConversation,
    user?.id,
  ]);

  const liveCollabsController = useMemo<CollabsWorkspaceLiveController | undefined>(() => {
    if (!liveEnabled) return undefined;
    return {
      markViewed: liveCollaborations.markViewed,
      acceptRequest: async (requestId) => {
        const result = await liveCollaborations.acceptRequest(requestId);
        if (result.conversation_id) {
          await refreshMessagingInbox({ silent: true });
          await selectLiveConversation(result.conversation_id);
        }
        return result;
      },
      declineRequest: liveCollaborations.declineRequest,
      cancelRequest: liveCollaborations.cancelRequest,
      isMutating: liveCollaborations.isMutating,
      status: liveCollaborations.status,
      error: liveCollaborations.error,
      actionError: liveCollaborations.actionError,
      clearActionError: liveCollaborations.clearActionError,
      retry: liveCollaborations.refresh,
      resolveAttachmentUrl: (attachment) => messagingAttachmentsRepository.createSignedAttachmentUrl(attachment),
    };
  }, [liveCollaborations, liveEnabled, refreshMessagingInbox, selectLiveConversation]);

  const liveGroupSummaries = liveGroups.groups;
  const openLiveGroupDetail = liveGroups.openGroup;

  const openLiveGroup = useCallback(async (groupId: string) => {
    const request = ++groupConversationRequestRef.current;
    const summary = liveGroupSummaries.find((group) => group.id === groupId) ?? null;
    const detail = await openLiveGroupDetail(groupId);
    if (request !== groupConversationRequestRef.current) return detail;
    const conversationId = detail?.conversation_id ?? summary?.conversationId ?? null;
    if (
      conversationId
      && (
        liveMessaging.selectedConversationId !== conversationId
        || liveMessaging.messagesStatus === "idle"
        || liveMessaging.messagesStatus === "error"
      )
    ) {
      await openLiveConversation(conversationId);
    }
    return detail;
  }, [liveGroupSummaries, liveMessaging.messagesStatus, liveMessaging.selectedConversationId, openLiveConversation, openLiveGroupDetail]);

  const liveGroupsController = useMemo<ArtistGroupsWorkspaceLiveController | null>(() => {
    if (!liveEnabled) return null;
    const selectedGroupConversationId = liveGroups.selectedGroup?.conversation_id
      ?? liveGroups.selectedSummary?.conversationId
      ?? null;
    const groupConversationSelected = Boolean(
      selectedGroupConversationId
      && liveMessaging.selectedConversationId === selectedGroupConversationId,
    );
    const groupAttachments = liveAttachmentsController && selectedGroupConversationId
      ? {
          ...liveAttachmentsController,
          queue: liveAttachmentsController.queue.filter(
            (item) => item.conversationId === selectedGroupConversationId,
          ),
        }
      : undefined;
    return {
      groups: displayedGroupItems,
      invitations: liveGroups.invitations,
      activity: liveGroups.activity,
      selectedGroupId: liveGroups.selectedGroupId,
      status: liveGroups.status,
      detailStatus: liveGroups.detailStatus,
      error: liveGroups.error,
      actionError: liveGroups.actionError,
      contacts: liveMessaging.contacts,
      contactsStatus: liveMessaging.contactsStatus,
      contactsError: liveMessaging.contactsError?.message ?? null,
      searchContacts: liveMessaging.searchContacts,
      openGroup: openLiveGroup,
      createGroup: liveGroups.createGroup,
      updateGroup: liveGroups.updateGroup,
      inviteMember: liveGroups.inviteMember,
      respondInvitation: liveGroups.respondInvitation,
      cancelInvitation: liveGroups.cancelInvitation,
      setPreferences: liveGroups.setPreferences,
      setAuthorityRole: liveGroups.setAuthorityRole,
      setArtisticRole: liveGroups.setArtisticRole,
      removeMember: liveGroups.removeMember,
      leaveGroup: liveGroups.leaveGroup,
      setGroupArchived: liveGroups.setGroupArchived,
      deleteGroup: liveGroups.deleteGroup,
      clearActionError: liveGroups.clearActionError,
      chat: {
        selectedConversationId: liveMessaging.selectedConversationId,
        messages: groupConversationSelected ? liveMessaging.selectedMessages : [],
        status: groupConversationSelected ? liveMessaging.messagesStatus : "loading",
        error: groupConversationSelected ? liveMessaging.messagesError?.message ?? null : null,
        actionError: groupConversationSelected ? liveMessaging.actionError?.message ?? null : null,
        clearActionError: liveMessaging.clearActionError,
        refresh: liveMessaging.refreshSelectedConversation,
        sendText: liveMessaging.sendText,
        retryMessage: liveMessaging.retryMessage,
        attachments: groupAttachments,
      },
    };
  }, [displayedGroupItems, liveAttachmentsController, liveEnabled, liveGroups, liveMessaging, openLiveGroup]);

  const liveProjectsController = useMemo<ProjectsWorkspaceLiveController | null>(() => {
    if (!liveEnabled || !user?.id) return null;
    return {
      ...liveProjects,
      currentProfileId: user.id,
      searchInviteCandidates: liveMessaging.searchContacts,
      inviteCandidates: liveMessaging.contacts.map((contact) => ({
        id: contact.id,
        displayName: contact.displayName,
        username: contact.username,
        avatar: contact.avatar,
        role: contact.role,
      })),
    };
  }, [liveEnabled, liveMessaging.contacts, liveMessaging.searchContacts, liveProjects, user?.id]);

  let rightPane: ReactNode = null;
  if (contentSpace === "collabs" && !collabChatId) {
    rightPane = (
      <CollabsWorkspace
        collabs={allCollabs}
        onAcceptedCollab={openAcceptedCollab}
        openCollabRequest={openCollabRequest ?? undefined}
        onItemsChange={liveEnabled ? undefined : setCollabItems}
        onActiveCollabChange={(collabId) => setSelectedRailKey(collabId ? `collabs:${collabId}` : null)}
        liveController={liveCollabsController}
      />
    );
  } else if (contentSpace === "projects") {
    rightPane = (
      <ProjectsWorkspace
        onProjectCreated={liveEnabled ? undefined : (project) => linkProjectToArtistGroup(project.groupId, project.id)}
        openProjectRequest={openProjectRequest ?? undefined}
        createProjectRequest={createProjectRequest ?? undefined}
        onItemsChange={liveEnabled ? undefined : setProjectItems}
        onActiveProjectChange={(projectId) => setSelectedRailKey(`projects:${projectId}`)}
        liveController={liveProjectsController}
      />
    );
  } else if (contentSpace === "groups") {
    rightPane = (
      <ArtistGroupsWorkspace
        createGroupSignal={createGroupSignal}
        onOpenMemberChat={openMemberChat}
        onOpenProject={liveEnabled ? undefined : openGroupProject}
        onCreateProject={liveEnabled ? undefined : createGroupProject}
        openGroupRequest={openGroupRequest ?? undefined}
        onItemsChange={liveEnabled ? undefined : setGroupItems}
        onActiveGroupChange={(groupId) => setSelectedRailKey(`groups:${groupId}`)}
        liveController={liveGroupsController}
      />
    );
  }

  return (
    <main className="messaging-page">
      <div className="messaging-page__backdrop" aria-hidden="true" />

      <div className="messaging-rail">
        <MeewavPrimaryNav
          activeView="globe"
          activeDestination="messages"
          onGlobe={() => navigate(MON_GLOBE_ROUTE, {
            state: MON_GLOBE_HOST_POSITION_NAVIGATION_STATE,
          })}
          onMessages={() => changeSpace("messages")}
        />
      </div>

      <section className="messaging-stage" data-active-space={activeSpace} data-content-space={contentSpace}>
        <MessageWorkspace
          newConversationSignal={newConversationSignal}
          openRequest={openRequest}
          onRequestConsumed={() => setOpenRequest(null)}
          onCreateGroup={() => setCreateGroupSignal((signal) => signal + 1)}
          activeSpace={activeSpace}
          contentSpace={contentSpace}
          showCollabConversation={contentSpace === "collabs" && Boolean(collabChatId)}
          conversationScope={contentSpace === "collabs" ? "collabs" : "friends"}
          railItems={railItems}
          selectedRailKey={selectedRailKey}
          onRailItemSelect={selectRailItem}
          rightPane={rightPane}
          conversationHeader={contentSpace === "collabs" && collabChatId ? <>
            <nav className="mw-hub-chips mw-collab-return" aria-label="Navigation des demandes de collab">
              <button type="button" onClick={() => {
                nextRequestToken();
                setCollabChatId(null);
                setSelectedRailKey(null);
                setOpenRequest(null);
                setOpenCollabRequest(null);
              }}>Toutes les demandes</button>
            </nav>
            <CollabsWorkspace
              collabs={allCollabs}
              pinnedCollabId={collabChatId}
              onAcceptedCollab={openAcceptedCollab}
              onItemsChange={liveEnabled ? undefined : setCollabItems}
              liveController={liveCollabsController}
            />
          </> : null}
          onSpaceChange={changeSpace}
          onConversationsChange={liveEnabled ? undefined : setMessageItems}
          liveController={liveController}
          marketplaceContext={routeState.source === "marketplace" && routeState.marketListingId
            ? {
                listingTitle: routeState.marketListingTitle ?? "Annonce Market",
                onBack: () => navigate(routeState.returnTo ?? "/market"),
              }
            : null}
        />
      </section>
    </main>
  );
}
