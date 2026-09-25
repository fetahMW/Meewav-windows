import {
  ArrowLeft,
  Archive,
  Bell,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  FolderKanban,
  History,
  ImagePlus,
  Info,
  Link2,
  LockKeyhole,
  LogOut,
  MessageCircleMore,
  MoreHorizontal,
  Mic,
  Music,
  Music2,
  Paperclip,
  Palette,
  Play,
  Plus,
  Search,
  Send,
  Smile,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  UserRound,
  Users,
  Vote,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { appendMeeWavEmoticon, MeeWavEmoticonComposer, MeeWavEmoticonPicker, MeeWavRichText } from "../emoticons/MeewavEmoticons";
import type {
  MessagingWorkspaceAttachmentsController,
  MessagingWorkspaceLiveStatus,
  MessagingWorkspaceMessage,
} from "./MessageWorkspace";
import type {
  MessagingAttachmentPurpose,
  MessagingAttachmentViewModel,
  MessagingStructuredMessageKind,
} from "./messaging.attachments.types";
import type { MessagingAttachmentQueueItem } from "./useMessagingAttachmentsLive";
import type {
  MessagingArtistGroupActivityViewModel,
  MessagingArtistGroupAuthorityRole,
  MessagingArtistGroupInvitationDecision,
  MessagingArtistGroupInvitationViewModel,
  MessagingArtistGroupRosterVisibility,
  MessagingArtistGroupVisibility,
} from "./messaging.groups.types";
import { playMessageSound } from "./messagingSounds";
import "./artist-groups-workspace.css";

type GroupPanel = "chat" | "planning" | "members" | "decisions" | "projects" | "settings";
type MemberStatus = "active" | "away" | "pending";

type GroupChatMessage = {
  id: string;
  sender: string;
  mine?: boolean;
  system?: boolean;
  body: string;
  time: string;
};

export type ArtistGroupMember = {
  id: string;
  name: string;
  role: string;
  avatar: string;
  online: boolean;
  status?: MemberStatus;
  authorityRole?: MessagingArtistGroupAuthorityRole;
  invitationId?: string;
};

export type ArtistGroup = {
  id: string;
  name: string;
  style: string;
  description: string;
  cover: string;
  statusInfo: string;
  lastMessage: string;
  isMain?: boolean;
  nextSessionTitle?: string;
  nextSessionTime?: string;
  confirmedCount?: number;
  waitingCount?: number;
  pendingDecisionTitle?: string;
  messages: GroupChatMessage[];
  members: ArtistGroupMember[];
  relatedProjectIds: string[];
  server?: {
    conversationId: string;
    authorityRole: MessagingArtistGroupAuthorityRole;
    visibility: MessagingArtistGroupVisibility;
    lifecycle: "active" | "archived" | "deleted";
    notificationsEnabled: boolean;
    rosterVisibility: MessagingArtistGroupRosterVisibility;
    personallyArchived: boolean;
    pendingInvitationCount: number;
  };
};

export type ArtistGroupsWorkspaceLiveController = {
  groups: ArtistGroup[];
  invitations: MessagingArtistGroupInvitationViewModel[];
  activity: MessagingArtistGroupActivityViewModel[];
  selectedGroupId: string | null;
  status: "idle" | "loading" | "ready" | "error";
  detailStatus: "idle" | "loading" | "ready" | "error";
  error: { message: string } | null;
  actionError: { message: string } | null;
  contacts: Array<{ id: string; username: string; displayName: string; avatar: string; role: string; online: boolean }>;
  contactsStatus: "idle" | "loading" | "ready" | "error";
  contactsError: string | null;
  searchContacts: (query: string) => Promise<unknown>;
  openGroup: (groupId: string) => Promise<unknown>;
  createGroup: (input: {
    name: string;
    description?: string | null;
    visibility?: MessagingArtistGroupVisibility;
    artisticRole?: string | null;
  }) => Promise<unknown>;
  updateGroup: (groupId: string, input: {
    name: string;
    description: string | null;
    visibility: MessagingArtistGroupVisibility;
  }) => Promise<unknown>;
  inviteMember: (groupId: string, profileId: string, input?: { artisticRole?: string | null; message?: string | null }) => Promise<unknown>;
  respondInvitation: (invitationId: string, decision: MessagingArtistGroupInvitationDecision) => Promise<unknown>;
  cancelInvitation: (invitationId: string, groupId: string) => Promise<unknown>;
  setPreferences: (input: {
    groupId: string;
    notificationsEnabled?: boolean;
    rosterVisibility?: MessagingArtistGroupRosterVisibility;
    archived?: boolean;
  }) => Promise<unknown>;
  setAuthorityRole: (groupId: string, profileId: string, role: Exclude<MessagingArtistGroupAuthorityRole, "owner">) => Promise<unknown>;
  setArtisticRole: (groupId: string, profileId: string, role: string | null) => Promise<unknown>;
  removeMember: (groupId: string, profileId: string) => Promise<unknown>;
  leaveGroup: (groupId: string) => Promise<unknown>;
  setGroupArchived: (groupId: string, archived: boolean) => Promise<unknown>;
  deleteGroup: (groupId: string, confirmationName: string) => Promise<unknown>;
  clearActionError: () => void;
  chat?: ArtistGroupChatLiveController;
};

export type ArtistGroupChatLiveController = {
  selectedConversationId: string | null;
  messages: Array<MessagingWorkspaceMessage & {
    server?: { senderProfileId?: string | null };
  }>;
  status: MessagingWorkspaceLiveStatus;
  error?: string | null;
  actionError?: string | null;
  clearActionError?: () => void;
  refresh: () => void | Promise<unknown>;
  sendText: (body: string) => unknown | Promise<unknown>;
  retryMessage: (clientMessageId: string) => unknown | Promise<unknown>;
  attachments?: MessagingWorkspaceAttachmentsController;
};

type CreateDraft = {
  name: string;
  style: string;
  description: string;
  cover: string;
  selectedMembers: string[];
  roles: Record<string, string>;
};

export type ArtistGroupsWorkspaceProps = {
  createGroupSignal?: number;
  onOpenMemberChat?: (member: { id: string; name: string; role: string; avatar: string }) => void;
  onOpenProject?: (projectId: string) => void;
  onCreateProject?: (groupId: string, projectName: string) => void;
  openGroupRequest?: { token: number; groupId: string };
  onItemsChange?: (groups: ArtistGroup[]) => void;
  onActiveGroupChange?: (groupId: string) => void;
  liveController?: ArtistGroupsWorkspaceLiveController | null;
};

const avatarsRoot = "/images/messaging/avatars";
const groupsRoot = "/images/messaging/groups";

const avatar = (index: number) => `${avatarsRoot}/avatar_${((index - 1) % 7) + 1}.png`;

const initialGroups: ArtistGroup[] = [
  {
    id: "group_1",
    name: "Midnight Echo",
    style: "Collectif Hip-Hop • Trap • R&B",
    description: "Le hub principal du collectif Midnight Echo. On prépare l’album « Echo Chambers ».",
    isMain: true,
    cover: `${groupsRoot}/group_1.png`,
    statusInfo: "3 membres dispo • 1 réponse attendue",
    lastMessage: "Alex : J’ai fini le mix du track #4 🎹",
    messages: [
      { id: "midnight_system", sender: "Système", system: true, body: "Midnight Echo · espace de travail du collectif", time: "" },
      { id: "midnight_1", sender: "Alex", body: "J’ai fini le mix du track #4. Le refrain frappe beaucoup mieux maintenant 🎹", time: "20:48" },
      { id: "midnight_2", sender: "Sarah", body: "Je vous envoie les doubles voix avant la session de ce soir.", time: "20:51" },
      { id: "midnight_3", sender: "Moi", mine: true, body: "Parfait. On valide les transitions ensemble à 21h30.", time: "20:54" },
      { id: "midnight_4", sender: "Marc", body: "J’ai aussi préparé une version sans l’interlude pour comparer.", time: "21:02" },
    ],
    nextSessionTitle: "Répétition Studio A",
    nextSessionTime: "Ce soir 21h30",
    confirmedCount: 3,
    waitingCount: 1,
    relatedProjectIds: ["project_1", "project_2"],
    members: [
      { id: "m1", name: "Alex", role: "Beatmaker", online: true, avatar: avatar(1) },
      { id: "m2", name: "Sarah", role: "Chanteuse", online: true, avatar: avatar(4) },
      { id: "m3", name: "Marc", role: "Producteur", online: true, avatar: avatar(3) },
      { id: "m4", name: "Julien", role: "Ingé son", online: true, avatar: avatar(2) },
    ],
  },
  {
    id: "group_2",
    name: "Neon Pulse",
    style: "Electronic • Synthwave",
    description: "Projet de collaboration synth-wave inspiré des années 80.",
    cover: `${groupsRoot}/group_2.png`,
    statusInfo: "5 membres • Session à confirmer",
    lastMessage: "Max : On se capte demain pour les synthés ? ⚡",
    messages: [
      { id: "neon_system", sender: "Système", system: true, body: "Neon Pulse · laboratoire synthwave", time: "" },
      { id: "neon_1", sender: "Max", body: "On se capte demain pour refaire les synthés du pont ? ⚡", time: "18:12" },
      { id: "neon_2", sender: "Chloe", body: "Oui, je garde la mélodie mais je vais doubler le refrain une octave au-dessus.", time: "18:18" },
      { id: "neon_3", sender: "Moi", mine: true, body: "Je réserve 19h. Emma, tu peux préparer la nouvelle séquence ?", time: "18:23" },
      { id: "neon_4", sender: "Emma", body: "C’est noté. Je vous mets aussi une version plus sombre dans le dossier.", time: "18:31" },
    ],
    pendingDecisionTitle: "Choisir le créneau de répétition",
    relatedProjectIds: ["project_3"],
    members: [
      { id: "m2_1", name: "Max", role: "Synth", online: true, avatar: avatar(2) },
      { id: "m2_2", name: "Leo", role: "Bass", online: false, avatar: avatar(1) },
      { id: "m2_3", name: "Chloe", role: "Vocals", online: true, avatar: avatar(4) },
      { id: "m2_4", name: "Dan", role: "Drums", online: false, avatar: avatar(3) },
      { id: "m2_5", name: "Emma", role: "Prod", online: true, avatar: avatar(5) },
    ],
  },
  {
    id: "group_3",
    name: "Silent Room",
    style: "Lo-fi • Chill • Ambient",
    description: "Espace de composition calme pour des textures sonores ambient.",
    cover: `${groupsRoot}/group_3.png`,
    statusInfo: "7 membres • 2 réponses attendues",
    lastMessage: "Luna : Les drums sont un peu forts sur la V1",
    messages: [
      { id: "silent_system", sender: "Système", system: true, body: "Silent Room · textures lo-fi et ambient", time: "" },
      { id: "silent_1", sender: "Luna", body: "Les drums sont encore un peu forts sur la V1, surtout après 1:40.", time: "10:05" },
      { id: "silent_2", sender: "Luc", body: "Je baisse le bus de 2 dB et je laisse davantage respirer les nappes.", time: "10:09" },
      { id: "silent_3", sender: "Moi", mine: true, body: "Bonne direction. Gardons le grain de la caisse claire, il fait l’identité du morceau.", time: "10:14" },
      { id: "silent_4", sender: "Zoe", body: "Je peux enregistrer une guitare très légère pour la fin 🌙", time: "10:22" },
    ],
    relatedProjectIds: [],
    members: [
      { id: "m3_1", name: "Luna", role: "Vocal", online: true, avatar: avatar(5) },
      { id: "m3_2", name: "Tom", role: "Keys", online: false, avatar: avatar(6) },
      { id: "m3_3", name: "Zoe", role: "Guitar", online: true, avatar: avatar(7) },
      { id: "m3_4", name: "Sam", role: "Beatmaker", online: false, avatar: avatar(1) },
      { id: "m3_5", name: "Mia", role: "Bass", online: true, avatar: avatar(2) },
      { id: "m3_6", name: "Luc", role: "Mix", online: true, avatar: avatar(3) },
      { id: "m3_7", name: "Eva", role: "Mastering", online: false, avatar: avatar(4) },
    ],
  },
  {
    id: "group_4",
    name: "The Cypher",
    style: "Rap • Boom Bap",
    description: "Session freestyle et boom-bap pure souche.",
    cover: `${groupsRoot}/group_4.png`,
    statusInfo: "6 membres • Vote en cours",
    lastMessage: "Kray : On valide la cover ? 🎨",
    messages: [
      { id: "cypher_system", sender: "Système", system: true, body: "The Cypher · session rap et boom bap", time: "" },
      { id: "cypher_1", sender: "Kray", body: "On valide la cover avec le lettrage argent ou on garde la version brute ? 🎨", time: "16:35" },
      { id: "cypher_2", sender: "Flow", body: "Version brute pour moi. Elle colle mieux au morceau.", time: "16:38" },
      { id: "cypher_3", sender: "Moi", mine: true, body: "Je lance le vote dans Décisions et on clôture ce soir.", time: "16:42" },
      { id: "cypher_4", sender: "BeatZ", body: "Le master sans limiteur est aussi prêt pour demain.", time: "16:49" },
    ],
    pendingDecisionTitle: "Valider la DA de la cover",
    relatedProjectIds: [],
    members: [
      { id: "m4_1", name: "Kray", role: "Rapper", online: true, avatar: avatar(5) },
      { id: "m4_2", name: "DJ T", role: "DJ", online: false, avatar: avatar(1) },
      { id: "m4_3", name: "Flow", role: "Rapper", online: true, avatar: avatar(2) },
      { id: "m4_4", name: "BeatZ", role: "Beatmaker", online: true, avatar: avatar(3) },
      { id: "m4_5", name: "Nas", role: "Rapper", online: false, avatar: avatar(4) },
      { id: "m4_6", name: "Ken", role: "Mix", online: true, avatar: avatar(5) },
    ],
  },
  {
    id: "group_5",
    name: "Roots & Strings",
    style: "Soul • Acoustic",
    description: "Groupe live pour des sessions acoustiques soul.",
    cover: `${groupsRoot}/group_5.png`,
    statusInfo: "8 membres • Répète samedi 16h",
    lastMessage: "Ben : N’oubliez pas vos instruments samedi ! 🎸",
    messages: [
      { id: "roots_system", sender: "Système", system: true, body: "Roots & Strings · formation live acoustique", time: "" },
      { id: "roots_1", sender: "Ben", body: "N’oubliez pas vos instruments samedi ! On attaque le set à 16h 🎸", time: "09:12" },
      { id: "roots_2", sender: "Lia", body: "Je ramène aussi le micro à ruban pour les harmonies.", time: "09:16" },
      { id: "roots_3", sender: "Moi", mine: true, body: "Parfait. On commence par les trois morceaux soul, puis on travaille les transitions.", time: "09:20" },
      { id: "roots_4", sender: "Pat", body: "Je prépare deux propositions de ligne de sax pour le final.", time: "09:27" },
    ],
    nextSessionTitle: "Planning",
    nextSessionTime: "Samedi 16h • Studio B",
    relatedProjectIds: [],
    members: [
      { id: "m5_1", name: "Ben", role: "Guitar", online: true, avatar: avatar(6) },
      { id: "m5_2", name: "Lia", role: "Vocals", online: true, avatar: avatar(7) },
      { id: "m5_3", name: "Dan", role: "Keys", online: false, avatar: avatar(1) },
      { id: "m5_4", name: "Kim", role: "Bass", online: true, avatar: avatar(2) },
      { id: "m5_5", name: "Ron", role: "Drums", online: false, avatar: avatar(3) },
      { id: "m5_6", name: "Pat", role: "Sax", online: true, avatar: avatar(4) },
      { id: "m5_7", name: "Jon", role: "Trumpet", online: false, avatar: avatar(5) },
      { id: "m5_8", name: "Sue", role: "Vocals", online: true, avatar: avatar(6) },
    ],
  },
];

const GROUPS_SESSION_EVENT = "meewav:artist-groups-session-changed";
let artistGroupSessionItems: ArtistGroup[] | null = null;

function cloneArtistGroups(groups: ArtistGroup[]) {
  return groups.map((group) => ({
    ...group,
    relatedProjectIds: [...group.relatedProjectIds],
    messages: group.messages.map((message) => ({ ...message })),
    members: group.members.map((member) => ({ ...member })),
  }));
}

export function getInitialArtistGroupsSnapshot() {
  return cloneArtistGroups(artistGroupSessionItems ?? initialGroups);
}

export function linkProjectToArtistGroup(groupId: string | undefined, projectId: string) {
  if (!groupId) return;
  const source = artistGroupSessionItems ?? cloneArtistGroups(initialGroups);
  artistGroupSessionItems = source.map((group) => group.id === groupId && !group.relatedProjectIds.includes(projectId)
    ? { ...group, relatedProjectIds: [...group.relatedProjectIds, projectId] }
    : group);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(GROUPS_SESSION_EVENT));
}

