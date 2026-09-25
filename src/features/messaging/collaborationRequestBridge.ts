import type { DemoCollab, DemoCollabAttachment } from "./messagingDemoData";
import type { MessagingOriginSource } from "./messaging.route";

const STORAGE_KEY = "meewav:globe-collaboration-requests:v1";
const REQUEST_EVENT = "meewav:collaboration-requests-changed";
const MESSAGE_MAX_LENGTH = 500;
const ATTACHMENT_MAX_COUNT = 3;

export type GlobeCollaborationDraft = {
  senderProfileId: string;
  recipientProfileId: string;
  recipientName: string;
  recipientRole?: string;
  recipientAvatar?: string;
  recipientGradeLevel?: number;
  requestSource?: MessagingOriginSource;
  message: string;
  attachments: File[];
};

type StoredGlobeRequest = {
  id: string;
  senderProfileId: string;
  recipientProfileId: string;
  recipientName: string;
  recipientRole: string;
  recipientAvatar: string;
  recipientGradeLevel?: number;
  requestSource?: MessagingOriginSource;
  message: string;
  createdAt: string;
  attachments: DemoCollabAttachment[];
};

function fallbackUrl(type: "audio" | "video") {
  return type === "video" ? "assets/shortfictive/shortf2.mp4" : "meewav-demo-audio";
}

function readStoredRequests(): StoredGlobeRequest[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as StoredGlobeRequest[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let sessionRequests = readStoredRequests();

function persistRequests() {
  if (typeof window === "undefined") return;
  const serializable = sessionRequests.map((request) => ({
    ...request,
    attachments: request.attachments.map((attachment) => ({
      ...attachment,
      url: attachment.url.startsWith("blob:")
        ? fallbackUrl(attachment.type as "audio" | "video")
        : attachment.url,
    })),
  }));
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  } catch {
    // La demande reste disponible pour la session même si le navigateur
    // refuse le stockage local (navigation privée ou quota saturé).
  }
  window.dispatchEvent(new CustomEvent(REQUEST_EVENT));
}

function collaborationAttachment(file: File, requestId: string, index: number): DemoCollabAttachment {
  const type = file.type.startsWith("audio/") ? "audio" : "video";
  return {
    id: `${requestId}-attachment-${index + 1}`,
    type,
    url: URL.createObjectURL(file),
    fileName: file.name,
    fileSize: file.size,
  };
}

export function submitGlobeCollaborationRequest(draft: GlobeCollaborationDraft) {
  const message = draft.message.trim();
  if (!message || message.length > MESSAGE_MAX_LENGTH) {
    throw new Error("La demande doit contenir entre 1 et 500 caractères.");
  }
  if (draft.attachments.length > ATTACHMENT_MAX_COUNT) {
    throw new Error("Une demande accepte au maximum 3 fichiers.");
  }
  if (draft.attachments.some((file) => !file.type.startsWith("audio/") && !file.type.startsWith("video/"))) {
    throw new Error("Seuls les fichiers audio et vidéo sont acceptés.");
  }

  const requestId = `globe-collab-${Date.now()}`;
  const request: StoredGlobeRequest = {
    id: requestId,
    senderProfileId: draft.senderProfileId,
    recipientProfileId: draft.recipientProfileId,
    recipientName: draft.recipientName,
    recipientRole: draft.recipientRole ?? "Artiste",
    recipientAvatar: draft.recipientAvatar ?? "",
    recipientGradeLevel: draft.recipientGradeLevel,
    requestSource: draft.requestSource ?? "globe",
    message,
    createdAt: new Date().toISOString(),
    attachments: draft.attachments.map((file, index) => collaborationAttachment(file, requestId, index)),
  };

  sessionRequests = [request, ...sessionRequests.filter((item) => item.id !== request.id)];
  persistRequests();
  return request;
}

export function getGlobeCollaborationRequests(): DemoCollab[] {
  return sessionRequests.map((request) => ({
    id: request.id,
    userId: request.recipientProfileId,
    name: request.recipientName,
    role: request.recipientRole,
    avatar: request.recipientAvatar,
    verified: true,
    message: request.message,
    meta: "À l’instant",
    rank: request.recipientGradeLevel ?? 1,
    gradeLevel: request.recipientGradeLevel ?? 1,
    status: "sent",
    isReceived: false,
    requestStatus: "pending",
    sentState: "unread",
    attachments: request.attachments,
    origin: "globe",
    requestSource: request.requestSource ?? "globe",
    senderProfileId: request.senderProfileId,
    recipientProfileId: request.recipientProfileId,
    createdAt: request.createdAt,
  }));
}

export function removeGlobeCollaborationRequest(requestId: string) {
  const removed = sessionRequests.find((request) => request.id === requestId);
  removed?.attachments.forEach((attachment) => {
    if (attachment.url.startsWith("blob:")) URL.revokeObjectURL(attachment.url);
  });
  sessionRequests = sessionRequests.filter((request) => request.id !== requestId);
  persistRequests();
}

export function subscribeToGlobeCollaborationRequests(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const notify = () => listener();
  window.addEventListener(REQUEST_EVENT, notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(REQUEST_EVENT, notify);
    window.removeEventListener("storage", notify);
  };
}
