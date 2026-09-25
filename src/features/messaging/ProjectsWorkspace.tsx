import { demoTrackPackAudio } from "./demoTrackPackAudio";
import {
  Archive,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  GitCompare,
  History,
  Info,
  ListChecks,
  LogOut,
  MessageCircleMore,
  Mic,
  MoreVertical,
  Music,
  Music2,
  Paperclip,
  Pause,
  Play,
  Plus,
  Save,
  Search,
  Send,
  Smile,
  Settings2,
  ShieldCheck,
  Trash2,
  Upload,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import { appendMeeWavEmoticon, MeeWavEmoticonComposer, MeeWavEmoticonPicker, MeeWavRichText } from "../emoticons/MeewavEmoticons";
import {
  createMessagingProjectIdempotencyKey,
  createMessagingProjectTaskId,
} from "./messaging.projects.service";
import {
  createMessagingProjectCreationAttempt,
  createMessagingProjectInvitationAttempt,
} from "./messaging.projects.retry";
import type {
  MessagingProjectAuthorityRole,
  MessagingInviteProjectMemberInput,
  MessagingProjectInvitationRow,
  MessagingProjectInvitationResult,
  MessagingProjectListItem,
  MessagingProjectPermissions,
  MessagingProjectStatus,
  MessagingProjectTaskStatus,
  MessagingProjectWorkspace,
} from "./messaging.projects.types";
import type { MessagingMessageRow } from "./messaging.types";
import { playMessageSound } from "./messagingSounds";
import type { useMessagingProjectsLive } from "./useMessagingProjectsLive";
import { TrackPackViewer } from "./MessageWorkspace";
import type { DemoMessage } from "./messagingDemoData";
import { InstrumentArtwork, Waveform } from "./TrackPackStudioPrimitives";
import { TRACK_PACK_INSTRUMENTS, inferTrackPackInstrument } from "./trackPackInstrumentCatalog";
import "./messaging-hubs.css";

type ProjectDetailTab = "chat" | "tasks" | "stems" | "info";
type ProjectStatus = "inProgress" | "completed" | "archived";
type TaskStatus = "todo" | "inProgress" | "done";
type PermissionKey =
  | "canEdit"
  | "canInvite"
  | "canManageMembers"
  | "canManageStems"
  | "canCreateTasks";

type MemberPermissions = Record<PermissionKey, boolean>;

export type ProjectsWorkspaceInviteCandidate = {
  id: string;
  displayName: string;
  username?: string | null;
  avatar?: string | null;
  role?: string | null;
};

type ProjectContact = {
  id: string;
  name: string;
  role: string;
  avatar: string;
  online: boolean;
};

type ProjectMember = ProjectContact & {
  memberId: string;
  permissions: MemberPermissions;
  creator?: boolean;
  authorityRole?: MessagingProjectAuthorityRole;
};

type ProjectStem = {
  mediaUrl?: string;
  mediaFile?: File;
  id: string;
  label: string;
  fileName: string;
  durationSeconds: number;
  bpm?: number;
  musicalKey?: string;
  order: number;
  addedBy: string;
};

type ProjectTake = {
  id: string;
  version: number;
  description: string;
  stems: ProjectStem[];
  createdBy: string;
  createdLabel: string;
  changes?: { added: string[]; removed: string[]; modified: string[] };
};

type ProjectMix = {
  id: string;
  name: string;
  takes: ProjectTake[];
  currentTakeId?: string;
  isDefault: boolean;
};

type ProjectTask = {
  id: string;
  title: string;
  description?: string;
  assignment: string;
  assignmentAvatar?: string;
  deadline?: string;
  status: TaskStatus;
};

type FeedbackStatus = "open" | "inProgress" | "resolved";
type FeedbackType = "technical" | "creative" | "validation" | "question";

type ProjectFeedback = {
  id: string;
  takeId: string;
  stemId: string;
  position: string;
  type: FeedbackType;
  content: string;
  status: FeedbackStatus;
  author: string;
  avatar: string;
  age: string;
  replies: Array<{ id: string; author: string; content: string }>;
};

type ProjectChatMessage = {
  id: string;
  sender: string;
  mine?: boolean;
  system?: boolean;
  body: string;
  time: string;
};

type ProjectWorkspaceInfo = {
  genre: string;
  bpm: number;
  musicalKey: string;
  objective: string;
  delivery: string;
  milestone: string;
  completion: number;
  notes: string;
};

export type ProjectWorkspaceItem = {
  id: string;
  name: string;
  description: string;
  cover: string;
  status: ProjectStatus;
  members: number;
  deadline?: string;
  createdAt?: string;
  creatorId?: string;
  takeVersion?: number;
  stemCount: number;
  unreadMessages: number;
  newStems: number;
  hasNewTake: boolean;
  newTasks: number;
  currentMixId?: string;
  memberDetails?: ProjectMember[];
  mixes?: ProjectMix[];
  tasks?: ProjectTask[];
  feedbacks?: ProjectFeedback[];
  messages?: ProjectChatMessage[];
  workspaceInfo?: ProjectWorkspaceInfo;
  groupId?: string;
  deliveryAt?: string | null;
  liveUpdatedAt?: string;
  viewerProfileId?: string;
  viewerAuthorityRole?: MessagingProjectAuthorityRole;
  viewerPermissions?: MemberPermissions;
};

type MessagingProjectsLiveHook = ReturnType<typeof useMessagingProjectsLive>;

export type ProjectsWorkspaceLiveController = Pick<
  MessagingProjectsLiveHook,
  | "items"
  | "invitations"
  | "selectedProjectId"
  | "selectedProject"
  | "messages"
  | "status"
  | "detailStatus"
  | "error"
  | "actionError"
  | "mutations"
  | "refresh"
  | "selectProject"
  | "createProject"
  | "updateProject"
  | "inviteMember"
  | "respondToInvitation"
  | "cancelInvitation"
  | "updateMember"
  | "transferOwnership"
  | "removeMember"
  | "leaveProject"
  | "upsertTask"
  | "deleteTask"
  | "setProjectStatus"
  | "deleteProject"
  | "sendText"
  | "clearActionError"
> & {
  currentProfileId: string;
  inviteCandidates?: ProjectsWorkspaceInviteCandidate[];
  searchInviteCandidates?: (query: string) => void | Promise<unknown>;
};

export type ProjectsWorkspaceProps = {
  projects?: ProjectWorkspaceItem[];
  onProjectCreated?: (project: ProjectWorkspaceItem) => void;
  openProjectRequest?: { token: number; projectId: string };
  createProjectRequest?: { token: number; groupId: string; name: string };
  onItemsChange?: (projects: ProjectWorkspaceItem[]) => void;
  onActiveProjectChange?: (projectId: string) => void;
  liveController?: ProjectsWorkspaceLiveController | null;
};

const permissionsAll: MemberPermissions = {
  canEdit: true,
  canInvite: true,
  canManageMembers: true,
  canManageStems: true,
  canCreateTasks: true,
};

const permissionsStandard: MemberPermissions = {
  canEdit: true,
  canInvite: false,
  canManageMembers: false,
  canManageStems: true,
  canCreateTasks: true,
};

const permissionsDj: MemberPermissions = {
  canEdit: true,
  canInvite: false,
  canManageMembers: false,
  canManageStems: true,
  canCreateTasks: false,
};

const permissionsVocal: MemberPermissions = {
  canEdit: false,
  canInvite: false,
  canManageMembers: false,
  canManageStems: false,
  canCreateTasks: true,
};

function fromLivePermissions(permissions: MessagingProjectPermissions): MemberPermissions {
  return {
    canEdit: permissions.can_edit,
    canInvite: permissions.can_invite,
    canManageMembers: permissions.can_manage_members,
    canManageStems: permissions.can_manage_stems,
    canCreateTasks: permissions.can_create_tasks,
  };
}

function toLivePermissions(permissions: MemberPermissions): MessagingProjectPermissions {
  return {
    can_edit: permissions.canEdit,
    can_invite: permissions.canInvite,
    can_manage_members: permissions.canManageMembers,
    can_manage_stems: permissions.canManageStems,
    can_create_tasks: permissions.canCreateTasks,
  };
}

function fromLiveProjectStatus(status: MessagingProjectStatus): ProjectStatus {
  if (status === "completed") return "completed";
  if (status === "archived") return "archived";
  return "inProgress";
}

function fromLiveTaskStatus(status: MessagingProjectTaskStatus): TaskStatus {
  if (status === "in_progress") return "inProgress";
  return status;
}

function toLiveTaskStatus(status: TaskStatus): MessagingProjectTaskStatus {
  if (status === "inProgress") return "in_progress";
  return status;
}

function formatLiveDate(value: string | null | undefined, withTime = false) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", withTime
    ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
    : { day: "numeric", month: "long", year: "numeric" })
    .format(date);
}

function liveProjectCover(projectId: string) {
  let hash = 0;
  for (let index = 0; index < projectId.length; index += 1) hash = (hash + projectId.charCodeAt(index)) % 5;
  return `/images/messaging/groups/group_${hash + 1}.png`;
}

function inviteCandidateToContact(candidate: ProjectsWorkspaceInviteCandidate): ProjectContact {
  return {
    id: candidate.id,
    name: candidate.displayName,
    role: candidate.role || (candidate.username ? `@${candidate.username}` : "Artiste"),
    avatar: candidate.avatar || liveProjectCover(candidate.id),
    online: false,
  };
}

export function mapMessagingProjectToWorkspaceItem(
  item: MessagingProjectListItem,
  currentProfileId: string,
  workspace?: MessagingProjectWorkspace | null,
  messages: MessagingMessageRow[] = [],
): ProjectWorkspaceItem {
  const detail = workspace?.project_id === item.id ? workspace : null;
  const memberById = new Map(detail?.members.map((member) => [member.profile_id, member]) ?? []);
  const mappedMembers: ProjectMember[] = (detail?.members ?? []).map((member) => ({
    id: member.profile_id,
    memberId: member.profile_id,
    name: member.display_name,
    role: member.artistic_role || member.primary_role_key || member.authority_role,
    avatar: member.avatar_url || liveProjectCover(member.profile_id),
    online: false,
    permissions: fromLivePermissions(member),
    creator: member.authority_role === "owner",
    authorityRole: member.authority_role,
  }));
  const mappedTasks: ProjectTask[] = (detail?.tasks ?? []).map((task) => ({
    id: task.task_id,
    title: task.title,
    description: task.description || undefined,
    assignment: task.assigned_display_name || "Non assigné",
    deadline: formatLiveDate(task.due_at),
    status: fromLiveTaskStatus(task.status),
  }));
  const mappedMessages: ProjectChatMessage[] = messages.map((message) => {
    const sender = message.sender_profile_id ? memberById.get(message.sender_profile_id) : null;
    return {
      id: message.id,
      sender: message.kind === "system" ? "Système" : sender?.display_name || "Membre",
      mine: message.sender_profile_id === currentProfileId,
      system: message.kind === "system",
      body: message.deleted_at ? "Message supprimé" : (message.body || ""),
      time: formatLiveDate(message.created_at, true) || "",
    };
  });
  const completedTasks = mappedTasks.filter((task) => task.status === "done").length;
  const completion = detail?.status === "completed"
    ? 100
    : mappedTasks.length > 0
      ? Math.round((completedTasks / mappedTasks.length) * 100)
      : 0;

  return {
    id: item.id,
    name: detail?.name ?? item.name,
    description: detail?.description ?? item.description,
    cover: liveProjectCover(item.id),
    status: fromLiveProjectStatus(detail?.status ?? item.status),
    members: detail?.members.length ?? item.members,
    deadline: formatLiveDate(detail?.delivery_at ?? item.deliveryAt),
    deliveryAt: detail?.delivery_at ?? item.deliveryAt,
    createdAt: formatLiveDate(detail?.created_at),
    creatorId: detail?.owner_profile_id ?? undefined,
    stemCount: 0,
    unreadMessages: detail?.unread_count ?? item.unread,
    newStems: 0,
    hasNewTake: false,
    newTasks: detail?.tasks.filter((task) => task.status !== "done").length ?? item.pendingTasks,
    memberDetails: mappedMembers,
    mixes: [],
    tasks: mappedTasks,
    feedbacks: [],
    messages: mappedMessages,
    workspaceInfo: {
      genre: detail?.genre || item.genre || "À définir",
      bpm: detail?.bpm || item.bpm || 0,
      musicalKey: detail?.musical_key || item.musicalKey || "À définir",
      objective: detail?.objective || detail?.description || item.description,
      delivery: formatLiveDate(detail?.delivery_at ?? item.deliveryAt) || "À planifier",
      milestone: detail?.milestone || "À définir",
      completion,
      notes: "",
    },
    liveUpdatedAt: detail?.updated_at ?? item.updatedAt,
    viewerProfileId: currentProfileId,
    viewerAuthorityRole: detail?.membership.authority_role ?? item.role,
    viewerPermissions: fromLivePermissions(detail?.membership ?? item.permissions),
  };
}

const mockUsers: ProjectContact[] = [
  { id: "user_1", name: "Echo Flow", role: "Artiste", avatar: "/images/messaging/avatars/avatar_1.png", online: true },
  { id: "user_2", name: "Neon Pulse", role: "Beatmaker", avatar: "/images/messaging/avatars/avatar_2.png", online: false },
  { id: "user_3", name: "Stellar Vibe", role: "DJ / Producteur", avatar: "/images/messaging/avatars/avatar_3.png", online: true },
  { id: "user_4", name: "Lisa Music", role: "Mixeur", avatar: "/images/messaging/avatars/avatar_4.png", online: false },
  { id: "user_5", name: "The Producer", role: "Producteur", avatar: "/images/messaging/avatars/avatar_5.png", online: true },
  { id: "user_6", name: "Vocal Queen", role: "Artiste / Auteur", avatar: "/images/messaging/avatars/avatar_6.png", online: false },
];

const memberDirectory: Record<string, ProjectMember> = {
  current_user: {
    id: "current_user",
    memberId: "pm_1",
    name: "Moi",
    role: "Producteur",
    avatar: "/images/messaging/avatars/avatar_7.png",
    online: true,
    permissions: permissionsAll,
  },
  user_1: {
    id: "user_1",
    memberId: "pm_2",
    name: "Maya Chen",
    role: "Artiste",
    avatar: "/images/messaging/avatars/avatar_1.png",
    online: true,
    permissions: permissionsStandard,
  },
  user_2: {
    id: "user_2",
    memberId: "pm_3",
    name: "SoundMax",
    role: "Beatmaker",
    avatar: "/images/messaging/avatars/avatar_2.png",
    online: false,
    permissions: permissionsStandard,
  },
  user_3: {
    id: "user_3",
    memberId: "pm_4",
    name: "DJ Nova",
    role: "DJ / Producteur",
    avatar: "/images/messaging/avatars/avatar_3.png",
    online: true,
    permissions: permissionsDj,
  },
  user_4: {
    id: "user_4",
    memberId: "pm_5",
    name: "Lisa Music",
    role: "Mixeur",
    avatar: "/images/messaging/avatars/avatar_4.png",
    online: false,
    permissions: permissionsAll,
  },
  user_6: {
    id: "user_6",
    memberId: "pm_6",
    name: "Vocal Queen",
    role: "Chanteuse",
    avatar: "/images/messaging/avatars/avatar_6.png",
    online: false,
    permissions: permissionsVocal,
  },
};

function projectMembers(creatorId: string, ids: string[]) {
  return ids.map((id) => ({
    ...memberDirectory[id],
    permissions: { ...memberDirectory[id].permissions },
    creator: id === creatorId,
  }));
}

const nightDriveStems: ProjectStem[] = [
  { id: "stem_1", label: "Drums", fileName: "drums_main.wav", durationSeconds: 204, bpm: 140, musicalKey: "Am", order: 0, addedBy: "user_2" },
  { id: "stem_2", label: "Bass", fileName: "bass_808.wav", durationSeconds: 204, bpm: 140, musicalKey: "Am", order: 1, addedBy: "user_2" },
  { id: "stem_3", label: "Synth Lead", fileName: "synth_lead_v2.wav", durationSeconds: 200, bpm: 140, musicalKey: "Am", order: 2, addedBy: "current_user" },
  { id: "stem_4", label: "Vocals", fileName: "vocal_main_maya.wav", durationSeconds: 165, bpm: 140, musicalKey: "Am", order: 3, addedBy: "user_1" },
  { id: "stem_5", label: "FX", fileName: "fx_risers.wav", durationSeconds: 204, bpm: 140, order: 4, addedBy: "user_3" },
].map((stem) => ({ ...stem, ...demoTrackPackAudio(stem.label) }));

const nightDriveMixes: ProjectMix[] = [
  {
    id: "mix_1",
    name: "Mix Principal",
    currentTakeId: "take_3",
    isDefault: true,
    takes: [
      {
        id: "take_1",
        version: 1,
        description: "Structure de base - drums + bass",
        stems: nightDriveStems.slice(0, 2),
        createdBy: "user_2",
        createdLabel: "Il y a 5 jours",
        changes: { added: ["stem_1", "stem_2"], removed: [], modified: [] },
      },
      {
        id: "take_2",
        version: 2,
        description: "Ajout du synth lead",
        stems: nightDriveStems.slice(0, 3),
        createdBy: "current_user",
        createdLabel: "Il y a 3 jours",
        changes: { added: ["stem_3"], removed: [], modified: [] },
      },
      {
        id: "take_3",
        version: 3,
        description: "Vocals de Maya + FX",
        stems: nightDriveStems,
        createdBy: "user_1",
        createdLabel: "Il y a 1 jour",
        changes: { added: ["stem_4", "stem_5"], removed: [], modified: [] },
      },
    ],
  },
  {
    id: "mix_2",
    name: "Mix Radio Edit",
    isDefault: false,
    takes: [
      {
        id: "take_radio_1",
        version: 1,
        description: "Version courte pour radio",
        stems: [nightDriveStems[0], nightDriveStems[1], nightDriveStems[3]],
        createdBy: "user_4",
        createdLabel: "Il y a 1 jour",
        changes: { added: ["stem_1", "stem_2", "stem_4"], removed: [], modified: [] },
      },
    ],
  },
];