const inviteCandidates = [
  { id: "dami", name: "Dami", avatar: avatar(1) },
  { id: "luna", name: "Luna", avatar: avatar(5) },
  { id: "kray", name: "Kray", avatar: avatar(7) },
];

const roleOptions = [
  "Accordéoniste", "Bassiste", "Batteur", "Beatboxer", "Beatmaker", "Réalisateur Vidéo",
  "Compositeur", "Danseur", "Danseuse", "DJ", "Guitariste Électrique", "Guitariste",
  "Ingénieur du Son", "Cordiste", "Cuivres", "Claviériste", "Percussionniste", "Producteur",
  "Rappeur", "Chanteuse", "Chanteur", "Utilisatrice", "Utilisateur",
];

const emptyDraft: CreateDraft = {
  name: "",
  style: "",
  description: "",
  cover: "",
  selectedMembers: [],
  roles: {},
};

function MemberAvatar({ member, size = "normal" }: { member: ArtistGroupMember; size?: "small" | "normal" | "large" }) {
  return (
    <span className={`agw-avatar is-${size}`} title={`${member.name} — ${member.role}`}>
      <img src={member.avatar} alt="" />
      {member.online && <i aria-label="En ligne" />}
    </span>
  );
}

function GroupWaveMark() {
  return (
    <svg viewBox="0 0 48 48" role="presentation">
      <path d="M5 27h4l4-12 6 22 6-28 5 22 5-14 4 10h4" />
    </svg>
  );
}

function PanelShell({
  title,
  eyebrow,
  onBack,
  onClose,
  toolbar,
  sideActions,
  className,
  identityIcon,
  hideClose = false,
  children,
}: {
  title: string;
  eyebrow: string;
  onBack?: () => void;
  onClose?: () => void;
  toolbar?: ReactNode;
  sideActions?: ReactNode;
  className?: string;
  identityIcon?: ReactNode;
  hideClose?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`agw-panel${className ? ` ${className}` : ""}`} role="dialog" aria-modal="true" aria-label={title}>
      <header className={`agw-panel__bar${toolbar ? " has-toolbar is-workspace-subbar mw-hub-chipbar" : ""}`}>
        <div className="agw-panel__identity">
          {onBack && <button type="button" className={`agw-icon-button${identityIcon ? " agw-panel__identity-back" : ""}`} onClick={onBack} aria-label="Retour"><ArrowLeft size={19} /></button>}
          {identityIcon && <span className="agw-panel__identity-mark" aria-hidden="true">{identityIcon}</span>}
          <span><small>{eyebrow}</small><strong>{title}</strong></span>
        </div>
        {toolbar && <div className="agw-panel__toolbar">{toolbar}</div>}
        {toolbar && sideActions && <div className="agw-panel__controls">{sideActions}</div>}
        {onClose && !hideClose && (
          <div className="agw-panel__controls">
            <button type="button" className="agw-icon-button" onClick={onClose} aria-label="Fermer"><X size={20} /></button>
          </div>
        )}
      </header>
      <div className={`agw-panel__layout${sideActions && !toolbar ? " has-side-actions" : ""}`}>
        <div className="agw-panel__body">{children}</div>
        {sideActions && !toolbar && <aside className="agw-panel__side-rail" aria-label="Actions du groupe">{sideActions}</aside>}
      </div>
    </section>
  );
}

function inferAttachmentPurpose(file: File): MessagingAttachmentPurpose {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "document";
}

function structuredKindForAttachment(purpose: MessagingAttachmentPurpose): MessagingStructuredMessageKind {
  if (purpose === "image") return "image";
  if (purpose === "video") return "video";
  if (purpose === "audio" || purpose === "voice_note" || purpose === "track_stem") return "audio";
  return "file";
}

function formatAttachmentStatus(item: MessagingAttachmentQueueItem) {
  if (item.status === "queued" || item.status === "preparing") return "Préparation…";
  if (item.status === "uploading") return "Envoi sécurisé…";
  if (item.status === "finalizing") return "Vérification…";
  if (item.status === "ready") return "Prêt à envoyer";
  if (item.status === "sending") return "Publication…";
  if (item.status === "sent") return "Envoyé";
  if (item.status === "discarding") return "Suppression…";
  return item.error?.message ?? "Échec de l’envoi";
}