const summerStems: ProjectStem[] = [
  { id: "stem_ep_1", label: "Drums", fileName: "tropical_drums.wav", durationSeconds: 250, bpm: 110, musicalKey: "C", order: 0, addedBy: "user_3" },
  { id: "stem_ep_2", label: "Chords", fileName: "piano_chords.wav", durationSeconds: 250, bpm: 110, musicalKey: "C", order: 1, addedBy: "user_3" },
].map((stem) => ({ ...stem, ...demoTrackPackAudio(stem.label) }));

const summerMixes: ProjectMix[] = [
  {
    id: "mix_3",
    name: "Mix Principal",
    isDefault: true,
    takes: [
      {
        id: "take_ep_1",
        version: 1,
        description: "Premier jet - instru de base",
        stems: summerStems,
        createdBy: "user_3",
        createdLabel: "Il y a 40 jours",
      },
    ],
  },
];

const projectOneTasks: ProjectTask[] = [
  {
    id: "task_1",
    title: "Enregistrer le couplet 2",
    description: "Maya doit enregistrer son deuxième couplet sur le beat v3",
    assignment: "Maya Chen",
    assignmentAvatar: "/images/messaging/avatars/avatar_1.png",
    deadline: "Dans 3 jours",
    status: "inProgress",
  },
  {
    id: "task_2",
    title: "Refaire le drop",
    description: "Le drop actuel manque de punch, besoin de plus de layers",
    assignment: "Beatmaker",
    status: "todo",
  },
  {
    id: "task_3",
    title: "Mix final",
    description: "Mixer et masteriser la version finale une fois tous les stems validés",
    assignment: "Lisa Music",
    assignmentAvatar: "/images/messaging/avatars/avatar_4.png",
    deadline: "Dans 14 jours",
    status: "todo",
  },
  {
    id: "task_4",
    title: "Valider la structure",
    description: "Écoute collective pour valider intro-couplet-refrain-couplet-outro",
    assignment: "Non assigné",
    status: "done",
  },
];

const projectTwoTasks: ProjectTask[] = [
  {
    id: "task_5",
    title: "Ajouter les vocaux",
    assignment: "Vocal Queen",
    assignmentAvatar: "/images/messaging/avatars/avatar_6.png",
    status: "todo",
  },
];

const initialFeedbacks: ProjectFeedback[] = [
  {
    id: "fb_1",
    takeId: "take_3",
    stemId: "stem_1",
    position: "1:24 – 1:45",
    type: "technical",
    content: "Le kick est un peu trop fort sur cette section, ça masque la basse",
    status: "open",
    author: "Lisa Music",
    avatar: "/images/messaging/avatars/avatar_4.png",
    age: "Il y a 5 heures",
    replies: [{ id: "reply_1", author: "SoundMax", content: "Je vais baisser de 2-3 dB, ça devrait aller" }],
  },
  {
    id: "fb_2",
    takeId: "take_3",
    stemId: "stem_4",
    position: "0:45",
    type: "creative",
    content: "On pourrait ajouter un ad-lib ici pour remplir le vide",
    status: "inProgress",
    author: "Moi",
    avatar: "/images/messaging/avatars/avatar_3.png",
    age: "Il y a 1 jour",
    replies: [],
  },
  {
    id: "fb_3",
    takeId: "take_3",
    stemId: "stem_3",
    position: "2:30 – 2:50",
    type: "validation",
    content: "Ce passage est parfait, on garde tel quel !",
    status: "resolved",
    author: "Maya Chen",
    avatar: "/images/messaging/avatars/avatar_1.png",
    age: "Il y a 2 jours",
    replies: [],
  },
  {
    id: "fb_4",
    takeId: "take_3",
    stemId: "stem_5",
    position: "3:00",
    type: "question",
    content: "C’est quoi ce son à la fin ? C’est voulu ?",
    status: "open",
    author: "Maya Chen",
    avatar: "/images/messaging/avatars/avatar_1.png",
    age: "Il y a 8 heures",
    replies: [],
  },
];

const flutterProjectSeeds: ProjectWorkspaceItem[] = [
  { id: "project_1", name: "Night Drive", description: "Single trap/drill avec Maya Chen. Objectif : sortie fin février.", cover: "/images/messaging/groups/group_2.png", status: "inProgress", members: 4, deadline: "Dans 21 jours", createdAt: "Il y a 30 jours", creatorId: "current_user", takeVersion: 3, stemCount: 5, unreadMessages: 3, newStems: 1, hasNewTake: true, newTasks: 0, currentMixId: "mix_1", memberDetails: projectMembers("current_user", ["current_user", "user_1", "user_2", "user_4"]), mixes: nightDriveMixes, tasks: projectOneTasks, feedbacks: initialFeedbacks },
  { id: "project_2", name: "Summer Vibes EP", description: "EP 5 titres ambiance summer/tropical house", cover: "/images/messaging/groups/group_5.png", status: "inProgress", members: 3, createdAt: "Il y a 45 jours", creatorId: "user_3", takeVersion: 1, stemCount: 2, unreadMessages: 0, newStems: 0, hasNewTake: false, newTasks: 2, currentMixId: "mix_3", memberDetails: projectMembers("user_3", ["user_3", "current_user", "user_6"]), mixes: summerMixes, tasks: projectTwoTasks, feedbacks: [] },
  { id: "project_3", name: "Acoustic Session", description: "Reprise acoustique de mes titres", cover: "/images/messaging/groups/group_5.png", status: "completed", members: 2, createdAt: "Il y a 60 jours", creatorId: "current_user", stemCount: 0, unreadMessages: 0, newStems: 0, hasNewTake: false, newTasks: 0, memberDetails: projectMembers("current_user", ["current_user", "user_1"]), mixes: [], tasks: [], feedbacks: [] },
  { id: "project_4", name: "Old Beats Archive", description: "Anciennes prods à revisiter", cover: "/images/messaging/groups/group_3.png", status: "archived", members: 1, createdAt: "Il y a 120 jours", creatorId: "current_user", stemCount: 0, unreadMessages: 0, newStems: 0, hasNewTake: false, newTasks: 0, memberDetails: projectMembers("current_user", ["current_user"]), mixes: [], tasks: [], feedbacks: [] },
  { id: "project_5", name: "Freestyle Friday", description: "Sessions freestyle hebdo avec le crew", cover: "/images/messaging/groups/group_4.png", status: "inProgress", members: 4, createdAt: "Il y a 10 jours", creatorId: "current_user", stemCount: 0, unreadMessages: 7, newStems: 2, hasNewTake: false, newTasks: 1, memberDetails: projectMembers("current_user", ["current_user", "user_2", "user_3", "user_6"]), mixes: [], tasks: [], feedbacks: [] },
  { id: "project_6", name: "Remix Contest", description: "Remix officiel pour le concours Universal", cover: "/images/messaging/groups/group_5.png", status: "inProgress", members: 2, deadline: "Dans 5 jours", createdAt: "Il y a 15 jours", creatorId: "user_2", stemCount: 0, unreadMessages: 0, newStems: 0, hasNewTake: true, newTasks: 0, memberDetails: projectMembers("user_2", ["current_user", "user_2"]), mixes: [], tasks: [], feedbacks: [] },
  { id: "project_7", name: "Album Nocturne", description: "Projet album 12 titres, dark R&B / trap soul", cover: "/images/messaging/groups/group_1.png", status: "inProgress", members: 6, deadline: "Dans 60 jours", createdAt: "Il y a 90 jours", creatorId: "current_user", stemCount: 0, unreadMessages: 12, newStems: 3, hasNewTake: true, newTasks: 4, memberDetails: projectMembers("current_user", ["current_user", "user_1", "user_2", "user_3", "user_4", "user_6"]), mixes: [], tasks: [], feedbacks: [] },
  { id: "project_8", name: "Lofi Beats", description: "Beats lofi pour chaîne YouTube", cover: "/images/messaging/groups/group_3.png", status: "inProgress", members: 2, createdAt: "Il y a 20 jours", creatorId: "current_user", stemCount: 0, unreadMessages: 0, newStems: 0, hasNewTake: false, newTasks: 0, memberDetails: projectMembers("current_user", ["current_user", "user_4"]), mixes: [], tasks: [], feedbacks: [] },
  { id: "project_9", name: "Live Session Berlin", description: "Enregistrement live au Studio 44 Berlin", cover: "/images/messaging/groups/group_1.png", status: "completed", members: 3, createdAt: "Il y a 75 jours", creatorId: "user_1", stemCount: 0, unreadMessages: 0, newStems: 0, hasNewTake: false, newTasks: 0, memberDetails: projectMembers("user_1", ["current_user", "user_1", "user_3"]), mixes: [], tasks: [], feedbacks: [] },
  { id: "project_10", name: "Prod pour Naya", description: "Production 3 singles pour Naya", cover: "/images/V4/Direction artistique V2.png", status: "inProgress", members: 2, createdAt: "Il y a 8 jours", creatorId: "current_user", stemCount: 0, unreadMessages: 2, newStems: 0, hasNewTake: false, newTasks: 0, memberDetails: projectMembers("current_user", ["current_user", "user_6"]), mixes: [], tasks: [], feedbacks: [] },
  { id: "project_11", name: "Mixtape Été 2025", description: "Compilation des meilleurs morceaux de l’été", cover: "/images/messaging/groups/group_3.png", status: "archived", members: 3, createdAt: "Il y a 200 jours", creatorId: "current_user", stemCount: 0, unreadMessages: 0, newStems: 0, hasNewTake: false, newTasks: 0, memberDetails: projectMembers("current_user", ["current_user", "user_1", "user_2"]), mixes: [], tasks: [], feedbacks: [] },
  { id: "project_12", name: "Collab UK Drill", description: "Projet drill avec des artistes UK", cover: "/images/messaging/groups/group_4.png", status: "inProgress", members: 3, createdAt: "Il y a 5 jours", creatorId: "user_3", stemCount: 0, unreadMessages: 0, newStems: 1, hasNewTake: false, newTasks: 3, memberDetails: projectMembers("user_3", ["current_user", "user_2", "user_3"]), mixes: [], tasks: [], feedbacks: [] },
];

const flutterProjectMessages: ProjectChatMessage[] = [
  { id: "msg_sys_0", sender: "Système", system: true, body: "Moi a ajouté Maya Chen au projet", time: "Il y a 3 jours" },
  { id: "msg_sys_1", sender: "Système", system: true, body: "Moi a ajouté SoundMax au projet", time: "Il y a 3 jours" },
  { id: "msg_p1", sender: "Moi", mine: true, body: "Salut l’équipe ! Bienvenue sur Night Drive.", time: "Il y a 3 jours" },
  { id: "msg_p2", sender: "Maya Chen", body: "Hey ! Merci pour l’ajout, hâte de bosser là-dessus.", time: "Il y a 3 jours" },
  { id: "msg_p3", sender: "SoundMax", body: "Yo ! On commence par quoi ?", time: "Il y a 3 jours" },
  { id: "msg_p4", sender: "Moi", mine: true, body: "J’ai mis en ligne les premiers stems pour la structure.", time: "Hier" },
  { id: "msg_p5", sender: "SoundMax", body: "Je les regarde tout de suite.", time: "Hier" },
  { id: "msg_p6", sender: "SoundMax", body: "La rythmique est folle ! Je vais rajouter des nappes de synthé.", time: "Hier" },
  { id: "msg_p7", sender: "Maya Chen", body: "Moi je vais commencer à poser des voix témoins sur le refrain.", time: "Hier" },
  { id: "msg_p8", sender: "Moi", mine: true, body: "Nickel, essayez de synchroniser vos versions.", time: "Hier" },
  { id: "msg_p9", sender: "SoundMax", body: "J’ai un petit souci avec le mix du Kick, il bave un peu sur la basse.", time: "Il y a 5 h" },
  { id: "msg_p10", sender: "Lisa Music", body: "Je peux regarder ça si vous voulez, je suis dispo.", time: "Il y a 4 h 40" },
  { id: "msg_p11", sender: "Moi", mine: true, body: "Ah salut Lisa ! Carrément, ça nous aiderait bien.", time: "Il y a 4 h 30" },
  { id: "msg_p12", sender: "Maya Chen", body: "Lisa, tu pourras aussi checker les voix du pont ?", time: "Il y a 4 h 10" },
  { id: "msg_p13", sender: "Lisa Music", body: "Pas de souci, envoyez-moi le Track Pack mis à jour.", time: "Il y a 4 h" },
  { id: "msg_p14", sender: "SoundMax", body: "C’est envoyé !", time: "Il y a 3 h 45" },
  { id: "msg_p15", sender: "Lisa Music", body: "Bien reçu, je m’en occupe.", time: "Il y a 3 h 30" },
  { id: "msg_p16", sender: "Moi", mine: true, body: "On attend ton retour Lisa !", time: "Il y a 3 h 10" },
  { id: "msg_p17", sender: "Maya Chen", body: "Le drop est incroyable ! 🔥", time: "Il y a 2 h" },
  { id: "msg_p18", sender: "SoundMax", body: "J’ai ajouté les vocals et les FX. Écoutez et dites-moi ce que vous en pensez !", time: "Il y a 1 h" },
  { id: "msg_p19", sender: "Moi", mine: true, body: "Ça sonne vraiment pro maintenant.", time: "Il y a 50 min" },
  { id: "msg_p20", sender: "Lisa Music", body: "J’ai corrigé le Kick, c’est beaucoup plus propre.", time: "Il y a 40 min" },
  { id: "msg_p21", sender: "Maya Chen", body: "Merci Lisa ! C’est parfait.", time: "Il y a 30 min" },
  { id: "msg_p22", sender: "Moi", mine: true, body: "On valide la V1 ?", time: "Il y a 20 min" },
  { id: "msg_p23", sender: "SoundMax", body: "V1 validée pour moi !", time: "Il y a 15 min" },
  { id: "msg_p24", sender: "Maya Chen", body: "Pareil, validé !", time: "Il y a 10 min" },
  { id: "msg_p25", sender: "Moi", mine: true, body: "C’est parti pour le mixage final !", time: "Il y a 5 min" },
];

type ProjectFixtureBlueprint = ProjectWorkspaceInfo & {
  chatLead: string;
  chatReply: string;
  stems: Array<{ label: string; fileName: string; durationSeconds: number }>;
  tasks: Array<Pick<ProjectTask, "title" | "description" | "assignment" | "status">>;
};