function GroupAttachmentMessage({
  message,
  resolveUrl,
}: {
  message: MessagingWorkspaceMessage;
  resolveUrl: (attachment: MessagingAttachmentViewModel) => Promise<string>;
}) {
  const first = message.attachments?.[0];
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setResolvedUrl(null);
    setError(null);
  }, [first?.mediaFileId]);

  if (!first) return <div className="mw-bubble mw-bubble--text"><p><MeeWavRichText>{message.body}</MeeWavRichText></p></div>;

  const resolve = async () => {
    if (!first.available || loading) return;
    setLoading(true);
    setError(null);
    try {
      setResolvedUrl(await resolveUrl(first));
    } catch {
      setError("Ce fichier privé n’est pas disponible pour le moment.");
    } finally {
      setLoading(false);
    }
  };

  if (resolvedUrl && message.kind === "image") {
    return <figure className="mw-image-message"><img src={resolvedUrl} alt={first.displayName} /><figcaption><strong>{first.displayName}</strong></figcaption></figure>;
  }
  if (resolvedUrl && message.kind === "video") {
    return <figure className="mw-image-message mw-video-message"><video src={resolvedUrl} controls preload="metadata">Votre navigateur ne peut pas lire cette vidéo.</video><figcaption><strong>{first.displayName}</strong></figcaption></figure>;
  }
  if (resolvedUrl && (message.kind === "audio" || message.kind === "audio-file")) {
    return <div className="mw-bubble mw-bubble--file is-server-attachment"><FileAudio /><span><strong>{first.displayName}</strong><small>{first.mimeType}</small></span><audio src={resolvedUrl} controls preload="metadata" /></div>;
  }
  if (resolvedUrl) {
    return <div className="mw-bubble mw-bubble--file is-server-attachment"><FileText /><span><strong>{first.displayName}</strong><small>{first.mimeType}</small></span><a href={resolvedUrl} target="_blank" rel="noreferrer">Ouvrir</a></div>;
  }

  const AttachmentIcon = message.kind === "image"
    ? FileImage
    : message.kind === "video"
      ? FileVideo
      : message.kind === "audio" || message.kind === "audio-file"
        ? FileAudio
        : FileText;
  return (
    <div className="mw-bubble mw-bubble--file is-server-attachment">
      <AttachmentIcon />
      <span><strong>{first.displayName}</strong><small>{error ?? (first.available ? `${first.mimeType} · accès privé` : "Fichier indisponible")}</small></span>
      <button type="button" disabled={!first.available || loading} onClick={() => void resolve()} aria-label={`Ouvrir ${first.displayName}`}>{loading ? "…" : <Play />}</button>
    </div>
  );
}

function GroupLiveMessage({
  group,
  message,
  retryMessage,
  resolveAttachmentUrl,
}: {
  group: ArtistGroup;
  message: MessagingWorkspaceMessage & { server?: { senderProfileId?: string | null } };
  retryMessage: (clientMessageId: string) => unknown | Promise<unknown>;
  resolveAttachmentUrl?: (attachment: MessagingAttachmentViewModel) => Promise<string>;
}) {
  const mine = message.author === "me";
  const senderName = message.server?.senderProfileId
    ? group.members.find((member) => member.id === message.server?.senderProfileId)?.name
    : null;
  const hasAttachment = Boolean(message.attachments?.length && resolveAttachmentUrl);
  const family = hasAttachment || ["audio-file", "image", "video", "file"].includes(message.kind)
    ? "attachment"
    : "conversation";
  return (
    <>
      {message.dayLabel && <div className="mw-day-marker"><span>{message.dayLabel}</span></div>}
      <article className={`mw-message is-family-${family} has-tail ${mine ? "is-mine" : "is-theirs"}`}>
        {!mine && <strong className="mwp-project-chat__sender">{senderName ?? "Membre du groupe"}</strong>}
        {hasAttachment && resolveAttachmentUrl
          ? <>{message.attachments?.map((attachment) => <GroupAttachmentMessage key={attachment.id} message={{ ...message, attachments: [attachment] }} resolveUrl={resolveAttachmentUrl} />)}</>
          : <div className="mw-bubble mw-bubble--text"><p><MeeWavRichText>{message.body}</MeeWavRichText></p></div>}
        <div className="mw-message__meta">
          {mine && message.deliveryStatus === "failed" && message.sourceId && (
            <button type="button" onClick={() => void retryMessage(message.sourceId!)}>Échec · Réessayer</button>
          )}
          <span className="mw-message__time">{message.time}{mine && (message.deliveryStatus === "pending" ? <Check size={12} /> : <CheckCircle2 size={12} />)}</span>
        </div>
      </article>
    </>
  );
}

function GroupAttachmentQueue({
  items,
  sending,
  onRetry,
  onDiscard,
  onSend,
}: {
  items: MessagingAttachmentQueueItem[];
  sending: boolean;
  onRetry: (id: string) => void;
  onDiscard: (id: string) => void;
  onSend: () => void;
}) {
  if (items.length === 0) return null;
  const ready = items.every((item) => item.status === "ready");
  const busy = sending || items.some((item) => ["queued", "preparing", "uploading", "finalizing", "sending", "discarding"].includes(item.status));
  return (
    <section className="mw-attachment-queue" aria-label="Pièces jointes du groupe en préparation">
      <div className="mw-attachment-queue__items">
        {items.map((item) => {
          const ItemIcon = item.purpose === "image" ? FileImage : item.purpose === "video" ? FileVideo : item.purpose === "document" ? FileText : FileAudio;
          return <article key={item.id} className={`is-${item.status}`}><ItemIcon aria-hidden="true" /><span><strong>{item.displayName}</strong><small>{formatAttachmentStatus(item)}</small><i style={{ "--mw-upload-progress": `${Math.round(item.progress * 100)}%` } as CSSProperties} /></span>{item.status === "failed" && <button type="button" onClick={() => onRetry(item.id)}>Réessayer</button>}{!["sending", "sent", "discarding"].includes(item.status) && <button type="button" className="is-icon" onClick={() => onDiscard(item.id)} aria-label={`Retirer ${item.displayName}`}><X /></button>}</article>;
        })}
      </div>
      <button type="button" className="mw-attachment-queue__send" disabled={!ready || busy} onClick={onSend}><Send /> Envoyer</button>
    </section>
  );
}

function GroupChatPanel({
  group,
  onGroupChange,
  liveMode,
  liveChat,
}: {
  group: ArtistGroup;
  onGroupChange: (group: ArtistGroup) => void;
  liveMode: boolean;
  liveChat?: ArtistGroupChatLiveController;
}) {
  const [draft, setDraft] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [sendingAttachments, setSendingAttachments] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const pendingAttachmentPurposeRef = useRef<MessagingAttachmentPurpose | null>(null);
  const conversationId = group.server?.conversationId ?? null;
  const liveConversationReady = Boolean(
    liveMode
    && liveChat
    && conversationId
    && liveChat.selectedConversationId === conversationId,
  );
  const liveMessages = liveConversationReady ? liveChat?.messages ?? [] : [];
  const liveAttachmentItems = liveConversationReady && liveChat?.attachments && conversationId
    ? liveChat.attachments.queue.filter((item) => item.conversationId === conversationId && item.status !== "sent")
    : [];

  useEffect(() => {
    window.setTimeout(() => messagesEndRef.current?.scrollIntoView?.({ block: "end" }), 0);
  }, [group.messages.length, liveMessages.length]);

  const appendMessage = (body: string) => {
    const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date());
    onGroupChange({
      ...group,
      lastMessage: `Moi : ${body}`,
      waitingCount: 0,
      messages: [
        ...group.messages,
        {
          id: `group_message_${group.id}_${Date.now()}`,
          sender: "Moi",
          mine: true,
          body,
          time,
        },
      ],
    });
    void playMessageSound("send");
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    if (!liveMode) {
      appendMessage(body);
      setDraft("");
      return;
    }
    if (!liveConversationReady || !liveChat) return;
    setDraft("");
    setLocalError(null);
    const result = await liveChat.sendText(body);
    if (result === null || result === false) {
      setDraft(body);
      setLocalError("Le message n’a pas pu être envoyé.");
      return;
    }
    void playMessageSound("send");
  };

  const openAttachmentPicker = (accept: string, purpose: MessagingAttachmentPurpose | null = null) => {
    if (!attachmentInputRef.current) return;
    if (liveMode && (!liveConversationReady || !liveChat?.attachments)) {
      setLocalError("Le stockage sécurisé n’est pas disponible dans cette discussion.");
      return;
    }
    pendingAttachmentPurposeRef.current = purpose;
    attachmentInputRef.current.accept = accept;
    attachmentInputRef.current.click();
  };

  const attachFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!liveMode) {
      appendMessage(`📎 ${file.name}`);
      return;
    }
    if (!liveConversationReady || !liveChat?.attachments || !conversationId) return;
    const itemId = liveChat.attachments.enqueue({
      conversationId,
      file,
      purpose: pendingAttachmentPurposeRef.current ?? inferAttachmentPurpose(file),
    });
    pendingAttachmentPurposeRef.current = null;
    if (!itemId) setLocalError("Ce fichier n’a pas pu être ajouté à la file d’envoi.");
    else setLocalError(null);
  };

  const sendAttachments = async () => {
    if (!liveConversationReady || !liveChat?.attachments || !conversationId || sendingAttachments) return;
    const readyItems = liveAttachmentItems.filter((item) => item.status === "ready");
    if (readyItems.length !== liveAttachmentItems.length || readyItems.length === 0) return;
    setSendingAttachments(true);
    setLocalError(null);
    try {
      for (const item of readyItems) {
        const result = await liveChat.attachments.sendReadyMessage({
          conversationId,
          clientMessageId: item.id,
          kind: structuredKindForAttachment(item.purpose),
          body: item.displayName,
          attachmentItemIds: [item.id],
          attachmentDetails: {
            [item.id]: {
              role: item.purpose === "document" ? "document" : "primary",
              label: item.displayName,
            },
          },
        });
        if (!result) {
          setLocalError("La pièce jointe est prête, mais sa publication a échoué. Tu peux réessayer.");
          return;
        }
      }
      liveChat.attachments.clearSent?.();
      void playMessageSound("send");
    } finally {
      setSendingAttachments(false);
    }
  };

  const composerDisabled = liveMode && !liveConversationReady;

  return (
    <section className="mw-chat-scene mwp-project-chat agw-group-chat" aria-label={`Chat de ${group.name}`}>
      <div className="mw-chat-timeline mwp-project-chat__timeline">
        <div className="mw-chat-timeline__inner mwp-project-chat__messages">
          {!liveMode && group.messages.map((message) => {
            if (message.system) {
              return <p key={message.id} className="mwp-project-chat__system">{message.body}</p>;
            }
            return (
              <article key={message.id} className={`mw-message is-family-conversation has-tail ${message.mine ? "is-mine" : "is-theirs"}`}>
                {!message.mine && <strong className="mwp-project-chat__sender">{message.sender}</strong>}
                <div className="mw-bubble mw-bubble--text"><p><MeeWavRichText>{message.body}</MeeWavRichText></p></div>
                <div className="mw-message__meta"><span className="mw-message__time">{message.time}</span></div>
              </article>
            );
          })}
          {liveMode && (!conversationId || !liveChat) && <div className="mw-search-empty"><MessageCircleMore /><span>Cette discussion n’est pas encore reliée à une conversation serveur.</span></div>}
          {liveMode && conversationId && liveChat && !liveConversationReady && <div className="mw-search-empty" role="status"><MessageCircleMore /><span>Chargement de la discussion du groupe…</span></div>}
          {liveConversationReady && liveChat?.status === "loading" && liveMessages.length === 0 && <div className="mw-search-empty" role="status"><MessageCircleMore /><span>Chargement des messages…</span></div>}
          {liveConversationReady && liveChat?.status === "error" && <div className="mw-search-empty" role="alert"><MessageCircleMore /><span>{liveChat.error ?? "Impossible de charger les messages."}</span><button type="button" onClick={() => void liveChat.refresh()}>Réessayer</button></div>}
          {liveConversationReady && liveChat?.status !== "loading" && liveChat?.status !== "error" && liveMessages.length === 0 && <div className="mw-search-empty"><MessageCircleMore /><span>La discussion est prête. Écris le premier message du groupe.</span></div>}
          {liveConversationReady && liveChat && liveMessages.map((message) => <GroupLiveMessage key={message.id} group={group} message={message} retryMessage={liveChat.retryMessage} resolveAttachmentUrl={liveChat.attachments?.resolveUrl} />)}
          <div ref={messagesEndRef} />
        </div>
      </div>
      <div className="mw-composer-zone mwp-project-chat__composer-zone">
        {(localError || (liveConversationReady && liveChat?.actionError)) && <div className="mw-search-empty" role="alert"><span>{localError ?? liveChat?.actionError}</span><button type="button" onClick={() => { setLocalError(null); liveChat?.clearActionError?.(); }}>Fermer</button></div>}
        <GroupAttachmentQueue items={liveAttachmentItems} sending={sendingAttachments} onRetry={(id) => { void liveChat?.attachments?.retry(id); }} onDiscard={(id) => { void liveChat?.attachments?.discard(id); }} onSend={() => { void sendAttachments(); }} />
        <div className="mw-composer-row">
          <form className="mw-composer mwp-project-chat__composer" onSubmit={(event) => { void sendMessage(event); }}>
            <button type="button" disabled={composerDisabled} onClick={() => openAttachmentPicker("image/*,video/*,audio/*,application/pdf")} aria-label="Ajouter une pièce jointe"><Paperclip /></button>
            <MeeWavEmoticonComposer disabled={composerDisabled} value={draft} onChange={setDraft} maxLength={4_000} placeholder="Écris ton message..." ariaLabel={`Message pour ${group.name}`} />
            <MeeWavEmoticonPicker triggerIcon={<Smile aria-hidden="true" />} disabled={composerDisabled} onSelect={(emoticon) => setDraft((value) => appendMeeWavEmoticon(value, emoticon.name, 4_000))} />
            <button type="button" disabled={composerDisabled} onClick={() => openAttachmentPicker("audio/*", "audio")} aria-label="Ajouter un contenu musical"><Music /></button>
            <button type="button" disabled={composerDisabled} onClick={() => openAttachmentPicker("audio/*", "voice_note")} aria-label="Ajouter une note vocale"><Mic /></button>
            <button type="submit" disabled={composerDisabled || !draft.trim()} className={`mw-composer-send${draft.trim() ? " is-ready" : ""}`} aria-label="Envoyer le message"><Send /></button>
          </form>
        </div>
        <input ref={attachmentInputRef} type="file" onChange={attachFile} hidden />
      </div>
    </section>
  );
}