const projectFixtureBlueprints: Record<string, ProjectFixtureBlueprint> = {
  project_1: {
    genre: "Trap / Drill cinématique", bpm: 140, musicalKey: "A minor", objective: "Finaliser le single et verrouiller une version radio avant le mastering.", delivery: "Sortie cible · fin février", milestone: "Validation du mix V3", completion: 78, notes: "La voix doit rester très proche au couplet, puis s’ouvrir sur le refrain.",
    chatLead: "Le mix V3 est prêt pour l’écoute collective.", chatReply: "Je valide la structure, il reste seulement les automations du pont.",
    stems: [], tasks: [],
  },
  project_2: {
    genre: "Tropical House / Pop", bpm: 110, musicalKey: "C major", objective: "Construire un EP lumineux de cinq titres avec une identité sonore continue.", delivery: "Pré-écoute label · 12 août", milestone: "Choisir le deuxième single", completion: 42, notes: "Garder les percussions organiques et éviter les synthés trop agressifs.",
    chatLead: "J’ai resserré le refrain du deuxième titre, il respire beaucoup mieux.", chatReply: "Parfait, je pose les harmonies vocales demain matin.",
    stems: [{ label: "Percussions", fileName: "summer_percussions.wav", durationSeconds: 248 }, { label: "Bass", fileName: "summer_bass.wav", durationSeconds: 248 }, { label: "Guitare", fileName: "summer_guitar.wav", durationSeconds: 244 }, { label: "Vocals", fileName: "summer_vocals.wav", durationSeconds: 228 }],
    tasks: [{ title: "Choisir le single", description: "Comparer les deux refrains finalistes.", assignment: "Vocal Queen", status: "inProgress" }, { title: "Réenregistrer les harmonies", description: "Doubler la tierce sur le dernier refrain.", assignment: "Vocal Queen", status: "todo" }, { title: "Préparer le pré-master", description: "Exporter la version label en 24 bits.", assignment: "DJ Nova", status: "todo" }],
  },
  project_3: {
    genre: "Acoustique / Soul", bpm: 86, musicalKey: "G major", objective: "Réinterpréter trois titres en prise live intime et naturelle.", delivery: "Captation live · 28 juillet", milestone: "Valider la prise guitare-voix", completion: 88, notes: "Conserver les respirations et les bruits de jeu qui donnent de la proximité.",
    chatLead: "La prise 4 est la plus vivante, même avec la petite respiration avant le pont.", chatReply: "On garde celle-là. Je nettoie seulement le bruit de chaise à 1:42.",
    stems: [{ label: "Guitare", fileName: "acoustic_guitar_take4.wav", durationSeconds: 218 }, { label: "Lead Vocal", fileName: "acoustic_lead.wav", durationSeconds: 218 }, { label: "Room", fileName: "acoustic_room.wav", durationSeconds: 218 }, { label: "Cello", fileName: "acoustic_cello.wav", durationSeconds: 210 }],
    tasks: [{ title: "Nettoyer la prise room", description: "Retirer le bruit à 1:42 sans perdre l’ambiance.", assignment: "Lisa Music", status: "inProgress" }, { title: "Étalonner la captation", description: "Créer une LUT chaude et naturelle.", assignment: "Maya Chen", status: "todo" }, { title: "Valider le générique", description: "Confirmer les crédits musiciens.", assignment: "Moi", status: "done" }],
  },
  project_4: {
    genre: "Hip-Hop archives", bpm: 92, musicalKey: "D minor", objective: "Trier les anciennes sessions et sélectionner deux beats à réactualiser.", delivery: "Archive interne", milestone: "Taguer les 24 meilleures boucles", completion: 64, notes: "Ne pas moderniser à outrance : garder le grain des samplers d’origine.",
    chatLead: "J’ai retrouvé la session originale de 2019 avec toutes les pistes séparées.", chatReply: "Excellent. Le sample de piano mérite vraiment une nouvelle batterie.",
    stems: [{ label: "Sample", fileName: "archive_sample_2019.wav", durationSeconds: 186 }, { label: "Drums", fileName: "archive_drums_2019.wav", durationSeconds: 186 }, { label: "Bass", fileName: "archive_bass_2019.wav", durationSeconds: 186 }, { label: "Texture", fileName: "archive_tape_noise.wav", durationSeconds: 186 }],
    tasks: [{ title: "Classer les sessions", description: "Ajouter année, tonalité et tempo.", assignment: "Moi", status: "inProgress" }, { title: "Nettoyer les samples", description: "Supprimer les clics sans perdre le grain.", assignment: "SoundMax", status: "todo" }, { title: "Sélectionner deux beats", description: "Préparer la shortlist pour le prochain projet.", assignment: "Moi", status: "todo" }],
  },
  project_5: {
    genre: "Freestyle / Boom bap", bpm: 96, musicalKey: "F minor", objective: "Préparer une session hebdomadaire spontanée mais techniquement solide.", delivery: "Session vendredi · 22 h", milestone: "Verrouiller la boucle d’ouverture", completion: 55, notes: "Laisser seize mesures libres après chaque refrain pour les passages improvisés.",
    chatLead: "La boucle d’ouverture est prête, j’ai laissé les seize mesures comme prévu.", chatReply: "Parfait, j’amène deux variantes de basse pour la session.",
    stems: [{ label: "Drums", fileName: "freestyle_drums_96.wav", durationSeconds: 192 }, { label: "Bass", fileName: "freestyle_bass_96.wav", durationSeconds: 192 }, { label: "Keys", fileName: "freestyle_keys_96.wav", durationSeconds: 192 }, { label: "Cuts", fileName: "freestyle_dj_cuts.wav", durationSeconds: 188 }],
    tasks: [{ title: "Préparer les variantes", description: "Exporter trois boucles de seize mesures.", assignment: "DJ Nova", status: "inProgress" }, { title: "Tester les micros", description: "Vérifier les quatre chaînes voix.", assignment: "Lisa Music", status: "todo" }, { title: "Partager le running order", description: "Définir l’ordre de passage du crew.", assignment: "Moi", status: "todo" }],
  },
  project_6: {
    genre: "Electro Remix", bpm: 128, musicalKey: "E minor", objective: "Livrer un remix club compétitif tout en conservant le hook original.", delivery: "Deadline concours · 5 jours", milestone: "Bounce final sans limiteur", completion: 71, notes: "Le règlement impose une durée maximale de 3:30 et le vocal original intact.",
    chatLead: "La version club tient maintenant en 3:24, on est dans les règles.", chatReply: "Je fais un dernier contrôle de phase puis on envoie le bounce.",
    stems: [{ label: "Kick", fileName: "remix_kick_128.wav", durationSeconds: 204 }, { label: "Bass", fileName: "remix_bass_128.wav", durationSeconds: 204 }, { label: "Lead", fileName: "remix_lead_128.wav", durationSeconds: 204 }, { label: "Original Vocal", fileName: "remix_original_vocal.wav", durationSeconds: 202 }],
    tasks: [{ title: "Contrôle de phase", description: "Vérifier kick et basse en mono.", assignment: "SoundMax", status: "inProgress" }, { title: "Exporter le master", description: "WAV 24 bits sans normalisation.", assignment: "Moi", status: "todo" }, { title: "Remplir le formulaire", description: "Ajouter crédits et liens sociaux.", assignment: "Maya Chen", status: "done" }],
  },
  project_7: {
    genre: "Dark R&B / Trap Soul", bpm: 74, musicalKey: "C# minor", objective: "Construire un album nocturne cohérent de douze titres et trois interludes.", delivery: "Écoute privée · octobre", milestone: "Verrouiller la tracklist A", completion: 36, notes: "La narration va de l’isolement vers la reconnexion; chaque interlude doit faire avancer cette trajectoire.",
    chatLead: "La roadmap est claire : on garde l’interlude juste avant le dernier titre.", chatReply: "Oui, ça rend la fin beaucoup plus forte. Je mets la tracklist à jour.",
    stems: [{ label: "Drums", fileName: "nocturne_drums_74.wav", durationSeconds: 238 }, { label: "Sub", fileName: "nocturne_sub_74.wav", durationSeconds: 238 }, { label: "Rhodes", fileName: "nocturne_rhodes.wav", durationSeconds: 236 }, { label: "Lead Vocal", fileName: "nocturne_lead_vocal.wav", durationSeconds: 226 }, { label: "Atmosphere", fileName: "nocturne_atmosphere.wav", durationSeconds: 238 }],
    tasks: [{ title: "Valider la tracklist", description: "Fixer l’ordre des douze titres.", assignment: "Toute l’équipe", status: "inProgress" }, { title: "Écrire l’interlude III", description: "Relier les titres 10 et 11.", assignment: "Maya Chen", status: "todo" }, { title: "Mixer les trois singles", description: "Créer une cohérence de niveau et d’espace.", assignment: "Lisa Music", status: "todo" }],
  },
  project_8: {
    genre: "Lo-Fi / Chillhop", bpm: 78, musicalKey: "Bb major", objective: "Produire une série de beats continus pour une chaîne vidéo de concentration.", delivery: "Premier épisode · septembre", milestone: "Assembler le mix de 30 minutes", completion: 49, notes: "Transitions invisibles, dynamique douce et aucune fréquence fatigante au casque.",
    chatLead: "J’ai enchaîné les six premiers beats sans blanc entre les morceaux.", chatReply: "La transition 4 vers 5 est parfaite, je retravaille seulement la fin.",
    stems: [{ label: "Dusty Drums", fileName: "lofi_dusty_drums.wav", durationSeconds: 168 }, { label: "Upright Bass", fileName: "lofi_upright_bass.wav", durationSeconds: 168 }, { label: "Rhodes", fileName: "lofi_rhodes.wav", durationSeconds: 168 }, { label: "Vinyl", fileName: "lofi_vinyl_texture.wav", durationSeconds: 168 }],
    tasks: [{ title: "Finaliser six beats", description: "Uniformiser les intros et outros.", assignment: "Moi", status: "inProgress" }, { title: "Créer l’animation loop", description: "Préparer une boucle vidéo de 12 secondes.", assignment: "PixelArt Studio", status: "todo" }, { title: "Normaliser les niveaux", description: "Cibler -14 LUFS pour la plateforme.", assignment: "Lisa Music", status: "todo" }],
  },
  project_9: {
    genre: "Live électronique", bpm: 122, musicalKey: "A major", objective: "Monter une captation live immersive du concert au Studio 44.", delivery: "Première vidéo · 30 août", milestone: "Synchroniser le multipiste et les caméras", completion: 83, notes: "Préserver l’énergie du public; corriger uniquement les défauts réellement gênants.",
    chatLead: "Le timecode caméra B est recalé, toutes les prises sont enfin synchrones.", chatReply: "Super. Je lance le premier montage du morceau d’ouverture.",
    stems: [{ label: "Live Drums", fileName: "berlin_live_drums.wav", durationSeconds: 286 }, { label: "Bass DI", fileName: "berlin_bass_di.wav", durationSeconds: 286 }, { label: "Synths", fileName: "berlin_synths.wav", durationSeconds: 286 }, { label: "Crowd", fileName: "berlin_crowd.wav", durationSeconds: 286 }],
    tasks: [{ title: "Synchroniser les caméras", description: "Aligner les quatre angles au timecode.", assignment: "PixelArt Studio", status: "done" }, { title: "Nettoyer les pistes live", description: "Réduire les repisses les plus fortes.", assignment: "Lisa Music", status: "inProgress" }, { title: "Choisir les plans du final", description: "Monter la dernière minute du concert.", assignment: "Maya Chen", status: "todo" }],
  },
  project_10: {
    genre: "Afro Pop / R&B", bpm: 104, musicalKey: "F# minor", objective: "Produire trois singles complémentaires pour présenter la nouvelle direction de Naya.", delivery: "Premier single · 6 septembre", milestone: "Valider les toplines du single 1", completion: 58, notes: "La voix de Naya reste le centre; les arrangements doivent soutenir sans surcharger.",
    chatLead: "La topline du refrain fonctionne, j’ai envoyé deux fins alternatives.", chatReply: "La deuxième fin est plus mémorable. Je pose les doubles ce soir.",
    stems: [{ label: "Afro Drums", fileName: "naya_afro_drums.wav", durationSeconds: 198 }, { label: "Bass", fileName: "naya_bass.wav", durationSeconds: 198 }, { label: "Guitars", fileName: "naya_guitars.wav", durationSeconds: 196 }, { label: "Lead Vocal", fileName: "naya_lead_vocal.wav", durationSeconds: 184 }],
    tasks: [{ title: "Valider la topline", description: "Choisir la fin du refrain.", assignment: "Vocal Queen", status: "inProgress" }, { title: "Éditer les doubles", description: "Aligner les doubles sans les rigidifier.", assignment: "Moi", status: "todo" }, { title: "Préparer la cover session", description: "Rassembler les références visuelles.", assignment: "PixelArt Studio", status: "todo" }],
  },
  project_11: {
    genre: "Compilation estivale", bpm: 116, musicalKey: "D major", objective: "Archiver la mixtape avec masters, crédits et versions instrumentales complètes.", delivery: "Projet archivé", milestone: "Compléter les métadonnées", completion: 96, notes: "Conserver les versions originales publiées et documenter toutes les autorisations.",
    chatLead: "Il manque seulement les crédits du titre 7 dans le dossier final.", chatReply: "Je les récupère auprès du guitariste et je clos l’archive.",
    stems: [{ label: "Master", fileName: "mixtape_master.wav", durationSeconds: 224 }, { label: "Instrumental", fileName: "mixtape_instrumental.wav", durationSeconds: 224 }, { label: "Acapella", fileName: "mixtape_acapella.wav", durationSeconds: 220 }, { label: "TV Mix", fileName: "mixtape_tv_mix.wav", durationSeconds: 224 }],
    tasks: [{ title: "Compléter les crédits", description: "Ajouter le guitariste du titre 7.", assignment: "Moi", status: "inProgress" }, { title: "Vérifier les masters", description: "Comparer les checksums de l’archive.", assignment: "Lisa Music", status: "done" }, { title: "Exporter le catalogue", description: "Créer le PDF récapitulatif.", assignment: "PixelArt Studio", status: "todo" }],
  },
  project_12: {
    genre: "UK Drill", bpm: 142, musicalKey: "G minor", objective: "Créer un titre bilingue France–UK avec deux flows réellement complémentaires.", delivery: "Session Londres · 2 semaines", milestone: "Valider le beat switch", completion: 47, notes: "Le beat switch doit arriver après le couplet français et ouvrir l’espace au flow anglais.",
    chatLead: "Le beat switch à 1:18 change complètement l’énergie, c’est le bon endroit.", chatReply: "Validé. Je réécris mes quatre dernières mesures pour mieux l’annoncer.",
    stems: [{ label: "Drums", fileName: "uk_drill_drums_142.wav", durationSeconds: 176 }, { label: "808", fileName: "uk_drill_808.wav", durationSeconds: 176 }, { label: "Bell", fileName: "uk_drill_bell.wav", durationSeconds: 176 }, { label: "French Vocal", fileName: "uk_drill_fr_vocal.wav", durationSeconds: 162 }, { label: "UK Vocal", fileName: "uk_drill_uk_vocal.wav", durationSeconds: 158 }],
    tasks: [{ title: "Valider le beat switch", description: "Écouter la transition à 1:18.", assignment: "Toute l’équipe", status: "inProgress" }, { title: "Réécrire quatre mesures", description: "Préparer l’arrivée du deuxième couplet.", assignment: "Maya Chen", status: "todo" }, { title: "Réserver la session", description: "Confirmer le studio à Londres.", assignment: "DJ Nova", status: "done" }],
  },
};

function generatedProjectMessages(project: ProjectWorkspaceItem, blueprint: ProjectFixtureBlueprint, index: number): ProjectChatMessage[] {
  if (project.id === "project_1") return flutterProjectMessages.map((message) => ({ ...message }));
  const collaborators = (project.memberDetails ?? []).filter((member) => member.id !== "current_user");
  const lead = collaborators[0]?.name ?? "L’équipe";
  const second = collaborators[1]?.name ?? lead;
  const prefix = project.id + "_message_";
  return [
    { id: prefix + "system", sender: "Système", system: true, body: `${project.name} a été connecté à son espace de production`, time: project.createdAt ?? "Récemment" },
    { id: prefix + "1", sender: "Moi", mine: true, body: `Bienvenue dans le chat de ${project.name}. On centralise toutes les décisions ici.`, time: "Il y a 2 jours" },
    { id: prefix + "2", sender: lead, body: blueprint.chatLead, time: "Hier" },
    { id: prefix + "3", sender: "Moi", mine: true, body: `Objectif actuel : ${blueprint.milestone}.`, time: "Hier" },
    { id: prefix + "4", sender: second, body: blueprint.chatReply, time: "Il y a 3 h" },
    { id: prefix + "5", sender: "Moi", mine: true, body: `Parfait. J’ai mis à jour les stems et les tâches de ${project.name}.`, time: `${index + 4} min` },
  ];
}

function generatedProjectMix(project: ProjectWorkspaceItem, blueprint: ProjectFixtureBlueprint, index: number): ProjectMix {
  const takeId = `${project.id}_take_1`;
  const stems: ProjectStem[] = blueprint.stems.map((stem, stemIndex) => ({
    id: `${project.id}_stem_${stemIndex + 1}`,
    ...stem,
    ...demoTrackPackAudio(stem.label),
    bpm: blueprint.bpm,
    musicalKey: blueprint.musicalKey,
    order: stemIndex,
    addedBy: (project.memberDetails ?? [])[stemIndex % Math.max(project.memberDetails?.length ?? 1, 1)]?.id ?? "current_user",
  }));
  return {
    id: `${project.id}_mix_1`,
    name: project.status === "archived" ? "Mix archivé" : "Mix Principal",
    currentTakeId: takeId,
    isDefault: true,
    takes: [{
      id: takeId,
      version: Math.max(project.takeVersion ?? 1, 1),
      description: blueprint.milestone,
      stems,
      createdBy: project.creatorId ?? "current_user",
      createdLabel: index % 2 === 0 ? "Mis à jour hier" : "Mis à jour cette semaine",
      changes: { added: stems.map((stem) => stem.id), removed: [], modified: [] },
    }],
  };
}

function generatedProjectTasks(project: ProjectWorkspaceItem, blueprint: ProjectFixtureBlueprint): ProjectTask[] {
  return blueprint.tasks.map((task, index) => ({
    id: `${project.id}_task_${index + 1}`,
    ...task,
    deadline: index === 0 ? (project.deadline ?? blueprint.delivery) : undefined,
  }));
}

function hydrateProjectFixture(project: ProjectWorkspaceItem, index: number): ProjectWorkspaceItem {
  const blueprint = projectFixtureBlueprints[project.id];
  if (!blueprint) return project;
  const mixes = project.mixes && project.mixes.length > 0 ? cloneMixes(project.mixes) : [generatedProjectMix(project, blueprint, index)];
  const currentMix = mixes.find((mix) => mix.id === project.currentMixId) ?? mixes.find((mix) => mix.isDefault) ?? mixes[0];
  const currentTake = getTake(currentMix, currentMix?.currentTakeId);
  const tasks = project.id === "project_1" ? (project.tasks ?? []).map((task) => ({ ...task })) : generatedProjectTasks(project, blueprint);
  return {
    ...project,
    messages: generatedProjectMessages(project, blueprint, index),
    mixes,
    currentMixId: currentMix?.id,
    takeVersion: currentTake?.version ?? project.takeVersion ?? 1,
    stemCount: currentTake?.stems.length ?? 0,
    tasks,
    newTasks: tasks.filter((task) => task.status !== "done").length,
    workspaceInfo: {
      genre: blueprint.genre,
      bpm: blueprint.bpm,
      musicalKey: blueprint.musicalKey,
      objective: blueprint.objective,
      delivery: blueprint.delivery,
      milestone: blueprint.milestone,
      completion: blueprint.completion,
      notes: blueprint.notes,
    },
  };
}

const flutterProjects: ProjectWorkspaceItem[] = flutterProjectSeeds.map(hydrateProjectFixture);

function statusLabel(status: ProjectStatus) {
  if (status === "completed") return "Terminé";
  if (status === "archived") return "Archivé";
  return "En cours";
}

function taskStatusLabel(status: TaskStatus) {
  if (status === "inProgress") return "En cours";
  if (status === "done") return "Terminée";
  return "À faire";
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return minutes + ":" + String(Math.floor(seconds % 60)).padStart(2, "0");
}

function cloneMixes(mixes: ProjectMix[] = []): ProjectMix[] {
  return mixes.map((mix) => ({
    ...mix,
    takes: mix.takes.map((take) => ({
      ...take,
      stems: take.stems.map((stem) => ({ ...stem })),
      changes: take.changes
        ? {
            added: [...take.changes.added],
            removed: [...take.changes.removed],
            modified: [...take.changes.modified],
          }
        : undefined,
    })),
  }));
}

let projectSessionItems: ProjectWorkspaceItem[] | null = null;

function cloneProjectItems(projects: ProjectWorkspaceItem[]) {
  return projects.map((project) => ({
    ...project,
    memberDetails: project.memberDetails?.map((member) => ({ ...member, permissions: { ...member.permissions } })),
    mixes: cloneMixes(project.mixes),
    tasks: project.tasks?.map((task) => ({ ...task })),
    feedbacks: project.feedbacks?.map((feedback) => ({ ...feedback, replies: feedback.replies.map((reply) => ({ ...reply })) })),
    messages: project.messages?.map((message) => ({ ...message })),
    workspaceInfo: project.workspaceInfo ? { ...project.workspaceInfo } : undefined,
  }));
}

export function getInitialProjectItemsSnapshot() {
  return cloneProjectItems(projectSessionItems ?? flutterProjects);
}

function getTake(mix: ProjectMix | undefined, takeId?: string) {
  if (!mix || mix.takes.length === 0) return undefined;
  return mix.takes.find((take) => take.id === takeId)
    ?? mix.takes.find((take) => take.id === mix.currentTakeId)
    ?? mix.takes[mix.takes.length - 1];
}

function getCurrentMix(project: ProjectWorkspaceItem) {
  const mixes = project.mixes ?? [];
  return mixes.find((mix) => mix.id === project.currentMixId)
    ?? mixes.find((mix) => mix.isDefault)
    ?? mixes[0];
}