export default function ArtistGroupsWorkspace({
  createGroupSignal = 0,
  onOpenMemberChat,
  onOpenProject,
  onCreateProject,
  openGroupRequest,
  onItemsChange,
  onActiveGroupChange,
  liveController = null,
}: ArtistGroupsWorkspaceProps) {
  const liveMode = Boolean(liveController);
  const [groups, setGroups] = useState<ArtistGroup[]>(() => cloneArtistGroups(liveController?.groups ?? artistGroupSessionItems ?? initialGroups));
  const [panel, setPanel] = useState<{ groupId: string; view: GroupPanel } | null>(() => {
    const firstGroup = (liveController?.groups ?? artistGroupSessionItems ?? initialGroups)[0];
    return firstGroup ? { groupId: firstGroup.id, view: "chat" } : null;
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState(1);
  const [createDraft, setCreateDraft] = useState<CreateDraft>(emptyDraft);
  const [createError, setCreateError] = useState("");
  const [toast, setToast] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [sessionFormOpen, setSessionFormOpen] = useState(false);
  const [sessionTitle, setSessionTitle] = useState("");
  const [sessionDate, setSessionDate] = useState("");
  const [sessionPlace, setSessionPlace] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [inviteMemberOpen, setInviteMemberOpen] = useState(false);
  const [inviteMemberName, setInviteMemberName] = useState("");
  const [inviteMemberProfileId, setInviteMemberProfileId] = useState<string | null>(null);
  const [memberMenu, setMemberMenu] = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<{ groupId: string; member: ArtistGroupMember } | null>(null);
  const [memberRoleEditor, setMemberRoleEditor] = useState<string | null>(null);
  const [voteChoice, setVoteChoice] = useState("Samedi 16h");
  const [decisionOptionsByGroup, setDecisionOptionsByGroup] = useState<Record<string, string[]>>({
    group_2: ["Samedi 16h", "Dimanche 18h", "Lundi 20h"],
    group_4: ["Option A", "Option B", "Option C"],
  });
  const [completedDecision, setCompletedDecision] = useState<{ title: string; result: string } | null>(null);
  const [recordedVotes, setRecordedVotes] = useState<Record<string, string>>({});
  const [newDecisionOpen, setNewDecisionOpen] = useState(false);
  const [decisionTitle, setDecisionTitle] = useState("");
  const [decisionOptions, setDecisionOptions] = useState("");
  const [projectMode, setProjectMode] = useState<"link" | "create" | null>(null);
  const [projectTitle, setProjectTitle] = useState("");
  const [notifications, setNotifications] = useState<Record<string, boolean>>({});
  const [privateGroups, setPrivateGroups] = useState<Record<string, boolean>>({});
  const [settingsDetail, setSettingsDetail] = useState<"theme" | "admins" | "history" | null>(null);
  const [dangerConfirmation, setDangerConfirmation] = useState<{ groupId: string; action: "leave" | "delete" } | null>(null);
  const lastOpenGroupToken = useRef<number | null>(null);
  const lastCreateGroupSignal = useRef(createGroupSignal);
  const onItemsChangeRef = useRef(onItemsChange);
  const onActiveGroupChangeRef = useRef(onActiveGroupChange);
  onItemsChangeRef.current = onItemsChange;
  onActiveGroupChangeRef.current = onActiveGroupChange;

  useEffect(() => {
    if (createGroupSignal <= 0 || lastCreateGroupSignal.current === createGroupSignal) return;
    lastCreateGroupSignal.current = createGroupSignal;
    setCreateStep(1);
    setCreateDraft(emptyDraft);
    setCreateError("");
    setCreateOpen(true);
  }, [createGroupSignal]);

  useEffect(() => {
    if (liveMode) return;
    artistGroupSessionItems = cloneArtistGroups(groups);
    onItemsChangeRef.current?.(cloneArtistGroups(groups));
  }, [groups, liveMode]);

  useEffect(() => {
    if (!liveController) return;
    const nextGroups = cloneArtistGroups(liveController.groups);
    setGroups(nextGroups);
    setPanel((current) => {
      if (current && nextGroups.some((group) => group.id === current.groupId)) return current;
      const firstGroup = nextGroups[0];
      return firstGroup ? { groupId: firstGroup.id, view: "chat" } : null;
    });
    const requestedGroupId = panel && nextGroups.some((group) => group.id === panel.groupId)
      ? panel.groupId
      : nextGroups[0]?.id;
    if (requestedGroupId && liveController.selectedGroupId !== requestedGroupId) {
      void liveController.openGroup(requestedGroupId);
    }
  }, [liveController, liveController?.groups, panel]);

  useEffect(() => {
    if (!liveController?.actionError) return;
    setToast(liveController.actionError.message);
  }, [liveController?.actionError]);

  useEffect(() => {
    if (!openGroupRequest || lastOpenGroupToken.current === openGroupRequest.token) return;
    if (!groups.some((group) => group.id === openGroupRequest.groupId)) return;
    lastOpenGroupToken.current = openGroupRequest.token;
    setCreateOpen(false);
    setPanel((current) => ({
      groupId: openGroupRequest.groupId,
      view: current?.view ?? "chat",
    }));
    onActiveGroupChangeRef.current?.(openGroupRequest.groupId);
    void liveController?.openGroup(openGroupRequest.groupId);
  }, [groups, liveController, openGroupRequest]);

  useEffect(() => {
    if (liveMode) return undefined;
    const syncExternalGroupChanges = () => {
      if (artistGroupSessionItems) setGroups(cloneArtistGroups(artistGroupSessionItems));
    };
    window.addEventListener(GROUPS_SESSION_EVENT, syncExternalGroupChanges);
    return () => window.removeEventListener(GROUPS_SESSION_EVENT, syncExternalGroupChanges);
  }, [liveMode]);

  const activeGroup = panel ? groups.find((group) => group.id === panel.groupId) ?? null : null;

  const notify = (message: string) => {
    setToast(message);
  };

  const updateGroup = (groupId: string, update: (group: ArtistGroup) => ArtistGroup) => {
    setGroups((current) => current.map((group) => group.id === groupId ? update(group) : group));
  };

  const openPanel = (groupId: string, view: GroupPanel) => {
    setDetailsOpen(false);
    setSessionFormOpen(false);
    setMemberMenu(null);
    if (view === "decisions") {
      setVoteChoice(recordedVotes[groupId] ?? decisionOptionsByGroup[groupId]?.[0] ?? "Samedi 16h");
    }
    setPanel({ groupId, view });
    onActiveGroupChangeRef.current?.(groupId);
    void liveController?.openGroup(groupId);
  };

  const resetCreate = () => {
    setCreateDraft(emptyDraft);
    setCreateStep(1);
    setCreateError("");
  };

  const handleCover = (event: ChangeEvent<HTMLInputElement>) => {
    if (liveMode) {
      notify("La couverture serveur sera disponible avec le stockage média.");
      return;
    }
    const file = event.target.files?.[0];
    if (!file) return;
    setCreateDraft((current) => ({ ...current, cover: URL.createObjectURL(file) }));
    setCreateError("");
  };

  const advanceCreate = () => {
    if (createStep === 1 && (!createDraft.name.trim() || (!liveMode && !createDraft.cover))) {
      setCreateError(liveMode ? "Le nom du groupe est obligatoire." : "Le nom et l’image de couverture sont obligatoires.");
      return;
    }
    if (!liveMode && createStep === 2 && createDraft.selectedMembers.length === 0) {
      setCreateError("Invite au moins un autre artiste.");
      return;
    }
    setCreateError("");
    if (createStep < 3) setCreateStep((step) => step + 1);
  };

  const createGroup = () => {
    if (liveController) {
      const name = createDraft.name.trim();
      if (!name) return;
      void liveController.createGroup({
        name,
        description: createDraft.description.trim() || null,
        visibility: "private",
        artisticRole: createDraft.style.trim() || null,
      }).then(() => {
        setCreateOpen(false);
        resetCreate();
        notify(`Le groupe « ${name} » est prêt.`);
      }).catch(() => undefined);
      return;
    }
    const selected = inviteCandidates.filter((candidate) => createDraft.selectedMembers.includes(candidate.id));
    const newGroup: ArtistGroup = {
      id: `group_${Date.now()}`,
      name: createDraft.name.trim(),
      style: createDraft.style.trim() || "Groupe d’artistes",
      description: createDraft.description.trim() || `Le hub de collaboration de ${createDraft.name.trim()}.`,
      cover: createDraft.cover,
      statusInfo: `${selected.length + 1} membres • Prêt à collaborer`,
      lastMessage: "Le groupe vient d’être créé.",
      messages: [
        { id: `group_system_${Date.now()}`, sender: "Système", system: true, body: `${createDraft.name.trim()} · nouvel espace de groupe`, time: "" },
        { id: `group_welcome_${Date.now()}`, sender: "Moi", mine: true, body: "Bienvenue dans le groupe. On peut commencer à organiser notre première session ici.", time: "Maintenant" },
      ],
      relatedProjectIds: [],
      members: selected.map((candidate, index) => ({
        id: `${candidate.id}_${Date.now()}`,
        name: candidate.name,
        role: createDraft.roles[candidate.id] || "Beatmaker",
        avatar: candidate.avatar,
        online: index === 0,
      })),
    };
    setGroups((current) => [newGroup, ...current]);
    setPanel({ groupId: newGroup.id, view: "chat" });
    onActiveGroupChangeRef.current?.(newGroup.id);
    setCreateOpen(false);
    resetCreate();
    notify(`Le groupe « ${newGroup.name} » est prêt.`);
  };

  const removeMember = (groupId: string, memberId: string) => {
    if (liveController) {
      const pendingMember = groups.find((group) => group.id === groupId)?.members.find((member) => member.id === memberId && member.invitationId);
      const operation = pendingMember?.invitationId
        ? liveController.cancelInvitation(pendingMember.invitationId, groupId)
        : liveController.removeMember(groupId, memberId);
      void operation.then(() => {
        setMemberMenu(null);
        notify(pendingMember ? "L’invitation a été annulée." : "Le membre a été retiré du groupe.");
      }).catch(() => undefined);
      return;
    }
    updateGroup(groupId, (group) => ({ ...group, members: group.members.filter((member) => member.id !== memberId) }));
    setMemberMenu(null);
    notify("Le membre a été retiré du groupe.");
  };

  const changeMemberRole = (groupId: string, memberId: string, role: string) => {
    if (liveController) {
      void liveController.setArtisticRole(groupId, memberId, role).then(() => {
        setMemberRoleEditor(null);
        setMemberMenu(null);
        notify("Le rôle artistique a été actualisé.");
      }).catch(() => undefined);
      return;
    }
    updateGroup(groupId, (group) => ({
      ...group,
      members: group.members.map((member) => member.id === memberId ? { ...member, role } : member),
    }));
    setMemberRoleEditor(null);
    setMemberMenu(null);
    notify("Le rôle du membre a été actualisé.");
  };

  const toggleMemberAuthority = (groupId: string, member: ArtistGroupMember) => {
    if (!liveController || member.authorityRole === "owner") return;
    const nextRole = member.authorityRole === "admin" ? "member" : "admin";
    void liveController.setAuthorityRole(groupId, member.id, nextRole).then(() => {
      setMemberMenu(null);
      notify(nextRole === "admin" ? `${member.name} est maintenant administrateur.` : `${member.name} est maintenant membre.`);
    }).catch(() => undefined);
  };

  const inviteMember = (event: FormEvent, group: ArtistGroup) => {
    event.preventDefault();
    const name = inviteMemberName.trim();
    if (!name) return;
    if (liveController) {
      if (!inviteMemberProfileId) {
        notify("Sélectionne un vrai profil Meewav dans les résultats.");
        return;
      }
      void liveController.inviteMember(group.id, inviteMemberProfileId).then(() => {
        setInviteMemberName("");
        setInviteMemberProfileId(null);
        setInviteMemberOpen(false);
        notify("Invitation envoyée.");
      }).catch(() => undefined);
      return;
    }
    updateGroup(group.id, (current) => ({
      ...current,
      statusInfo: `${current.members.length + 1} membres • 1 invitation en attente`,
      members: [...current.members, {
        id: `invite_${Date.now()}`,
        name,
        role: "Beatmaker",
        avatar: avatar((current.members.length % 7) + 1),
        online: false,
        status: "pending",
      }],
    }));
    setInviteMemberName("");
    setInviteMemberOpen(false);
    notify(`Invitation envoyée à ${name}.`);
  };

  const addSession = (event: FormEvent) => {
    event.preventDefault();
    if (liveMode) {
      notify("Le planning de groupe n’est pas encore enregistré sur le serveur.");
      return;
    }
    if (!activeGroup || !sessionTitle.trim()) return;
    updateGroup(activeGroup.id, (group) => ({
      ...group,
      nextSessionTitle: sessionTitle.trim(),
      nextSessionTime: `${sessionDate || "Date à définir"}${sessionPlace ? ` • ${sessionPlace}` : ""}`,
    }));
    setSessionTitle("");
    setSessionDate("");
    setSessionPlace("");
    setSessionFormOpen(false);
    notify("La session a été ajoutée au planning.");
  };

  const addDecision = (event: FormEvent) => {
    event.preventDefault();
    if (liveMode) {
      notify("Les votes de groupe ne sont pas encore enregistrés sur le serveur.");
      return;
    }
    if (!activeGroup || !decisionTitle.trim() || !decisionOptions.trim()) return;
    const options = decisionOptions.split(",").map((option) => option.trim()).filter(Boolean);
    updateGroup(activeGroup.id, (group) => ({ ...group, pendingDecisionTitle: decisionTitle.trim() }));
    setDecisionOptionsByGroup((current) => ({ ...current, [activeGroup.id]: options }));
    setVoteChoice(options[0] ?? "");
    setDecisionTitle("");
    setDecisionOptions("");
    setNewDecisionOpen(false);
    notify("La décision a été publiée.");
  };

  const submitProject = (event: FormEvent) => {
    event.preventDefault();
    if (liveMode) {
      notify("Les liens groupe-projet ne sont pas encore enregistrés sur le serveur.");
      return;
    }
    if (!activeGroup || !projectTitle.trim()) return;
    if (projectMode === "create" && onCreateProject) {
      onCreateProject(activeGroup.id, projectTitle.trim());
      setProjectTitle("");
      setProjectMode(null);
      return;
    }
    const id = projectMode === "link"
      ? ({ "Beat #42 - Drill": "project_4", "Dark Piano Intro": "project_7", "Vocal Session July": "project_10" }[projectTitle.trim()] ?? `project_${Date.now()}`)
      : `project_${Date.now()}`;
    updateGroup(activeGroup.id, (group) => ({ ...group, relatedProjectIds: [...group.relatedProjectIds, id] }));
    setProjectTitle("");
    setProjectMode(null);
    notify("Le projet est maintenant lié au groupe.");
  };

  const confirmDangerAction = () => {
    if (!dangerConfirmation) return;
    const group = groups.find((item) => item.id === dangerConfirmation.groupId);
    if (!group) return;
    if (liveController) {
      const action = dangerConfirmation.action;
      const operation = action === "leave"
        ? liveController.leaveGroup(group.id)
        : liveController.deleteGroup(group.id, group.name);
      void operation.then(() => {
        setDangerConfirmation(null);
        notify(action === "leave" ? `Vous avez quitté « ${group.name} ».` : `Le groupe « ${group.name} » a été supprimé.`);
      }).catch(() => undefined);
      return;
    }
    const remainingGroups = groups.filter((item) => item.id !== group.id);
    const nextGroup = remainingGroups[0] ?? null;
    setGroups(remainingGroups);
    setDangerConfirmation(null);
    setPanel(nextGroup ? { groupId: nextGroup.id, view: "chat" } : null);
    if (nextGroup) onActiveGroupChangeRef.current?.(nextGroup.id);
    notify(dangerConfirmation.action === "leave" ? `Vous avez quitté « ${group.name} ».` : `Le groupe « ${group.name} » a été supprimé.`);
  };

  const renderCreateFlow = () => (
    <PanelShell title="Créer un groupe" eyebrow={`ÉTAPE ${createStep} SUR 3`} onClose={() => { setCreateOpen(false); resetCreate(); }} onBack={createStep > 1 ? () => { setCreateStep((step) => step - 1); setCreateError(""); } : undefined}>
      <div className="agw-create">
        <ol className="agw-stepper">
          {["Identité", liveMode ? "Invitations" : "Membres", "Récap"].map((label, index) => <li key={label} className={createStep >= index + 1 ? "is-active" : ""}><span>{createStep > index + 1 ? <Check size={14} /> : index + 1}</span><small>{label}</small></li>)}
        </ol>
        {createStep === 1 && (
          <div className="agw-create__stage">
            {liveMode ? (
              <div className="agw-cover-picker"><ImagePlus size={30} /><strong>COUVERTURE PAR DÉFAUT</strong><small>La personnalisation arrivera avec le stockage média.</small></div>
            ) : (
              <label className={`agw-cover-picker ${createDraft.cover ? "has-image" : ""}`}>
                {createDraft.cover ? <img src={createDraft.cover} alt="Aperçu de la couverture" /> : <><ImagePlus size={30} /><strong>IMAGE OBLIGATOIRE</strong><small>Ajouter la couverture du groupe</small></>}
                <input type="file" accept="image/*" onChange={handleCover} />
              </label>
            )}
            <div className="agw-form-grid">
              <label><span>NOM DU GROUPE *</span><input value={createDraft.name} onChange={(event) => setCreateDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Ex : Midnight Echo" /></label>
              <label><span>STYLE / PROFIL ARTISTIQUE</span><input value={createDraft.style} onChange={(event) => setCreateDraft((current) => ({ ...current, style: event.target.value }))} placeholder="Ex : Collectif Hip-Hop • Trap" /></label>
              <label className="is-wide"><span>DESCRIPTION (OPTIONNELLE)</span><textarea value={createDraft.description} onChange={(event) => setCreateDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Quel est l’objectif du groupe ?" /></label>
            </div>
          </div>
        )}
        {createStep === 2 && (
          <div className="agw-create__stage">
            <div className="agw-stage-heading"><span><UserPlus size={22} /></span><div><h3>Inviter des artistes</h3><p>Invite au moins un autre artiste et attribue son rôle.</p></div></div>
            {liveMode ? <div className="agw-empty-inline"><ShieldCheck size={24} /><strong>Le groupe sera créé avant les invitations</strong><span>Tu pourras ensuite inviter de vrais profils depuis l’espace Membres. Aucun avatar de démonstration ne sera ajouté.</span></div> : <div className="agw-candidate-list">
              {inviteCandidates.map((candidate) => {
                const selected = createDraft.selectedMembers.includes(candidate.id);
                return <div className={selected ? "is-selected" : ""} key={candidate.id}>
                  <button type="button" onClick={() => setCreateDraft((current) => ({ ...current, selectedMembers: selected ? current.selectedMembers.filter((id) => id !== candidate.id) : [...current.selectedMembers, candidate.id], roles: selected ? current.roles : { ...current.roles, [candidate.id]: current.roles[candidate.id] ?? "Beatmaker" } }))}>
                    <img src={candidate.avatar} alt="" /><span><strong>{candidate.name}</strong><small>{selected ? "Ajouté au groupe" : "Inviter cet artiste"}</small></span><i>{selected ? <Check size={15} /> : <Plus size={15} />}</i>
                  </button>
                  {selected && <label><span>Rôle</span><select value={createDraft.roles[candidate.id] ?? "Beatmaker"} onChange={(event) => setCreateDraft((current) => ({ ...current, roles: { ...current.roles, [candidate.id]: event.target.value } }))}>{roleOptions.map((role) => <option key={role}>{role}</option>)}</select></label>}
                </div>;
              })}
            </div>}
          </div>
        )}
        {createStep === 3 && (
          <div className="agw-create__stage">
            <div className="agw-recap">
              <img src={createDraft.cover || `${groupsRoot}/group_1.png`} alt="" />
              <div><small>PRÊT À COLLABORER</small><h3>{createDraft.name}</h3><p>{createDraft.style || "Groupe d’artistes"}</p></div>
              <dl><div><dt>Membres</dt><dd>{createDraft.selectedMembers.length + 1} artistes</dd></div><div><dt>Type</dt><dd>Groupe privé (par défaut)</dd></div><div><dt>Statut</dt><dd>Prêt à collaborer</dd></div></dl>
            </div>
          </div>
        )}
        {createError && <p className="agw-form-error">{createError}</p>}
        <div className="agw-create__footer">
          {createStep < 3 ? <button type="button" className="agw-primary-button" onClick={advanceCreate}>CONTINUER <ChevronRight size={17} /></button> : <button type="button" className="agw-primary-button" onClick={createGroup}>CRÉER LE GROUPE <Check size={17} /></button>}
        </div>
      </div>
    </PanelShell>
  );

  const renderGroupToolbar = (group: ArtistGroup, activeView: GroupPanel) => (
    <nav className={`mw-hub-chips is-${activeView}`} aria-label={`Espaces de ${group.name}`}>
      <button type="button" className={activeView === "chat" ? "is-active" : ""} onClick={() => openPanel(group.id, "chat")}><MessageCircleMore size={17} /> Chat</button>
      <button type="button" className={activeView === "planning" ? "is-active" : ""} onClick={() => openPanel(group.id, "planning")}><CalendarClock size={17} /> Planning</button>
      <button type="button" className={activeView === "members" ? "is-active" : ""} onClick={() => openPanel(group.id, "members")}><Users size={17} /> Membres</button>
      <button type="button" className={activeView === "decisions" ? "is-active" : ""} onClick={() => openPanel(group.id, "decisions")}><Vote size={17} /> Décisions</button>
      <button type="button" className={activeView === "projects" ? "is-active" : ""} onClick={() => openPanel(group.id, "projects")}><FolderKanban size={17} /> Projets liés</button>
    </nav>
  );

  const renderGroupSideAction = (group: ArtistGroup, activeView: GroupPanel) => (
    <button type="button" className={`agw-panel-option${activeView === "settings" ? " is-active" : ""}`} onClick={() => openPanel(group.id, "settings")} aria-label="Paramètres et options du groupe" aria-pressed={activeView === "settings"}>
      <Settings2 size={17} /> <span>Options</span>
    </button>
  );

  const renderChat = (group: ArtistGroup) => (
    <PanelShell
      title={group.name}
      eyebrow={`${group.members.length} MEMBRES · ${group.style}`}
      toolbar={renderGroupToolbar(group, "chat")}
      sideActions={renderGroupSideAction(group, "chat")}
      hideClose
    >
      <GroupChatPanel
        key={group.id}
        group={group}
        liveMode={liveMode}
        liveChat={liveController?.chat}
        onGroupChange={(nextGroup) => updateGroup(group.id, () => nextGroup)}
      />
    </PanelShell>
  );

  const renderPlanning = (group: ArtistGroup) => (
    <PanelShell className="agw-panel--planning" title={group.name} eyebrow="PLANNING DU GROUPE" onBack={() => openPanel(group.id, "chat")} toolbar={renderGroupToolbar(group, "planning")} sideActions={renderGroupSideAction(group, "planning")} hideClose>
      <div className="agw-subview agw-planning-subview">
        <div className="agw-subview__heading">
          <div><small>COORDINATION</small><h2>Sessions du groupe</h2><p>Confirme les présences et propose le prochain créneau.</p></div>
          <button type="button" className="agw-primary-button is-small" aria-expanded={sessionFormOpen} aria-controls="agw-planning-session-form" onClick={() => setSessionFormOpen((value) => !value)}><Plus size={18} /> Ajouter</button>
        </div>
        <section className="agw-next-session" aria-label="Prochaine session du groupe">
          <div className="agw-next-session__primary">
            <small>PROCHAINE SESSION</small>
            <h3>Prochaine session</h3>
            <p className="agw-next-session__time"><Clock3 size={19} /> <span>{group.nextSessionTime ?? "Ce soir 21h30"}</span><span className="agw-session-status"><i /> À venir</span></p>
            <div className="agw-next-session__actions">
              <button type="button" className="agw-primary-button is-small" onClick={() => {
                updateGroup(group.id, (current) => ({
                  ...current,
                  confirmedCount: Math.min(current.members.length, (current.confirmedCount ?? 0) + 1),
                  waitingCount: Math.max(0, (current.waitingCount ?? 0) - 1),
                }));
                notify("Session confirmée !");
              }}><Check size={18} /> Confirmer</button>
              <button type="button" className="agw-secondary-button is-small" aria-expanded={detailsOpen} aria-controls="agw-planning-session-details" onClick={() => setDetailsOpen((value) => !value)}><Info size={18} /> Détails</button>
            </div>
          </div>
          <div className="agw-next-session__context">
            <span className="agw-next-session__signal" aria-hidden="true"><GroupWaveMark /></span>
            <div className="agw-next-session__copy">
              <h4>{group.nextSessionTitle ?? "Répétition Studio A"}</h4>
              <p>Préparation du set et validation des transitions.</p>
            </div>
            <div className="agw-next-session__attendance">
              <span className="agw-participant-stack" aria-label={`${group.confirmedCount ?? 0} membres confirmés`}>
                {group.members.slice(0, 3).map((member) => <span key={member.id} title={member.name}><UserRound size={19} /></span>)}
                <span className="is-waiting" title="En attente"><UserRound size={18} /></span>
              </span>
              <span><strong>{group.confirmedCount ?? 0}</strong> confirmés</span><i />
              <span><strong>{group.waitingCount ?? 0}</strong> en attente</span>
            </div>
          </div>
        </section>
        {detailsOpen && <aside id="agw-planning-session-details" className="agw-session-details"><Info size={18} /><span><strong>{group.nextSessionTitle ?? "Répétition Studio A"}</strong><small>Préparation du set, vérification du matériel et validation des transitions.</small></span></aside>}
        {sessionFormOpen && <form id="agw-planning-session-form" className="agw-inline-form" onSubmit={addSession}><h3>Nouvelle session</h3><label><span>Titre</span><input required value={sessionTitle} onChange={(event) => setSessionTitle(event.target.value)} placeholder="Répétition Studio" /></label><label><span>Date et heure</span><input value={sessionDate} onChange={(event) => setSessionDate(event.target.value)} placeholder="12/05/2026 • 20:00" /></label><label><span>Lieu</span><input value={sessionPlace} onChange={(event) => setSessionPlace(event.target.value)} placeholder="Studio A" /></label><div><button type="button" className="agw-secondary-button" onClick={() => setSessionFormOpen(false)}>Annuler</button><button type="submit" className="agw-primary-button">Créer</button></div></form>}
        <div className="agw-section-title"><span>SESSIONS CONFIRMÉES</span></div>
        <button type="button" className="agw-list-tile" onClick={() => setDetailsOpen(true)}><span className="agw-session-tile__icon"><CheckCircle2 size={22} /></span><span className="agw-session-tile__copy"><strong>Répétition Studio</strong><small>Hier, 18:00</small></span><ChevronRight size={19} /></button>
        <div className="agw-section-title"><span>SESSIONS PROPOSÉES</span></div>
        <button type="button" className="agw-list-tile" onClick={() => setDetailsOpen(true)}><span className="agw-session-tile__icon"><Clock3 size={22} /></span><span className="agw-session-tile__copy"><strong>Session Mixage</strong><small>Samedi, 14:00</small></span><ChevronRight size={19} /></button>
      </div>
    </PanelShell>
  );

  const renderMembers = (group: ArtistGroup) => {
    const members = group.members.filter((member) => `${member.name} ${member.role}`.toLowerCase().includes(memberSearch.toLowerCase()));
    return <PanelShell className="agw-panel--members" title={group.name} eyebrow="Membres du groupe" identityIcon={<GroupWaveMark />} onBack={() => openPanel(group.id, "chat")} toolbar={renderGroupToolbar(group, "members")} sideActions={renderGroupSideAction(group, "members")} hideClose>
      <div className="agw-subview agw-members-subview">
        <div className="agw-subview__heading"><div><small><Sparkles size={13} /> ÉQUIPE ARTISTIQUE</small><h2>{group.members.length} membres</h2><p>Les rôles, disponibilités et accès du groupe.</p></div><button type="button" className="agw-primary-button is-small" aria-label="Ouvrir l’invitation d’un membre" onClick={() => setInviteMemberOpen((value) => !value)}><UserPlus size={19} /> Inviter</button></div>
        <label className="agw-search"><Search size={17} /><input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Rechercher un membre…" /></label>
        {inviteMemberOpen && <form className="agw-inline-form" onSubmit={(event) => inviteMember(event, group)}><h3>Inviter un artiste</h3><label><span>Contact</span><input required value={inviteMemberName} onChange={(event) => { const query = event.target.value; setInviteMemberName(query); setInviteMemberProfileId(null); if (liveController && query.trim().length >= 2) void liveController.searchContacts(query.trim()); }} placeholder="Nom ou @identifiant" /></label>{liveController && <div className="agw-live-contact-results" aria-live="polite">{liveController.contactsStatus === "loading" && <small>Recherche en cours…</small>}{liveController.contactsStatus === "error" && <small>{liveController.contactsError ?? "Recherche indisponible"}</small>}{liveController.contactsStatus === "ready" && liveController.contacts.length === 0 && inviteMemberName.trim().length >= 2 && <small>Aucun artiste trouvé</small>}{liveController.contacts.map((contact) => <button type="button" key={contact.id} className={inviteMemberProfileId === contact.id ? "is-selected" : ""} onClick={() => { setInviteMemberProfileId(contact.id); setInviteMemberName(contact.displayName); }}><img src={contact.avatar} alt="" /><span><strong>{contact.displayName}</strong><small>@{contact.username} • {contact.role}</small></span>{inviteMemberProfileId === contact.id ? <Check size={15} /> : <Plus size={15} />}</button>)}</div>}<div><button type="button" className="agw-secondary-button" onClick={() => { setInviteMemberOpen(false); setInviteMemberName(""); setInviteMemberProfileId(null); }}>Annuler</button><button type="submit" className="agw-primary-button" aria-label="Envoyer l’invitation" disabled={liveMode && !inviteMemberProfileId}>Inviter</button></div></form>}
        <div className="agw-members-list">
          {members.map((member) => <article key={`${member.id}:${member.invitationId ?? "member"}`}>
            <MemberAvatar member={member} size="large" />
            <span className="agw-member-copy">
              <strong>{member.name}{member.status === "pending" ? " · Invitation envoyée" : ""}</strong>
              <span className="agw-member-role">{member.role}</span>
              <small className="agw-member-access"><i className={member.online ? "is-online" : ""} />{member.online ? "En ligne" : "Hors ligne"}<b>•</b>{member.authorityRole === "owner" ? "Propriétaire" : member.authorityRole === "admin" ? "Admin" : "Accès complet"}</small>
            </span>
            <button type="button" className="agw-icon-button" onClick={() => setMemberMenu((current) => current === member.id ? null : member.id)} aria-label={`Options ${member.name}`}><MoreHorizontal size={19} /></button>
            {memberMenu === member.id && <div className="agw-member-menu">
              <button type="button" onClick={() => { setSelectedMember({ groupId: group.id, member }); setMemberMenu(null); }}>Voir le profil</button>
              {member.status !== "pending" && <button type="button" onClick={() => { onOpenMemberChat?.(member); setMemberMenu(null); if (!onOpenMemberChat) notify(`Message à ${member.name} ouvert.`); }}>Envoyer un message</button>}
              {member.status !== "pending" && <button type="button" onClick={() => setMemberRoleEditor((current) => current === member.id ? null : member.id)}>Changer le rôle artistique</button>}
              {memberRoleEditor === member.id && <label className="agw-role-editor"><span>Nouveau rôle</span><select autoFocus value={member.role} onChange={(event) => changeMemberRole(group.id, member.id, event.target.value)}>{roleOptions.map((role) => <option key={role}>{role}</option>)}</select></label>}
              {liveMode && member.status !== "pending" && member.authorityRole !== "owner" && <button type="button" onClick={() => toggleMemberAuthority(group.id, member)}>{member.authorityRole === "admin" ? "Retirer le rôle admin" : "Nommer administrateur"}</button>}
              <button type="button" className="is-danger" onClick={() => removeMember(group.id, member.id)}>{member.status === "pending" ? "Annuler l’invitation" : "Retirer du groupe"}</button>
            </div>}
          </article>)}
        </div>
        {selectedMember?.groupId === group.id && <aside className="agw-member-profile" aria-label={`Profil de ${selectedMember.member.name}`}><button type="button" className="agw-icon-button" onClick={() => setSelectedMember(null)} aria-label="Fermer le profil"><X size={17} /></button><MemberAvatar member={selectedMember.member} size="large" /><div><small>{selectedMember.member.online ? "EN LIGNE" : "HORS LIGNE"}</small><h3>{selectedMember.member.name}</h3><p>{selectedMember.member.role}</p></div><button type="button" className="agw-primary-button is-small" onClick={() => onOpenMemberChat?.(selectedMember.member)}><MessageCircleMore size={16} /> Envoyer un message</button></aside>}
      </div>
    </PanelShell>;
  };

  const renderDecisions = (group: ArtistGroup) => (
    <PanelShell className="agw-panel--decisions" title={group.name} eyebrow="DÉCISIONS DU GROUPE" onBack={() => openPanel(group.id, "chat")} toolbar={renderGroupToolbar(group, "decisions")} sideActions={renderGroupSideAction(group, "decisions")} hideClose>
      <div className="agw-subview">
        <div className="agw-subview__heading"><div><small>VOTE DU GROUPE</small><h2>Décider ensemble</h2><p>Chaque choix reste clair, documenté et partagé.</p></div><button type="button" className="agw-primary-button is-small" onClick={() => setNewDecisionOpen((value) => !value)}><Plus size={16} /> Nouveau</button></div>
        {newDecisionOpen && <form className="agw-inline-form" onSubmit={addDecision}><h3>Nouvelle décision</h3><label><span>Titre de la décision</span><input required value={decisionTitle} onChange={(event) => setDecisionTitle(event.target.value)} placeholder="Choisir le prochain créneau" /></label><label><span>Options, séparées par des virgules</span><input required value={decisionOptions} onChange={(event) => setDecisionOptions(event.target.value)} placeholder="Samedi, Dimanche, Lundi" /></label><div><button type="button" className="agw-secondary-button" onClick={() => setNewDecisionOpen(false)}>Annuler</button><button type="submit" className="agw-primary-button">Publier</button></div></form>}
        <div className="agw-section-title"><span>EN COURS</span></div>
        {group.pendingDecisionTitle ? <article className="agw-decision-card"><div><Vote size={20} /><span><strong>{group.pendingDecisionTitle}</strong><small>{recordedVotes[group.id] ? `Votre vote : ${recordedVotes[group.id]}` : "3 votes sur 4"}</small></span></div><progress value={recordedVotes[group.id] ? "4" : "3"} max="4" /><div className="agw-vote-options">{(decisionOptionsByGroup[group.id] ?? ["Samedi 16h", "Dimanche 18h", "Lundi 20h"]).map((option) => <button type="button" key={option} className={voteChoice === option ? "is-selected" : ""} onClick={() => setVoteChoice(option)}>{option}{voteChoice === option && <Check size={15} />}</button>)}</div><button type="button" className="agw-primary-button" disabled={!voteChoice} onClick={() => { setRecordedVotes((current) => ({ ...current, [group.id]: voteChoice })); notify(`Vote « ${voteChoice} » enregistré.`); }}>{recordedVotes[group.id] ? "Modifier mon vote" : "Valider mon vote"}</button></article> : <div className="agw-empty-inline"><CheckCircle2 size={24} /><strong>Aucune décision en attente</strong><span>Le groupe est aligné.</span></div>}
        <div className="agw-section-title"><span>TERMINÉES</span></div>
        <button type="button" className="agw-list-tile" onClick={() => setCompletedDecision({ title: "Choix de la cover — EP #1", result: "Option A" })}><CheckCircle2 size={20} /><span><strong>Choix de la cover — EP #1</strong><small>Décision finale : Option A</small></span><ChevronRight size={17} /></button>
        <button type="button" className="agw-list-tile" onClick={() => setCompletedDecision({ title: "Validation mixage track 4", result: "Validé à l’unanimité" })}><CheckCircle2 size={20} /><span><strong>Validation mixage track 4</strong><small>Décision finale : Validé</small></span><ChevronRight size={17} /></button>
        {completedDecision && <aside className="agw-settings-detail"><button type="button" className="agw-icon-button" onClick={() => setCompletedDecision(null)} aria-label="Fermer"><X size={16} /></button><strong>{completedDecision.title}</strong><p>Décision finale : {completedDecision.result}</p></aside>}
      </div>
    </PanelShell>
  );

  const renderProjects = (group: ArtistGroup) => (
    <PanelShell className="agw-panel--projects" title={group.name} eyebrow="PROJETS LIÉS" onBack={() => openPanel(group.id, "chat")} toolbar={renderGroupToolbar(group, "projects")} sideActions={renderGroupSideAction(group, "projects")} hideClose>
      <div className="agw-subview">
        <div className="agw-subview__heading"><div><small>CRÉATIONS CONNECTÉES</small><h2>Projets du groupe</h2><p>Cette équipe durable peut relier plusieurs maquettes et projets, sans perdre son identité de groupe.</p></div></div>
        <div className="agw-project-list">{group.relatedProjectIds.map((id, index) => <button type="button" key={id} onClick={() => { onOpenProject?.(id); if (!onOpenProject) notify(`${id.replace("project_", "Project #")} ouvert.`); }}><span className="agw-project-cover"><img src={`/images/messaging/covers/cover_${((Number(id.replace("project_", "")) || index + 1) - 1) % 13 + 1}.png`} alt="" loading="lazy" /></span><strong>{id.replace("project_", "Project #")}</strong><small>Dernière modification : hier</small><ChevronRight size={17} /></button>)}{group.relatedProjectIds.length === 0 && <div className="agw-empty-inline"><FolderKanban size={24} /><strong>Aucun projet lié</strong><span>Connecte une création au groupe.</span></div>}</div>
        <div className="agw-dual-actions"><button type="button" className="agw-primary-button" onClick={() => setProjectMode("link")}><Link2 size={17} /> Lier un projet existant</button><button type="button" className="agw-secondary-button" onClick={() => setProjectMode("create")}><Plus size={17} /> Créer un nouveau projet</button></div>
        {projectMode && <form className="agw-inline-form" onSubmit={submitProject}><h3>{projectMode === "link" ? "Lier un projet" : "Créer un projet"}</h3>{projectMode === "link" ? <fieldset className="agw-project-choices"><legend>Projet disponible</legend>{["Beat #42 - Drill", "Dark Piano Intro", "Vocal Session July"].map((title) => <label key={title}><input type="radio" name="project" value={title} checked={projectTitle === title} onChange={(event) => setProjectTitle(event.target.value)} /><span>{title}</span></label>)}</fieldset> : <label><span>Nom du projet</span><input required value={projectTitle} onChange={(event) => setProjectTitle(event.target.value)} placeholder="Nouveau projet" /></label>}<div><button type="button" className="agw-secondary-button" onClick={() => { setProjectMode(null); setProjectTitle(""); }}>Annuler</button><button type="submit" className="agw-primary-button" disabled={!projectTitle.trim()}>{projectMode === "link" ? "Lier la sélection" : "Créer"}</button></div></form>}
      </div>
    </PanelShell>
  );

  const renderSettings = (group: ArtistGroup) => {
    const notificationsOn = group.server?.notificationsEnabled ?? notifications[group.id] ?? true;
    const isPrivate = group.server ? group.server.visibility === "private" : privateGroups[group.id] ?? true;
    const rosterVisible = group.server?.rosterVisibility !== "hidden";
    const archived = group.server?.personallyArchived ?? false;
    const toggleNotifications = () => {
      if (!liveController) {
        setNotifications((current) => ({ ...current, [group.id]: !notificationsOn }));
        return;
      }
      void liveController.setPreferences({ groupId: group.id, notificationsEnabled: !notificationsOn }).catch(() => undefined);
    };
    const togglePrivacy = () => {
      if (!liveController) {
        setPrivateGroups((current) => ({ ...current, [group.id]: !isPrivate }));
        return;
      }
      void liveController.updateGroup(group.id, {
        name: group.name,
        description: group.description || null,
        visibility: isPrivate ? "discoverable" : "private",
      }).catch(() => undefined);
    };
    return <PanelShell title={group.name} eyebrow="OPTIONS DU GROUPE" onBack={() => openPanel(group.id, "chat")} toolbar={renderGroupToolbar(group, "settings")} sideActions={renderGroupSideAction(group, "settings")} hideClose>
      <div className="agw-subview">
        <div className="agw-settings-profile"><img src={group.cover} alt="" /><span><h2>{group.name}</h2><p>{group.style}</p></span></div>
        <div className="agw-section-title"><span>PRÉFÉRENCES</span></div>
        <button type="button" className="agw-setting-row" onClick={toggleNotifications}><Bell size={19} /><span><strong>Notifications</strong><small>{notificationsOn ? "Activées" : "Désactivées"}</small></span><i className={notificationsOn ? "is-on" : ""}><b /></i></button>
        <button type="button" className="agw-setting-row" onClick={togglePrivacy}><LockKeyhole size={19} /><span><strong>Confidentialité</strong><small>{isPrivate ? "Privé" : "Découvrable"}</small></span><i className={isPrivate ? "is-on" : ""}><b /></i></button>
        {liveController && <button type="button" className="agw-setting-row" onClick={() => void liveController.setPreferences({ groupId: group.id, rosterVisibility: rosterVisible ? "hidden" : "visible" }).catch(() => undefined)}><Users size={19} /><span><strong>Visibilité de la liste des membres</strong><small>{rosterVisible ? "Visible" : "Masquée"}</small></span><i className={rosterVisible ? "is-on" : ""}><b /></i></button>}
        <button type="button" className="agw-setting-row" onClick={() => liveMode ? notify("Le thème personnalisé n’est pas encore enregistré sur le serveur.") : setSettingsDetail("theme")}><Palette size={19} /><span><strong>Thème du groupe</strong><small>{liveMode ? "Bientôt disponible" : "Par défaut"}</small></span><ChevronRight size={17} /></button>
        <div className="agw-section-title"><span>ADMINISTRATION</span></div>
        <button type="button" className="agw-setting-row" onClick={() => setSettingsDetail("admins")}><ShieldCheck size={19} /><span><strong>Gérer les admins</strong><small>Accès et permissions</small></span><ChevronRight size={17} /></button>
        <button type="button" className="agw-setting-row" onClick={() => setSettingsDetail("history")}><History size={19} /><span><strong>Historique des actions</strong><small>Dernières modifications</small></span><ChevronRight size={17} /></button>
        {liveController && <button type="button" className="agw-setting-row" onClick={() => void liveController.setGroupArchived(group.id, !archived).catch(() => undefined)}><Archive size={19} /><span><strong>{archived ? "Restaurer le groupe" : "Archiver le groupe"}</strong><small>{archived ? "Revenir dans les groupes actifs" : "Le masquer de votre liste active"}</small></span><ChevronRight size={17} /></button>}
        {settingsDetail && <aside className="agw-settings-detail"><button type="button" className="agw-icon-button" onClick={() => setSettingsDetail(null)} aria-label="Fermer"><X size={16} /></button><strong>{settingsDetail === "theme" ? "Thème du groupe" : settingsDetail === "admins" ? "Administrateurs" : "Historique"}</strong><p>{settingsDetail === "theme" ? "Par défaut — sélectionné" : settingsDetail === "admins" ? (group.members.filter((member) => member.authorityRole === "owner" || member.authorityRole === "admin").map((member) => `${member.name}${member.authorityRole === "owner" ? " (propriétaire)" : ""}`).join(", ") || "Aucun administrateur supplémentaire.") : (liveController?.activity.map((item) => `${item.label} — ${item.actorName}`).join(" · ") || "Aucune action enregistrée.")}</p></aside>}
        <div className="agw-danger-zone"><button type="button" onClick={() => setDangerConfirmation({ groupId: group.id, action: "leave" })}><LogOut size={18} /> Quitter le groupe</button><button type="button" onClick={() => setDangerConfirmation({ groupId: group.id, action: "delete" })}><Trash2 size={18} /> Supprimer le groupe</button></div>
        {dangerConfirmation?.groupId === group.id && <aside className="agw-danger-confirm" role="alertdialog" aria-label={dangerConfirmation.action === "leave" ? "Quitter le groupe" : "Supprimer le groupe"}><strong>{dangerConfirmation.action === "leave" ? "Quitter le groupe ?" : "Supprimer le groupe ?"}</strong><p>{dangerConfirmation.action === "leave" ? "Tu ne verras plus la discussion ni les membres de ce groupe." : `Cette action supprimera définitivement « ${group.name} ».`}</p><div><button type="button" className="agw-secondary-button" onClick={() => setDangerConfirmation(null)}>Annuler</button><button type="button" className="agw-primary-button" onClick={confirmDangerAction}>{dangerConfirmation.action === "leave" ? "Quitter" : "Supprimer"}</button></div></aside>}
      </div>
    </PanelShell>;
  };

  const renderUnavailablePanel = (group: ArtistGroup, view: GroupPanel, title: string, description: string) => (
    <PanelShell title={group.name} eyebrow={title.toLocaleUpperCase("fr-FR")} onBack={() => openPanel(group.id, "chat")} toolbar={renderGroupToolbar(group, view)} sideActions={renderGroupSideAction(group, view)} hideClose>
      <div className="agw-subview">
        <div className="agw-empty-inline"><ShieldCheck size={26} /><strong>{title} — bientôt disponible</strong><span>{description} Aucune donnée de démonstration ne sera enregistrée à sa place.</span></div>
      </div>
    </PanelShell>
  );

  const renderLiveInvitations = () => {
    if (!liveController?.invitations.length) return null;
    return <aside className="agw-live-invitations" aria-label="Invitations de groupes reçues">
      <strong>Invitations reçues</strong>
      {liveController.invitations.map((invitation) => <article key={invitation.id}>
        <img src={invitation.inviterAvatar} alt="" />
        <span><b>{invitation.groupName}</b><small>{invitation.inviterName}{invitation.artisticRole ? ` • ${invitation.artisticRole}` : ""}</small></span>
        <div><button type="button" onClick={() => void liveController.respondInvitation(invitation.id, "decline").catch(() => undefined)}>Refuser</button><button type="button" onClick={() => void liveController.respondInvitation(invitation.id, "accept").then(() => notify(`Vous avez rejoint « ${invitation.groupName} ».`)).catch(() => undefined)}>Accepter</button></div>
      </article>)}
    </aside>;
  };

  const renderActivePanel = () => {
    if (!activeGroup || !panel) return null;
    if (panel.view === "chat") return renderChat(activeGroup);
    if (liveMode && panel.view === "planning") return renderUnavailablePanel(activeGroup, "planning", "Planning du groupe", "Les sessions nécessitent le futur backend de planning.");
    if (liveMode && panel.view === "decisions") return renderUnavailablePanel(activeGroup, "decisions", "Décisions du groupe", "Les votes nécessitent le futur backend de décisions.");
    if (liveMode && panel.view === "projects") return renderUnavailablePanel(activeGroup, "projects", "Projets liés", "Les liens avec les projets nécessitent leur contrat serveur dédié.");
    if (panel.view === "planning") return renderPlanning(activeGroup);
    if (panel.view === "members") return renderMembers(activeGroup);
    if (panel.view === "decisions") return renderDecisions(activeGroup);
    if (panel.view === "projects") return renderProjects(activeGroup);
    return renderSettings(activeGroup);
  };

  return (
    <main className={`agw${panel || createOpen ? " has-panel" : ""}`}>
      {toast && <div className="agw-toast" role="status"><CheckCircle2 size={17} /> {toast}<button type="button" onClick={() => { setToast(""); liveController?.clearActionError(); }} aria-label="Fermer"><X size={15} /></button></div>}
      {renderLiveInvitations()}
      {liveController && !groups.length && <section className="agw-live-state" role="status"><Users size={28} /><strong>{liveController.status === "loading" ? "Chargement des groupes…" : "Aucun groupe actif"}</strong><span>{liveController.error?.message ?? "Crée un groupe depuis le bandeau supérieur ou accepte une invitation reçue."}</span></section>}
      {renderActivePanel()}
      {createOpen && renderCreateFlow()}
    </main>
  );
}