function makeSilentWav(durationSeconds: number) {
  const sampleRate = 8000;
  const duration = Math.max(1, Math.round(durationSeconds));
  const dataLength = sampleRate * duration;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  write(36, "data");
  view.setUint32(40, dataLength, true);
  new Uint8Array(buffer, 44).fill(128);
  return new Blob([buffer], { type: "audio/wav" });
}

function downloadSilentStem(stem: ProjectStem) {
  const url = URL.createObjectURL(makeSilentWav(stem.durationSeconds));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = stem.fileName.replace(/\.[^.]+$/, "") + ".wav";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function Modal({
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="mwp-modal-layer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section className={"mwp-modal" + (wide ? " mwp-modal--wide" : "")} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h3>{title}</h3>
          <button type="button" onClick={onClose} aria-label={"Fermer " + title}><X size={18} /></button>
        </header>
        <div className="mwp-modal__body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </section>
    </div>
  );
}

function ConfirmModal({
  title,
  description,
  confirmLabel,
  danger,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="mw-button mw-button--quiet" onClick={onClose}>Annuler</button>
          <button type="button" className={"mw-button " + (danger ? "mwp-button--danger" : "mw-button--primary")} onClick={onConfirm}>{confirmLabel}</button>
        </>
      )}
    >
      <p className="mwp-confirm-copy">{description}</p>
    </Modal>
  );
}

type ProjectDraft = {
  name: string;
  description: string;
  genre: string;
  bpm: string;
  deadline: string;
  cover: string;
  memberIds: string[];
  permissions: Record<string, MemberPermissions>;
  groupId?: string;
};

const wizardSteps = ["Infos", "Membres", "Permissions", "Confirmer"];
const wizardPermissionLabels: Array<[PermissionKey, string]> = [
  ["canEdit", "Éditer"],
  ["canInvite", "Inviter"],
  ["canManageStems", "Stems"],
  ["canCreateTasks", "Tâches"],
];

function initialDraft(name = "", groupId?: string): ProjectDraft {
  return {
    name,
    description: "",
    genre: "",
    bpm: "",
    deadline: "",
    cover: "",
    memberIds: [],
    permissions: {},
    groupId,
  };
}

function formatDeadline(value: string) {
  if (!value) return "Sans deadline";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    .format(new Date(value + "T12:00:00"));
}

function ProjectWizard({
  onClose,
  onCreate,
  onCreateDraft,
  inviteCandidates = [],
  searchInviteCandidates,
  initialName,
  groupId,
}: {
  onClose: () => void;
  onCreate: (project: ProjectWorkspaceItem) => void;
  onCreateDraft?: (draft: ProjectDraft) => Promise<void>;
  inviteCandidates?: ProjectsWorkspaceInviteCandidate[];
  searchInviteCandidates?: (query: string) => void | Promise<unknown>;
  initialName?: string;
  groupId?: string;
}) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ProjectDraft>(() => initialDraft(initialName, groupId));
  const [allCanEdit, setAllCanEdit] = useState(true);
  const [allCanInvite, setAllCanInvite] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [contactQuery, setContactQuery] = useState("");
  const liveMode = Boolean(onCreateDraft);
  const availableContacts = liveMode ? inviteCandidates.map(inviteCandidateToContact) : mockUsers;
  const selectedContacts = availableContacts.filter((contact) => draft.memberIds.includes(contact.id));
  const canContinue = step !== 0 || draft.name.trim().length > 0;

  useEffect(() => {
    if (!liveMode || step !== 1 || !searchInviteCandidates || contactQuery.trim().length < 2) return undefined;
    const timer = window.setTimeout(() => {
      void Promise.resolve(searchInviteCandidates(contactQuery.trim())).catch(() => undefined);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [contactQuery, liveMode, searchInviteCandidates, step]);

  const updateDraft = <K extends keyof ProjectDraft>(key: K, value: ProjectDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const toggleMember = (id: string) => {
    setDraft((current) => {
      const selected = current.memberIds.includes(id);
      const memberIds = selected
        ? current.memberIds.filter((memberId) => memberId !== id)
        : [...current.memberIds, id];
      const permissions = { ...current.permissions };
      if (selected) {
        delete permissions[id];
      } else {
        permissions[id] = {
          ...permissionsStandard,
          canEdit: allCanEdit,
          canManageStems: allCanEdit,
          canInvite: allCanInvite,
        };
      }
      return { ...current, memberIds, permissions };
    });
  };

  const togglePermission = (memberId: string, permission: PermissionKey) => {
    setDraft((current) => ({
      ...current,
      permissions: {
        ...current.permissions,
        [memberId]: {
          ...(current.permissions[memberId] ?? permissionsStandard),
          [permission]: !(current.permissions[memberId]?.[permission] ?? false),
        },
      },
    }));
  };

  const setGlobalPermission = (permission: "edit" | "invite", enabled: boolean) => {
    if (permission === "edit") setAllCanEdit(enabled);
    else setAllCanInvite(enabled);
    setDraft((current) => {
      const permissions = { ...current.permissions };
      current.memberIds.forEach((id) => {
        permissions[id] = {
          ...(permissions[id] ?? permissionsStandard),
          ...(permission === "edit"
            ? { canEdit: enabled, canManageStems: enabled }
            : { canInvite: enabled }),
        };
      });
      return { ...current, permissions };
    });
  };

  const loadCover = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") updateDraft("cover", reader.result);
    });
    reader.readAsDataURL(file);
  };

  const createProject = async () => {
    if (onCreateDraft) {
      setSubmitting(true);
      setSubmitError(null);
      try {
        await onCreateDraft(draft);
      } catch (error) {
        setSubmitError(error instanceof Error ? error.message : "Impossible de créer le projet.");
      } finally {
        setSubmitting(false);
      }
      return;
    }
    const memberDetails: ProjectMember[] = [
      {
        ...memberDirectory.current_user,
        permissions: { ...permissionsAll },
        creator: true,
      },
      ...selectedContacts.map((contact, index) => ({
        ...contact,
        memberId: "pm_new_" + contact.id + "_" + index,
        permissions: { ...(draft.permissions[contact.id] ?? permissionsStandard) },
      })),
    ];
    const now = Date.now();
    const mixId = "mix_new_" + now;
    const takeId = "take_new_" + now;
    const bpm = Number(draft.bpm) || 120;
    const project: ProjectWorkspaceItem = {
      id: "project_new_" + now,
      name: draft.name.trim(),
      description: draft.description.trim(),
      cover: draft.cover,
      status: "inProgress",
      members: memberDetails.length,
      deadline: draft.deadline ? formatDeadline(draft.deadline) : undefined,
      createdAt: "Aujourd’hui",
      creatorId: "current_user",
      stemCount: 0,
      unreadMessages: 0,
      newStems: 0,
      hasNewTake: false,
      newTasks: 0,
      currentMixId: mixId,
      memberDetails,
      mixes: [{
        id: mixId,
        name: "Mix Principal",
        currentTakeId: takeId,
        takes: [{
          id: takeId,
          version: 1,
          description: "Espace de stems initial",
          stems: [],
          createdBy: "current_user",
          createdLabel: "Aujourd’hui",
        }],
        isDefault: true,
      }],
      tasks: [{
        id: "task_new_" + now,
        title: "Définir la première étape",
        description: "Préciser le prochain livrable avec l’équipe.",
        assignment: "Moi",
        status: "todo",
      }],
      feedbacks: [],
      messages: [
        { id: "message_new_system_" + now, sender: "Système", system: true, body: `${draft.name.trim()} a été créé`, time: "Aujourd’hui" },
        { id: "message_new_welcome_" + now, sender: "Moi", mine: true, body: `Bienvenue dans le chat de ${draft.name.trim()}. On centralise ici les décisions du projet.`, time: "À l’instant" },
      ],
      workspaceInfo: {
        genre: draft.genre || "À définir",
        bpm,
        musicalKey: "À définir",
        objective: draft.description.trim() || "Définir la direction artistique et le premier livrable.",
        delivery: draft.deadline ? formatDeadline(draft.deadline) : "À planifier",
        milestone: "Premier point d’équipe",
        completion: 5,
        notes: "Cet espace est prêt à recevoir les stems, tâches et décisions du projet.",
      },
      groupId: draft.groupId,
    };
    onCreate(project);
  };

  return (
    <div
      className="mw-layer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section className="mw-project-wizard" role="dialog" aria-modal="true" aria-labelledby="mw-project-wizard-title">
        <header className="mw-project-wizard__header">
          <div>
            <span>Créer un projet</span>
            <h3 id="mw-project-wizard-title">Nouvel espace de travail</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer la création"><X size={20} /></button>
        </header>

        <ol className="mw-project-wizard__steps">
          {wizardSteps.map((label, index) => (
            <li key={label} className={index === step ? "is-current" : index < step ? "is-complete" : ""}>
              <span>{index < step ? <Check size={14} /> : index + 1}</span>
              <small>{label}</small>
            </li>
          ))}
        </ol>

        <div className="mw-project-wizard__body">
          {step === 0 && (
            <div className="mw-wizard-grid mw-wizard-grid--infos">
              <div className="mw-cover-picker">
                {draft.cover
                  ? <img src={draft.cover} alt="Aperçu de la couverture" />
                  : <span className="mwp-wizard-cover-empty"><Music2 size={36} /><small>Couverture facultative</small></span>}
                {liveMode ? (
                  <small className="mw-wizard-note">La couverture sera disponible après le câblage du stockage média.</small>
                ) : (
                  <>
                    <label className="mw-button mw-button--quiet">
                      <Upload size={15} /> Choisir une image
                      <input type="file" accept="image/*" onChange={(event) => loadCover(event.target.files?.[0])} />
                    </label>
                    {draft.cover && <button type="button" className="mwp-text-action" onClick={() => updateDraft("cover", "")}>Retirer l’image</button>}
                  </>
                )}
              </div>
              <div className="mw-form-stack">
                <label><span>Nom du projet *</span><input value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} placeholder="Nom du projet" autoFocus /></label>
                <label><span>Description (optionnel)</span><textarea value={draft.description} onChange={(event) => updateDraft("description", event.target.value)} placeholder="Décrivez votre projet..." rows={3} /></label>
                <div className="mw-form-row">
                  <label><span>Genre</span><input value={draft.genre} onChange={(event) => updateDraft("genre", event.target.value)} placeholder="Ex: Hip-Hop, R&B..." /></label>
                  <label><span>BPM</span><input value={draft.bpm} onChange={(event) => updateDraft("bpm", event.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" placeholder="Ex: 120" /></label>
                </div>
                <label><span>Deadline (optionnel)</span><input type="date" value={draft.deadline} onChange={(event) => updateDraft("deadline", event.target.value)} /></label>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="mw-wizard-section">
              <span className="mw-wizard-section__kicker"><Users size={16} /> Membres</span>
              <h4>Inviter des membres</h4>
              <p>Vous pourrez toujours en ajouter plus tard.</p>
              {liveMode && <label className="mwp-contact-search"><Search size={16} /><input value={contactQuery} onChange={(event) => setContactQuery(event.target.value)} placeholder="Rechercher un artiste par nom ou @identifiant" /></label>}
              <div className="mw-members-grid">
                {availableContacts.map((contact) => {
                  const selected = draft.memberIds.includes(contact.id);
                  return (
                    <button key={contact.id} type="button" className={selected ? "is-selected" : ""} onClick={() => toggleMember(contact.id)} aria-pressed={selected}>
                      <span className="mwp-member-avatar-wrap"><img src={contact.avatar} alt="" />{contact.online && <i />}</span>
                      <span><strong>{contact.name}</strong><small>{contact.role}</small></span>
                      <i>{selected ? <Check size={15} /> : <Plus size={15} />}</i>
                    </button>
                  );
                })}
              </div>
              {liveMode && availableContacts.length === 0 && (
                <div className="mw-wizard-note">{contactQuery.trim().length < 2 ? "Saisis au moins 2 caractères pour rechercher un artiste." : "Aucun artiste trouvé. Le projet peut être créé en solo."}</div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="mw-wizard-section">
              <span className="mw-wizard-section__kicker"><ShieldCheck size={16} /> Permissions</span>
              <h4>Configurez ce que chaque membre peut faire</h4>
              <div className="mwp-global-permissions">
                <button type="button" className={allCanEdit ? "is-active" : ""} onClick={() => setGlobalPermission("edit", !allCanEdit)} aria-pressed={allCanEdit}>
                  <span><strong>Tous peuvent éditer</strong><small>Modifier les stems et créer des Takes</small></span>
                  <i>{allCanEdit ? "Oui" : "Non"}</i>
                </button>
                <button type="button" className={allCanInvite ? "is-active" : ""} onClick={() => setGlobalPermission("invite", !allCanInvite)} aria-pressed={allCanInvite}>
                  <span><strong>Tous peuvent inviter</strong><small>Ajouter de nouveaux membres</small></span>
                  <i>{allCanInvite ? "Oui" : "Non"}</i>
                </button>
              </div>
              {selectedContacts.length === 0 ? (
                <div className="mw-wizard-note">Projet solo : aucune permission individuelle.</div>
              ) : (
                <>
                  <h5 className="mwp-permission-heading">Permissions individuelles</h5>
                  <div className="mw-permission-list">
                    {selectedContacts.map((contact) => (
                      <article key={contact.id}>
                        <img src={contact.avatar} alt="" />
                        <span><strong>{contact.name}</strong><small>{contact.role}</small></span>
                        <div>
                          {wizardPermissionLabels.map(([permission, label]) => {
                            const enabled = draft.permissions[contact.id]?.[permission] ?? false;
                            return <button key={permission} type="button" className={enabled ? "is-active" : ""} onClick={() => togglePermission(contact.id, permission)} aria-pressed={enabled}>{label}</button>;
                          })}
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="mw-confirmation">
              {draft.cover
                ? <img src={draft.cover} alt="" />
                : <span className="mwp-wizard-cover-empty"><Music2 size={42} /></span>}
              <div>
                <span className="mw-wizard-section__kicker"><CheckCircle2 size={16} /> Confirmation</span>
                <h4>{draft.name}</h4>
                {draft.description && <p>{draft.description}</p>}
                <dl>
                  <div><dt>Nom</dt><dd>{draft.name}</dd></div>
                  <div><dt>Membres</dt><dd>{selectedContacts.length === 0 ? "Projet solo" : String(selectedContacts.length + 1) + " (vous + " + selectedContacts.length + ")"}</dd></div>
                  {draft.deadline && <div><dt>Deadline</dt><dd>{formatDeadline(draft.deadline)}</dd></div>}
                </dl>
                {selectedContacts.length > 0 && <div className="mw-confirmation__members">{selectedContacts.map((contact) => <span key={contact.id}><img src={contact.avatar} alt="" />{contact.name}</span>)}</div>}
              </div>
            </div>
          )}
        </div>

        <footer className="mw-project-wizard__footer">
          {submitError && <span className="mw-wizard-note" role="alert">{submitError}</span>}
          {step > 0 ? <button type="button" className="mw-button mw-button--quiet" onClick={() => setStep((current) => current - 1)}><ChevronLeft size={16} /> Précédent</button> : <span />}
          {step < wizardSteps.length - 1 ? (
            <button type="button" className="mw-button mw-button--primary" disabled={!canContinue} onClick={() => setStep((current) => current + 1)}>Suivant <ChevronRight size={16} /></button>
          ) : (
            <button type="button" className="mw-button mw-button--primary" onClick={() => void createProject()} disabled={submitting}><Check size={16} /> {submitting ? "Création…" : "Créer le projet"}</button>
          )}
        </footer>
      </section>
    </div>
  );
}

function ProjectChatPanel({
  project,
  onProjectChange,
  live,
}: {
  project: ProjectWorkspaceItem;
  onProjectChange: (project: ProjectWorkspaceItem) => void;
  live?: {
    sendText: (body: string) => Promise<unknown>;
    pending: boolean;
    error?: string | null;
  };
}) {
  const messages = project.messages ?? [];
  const [draft, setDraft] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  const appendMessage = (body: string) => {
    onProjectChange({
      ...project,
      messages: [
        ...messages,
        {
        id: "project_message_" + Date.now(),
        sender: "Moi",
        mine: true,
        body,
        time: new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date()),
        },
      ],
      unreadMessages: 0,
    });
    window.setTimeout(() => messagesEndRef.current?.scrollIntoView({ block: "end" }), 0);
    void playMessageSound("send");
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    if (live) {
      try {
        await live.sendText(body);
        setDraft("");
        void playMessageSound("send");
      } catch {
        // Le contrôleur expose l'erreur utilisateur; le brouillon reste intact pour réessayer.
      }
      return;
    }
    appendMessage(body);
    setDraft("");
  };

  const openAttachmentPicker = (accept: string) => {
    if (!attachmentInputRef.current) return;
    attachmentInputRef.current.accept = accept;
    attachmentInputRef.current.click();
  };

  const attachFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    appendMessage(`📎 ${file.name}`);
    event.target.value = "";
  };

  return (
    <section className="mw-chat-scene mwp-project-chat">
      <div className="mw-chat-timeline mwp-project-chat__timeline">
        <div className="mw-chat-timeline__inner mwp-project-chat__messages">
          {messages.map((message) => {
            if (message.system) {
              return <p key={message.id} className="mwp-project-chat__system">{message.body}</p>;
            }
            return (
              <article
                key={message.id}
                className={`mw-message is-family-conversation has-tail ${message.mine ? "is-mine" : "is-theirs"}`}
              >
                {!message.mine && <strong className="mwp-project-chat__sender">{message.sender}</strong>}
                <div className="mw-bubble mw-bubble--text">
                  <p><MeeWavRichText>{message.body}</MeeWavRichText></p>
                </div>
                <div className="mw-message__meta">
                  <span className="mw-message__time">{message.time}</span>
                </div>
              </article>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>
      <div className="mw-composer-zone mwp-project-chat__composer-zone">
        <div className="mw-composer-row">
          <form className="mw-composer mwp-project-chat__composer" onSubmit={(event) => void sendMessage(event)}>
            <button type="button" disabled={Boolean(live)} title={live ? "Pièces jointes bientôt disponibles dans les projets" : undefined} onClick={() => openAttachmentPicker("image/*,video/*,audio/*,application/pdf")} aria-label="Ajouter une pièce jointe">
              <Paperclip />
            </button>
            <MeeWavEmoticonComposer value={draft} onChange={setDraft} maxLength={4_000} placeholder="Écris ton message..." ariaLabel="Message du projet" />
            <MeeWavEmoticonPicker triggerIcon={<Smile aria-hidden="true" />} onSelect={(emoticon) => setDraft((value) => appendMeeWavEmoticon(value, emoticon.name, 4_000))} />
            <button type="button" disabled={Boolean(live)} title={live ? "Contenus musicaux bientôt disponibles dans les projets" : undefined} onClick={() => openAttachmentPicker("audio/*")} aria-label="Ajouter un contenu musical">
              <Music2 />
            </button>
            <button type="button" disabled={Boolean(live)} title={live ? "Notes vocales bientôt disponibles dans les projets" : undefined} onClick={() => openAttachmentPicker("audio/*")} aria-label="Ajouter une note vocale">
              <Mic />
            </button>
            <button
              type="submit"
              className={`mw-composer-send${draft.trim() ? " is-ready" : ""}`}
              aria-label="Envoyer le message"
              disabled={live?.pending || !draft.trim()}
            >
              <Send />
            </button>
          </form>
        </div>
        {!live && <input ref={attachmentInputRef} type="file" onChange={attachFile} hidden />}
        {live?.error && <small className="mw-wizard-note" role="alert">{live.error}</small>}
      </div>
    </section>
  );
}

function ProjectTasksPanel({
  project,
  onProjectChange,
  live,
}: {
  project: ProjectWorkspaceItem;
  onProjectChange: (project: ProjectWorkspaceItem) => void;
  live?: {
    upsertTask: (task: ProjectTask) => Promise<unknown>;
    deleteTask: (taskId: string) => Promise<unknown>;
    canMutate: boolean;
    pending: boolean;
    error?: string | null;
  };
}) {
  const [filter, setFilter] = useState<"all" | TaskStatus>("all");
  const [selectedTask, setSelectedTask] = useState<ProjectTask | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const tasks = project.tasks ?? [];
  const filteredTasks = filter === "all" ? tasks : tasks.filter((task) => task.status === filter);

  const commitTasks = (next: ProjectTask[]) => {
    onProjectChange({
      ...project,
      tasks: next,
      newTasks: next.filter((task) => task.status !== "done").length,
    });
  };

  const toggleTask = (taskId: string) => {
    if (live && !live.canMutate) return;
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task) return;
    const nextTask: ProjectTask = { ...task, status: task.status === "done" ? "todo" : "done" };
    if (live) {
      void live.upsertTask(nextTask).catch(() => undefined);
      return;
    }
    commitTasks(tasks.map((candidate) => candidate.id === taskId ? nextTask : candidate));
  };

  const cycleStatus = (taskId: string) => {
    if (live && !live.canMutate) return;
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task) return;
    const status: TaskStatus = task.status === "todo"
      ? "inProgress"
      : task.status === "inProgress"
          ? "done"
          : "todo";
    const nextTask = { ...task, status };
    if (live) {
      void live.upsertTask(nextTask).catch(() => undefined);
      return;
    }
    commitTasks(tasks.map((candidate) => candidate.id === taskId ? nextTask : candidate));
  };

  const createTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (live && !live.canMutate) return;
    const title = newTitle.trim();
    if (!title) return;
    const task: ProjectTask = {
      id: live ? createMessagingProjectTaskId() : "task_new_" + Date.now(),
      title,
      description: newDescription.trim() || undefined,
      assignment: "Non assigné",
      status: "todo",
    };
    if (live) await live.upsertTask(task);
    else commitTasks([...tasks, task]);
    setNewTitle("");
    setNewDescription("");
    setCreateOpen(false);
  };

  const deleteSelectedTask = async () => {
    if (!selectedTask) return;
    if (live) await live.deleteTask(selectedTask.id);
    else commitTasks(tasks.filter((task) => task.id !== selectedTask.id));
    setSelectedTask(null);
  };

  const filters: Array<["all" | TaskStatus, string]> = [
    ["all", "Toutes"],
    ["todo", "À faire"],
    ["inProgress", "En cours"],
    ["done", "Terminées"],
  ];

  return (
    <section className="mwp-project-tasks">
      <header>
        <nav aria-label="Filtrer les tâches">
          {filters.map(([id, label]) => {
            const count = id === "all" ? tasks.length : tasks.filter((task) => task.status === id).length;
            return (
              <button key={id} type="button" className={filter === id ? "is-active" : ""} onClick={() => setFilter(id)} aria-pressed={filter === id}>
                {label}<i>{count}</i>
              </button>
            );
          })}
        </nav>
        <button type="button" className="mw-button mw-button--primary" disabled={live?.pending || (live ? !live.canMutate : false)} onClick={() => setCreateOpen(true)}><Plus size={15} /> Nouvelle tâche</button>
      </header>

      {filteredTasks.length === 0 ? (
        <div className="mwp-empty-panel"><ListChecks size={38} /><strong>{filter === "all" ? "Aucune tâche" : "Aucune tâche dans ce filtre"}</strong></div>
      ) : (
        <div className="mwp-task-list">
          {filteredTasks.map((task) => (
            <article key={task.id} className={"is-" + task.status}>
              <button type="button" className="mwp-task-check" disabled={live ? !live.canMutate : false} onClick={() => toggleTask(task.id)} aria-label={task.status === "done" ? "Remettre la tâche à faire" : "Marquer la tâche comme terminée"}>
                {task.status === "done" ? <Check size={15} /> : null}
              </button>
              <button type="button" className="mwp-task-copy" onClick={() => setSelectedTask(task)}>
                <strong>{task.title}</strong>
                {task.description && <span>{task.description}</span>}
                <small>{task.assignment}{task.deadline ? " · " + task.deadline : ""}</small>
              </button>
              <button type="button" className="mwp-task-status" disabled={live ? !live.canMutate : false} onClick={() => cycleStatus(task.id)}>{taskStatusLabel(task.status)}</button>
            </article>
          ))}
        </div>
      )}

      {selectedTask && (
        <Modal
          title={selectedTask.title}
          onClose={() => setSelectedTask(null)}
          footer={<button type="button" className="mw-button mwp-button--danger" disabled={live?.pending || (live ? !live.canMutate : false)} onClick={() => void deleteSelectedTask().catch(() => undefined)}><Trash2 size={15} /> Supprimer la tâche</button>}
        >
          {selectedTask.description && <p className="mwp-modal-description">{selectedTask.description}</p>}
          <dl className="mwp-fact-list">
            <div><dt>Assignation</dt><dd>{selectedTask.assignment}</dd></div>
            <div><dt>Statut</dt><dd>{taskStatusLabel(selectedTask.status)}</dd></div>
            {selectedTask.deadline && <div><dt>Deadline</dt><dd>{selectedTask.deadline}</dd></div>}
          </dl>
        </Modal>
      )}

      {createOpen && (
        <Modal
          title="Nouvelle tâche"
          onClose={() => setCreateOpen(false)}
          footer={(
            <>
              <button type="button" className="mw-button mw-button--quiet" onClick={() => setCreateOpen(false)}>Annuler</button>
              <button type="submit" form="mwp-create-task" className="mw-button mw-button--primary" disabled={!newTitle.trim()}>Créer</button>
            </>
          )}
        >
          <form id="mwp-create-task" className="mwp-form" onSubmit={(event) => void createTask(event).catch(() => undefined)}>
            <label><span>Titre de la tâche</span><input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} autoFocus /></label>
            <label><span>Description (optionnel)</span><textarea value={newDescription} onChange={(event) => setNewDescription(event.target.value)} rows={4} /></label>
          </form>
          {live?.error && <p className="mw-wizard-note" role="alert">{live.error}</p>}
        </Modal>
      )}
    </section>
  );
}

const feedbackTypeMeta: Record<FeedbackType, { label: string; icon: string }> = {
  technical: { label: "Technique", icon: "🔧" },
  creative: { label: "Créatif", icon: "🎨" },
  validation: { label: "Validation", icon: "✅" },
  question: { label: "Question", icon: "❓" },
};

const feedbackStatusLabels: Record<FeedbackStatus, string> = {
  open: "Ouvert",
  inProgress: "En cours",
  resolved: "Résolu",
};

function FeedbackModal({
  project,
  stem,
  takeId,
  onProjectChange,
  onClose,
}: {
  project: ProjectWorkspaceItem;
  stem: ProjectStem;
  takeId: string;
  onProjectChange: (project: ProjectWorkspaceItem) => void;
  onClose: () => void;
}) {
  const [statusFilter, setStatusFilter] = useState<"all" | FeedbackStatus>("all");
  const [selectedFeedbackId, setSelectedFeedbackId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [reply, setReply] = useState("");
  const [feedbackType, setFeedbackType] = useState<FeedbackType>("technical");
  const [feedbackPosition, setFeedbackPosition] = useState("0:00");
  const [feedbackBody, setFeedbackBody] = useState("");
  const feedbacks = (project.feedbacks ?? []).filter((feedback) => feedback.stemId === stem.id && feedback.takeId === takeId);
  const filtered = statusFilter === "all" ? feedbacks : feedbacks.filter((feedback) => feedback.status === statusFilter);
  const selected = feedbacks.find((feedback) => feedback.id === selectedFeedbackId);

  const updateFeedbacks = (updater: (current: ProjectFeedback[]) => ProjectFeedback[]) => {
    onProjectChange({ ...project, feedbacks: updater(project.feedbacks ?? []) });
  };

  const setStatus = (feedbackId: string, status: FeedbackStatus) => {
    updateFeedbacks((current) => current.map((feedback) => feedback.id === feedbackId ? { ...feedback, status } : feedback));
  };

  const sendReply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = reply.trim();
    if (!content || !selected) return;
    updateFeedbacks((current) => current.map((feedback) => feedback.id === selected.id
      ? {
          ...feedback,
          replies: [...feedback.replies, { id: "reply_new_" + Date.now(), author: "Moi", content }],
        }
      : feedback));
    setReply("");
  };

  const createFeedback = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = feedbackBody.trim();
    if (!content) return;
    const next: ProjectFeedback = {
      id: "fb_new_" + Date.now(),
      takeId,
      stemId: stem.id,
      position: feedbackPosition.trim() || "0:00",
      type: feedbackType,
      content,
      status: "open",
      author: "Moi",
      avatar: "/images/messaging/avatars/avatar_3.png",
      age: "À l’instant",
      replies: [],
    };
    updateFeedbacks((current) => [...current, next]);
    setFeedbackBody("");
    setCreating(false);
    setSelectedFeedbackId(next.id);
  };

  return (
    <Modal title={"Feedbacks · " + stem.label} onClose={onClose} wide>
      {selected ? (
        <div className="mwp-feedback-detail">
          <button type="button" className="mwp-text-action" onClick={() => setSelectedFeedbackId(null)}><ArrowLeft size={14} /> Tous les feedbacks</button>
          <header>
            <span>{feedbackTypeMeta[selected.type].icon}</span>
            <div><strong>{feedbackTypeMeta[selected.type].label}</strong><small>{selected.position} · {selected.age}</small></div>
          </header>
          <p>{selected.content}</p>
          <div className="mwp-feedback-statuses">
            {(["open", "inProgress", "resolved"] as FeedbackStatus[]).map((status) => (
              <button key={status} type="button" className={selected.status === status ? "is-active" : ""} onClick={() => setStatus(selected.id, status)}>{feedbackStatusLabels[status]}</button>
            ))}
          </div>
          <div className="mwp-feedback-replies">
            {selected.replies.map((item) => <p key={item.id}><strong>{item.author}</strong>{item.content}</p>)}
          </div>
          <form onSubmit={sendReply}>
            <input value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Répondre..." />
            <button type="submit" disabled={!reply.trim()} aria-label="Envoyer la réponse"><Send size={16} /></button>
          </form>
        </div>
      ) : creating ? (
        <form className="mwp-feedback-create" onSubmit={createFeedback}>
          <button type="button" className="mwp-text-action" onClick={() => setCreating(false)}><ArrowLeft size={14} /> Annuler</button>
          <label>
            <span>Type</span>
            <div className="mwp-feedback-types">
              {(Object.keys(feedbackTypeMeta) as FeedbackType[]).map((type) => (
                <button key={type} type="button" className={feedbackType === type ? "is-active" : ""} onClick={() => setFeedbackType(type)}>
                  {feedbackTypeMeta[type].icon} {feedbackTypeMeta[type].label}
                </button>
              ))}
            </div>
          </label>
          <label><span>Position</span><input value={feedbackPosition} onChange={(event) => setFeedbackPosition(event.target.value)} placeholder="0:00" /></label>
          <label><span>Feedback</span><textarea value={feedbackBody} onChange={(event) => setFeedbackBody(event.target.value)} placeholder="Décrivez votre feedback..." rows={5} /></label>
          <button type="submit" className="mw-button mw-button--primary" disabled={!feedbackBody.trim()}>Créer le feedback</button>
        </form>
      ) : (
        <div className="mwp-feedback-list-view">
          <header>
            <nav aria-label="Filtrer les feedbacks">
              {([
                ["all", "Tous"],
                ["open", "Ouverts"],
                ["inProgress", "En cours"],
                ["resolved", "Résolus"],
              ] as const).map(([id, label]) => (
                <button key={id} type="button" className={statusFilter === id ? "is-active" : ""} onClick={() => setStatusFilter(id)}>{label}</button>
              ))}
            </nav>
            <button type="button" className="mw-button mw-button--primary" onClick={() => setCreating(true)}><Plus size={15} /> Nouveau feedback</button>
          </header>
          {filtered.length === 0 ? (
            <div className="mwp-empty-panel"><MessageCircleMore size={34} /><strong>Aucun feedback</strong></div>
          ) : (
            <div className="mwp-feedback-list">
              {filtered.map((feedback) => (
                <button key={feedback.id} type="button" onClick={() => setSelectedFeedbackId(feedback.id)}>
                  <span>{feedbackTypeMeta[feedback.type].icon}</span>
                  <strong>{feedback.content}</strong>
                  <small>{feedback.position} · {feedback.author} · {feedbackStatusLabels[feedback.status]}</small>
                  {feedback.replies.length > 0 && <i>{feedback.replies.length} réponse{feedback.replies.length > 1 ? "s" : ""}</i>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function ProjectStemsPanel({
  project,
  onProjectChange,
}: {
  project: ProjectWorkspaceItem;
  onProjectChange: (project: ProjectWorkspaceItem) => void;
}) {
  const mixes = project.mixes ?? [];
  const [selectedMixId, setSelectedMixId] = useState(project.currentMixId ?? getCurrentMix(project)?.id ?? "");
  const selectedMix = mixes.find((mix) => mix.id === selectedMixId) ?? mixes[0];
  const [currentTakeId, setCurrentTakeId] = useState(selectedMix?.currentTakeId ?? selectedMix?.takes[selectedMix.takes.length - 1]?.id ?? "");
  const currentTake = getTake(selectedMix, currentTakeId);
  const [stemMenuId, setStemMenuId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [feedbackStemId, setFeedbackStemId] = useState<string | null>(null);
  const [renameStemId, setRenameStemId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [replaceStemId, setReplaceStemId] = useState<string | null>(null);
  const [deleteStemId, setDeleteStemId] = useState<string | null>(null);
  const [saveTakeOpen, setSaveTakeOpen] = useState(false);
  const [takeDescription, setTakeDescription] = useState("");
  const [newMixOpen, setNewMixOpen] = useState(false);
  const [newMixName, setNewMixName] = useState("");
  const addStemInputRef = useRef<HTMLInputElement | null>(null);
  const durationSeconds = currentTake?.stems.reduce((maximum, stem) => Math.max(maximum, stem.durationSeconds), 0) ?? 0;
  useEffect(() => {
    if (selectedMix && !selectedMix.takes.some((take) => take.id === currentTakeId)) {
      setCurrentTakeId(selectedMix.currentTakeId ?? selectedMix.takes[selectedMix.takes.length - 1]?.id ?? "");
    }
  }, [selectedMixId, selectedMix, currentTakeId]);

  const commitMixes = (nextMixes: ProjectMix[], nextCurrentMixId = selectedMixId, nextCurrentTakeId = currentTakeId) => {
    const nextMix = nextMixes.find((mix) => mix.id === nextCurrentMixId)
      ?? nextMixes.find((mix) => mix.isDefault)
      ?? nextMixes[0];
    const nextTake = getTake(nextMix, nextCurrentTakeId);
    onProjectChange({
      ...project,
      mixes: nextMixes,
      currentMixId: nextMix?.id,
      takeVersion: nextTake?.version,
      stemCount: nextTake?.stems.length ?? 0,
      hasNewTake: false,
    });
  };

  const selectMix = (mixId: string) => {
    const mix = mixes.find((item) => item.id === mixId);
    const takeId = mix?.currentTakeId ?? mix?.takes[mix.takes.length - 1]?.id ?? "";
    setSelectedMixId(mixId);
    setCurrentTakeId(takeId);
    commitMixes(mixes, mixId, takeId);
  };

  const updateCurrentStems = (updater: (stems: ProjectStem[]) => ProjectStem[]) => {
    if (!selectedMix || !currentTake) return;
    const next = cloneMixes(mixes).map((mix) => mix.id === selectedMix.id
      ? {
          ...mix,
          takes: mix.takes.map((take) => take.id === currentTake.id
            ? { ...take, stems: updater(take.stems).map((stem, index) => ({ ...stem, order: index })) }
            : take),
        }
      : mix);
    commitMixes(next);
  };

  const addStem = (file: File | undefined) => {
    if (!file || !file.type.startsWith("audio/")) return;
    const stem: ProjectStem = {
      id: "stem_new_" + Date.now(),
      label: file.name.replace(/\.[^.]+$/, ""),
      fileName: file.name,
      mediaFile: file,
      durationSeconds: 0,
      order: currentTake?.stems.length ?? 0,
      addedBy: "current_user",
    };
    let next: ProjectMix[] = cloneMixes(mixes);
    let mixId: string | undefined = selectedMix?.id;
    let takeId: string | undefined = currentTake?.id;
    if (!selectedMix) {
      const createdMixId = "mix_new_" + Date.now();
      const createdTakeId = "take_new_" + Date.now();
      mixId = createdMixId;
      takeId = createdTakeId;
      next = [{
        id: createdMixId,
        name: "Mix Principal",
        isDefault: true,
        currentTakeId: createdTakeId,
        takes: [{
          id: createdTakeId,
          version: 1,
          description: "Ajout de " + file.name,
          stems: [stem],
          createdBy: "current_user",
          createdLabel: "À l’instant",
        }],
      }];
    } else if (!currentTake) {
      const createdTakeId = "take_new_" + Date.now();
      takeId = createdTakeId;
      next = next.map((mix) => mix.id === selectedMix.id
        ? {
            ...mix,
            currentTakeId: createdTakeId,
            takes: [{
              id: createdTakeId,
              version: 1,
              description: "Ajout de " + file.name,
              stems: [stem],
              createdBy: "current_user",
              createdLabel: "À l’instant",
            }],
          }
        : mix);
    } else {
      next = next.map((mix) => mix.id === selectedMix.id
        ? {
            ...mix,
            takes: mix.takes.map((take) => take.id === currentTake.id
              ? { ...take, stems: [...take.stems, stem] }
              : take),
          }
        : mix);
    }
    setSelectedMixId(mixId ?? "");
    setCurrentTakeId(takeId ?? "");
    commitMixes(next, mixId, takeId);
  };

  const renameStem = () => {
    const label = renameValue.trim();
    if (!renameStemId || !label) return;
    updateCurrentStems((stems) => stems.map((stem) => stem.id === renameStemId ? { ...stem, label } : stem));
    setRenameStemId(null);
  };

  const replaceStem = (file: File | undefined) => {
    if (!replaceStemId || !file || !file.type.startsWith("audio/")) return;
    updateCurrentStems((stems) => stems.map((stem) => stem.id === replaceStemId ? { ...stem, fileName: file.name, mediaUrl: undefined, mediaFile: file, durationSeconds: 0 } : stem));
    setReplaceStemId(null);
  };

  const deleteStem = () => {
    if (!deleteStemId) return;
    updateCurrentStems((stems) => stems.filter((stem) => stem.id !== deleteStemId));
    setDeleteStemId(null);
  };

  const saveTake = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const description = takeDescription.trim();
    if (!selectedMix || !currentTake || !description) return;
    const version = Math.max(0, ...selectedMix.takes.map((take) => take.version)) + 1;
    const newTake: ProjectTake = {
      id: "take_new_" + Date.now(),
      version,
      description,
      stems: currentTake.stems.map((stem) => ({ ...stem })),
      createdBy: "current_user",
      createdLabel: "À l’instant",
    };
    const next = cloneMixes(mixes).map((mix) => mix.id === selectedMix.id
      ? { ...mix, takes: [...mix.takes, newTake], currentTakeId: newTake.id }
      : mix);
    setCurrentTakeId(newTake.id);
    commitMixes(next, selectedMix.id, newTake.id);
    setTakeDescription("");
    setSaveTakeOpen(false);
  };

  const createMix = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newMixName.trim();
    if (!name) return;
    const id = "mix_new_" + Date.now();
    const next = [...cloneMixes(mixes), { id, name, takes: [], isDefault: mixes.length === 0 }];
    setSelectedMixId(id);
    setCurrentTakeId("");
    commitMixes(next, id, "");
    setNewMixName("");
    setNewMixOpen(false);
  };

  const chooseTakeForCompare = (takeId: string) => {
    if (!compareMode) {
      setCurrentTakeId(takeId);
      setHistoryOpen(false);
      return;
    }
    setCompareIds((current) => current.includes(takeId)
      ? current.filter((id) => id !== takeId)
      : current.length < 2
        ? [...current, takeId]
        : [current[1], takeId]);
  };

  const comparedTakes = compareIds.map((id) => selectedMix?.takes.find((take) => take.id === id)).filter(Boolean) as ProjectTake[];
  const compareAdded = comparedTakes.length === 2
    ? comparedTakes[1].stems.filter((stem) => !comparedTakes[0].stems.some((candidate) => candidate.id === stem.id))
    : [];
  const compareRemoved = comparedTakes.length === 2
    ? comparedTakes[0].stems.filter((stem) => !comparedTakes[1].stems.some((candidate) => candidate.id === stem.id))
    : [];
  const feedbackStem = currentTake?.stems.find((stem) => stem.id === feedbackStemId);
  const menuStem = currentTake?.stems.find((stem) => stem.id === stemMenuId);
  const renameStemItem = currentTake?.stems.find((stem) => stem.id === renameStemId);
  const replaceStemItem = currentTake?.stems.find((stem) => stem.id === replaceStemId);
  const deleteStemItem = currentTake?.stems.find((stem) => stem.id === deleteStemId);
  const orderedStems = currentTake?.stems.slice().sort((left, right) => left.order - right.order) ?? [];
  const stemSources = useMemo(() => (currentTake?.stems ?? []).slice().sort((a, b) => a.order - b.order).map((stem) => ({
    url: stem.mediaFile instanceof File ? URL.createObjectURL(stem.mediaFile) : stem.mediaUrl,
    local: stem.mediaFile instanceof File,
  })), [currentTake]);
  useEffect(() => () => { stemSources.forEach((source) => { if (source.local && source.url) URL.revokeObjectURL(source.url); }); }, [stemSources]);
  const packMessage: DemoMessage = {
    id: `project-pack-${project.id}-${currentTake?.id}`, author: "me", kind: "track-pack",
    body: `${project.name} · ${selectedMix?.name ?? "Track Pack"} · Take ${currentTake?.version ?? 1}`,
    time: "", tracks: orderedStems.map((stem) => stem.fileName),
    trackMediaUrls: stemSources.map((source) => source.url ?? ""),
    trackDurations: orderedStems.map((stem) => formatDuration(stem.durationSeconds)),
    duration: formatDuration(durationSeconds),
    bpm: orderedStems.find((stem) => stem.bpm)?.bpm,
    musicalKey: orderedStems.find((stem) => stem.musicalKey)?.musicalKey,
  };

  if (!currentTake || currentTake.stems.length === 0) {
    return (
      <section className="mwp-project-stems mwp-project-stems--empty">
        <div className="mwp-empty-panel">
          <Music2 size={52} />
          <strong>Aucun Track Pack</strong>
          <span>Ajoutez des pistes audio pour commencer</span>
          <div>
            {mixes.length > 0 && (
              <select value={selectedMixId} onChange={(event) => selectMix(event.target.value)} aria-label="Sélectionner un mix">
                {mixes.map((mix) => <option key={mix.id} value={mix.id}>{mix.name}</option>)}
              </select>
            )}
            <button type="button" className="mw-button mw-button--quiet" onClick={() => setNewMixOpen(true)}><Plus size={15} /> Nouveau mix</button>
            <button type="button" className="mw-button mw-button--primary" onClick={() => addStemInputRef.current?.click()}><Upload size={15} /> Ajouter un stem</button>
            <input ref={addStemInputRef} type="file" accept="audio/*" hidden onChange={(event) => { addStem(event.target.files?.[0]); event.currentTarget.value = ""; }} />
          </div>
        </div>
        {newMixOpen && (
          <Modal title="Nouveau mix" onClose={() => setNewMixOpen(false)} footer={<button type="submit" form="mwp-new-mix" className="mw-button mw-button--primary" disabled={!newMixName.trim()}>Créer</button>}>
            <form id="mwp-new-mix" className="mwp-form" onSubmit={createMix}><label><span>Nom du mix</span><input value={newMixName} onChange={(event) => setNewMixName(event.target.value)} autoFocus /></label></form>
          </Modal>
        )}
      </section>
    );
  }

  return (
    <section className="mwp-project-stems">
      <div className="mwp-track-packs">
        <div className="mwp-track-packs__toolbar">
          <label>Track Pack <select value={selectedMixId} onChange={(event) => selectMix(event.target.value)} aria-label="Sélectionner un Track Pack">
            {mixes.map((mix) => <option key={mix.id} value={mix.id}>{mix.name}</option>)}
          </select></label>
          <div className="mw-hub-chips">
            <button type="button" onClick={() => setNewMixOpen(true)}><Plus size={14} /> Nouveau Track Pack</button>
            <button type="button" onClick={() => setHistoryOpen(true)}><History size={14} /> Take {currentTake.version}</button>
            <button type="button" onClick={() => setSaveTakeOpen(true)}><Save size={14} /> Sauvegarder</button>
            <button type="button" onClick={() => addStemInputRef.current?.click()}><Upload size={14} /> Ajouter une piste</button>
          </div>
        </div>
        <TrackPackViewer key={JSON.stringify([packMessage.id, packMessage.tracks, packMessage.trackDurations, packMessage.trackMediaUrls])} message={packMessage} embedded />
        <details className="mwp-track-packs__management">
          <summary>Gérer les pistes <span>{orderedStems.length}</span></summary>
          <div>{orderedStems.map((stem) => <div className="mwp-track-packs__file" key={stem.id}>
            <span><strong>{stem.label}</strong><small>{stem.fileName}</small></span>
            <time>{formatDuration(stem.durationSeconds)}</time>
            <button type="button" onClick={() => setStemMenuId(stem.id)} aria-label={"Options de " + stem.label}><MoreVertical size={16} /></button>
          </div>)}</div>
        </details>
      </div>

      <input ref={addStemInputRef} type="file" accept="audio/*" hidden onChange={(event) => { addStem(event.target.files?.[0]); event.currentTarget.value = ""; }} />

      {menuStem && (
        <Modal title={menuStem.label} onClose={() => setStemMenuId(null)}>
          <p className="mwp-modal-description">{menuStem.fileName}</p>
          <div className="mwp-action-list">
            <button type="button" onClick={() => { setFeedbackStemId(menuStem.id); setStemMenuId(null); }}><MessageCircleMore size={17} /><span>Feedbacks</span></button>
            <button type="button" onClick={() => { setRenameValue(menuStem.label); setRenameStemId(menuStem.id); setStemMenuId(null); }}><Edit3 size={17} /><span>Renommer</span></button>
            <button type="button" onClick={() => { setReplaceStemId(menuStem.id); setStemMenuId(null); }}><Upload size={17} /><span>Remplacer</span></button>
            <button type="button" onClick={() => { downloadSilentStem(menuStem); setStemMenuId(null); }}><Download size={17} /><span>Télécharger</span></button>
            <button type="button" className="is-danger" onClick={() => { setDeleteStemId(menuStem.id); setStemMenuId(null); }}><Trash2 size={17} /><span>Supprimer</span></button>
          </div>
        </Modal>
      )}

      {feedbackStem && (
        <FeedbackModal project={project} stem={feedbackStem} takeId={currentTake.id} onProjectChange={onProjectChange} onClose={() => setFeedbackStemId(null)} />
      )}

      {renameStemItem && (
        <Modal
          title="Renommer le stem"
          onClose={() => setRenameStemId(null)}
          footer={(
            <>
              <button type="button" className="mw-button mw-button--quiet" onClick={() => setRenameStemId(null)}>Annuler</button>
              <button type="button" className="mw-button mw-button--primary" onClick={renameStem} disabled={!renameValue.trim()}>Renommer</button>
            </>
          )}
        >
          <div className="mwp-form"><label><span>Nouveau nom</span><input value={renameValue} onChange={(event) => setRenameValue(event.target.value)} autoFocus /></label></div>
        </Modal>
      )}

      {replaceStemItem && (
        <Modal title="Remplacer le stem" onClose={() => setReplaceStemId(null)}>
          <p className="mwp-modal-description">Le fichier remplacera {replaceStemItem.fileName} dans le Take actuel.</p>
          <label className="mw-button mw-button--primary mwp-file-button"><Upload size={15} /> Sélectionner un fichier audio<input type="file" accept="audio/*" onChange={(event) => replaceStem(event.target.files?.[0])} /></label>
        </Modal>
      )}

      {deleteStemItem && (
        <ConfirmModal
          title="Supprimer ce stem ?"
          description={'Le stem "' + deleteStemItem.label + '" sera retiré du Take actuel. Cette action sera visible dans le prochain Take.'}
          confirmLabel="Supprimer"
          danger
          onClose={() => setDeleteStemId(null)}
          onConfirm={deleteStem}
        />
      )}

      {saveTakeOpen && (
        <Modal
          title="Sauvegarder ce Take"
          onClose={() => setSaveTakeOpen(false)}
          footer={(
            <>
              <button type="button" className="mw-button mw-button--quiet" onClick={() => setSaveTakeOpen(false)}>Annuler</button>
              <button type="submit" form="mwp-save-take" className="mw-button mw-button--primary" disabled={!takeDescription.trim()}>Sauvegarder</button>
            </>
          )}
        >
          <form id="mwp-save-take" className="mwp-form" onSubmit={saveTake}>
            <label><span>Décrivez les changements effectués</span><textarea value={takeDescription} onChange={(event) => setTakeDescription(event.target.value)} placeholder="Ex: Ajout guitare + nouveau drop" rows={4} autoFocus /></label>
          </form>
        </Modal>
      )}

      {newMixOpen && (
        <Modal
          title="Nouveau mix"
          onClose={() => setNewMixOpen(false)}
          footer={(
            <>
              <button type="button" className="mw-button mw-button--quiet" onClick={() => setNewMixOpen(false)}>Annuler</button>
              <button type="submit" form="mwp-new-mix" className="mw-button mw-button--primary" disabled={!newMixName.trim()}>Créer</button>
            </>
          )}
        >
          <form id="mwp-new-mix" className="mwp-form" onSubmit={createMix}><label><span>Nom du mix</span><input value={newMixName} onChange={(event) => setNewMixName(event.target.value)} autoFocus /></label></form>
        </Modal>
      )}

      {historyOpen && selectedMix && (
        <Modal title={compareMode ? "Comparer deux Takes" : "Historique des Takes"} onClose={() => { setHistoryOpen(false); setCompareMode(false); setCompareIds([]); }} wide>
          <div className="mwp-history-toolbar">
            <p>{compareMode ? "Sélectionnez 2 Takes à comparer" : selectedMix.name}</p>
            <button type="button" className={compareMode ? "is-active" : ""} onClick={() => { setCompareMode((current) => !current); setCompareIds([]); }}><GitCompare size={15} /> {compareMode ? "Annuler" : "Comparer"}</button>
          </div>
          <div className="mwp-take-list">
            {selectedMix.takes.map((take) => {
              const selectedForCompare = compareIds.includes(take.id);
              return (
                <button key={take.id} type="button" className={(take.id === currentTake.id ? "is-current " : "") + (selectedForCompare ? "is-compared" : "")} onClick={() => chooseTakeForCompare(take.id)}>
                  <span>Take {take.version}</span>
                  <strong>{take.description}</strong>
                  <small>{take.createdLabel} · {take.stems.length} stems · {formatDuration(take.stems.reduce((maximum, stem) => Math.max(maximum, stem.durationSeconds), 0))}</small>
                  {take.changes && <i>+{take.changes.added.length} · -{take.changes.removed.length} · ~{take.changes.modified.length}</i>}
                </button>
              );
            })}
          </div>
          {comparedTakes.length === 2 && (
            <div className="mwp-take-compare">
              <header><strong>Take {comparedTakes[0].version}</strong><span>vs</span><strong>Take {comparedTakes[1].version}</strong></header>
              <p><i>+{compareAdded.length}</i> ajouté{compareAdded.length > 1 ? "s" : ""} · <i>-{compareRemoved.length}</i> supprimé{compareRemoved.length > 1 ? "s" : ""}</p>
              {compareAdded.map((stem) => <span key={stem.id}>+ {stem.label}</span>)}
              {compareRemoved.map((stem) => <span key={stem.id}>- {stem.label}</span>)}
            </div>
          )}
        </Modal>
      )}
    </section>
  );
}

type ProjectConfirmAction = "complete" | "archive" | "leave" | "delete";

function ProjectInfoPanel({
  project,
  onProjectChange,
  onProjectRemove,
  live,
}: {
  project: ProjectWorkspaceItem;
  onProjectChange: (project: ProjectWorkspaceItem) => void;
  onProjectRemove: () => void;
  live?: {
    inviteCandidates: ProjectsWorkspaceInviteCandidate[];
    searchInviteCandidates?: (query: string) => void | Promise<unknown>;
    updateProject: (project: ProjectWorkspaceItem) => Promise<unknown>;
    inviteMember: (input: MessagingInviteProjectMemberInput) => Promise<MessagingProjectInvitationResult>;
    updateMember: (member: ProjectMember, artisticRole: string, permissions: MemberPermissions) => Promise<unknown>;
    transferOwnership: (member: ProjectMember) => Promise<unknown>;
    removeMember: (member: ProjectMember) => Promise<unknown>;
    setStatus: (status: MessagingProjectStatus) => Promise<unknown>;
    leaveProject: () => Promise<unknown>;
    deleteProject: () => Promise<unknown>;
    pending: boolean;
    error?: string | null;
  };
}) {
  const members = project.memberDetails ?? [];
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteQuery, setInviteQuery] = useState("");
  const [inviteIds, setInviteIds] = useState<Set<string>>(new Set());
  const inviteAttemptRef = useRef<ReturnType<typeof createMessagingProjectInvitationAttempt> | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState(project.name);
  const [editDescription, setEditDescription] = useState(project.description);
  const [editDeadline, setEditDeadline] = useState(project.deadline ?? "");
  const [memberMenuId, setMemberMenuId] = useState<string | null>(null);
  const [roleMemberId, setRoleMemberId] = useState<string | null>(null);
  const [roleValue, setRoleValue] = useState("");
  const [permissionsMemberId, setPermissionsMemberId] = useState<string | null>(null);
  const [permissionDraft, setPermissionDraft] = useState<MemberPermissions>({ ...permissionsStandard });
  const [removeMemberId, setRemoveMemberId] = useState<string | null>(null);
  const [transferMemberId, setTransferMemberId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ProjectConfirmAction | null>(null);
  const liveContacts = live?.inviteCandidates.map(inviteCandidateToContact) ?? [];
  const availableContacts = (live ? liveContacts : mockUsers).filter((contact) => !members.some((member) => member.id === contact.id));
  const menuMember = members.find((member) => member.id === memberMenuId);
  const roleMember = members.find((member) => member.id === roleMemberId);
  const permissionsMember = members.find((member) => member.id === permissionsMemberId);
  const removeMember = members.find((member) => member.id === removeMemberId);
  const transferMember = members.find((member) => member.id === transferMemberId);
  const viewerProfileId = project.viewerProfileId ?? "current_user";
  const isOwner = project.viewerAuthorityRole === "owner" || project.creatorId === viewerProfileId;
  const canEditProject = !live || Boolean(project.viewerPermissions?.canEdit || isOwner);
  const canInvite = !live || Boolean(project.viewerPermissions?.canInvite || isOwner);
  const canManageMembers = !live || Boolean(project.viewerPermissions?.canManageMembers || isOwner);
  const liveMode = Boolean(live);
  const searchInviteCandidates = live?.searchInviteCandidates;

  useEffect(() => {
    if (!liveMode || !inviteOpen || !searchInviteCandidates || inviteQuery.trim().length < 2) return undefined;
    const timer = window.setTimeout(() => {
      void Promise.resolve(searchInviteCandidates(inviteQuery.trim())).catch(() => undefined);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [inviteOpen, inviteQuery, liveMode, searchInviteCandidates]);

  const updateMembers = (next: ProjectMember[]) => {
    onProjectChange({ ...project, memberDetails: next, members: next.length });
  };

  const inviteMembers = async () => {
    if (live) {
      if (!inviteAttemptRef.current) {
        inviteAttemptRef.current = createMessagingProjectInvitationAttempt(
          live.inviteCandidates
            .filter((candidate) => inviteIds.has(candidate.id))
            .map((candidate) => ({
              profileId: candidate.id,
              authorityRole: "contributor" as const,
              artisticRole: candidate.role || null,
              permissions: toLivePermissions(permissionsStandard),
            })),
          `invite:${project.id}`,
        );
      }
      try {
        await inviteAttemptRef.current.run(project.id, live.inviteMember);
      } catch (error) {
        setInviteIds(new Set(inviteAttemptRef.current.pendingProfileIds));
        throw error;
      }
      inviteAttemptRef.current = null;
      setInviteIds(new Set());
      setInviteOpen(false);
      return;
    }
    const additions: ProjectMember[] = availableContacts
      .filter((contact) => inviteIds.has(contact.id))
      .map((contact) => ({
        ...contact,
        memberId: "pm_invited_" + contact.id + "_" + Date.now(),
        permissions: { ...permissionsStandard },
      }));
    if (additions.length > 0) updateMembers([...members, ...additions]);
    setInviteIds(new Set());
    setInviteOpen(false);
  };

  const saveProjectEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = editName.trim();
    if (!name) return;
    const nextProject = {
      ...project,
      name,
      description: editDescription.trim(),
      deadline: editDeadline.trim() || undefined,
      deliveryAt: live ? (editDeadline || null) : project.deliveryAt,
    };
    if (live) await live.updateProject(nextProject);
    else onProjectChange(nextProject);
    setEditOpen(false);
  };

  const saveRole = async () => {
    const role = roleValue.trim();
    if (!roleMember || !role) return;
    if (live) {
      await live.updateMember(roleMember, role, roleMember.permissions);
      setRoleMemberId(null);
      return;
    }
    updateMembers(members.map((member) => member.id === roleMember.id ? { ...member, role } : member));
    setRoleMemberId(null);
  };

  const savePermissions = async () => {
    if (!permissionsMember) return;
    if (live) {
      await live.updateMember(permissionsMember, permissionsMember.role, permissionDraft);
      setPermissionsMemberId(null);
      return;
    }
    updateMembers(members.map((member) => member.id === permissionsMember.id
      ? { ...member, permissions: { ...permissionDraft } }
      : member));
    setPermissionsMemberId(null);
  };

  const runProjectAction = async () => {
    if (live) {
      if (confirmAction === "complete") await live.setStatus("completed");
      else if (confirmAction === "archive") await live.setStatus("archived");
      else if (confirmAction === "leave") await live.leaveProject();
      else if (confirmAction === "delete") await live.deleteProject();
      setConfirmAction(null);
      return;
    }
    if (confirmAction === "complete") {
      onProjectChange({ ...project, status: "completed" });
    } else if (confirmAction === "archive") {
      onProjectChange({ ...project, status: "archived" });
    } else if (confirmAction === "leave" || confirmAction === "delete") {
      onProjectRemove();
    }
    setConfirmAction(null);
  };

  const confirmation = confirmAction
    ? {
        complete: {
          title: "Marquer comme terminé ?",
          description: "Le projet passera dans les projets terminés.",
          label: "Terminer",
          danger: false,
        },
        archive: {
          title: "Archiver le projet ?",
          description: "Le projet restera disponible dans les archives.",
          label: "Archiver",
          danger: false,
        },
        leave: {
          title: "Quitter le projet ?",
          description: "Vous n’aurez plus accès aux stems, tâches et discussions.",
          label: "Quitter",
          danger: true,
        },
        delete: {
          title: "Supprimer le projet ?",
          description: "Le projet sera retiré de votre espace.",
          label: "Supprimer",
          danger: true,
        },
      }[confirmAction]
    : null;

  const permissionLabels: Array<[PermissionKey, string]> = [
    ["canEdit", "Peut éditer"],
    ["canInvite", "Peut inviter"],
    ["canManageMembers", "Gérer les membres"],
    ["canManageStems", "Gérer les stems"],
    ["canCreateTasks", "Créer des tâches"],
  ];
  const roles = ["Artiste", "Beatmaker", "Producteur", "Mixeur", "Chanteur", "Chanteuse", "DJ", "Ingénieur son", "Auteur"];
  const activeMix = (project.mixes ?? []).find((mix) => mix.id === project.currentMixId)
    ?? (project.mixes ?? []).find((mix) => mix.isDefault)
    ?? project.mixes?.[0];
  const totalTakes = (project.mixes ?? []).reduce((total, mix) => total + mix.takes.length, 0);
  const workspaceInfo = project.workspaceInfo ?? {
    genre: "Direction à définir",
    bpm: getTake(activeMix, activeMix?.currentTakeId)?.stems[0]?.bpm ?? 120,
    musicalKey: getTake(activeMix, activeMix?.currentTakeId)?.stems[0]?.musicalKey ?? "À définir",
    objective: project.description || "Définir la direction artistique et le prochain livrable.",
    delivery: project.deadline || "À planifier",
    milestone: "Prochain point d’équipe",
    completion: project.status === "completed" ? 100 : project.status === "archived" ? 96 : 24,
    notes: "Les décisions importantes, stems et tâches de ce projet sont regroupés dans cet espace.",
  };

  return (
    <section className="mwp-project-info">
      <article className="mwp-info-stage">
        <header className="mwp-info-stage__hero">
          <div className="mwp-info-stage__heading">
            <span className="mwp-info-stage__eyebrow"><Music2 size={14} /> {workspaceInfo.genre}</span>
            <h2>{project.name}</h2>
            <p>{workspaceInfo.objective}</p>
            <div className="mwp-info-stage__progress" aria-label={`Avancement ${workspaceInfo.completion}%`}>
              <span><small>Avancement</small><strong>{workspaceInfo.completion}%</strong></span>
              <i aria-hidden="true"><b style={{ width: `${Math.max(0, Math.min(workspaceInfo.completion, 100))}%` }} /></i>
              <em>{workspaceInfo.milestone}</em>
            </div>
          </div>
          <div className="mwp-info-stage__status">
            <span className={`is-${project.status}`}><i />{statusLabel(project.status)}</span>
            {canEditProject && (
              <button type="button" disabled={live?.pending} onClick={() => { setEditName(project.name); setEditDescription(project.description); setEditDeadline(live ? (project.deliveryAt?.slice(0, 10) ?? "") : (project.deadline ?? "")); setEditOpen(true); }}><Edit3 size={16} /> Modifier</button>
            )}
          </div>
        </header>

        <div className="mwp-info-stage__pulse" aria-label="Résumé du projet">
          <div><strong>{members.length}</strong><span>Membres</span></div>
          <div><strong>{project.stemCount}</strong><span>Stems</span></div>
          <div><strong>{project.tasks?.length ?? 0}</strong><span>Tâches</span></div>
          <div><strong>{workspaceInfo.bpm}</strong><span>BPM</span></div>
          <div className="mwp-info-stage__date"><small>TONALITÉ</small><strong>{workspaceInfo.musicalKey}</strong></div>
          <div className="mwp-info-stage__date"><small>LIVRAISON</small><strong>{workspaceInfo.delivery}</strong></div>
        </div>

        <div className="mwp-info-stage__body">
          <div className="mwp-info-stage__main">
            <section className="mwp-info-zone mwp-info-zone--brief">
              <header>
                <span><Info size={17} /><strong>Direction de production</strong><small>{totalTakes} take{totalTakes > 1 ? "s" : ""}</small></span>
              </header>
              <div className="mwp-info-brief">
                <div>
                  <small>PROCHAIN JALON</small>
                  <strong>{workspaceInfo.milestone}</strong>
                  <p>{workspaceInfo.notes}</p>
                </div>
                <dl>
                  <div><dt>Créé</dt><dd>{project.createdAt || "Récemment"}</dd></div>
                  <div><dt>Statut</dt><dd>{statusLabel(project.status)}</dd></div>
                  <div><dt>Mix actif</dt><dd>{activeMix?.name || "À créer"}</dd></div>
                </dl>
              </div>
            </section>

            <section className="mwp-info-zone mwp-info-zone--members">
              <header>
                <span><Users size={17} /><strong>Équipe créative</strong><small>{members.length} membre{members.length > 1 ? "s" : ""}</small></span>
                {canInvite && <button type="button" disabled={live?.pending} onClick={() => { inviteAttemptRef.current = null; setInviteOpen(true); }}><UserPlus size={16} /> Inviter</button>}
              </header>
              <div className="mwp-info-members">
                {members.map((member) => (
                  <div key={member.memberId}>
                    <span className="mwp-member-avatar-wrap"><img src={member.avatar} alt="" />{member.online && <i />}</span>
                    <span><strong>{member.name}{member.id === viewerProfileId ? " (Moi)" : ""}</strong><small>{member.role}</small></span>
                    {member.creator && <em>Admin</em>}
                    <span className="mwp-member-permissions">
                      {member.permissions.canEdit && <i title="Peut éditer">E</i>}
                      {member.permissions.canInvite && <i title="Peut inviter">I</i>}
                      {member.permissions.canManageStems && <i title="Gère les stems">S</i>}
                    </span>
                    {canManageMembers && member.id !== viewerProfileId && member.authorityRole !== "owner" && (
                      <button type="button" onClick={() => setMemberMenuId(member.id)} aria-label={"Options de " + member.name}><MoreVertical size={16} /></button>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {(project.mixes ?? []).length > 0 && (
              <section className="mwp-info-zone mwp-info-zone--mixes">
                <header>
                  <span><Music2 size={17} /><strong>Univers sonore</strong><small>{project.mixes?.length} mix{(project.mixes?.length ?? 0) > 1 ? "es" : ""}</small></span>
                  {activeMix && <em><i /> {activeMix.name}</em>}
                </header>
                <div className="mwp-info-mixes">
                  {project.mixes?.map((mix, index) => (
                    <div key={mix.id} className={(mix.id === activeMix?.id ? "is-active" : "")}>
                      <span className="mwp-info-mix-index">{String(index + 1).padStart(2, "0")}</span>
                      <Music2 size={16} />
                      <span><strong>{mix.name}</strong><small>{mix.takes.length} take{mix.takes.length > 1 ? "s" : ""}</small></span>
                      {(mix.id === activeMix?.id) && <em>Mix actif</em>}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside className="mwp-info-stage__rail">
            <header><ShieldCheck size={17} /><span><strong>Pilotage</strong><small>Gestion du projet</small></span></header>
            <div className="mwp-action-list">
              {canEditProject && project.status !== "inProgress" && <button type="button" disabled={live?.pending} onClick={() => live ? void live.setStatus("in_progress").catch(() => undefined) : onProjectChange({ ...project, status: "inProgress" })}><History size={17} /><span><strong>Réouvrir</strong><small>Reprendre le travail</small></span><ChevronRight size={16} /></button>}
              {canEditProject && project.status !== "completed" && <button type="button" onClick={() => setConfirmAction("complete")}><CheckCircle2 size={17} /><span><strong>Terminer</strong><small>Valider la production</small></span><ChevronRight size={16} /></button>}
              {canEditProject && project.status !== "archived" && <button type="button" onClick={() => setConfirmAction("archive")}><Archive size={17} /><span><strong>Archiver</strong><small>Conserver l’historique</small></span><ChevronRight size={16} /></button>}
              {(!live || !isOwner) && <button type="button" className="is-warning" onClick={() => setConfirmAction("leave")}><LogOut size={17} /><span><strong>Quitter</strong><small>Sortir de l’équipe</small></span><ChevronRight size={16} /></button>}
              {isOwner && <button type="button" className="is-danger" onClick={() => setConfirmAction("delete")}><Trash2 size={17} /><span><strong>Supprimer</strong><small>Action définitive</small></span><ChevronRight size={16} /></button>}
            </div>
            {live?.error && <small className="mw-wizard-note" role="alert">{live.error}</small>}
          </aside>
        </div>
      </article>

      {inviteOpen && (
        <Modal
          title="Inviter des membres"
          onClose={() => { inviteAttemptRef.current = null; setInviteOpen(false); setInviteIds(new Set()); }}
          footer={(
            <>
              <button type="button" className="mw-button mw-button--quiet" onClick={() => { inviteAttemptRef.current = null; setInviteOpen(false); setInviteIds(new Set()); }}>Annuler</button>
              <button type="button" className="mw-button mw-button--primary" disabled={inviteIds.size === 0 || live?.pending} onClick={() => void inviteMembers().catch(() => undefined)}>Inviter ({inviteIds.size})</button>
            </>
          )}
        >
          {live && <label className="mwp-contact-search"><Search size={16} /><input value={inviteQuery} onChange={(event) => setInviteQuery(event.target.value)} placeholder="Rechercher un artiste par nom ou @identifiant" /></label>}
          {availableContacts.length === 0 ? (
            <div className="mwp-empty-panel"><Users size={32} /><strong>{live && inviteQuery.trim().length < 2 ? "Recherche un artiste" : "Aucun contact disponible"}</strong>{live && inviteQuery.trim().length < 2 && <span>Saisis au moins 2 caractères.</span>}</div>
          ) : (
            <div className="mwp-invite-list">
              {availableContacts.map((contact) => {
                const selected = inviteIds.has(contact.id);
                return (
                  <button key={contact.id} type="button" className={selected ? "is-selected" : ""} onClick={() => setInviteIds((current) => {
                    const next = new Set(current);
                    if (next.has(contact.id)) next.delete(contact.id);
                    else next.add(contact.id);
                    return next;
                  })}>
                    <img src={contact.avatar} alt="" />
                    <span><strong>{contact.name}</strong><small>{contact.role}</small></span>
                    <i>{selected && <Check size={14} />}</i>
                  </button>
                );
              })}
            </div>
          )}
        </Modal>
      )}

      {editOpen && (
        <Modal
          title="Modifier le projet"
          onClose={() => setEditOpen(false)}
          footer={(
            <>
              <button type="button" className="mw-button mw-button--quiet" onClick={() => setEditOpen(false)}>Annuler</button>
              <button type="submit" form="mwp-edit-project" className="mw-button mw-button--primary" disabled={!editName.trim()}>Enregistrer</button>
            </>
          )}
        >
          <form id="mwp-edit-project" className="mwp-form" onSubmit={(event) => void saveProjectEdit(event).catch(() => undefined)}>
            <label><span>Nom</span><input value={editName} onChange={(event) => setEditName(event.target.value)} /></label>
            <label><span>Description</span><textarea value={editDescription} onChange={(event) => setEditDescription(event.target.value)} rows={4} /></label>
            <label><span>Deadline</span><input type={live ? "date" : "text"} value={editDeadline} onChange={(event) => setEditDeadline(event.target.value)} placeholder="Non définie" /></label>
          </form>
        </Modal>
      )}

      {menuMember && (
        <Modal title={menuMember.name} onClose={() => setMemberMenuId(null)}>
          <p className="mwp-modal-description">{menuMember.role}</p>
          <div className="mwp-action-list">
            <button type="button" onClick={() => { setRoleMemberId(menuMember.id); setRoleValue(menuMember.role); setMemberMenuId(null); }}><Edit3 size={17} /><span>Modifier le rôle</span></button>
            <button type="button" onClick={() => { setPermissionsMemberId(menuMember.id); setPermissionDraft({ ...menuMember.permissions }); setMemberMenuId(null); }}><ShieldCheck size={17} /><span>Modifier les permissions</span></button>
            {live && isOwner && <button type="button" onClick={() => { setTransferMemberId(menuMember.id); setMemberMenuId(null); }}><Users size={17} /><span>Transférer la propriété</span></button>}
            <button type="button" className="is-danger" onClick={() => { setRemoveMemberId(menuMember.id); setMemberMenuId(null); }}><UserMinus size={17} /><span>Retirer du projet</span></button>
          </div>
        </Modal>
      )}

      {roleMember && (
        <Modal
          title={"Rôle de " + roleMember.name}
          onClose={() => setRoleMemberId(null)}
          footer={(
            <>
              <button type="button" className="mw-button mw-button--quiet" onClick={() => setRoleMemberId(null)}>Annuler</button>
              <button type="button" className="mw-button mw-button--primary" onClick={() => void saveRole().catch(() => undefined)} disabled={!roleValue.trim() || live?.pending}>Confirmer</button>
            </>
          )}
        >
          <div className="mwp-role-grid">
            {roles.map((role) => <button key={role} type="button" className={roleValue === role ? "is-active" : ""} onClick={() => setRoleValue(role)}>{role}</button>)}
          </div>
          <div className="mwp-form"><label><span>Rôle personnalisé</span><input value={roleValue} onChange={(event) => setRoleValue(event.target.value)} /></label></div>
        </Modal>
      )}

      {permissionsMember && (
        <Modal
          title={"Permissions de " + permissionsMember.name}
          onClose={() => setPermissionsMemberId(null)}
          footer={(
            <>
              <button type="button" className="mw-button mw-button--quiet" onClick={() => setPermissionsMemberId(null)}>Annuler</button>
              <button type="button" className="mw-button mw-button--primary" onClick={() => void savePermissions().catch(() => undefined)} disabled={live?.pending}>Enregistrer</button>
            </>
          )}
        >
          <div className="mwp-permission-shortcuts">
            <button type="button" onClick={() => setPermissionDraft({ ...permissionsAll })}>Tout autoriser</button>
            <button type="button" onClick={() => setPermissionDraft({ canEdit: false, canInvite: false, canManageMembers: false, canManageStems: false, canCreateTasks: false })}>Lecture seule</button>
          </div>
          <div className="mwp-permission-toggles">
            {permissionLabels.map(([permission, label]) => (
              <button key={permission} type="button" className={permissionDraft[permission] ? "is-active" : ""} onClick={() => setPermissionDraft((current) => ({ ...current, [permission]: !current[permission] }))}>
                <span>{label}</span><i>{permissionDraft[permission] ? "Oui" : "Non"}</i>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {removeMember && (
        <ConfirmModal
          title="Retirer ce membre ?"
          description={removeMember.name + " sera retiré du projet et n’aura plus accès aux stems, tâches et discussions."}
          confirmLabel="Retirer"
          danger
          onClose={() => setRemoveMemberId(null)}
          onConfirm={() => {
            if (live) {
              void live.removeMember(removeMember).then(() => setRemoveMemberId(null)).catch(() => undefined);
            } else {
              updateMembers(members.filter((member) => member.id !== removeMember.id));
              setRemoveMemberId(null);
            }
          }}
        />
      )}

      {transferMember && live && (
        <ConfirmModal
          title="Transférer la propriété ?"
          description={`${transferMember.name} deviendra propriétaire du projet. Vous resterez administrateur.`}
          confirmLabel="Transférer"
          onClose={() => setTransferMemberId(null)}
          onConfirm={() => void live.transferOwnership(transferMember).then(() => setTransferMemberId(null)).catch(() => undefined)}
        />
      )}

      {confirmation && (
        <ConfirmModal
          title={confirmation.title}
          description={confirmation.description}
          confirmLabel={confirmation.label}
          danger={confirmation.danger}
          onClose={() => setConfirmAction(null)}
          onConfirm={() => void runProjectAction().catch(() => undefined)}
        />
      )}
    </section>
  );
}

function LiveProjectCapabilityUnavailable({ title, description }: { title: string; description: string }) {
  return (
    <div className="mwp-empty-panel" role="status">
      <Music2 size={38} />
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function ProjectDetail({
  project,
  tab,
  onTabChange,
  onProjectChange,
  onProjectRemove,
  onNewProject,
  liveController,
  invitationControl,
}: {
  project: ProjectWorkspaceItem;
  tab: ProjectDetailTab;
  onTabChange: (tab: ProjectDetailTab) => void;
  onProjectChange: (project: ProjectWorkspaceItem) => void;
  onProjectRemove: () => void;
  onNewProject: () => void;
  liveController?: ProjectsWorkspaceLiveController | null;
  invitationControl?: ReactNode;
}) {
  const livePending = Boolean(liveController && Object.keys(liveController.mutations).length > 0);
  const liveError = liveController?.actionError?.message ?? null;
  const projectTabs = [
    ["chat", "Chat", MessageCircleMore],
    ["stems", "Track Packs", Music2],
    ["tasks", "Tâches", ListChecks],
    ["info", "Infos", Info],
  ] as const;

  return (
    <section className="mw-project-detail mwp-project-detail" data-project-tab={tab} aria-label={"Projet " + project.name}>
      <div className="mwp-project-floating-controls mw-hub-chipbar">
        <div className="agw-panel__identity">
          <span><small>{project.members} MEMBRE{project.members > 1 ? "S" : ""} · {statusLabel(project.status)}</small><strong>{project.name}</strong></span>
        </div>
        <div className="agw-panel__toolbar">
          <nav className={`mw-hub-chips is-project is-${tab}`} aria-label="Espaces du projet">
            {projectTabs.map(([id, label, Icon]) => (
              <button type="button" key={id} className={tab === id ? "is-active" : ""} onClick={() => onTabChange(id)} aria-pressed={tab === id}>
                <Icon size={17} /> {label}
              </button>
            ))}
          </nav>
        </div>
        <div className="agw-panel__controls">
          <button type="button" className={`agw-panel-option${tab === "info" ? " is-active" : ""}`} onClick={() => onTabChange("info")} aria-label="Options du projet" aria-pressed={tab === "info"}>
            <Settings2 size={17} /> <span>Options</span>
          </button>
          {invitationControl}
          <button type="button" className="agw-panel-create" onClick={onNewProject} aria-label="Nouveau projet">
            <Plus size={17} /> <span className="mwp-project-panel__create-label">Nouveau projet</span>
          </button>
        </div>
      </div>
      <div className="mw-project-detail__body">
        <div className="mwp-project-detail__content">
          {tab === "chat" && <ProjectChatPanel project={project} onProjectChange={onProjectChange}
            live={liveController ? {
              sendText: (body) => liveController.sendText(body),
              pending: livePending,
              error: liveError,
            } : undefined}
          />}
          {tab === "stems" && (liveController ? (
            <LiveProjectCapabilityUnavailable
              title="Stems bientôt disponibles"
              description="Le stockage, les takes, le mix et les retours ne sont pas encore câblés à Supabase. Aucune fausse sauvegarde n’est effectuée."
            />
          ) : <ProjectStemsPanel project={project} onProjectChange={onProjectChange} />)}
          {tab === "tasks" && <ProjectTasksPanel project={project} onProjectChange={onProjectChange}
            live={liveController ? {
              pending: livePending,
              error: liveError,
              canMutate: Boolean(project.viewerPermissions?.canCreateTasks || project.viewerAuthorityRole === "owner"),
              upsertTask: (task) => liveController.upsertTask({
                projectId: project.id,
                taskId: task.id,
                title: task.title,
                description: task.description,
                status: toLiveTaskStatus(task.status),
              }),
              deleteTask: (taskId) => liveController.deleteTask(project.id, taskId),
            } : undefined}
          />}
          {tab === "info" && <ProjectInfoPanel project={project} onProjectChange={onProjectChange}
            onProjectRemove={onProjectRemove}
            live={liveController ? {
              inviteCandidates: liveController.inviteCandidates ?? [],
              searchInviteCandidates: liveController.searchInviteCandidates,
              pending: livePending,
              error: liveError,
              updateProject: (next) => liveController.updateProject({
                projectId: next.id,
                name: next.name,
                description: next.description,
                genre: next.workspaceInfo?.genre || null,
                bpm: next.workspaceInfo?.bpm || null,
                musicalKey: next.workspaceInfo?.musicalKey || null,
                objective: next.workspaceInfo?.objective || null,
                deliveryAt: next.deliveryAt || null,
                milestone: next.workspaceInfo?.milestone || null,
                expectedUpdatedAt: next.liveUpdatedAt,
              }),
              inviteMember: (input) => liveController.inviteMember(input),
              updateMember: (member, artisticRole, permissions) => liveController.updateMember({
                projectId: project.id,
                profileId: member.id,
                authorityRole: member.authorityRole === "admin" || member.authorityRole === "viewer"
                  ? member.authorityRole
                  : "contributor",
                artisticRole,
                permissions: toLivePermissions(permissions),
              }),
              transferOwnership: (member) => liveController.transferOwnership(project.id, member.id),
              removeMember: (member) => liveController.removeMember(project.id, member.id),
              setStatus: (status) => liveController.setProjectStatus(project.id, status, project.liveUpdatedAt),
              leaveProject: () => liveController.leaveProject(project.id),
              deleteProject: () => liveController.deleteProject(project.id),
            } : undefined}
          />}
        </div>

      </div>
    </section>
  );
}

function ProjectInvitationsButton({ controller }: { controller: ProjectsWorkspaceLiveController }) {
  const [open, setOpen] = useState(false);
  const invitations = controller.invitations;
  if (invitations.length === 0) return null;

  const respond = async (invitation: MessagingProjectInvitationRow, decision: "accept" | "decline") => {
    await controller.respondToInvitation(
      invitation.invitation_id,
      decision,
      createMessagingProjectIdempotencyKey(`project-invitation:${invitation.invitation_id}:${decision}`),
    );
  };

  return (
    <>
      <button type="button" className="mw-button mw-button--quiet" onClick={() => setOpen(true)}>
        <UserPlus size={16} /> Invitations ({invitations.length})
      </button>
      {open && (
        <Modal title="Invitations de projets" onClose={() => setOpen(false)}>
          <div className="mwp-invite-list">
            {invitations.map((invitation) => (
              <article key={invitation.invitation_id}>
                <img src={invitation.other_avatar_url || liveProjectCover(invitation.other_profile_id)} alt="" />
                <span>
                  <strong>{invitation.project_name}</strong>
                  <small>{invitation.direction === "received"
                    ? `Invitation de ${invitation.other_display_name}`
                    : `Invitation envoyée à ${invitation.other_display_name}`}</small>
                </span>
                <div>
                  {invitation.direction === "received" ? (
                    <>
                      <button type="button" className="mw-button mw-button--primary" onClick={() => void respond(invitation, "accept").catch(() => undefined)}>Accepter</button>
                      <button type="button" className="mw-button mw-button--quiet" onClick={() => void respond(invitation, "decline").catch(() => undefined)}>Refuser</button>
                    </>
                  ) : (
                    <button type="button" className="mw-button mw-button--quiet" onClick={() => void controller.cancelInvitation(invitation.invitation_id).catch(() => undefined)}>Annuler</button>
                  )}
                </div>
              </article>
            ))}
          </div>
          {controller.actionError && <p className="mw-wizard-note" role="alert">{controller.actionError.message}</p>}
        </Modal>
      )}
    </>
  );
}

export function ProjectsWorkspace({
  projects: initialProjects = flutterProjects,
  onProjectCreated,
  openProjectRequest,
  createProjectRequest,
  onItemsChange,
  onActiveProjectChange,
  liveController,
}: ProjectsWorkspaceProps) {
  const [projects, setProjects] = useState<ProjectWorkspaceItem[]>(() => cloneProjectItems(projectSessionItems ?? initialProjects));
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() => {
    const firstProject = (projectSessionItems ?? initialProjects)[0];
    return firstProject?.id ?? null;
  });
  const [activeProjectTab, setActiveProjectTab] = useState<ProjectDetailTab>("chat");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardSeed, setWizardSeed] = useState<{ token: number; name?: string; groupId?: string }>({ token: 0 });
  const lastOpenToken = useRef<number | null>(null);
  const lastCreateToken = useRef<number | null>(null);
  const pendingCreatedProjectId = useRef<string | null>(null);
  const liveCreateAttemptRef = useRef<ReturnType<typeof createMessagingProjectCreationAttempt> | null>(null);
  const onItemsChangeRef = useRef(onItemsChange);
  const onActiveProjectChangeRef = useRef(onActiveProjectChange);
  const onProjectCreatedRef = useRef(onProjectCreated);
  onItemsChangeRef.current = onItemsChange;
  onActiveProjectChangeRef.current = onActiveProjectChange;
  onProjectCreatedRef.current = onProjectCreated;
  const liveMode = Boolean(liveController);

  const liveProjects = useMemo(() => liveController?.items.map((item) => mapMessagingProjectToWorkspaceItem(
    item,
    liveController.currentProfileId,
    liveController.selectedProjectId === item.id ? liveController.selectedProject : null,
    liveController.selectedProjectId === item.id ? liveController.messages : [],
  )) ?? [], [
    liveController?.currentProfileId,
    liveController?.items,
    liveController?.messages,
    liveController?.selectedProject,
    liveController?.selectedProjectId,
  ]);
  const visibleProjects = liveController ? liveProjects : projects;

  useEffect(() => {
    if (liveMode) return;
    projectSessionItems = cloneProjectItems(projects);
    onItemsChangeRef.current?.(cloneProjectItems(projects));
  }, [liveMode, projects]);

  useEffect(() => {
    if (!liveMode) return;
    onItemsChangeRef.current?.(cloneProjectItems(liveProjects));
    const pendingId = pendingCreatedProjectId.current;
    const created = pendingId ? liveProjects.find((project) => project.id === pendingId) : null;
    if (created) {
      pendingCreatedProjectId.current = null;
      onProjectCreatedRef.current?.(created);
    }
  }, [liveMode, liveProjects]);

  useEffect(() => {
    if (!liveController || liveController.status !== "ready" || liveController.selectedProjectId || liveController.items.length === 0) return;
    const firstProjectId = liveController.items[0].id;
    void liveController.selectProject(firstProjectId).then(() => {
      onActiveProjectChangeRef.current?.(firstProjectId);
    }).catch(() => undefined);
  }, [liveController, liveController?.items, liveController?.selectedProjectId, liveController?.status]);

  useEffect(() => {
    if (!openProjectRequest || lastOpenToken.current === openProjectRequest.token) return;
    lastOpenToken.current = openProjectRequest.token;
    if (visibleProjects.some((project) => project.id === openProjectRequest.projectId)) {
      if (liveController) void liveController.selectProject(openProjectRequest.projectId).catch(() => undefined);
      else setSelectedProjectId(openProjectRequest.projectId);
      setWizardOpen(false);
      onActiveProjectChangeRef.current?.(openProjectRequest.projectId);
    }
  }, [liveController, openProjectRequest, visibleProjects]);

  useEffect(() => {
    if (!createProjectRequest || lastCreateToken.current === createProjectRequest.token) return;
    lastCreateToken.current = createProjectRequest.token;
    liveCreateAttemptRef.current = null;
    setWizardSeed({
      token: createProjectRequest.token,
      name: createProjectRequest.name,
      groupId: createProjectRequest.groupId,
    });
    setWizardOpen(true);
  }, [createProjectRequest]);

  const selectedProject = liveController
    ? (liveController.selectedProject
      ? liveProjects.find((project) => project.id === liveController.selectedProjectId) ?? null
      : null)
    : projects.find((project) => project.id === selectedProjectId) ?? null;

  const createProject = (project: ProjectWorkspaceItem) => {
    setProjects((current) => [project, ...current]);
    setWizardOpen(false);
    setSelectedProjectId(project.id);
    onActiveProjectChangeRef.current?.(project.id);
    onProjectCreated?.(project);
  };

  const createLiveProject = async (draft: ProjectDraft) => {
    if (!liveController) return;
    if (!liveCreateAttemptRef.current) {
      const candidates = new Map((liveController.inviteCandidates ?? []).map((candidate) => [candidate.id, candidate]));
      liveCreateAttemptRef.current = createMessagingProjectCreationAttempt(
        {
          name: draft.name.trim(),
          description: draft.description.trim(),
          genre: draft.genre.trim() || null,
          bpm: draft.bpm ? Number(draft.bpm) : null,
          objective: draft.description.trim() || null,
          deliveryAt: draft.deadline ? new Date(`${draft.deadline}T12:00:00`).toISOString() : null,
        },
        draft.memberIds.flatMap((profileId) => {
          const candidate = candidates.get(profileId);
          return candidate ? [{
            profileId,
            authorityRole: "contributor" as const,
            artisticRole: candidate.role || null,
            permissions: toLivePermissions(draft.permissions[profileId] ?? permissionsStandard),
          }] : [];
        }),
      );
    }
    const result = await liveCreateAttemptRef.current.run({
      createProject: liveController.createProject,
      inviteMember: liveController.inviteMember,
    });
    pendingCreatedProjectId.current = result.project_id;
    await liveController.selectProject(result.project_id);
    liveCreateAttemptRef.current = null;
    setWizardOpen(false);
    onActiveProjectChangeRef.current?.(result.project_id);
  };

  const updateProject = (project: ProjectWorkspaceItem) => {
    setProjects((current) => current.map((item) => item.id === project.id ? project : item));
  };

  const removeProject = (projectId: string) => {
    const remainingProjects = projects.filter((project) => project.id !== projectId);
    const nextProject = remainingProjects[0] ?? null;
    setProjects(remainingProjects);
    setSelectedProjectId(nextProject?.id ?? null);
    if (nextProject) onActiveProjectChangeRef.current?.(nextProject.id);
  };

  const openNewProject = () => {
    liveCreateAttemptRef.current = null;
    setWizardSeed((current) => ({ token: current.token + 1 }));
    setWizardOpen(true);
  };

  return (
    <section className="mwp-project-workspace" aria-label="Projets musicaux">
      {selectedProject ? (
        <ProjectDetail
          key={selectedProject.id}
          project={selectedProject}
          tab={activeProjectTab}
          onTabChange={setActiveProjectTab}
          onProjectChange={updateProject}
          onProjectRemove={() => removeProject(selectedProject.id)}
          onNewProject={openNewProject}
          liveController={liveController}
          invitationControl={liveController ? <ProjectInvitationsButton controller={liveController} /> : undefined}
        />
      ) : liveController?.status === "loading" || liveController?.detailStatus === "loading" ? (
        <div className="mwp-project-empty-direct" role="status"><strong>Chargement du projet…</strong></div>
      ) : liveController?.error || liveController?.actionError ? (
        <div className="mwp-project-empty-direct" role="alert">
          <strong>{liveController.error?.message || liveController.actionError?.message}</strong>
          <button type="button" className="agw-panel-create" onClick={() => void liveController.refresh().catch(() => undefined)}>Réessayer</button>
        </div>
      ) : (
        <div className="mwp-project-empty-direct">
          <strong>Aucun projet actif</strong>
          {liveController && <ProjectInvitationsButton controller={liveController} />}
          <button type="button" className="agw-panel-create" onClick={openNewProject}><Plus size={17} /> <span>Nouveau projet</span></button>
        </div>
      )}
      {wizardOpen && (
        <ProjectWizard
          key={"project-wizard-" + wizardSeed.token}
          initialName={wizardSeed.name}
          groupId={wizardSeed.groupId}
          onClose={() => { liveCreateAttemptRef.current = null; setWizardOpen(false); }}
          onCreate={createProject}
          onCreateDraft={liveController ? createLiveProject : undefined}
          inviteCandidates={liveController?.inviteCandidates}
          searchInviteCandidates={liveController?.searchInviteCandidates}
        />
      )}
    </section>
  );
}

export default ProjectsWorkspace;
