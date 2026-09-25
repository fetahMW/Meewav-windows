export type MessagingAttachmentsErrorCode =
  | "authentication_required"
  | "blocked_relationship"
  | "not_a_conversation_member"
  | "attachment_upload_not_found"
  | "attachment_upload_not_ready"
  | "attachment_upload_not_finalizable"
  | "attachment_upload_expired"
  | "attachment_upload_rate_limit"
  | "too_many_pending_uploads"
  | "attachment_storage_object_missing"
  | "unsupported_attachment_type"
  | "attachment_size_limit"
  | "attachment_size_mismatch"
  | "attachment_mime_mismatch"
  | "voice_note_duration_limit"
  | "message_attachment_limit"
  | "attachment_kind_mismatch"
  | "attachment_role_mismatch"
  | "track_pack_total_size_limit"
  | "collaboration_attachment_limit"
  | "idempotency_conflict"
  | "invalid_request"
  | "upload_failed"
  | "finalize_failed"
  | "discard_failed"
  | "signed_url_failed"
  | "load_failed"
  | "mutation_failed"
  | "unknown";

const stableCodes = new Set<MessagingAttachmentsErrorCode>([
  "authentication_required",
  "blocked_relationship",
  "not_a_conversation_member",
  "attachment_upload_not_found",
  "attachment_upload_not_ready",
  "attachment_upload_not_finalizable",
  "attachment_upload_expired",
  "attachment_upload_rate_limit",
  "too_many_pending_uploads",
  "attachment_storage_object_missing",
  "unsupported_attachment_type",
  "attachment_size_limit",
  "attachment_size_mismatch",
  "attachment_mime_mismatch",
  "voice_note_duration_limit",
  "message_attachment_limit",
  "attachment_kind_mismatch",
  "attachment_role_mismatch",
  "track_pack_total_size_limit",
  "collaboration_attachment_limit",
  "idempotency_conflict",
]);

const messages: Record<MessagingAttachmentsErrorCode, string> = {
  authentication_required: "Ta session a expiré. Reconnecte-toi pour continuer.",
  blocked_relationship: "Cette pièce jointe n’est pas disponible pour cette relation.",
  not_a_conversation_member: "Tu n’as plus accès à cette conversation.",
  attachment_upload_not_found: "Ce téléversement n’est plus disponible.",
  attachment_upload_not_ready: "La pièce jointe n’est pas encore prête.",
  attachment_upload_not_finalizable: "Ce téléversement ne peut plus être finalisé.",
  attachment_upload_expired: "Le téléversement a expiré. Relance-le.",
  attachment_upload_rate_limit: "Trop de téléversements ont été lancés. Réessaie dans un instant.",
  too_many_pending_uploads: "Termine ou annule les téléversements en attente avant de continuer.",
  attachment_storage_object_missing: "Le fichier téléversé est introuvable.",
  unsupported_attachment_type: "Ce format de fichier n’est pas pris en charge.",
  attachment_size_limit: "Ce fichier dépasse la taille autorisée.",
  attachment_size_mismatch: "Le fichier reçu ne correspond pas à celui préparé.",
  attachment_mime_mismatch: "Le format reçu ne correspond pas au fichier préparé.",
  voice_note_duration_limit: "Une note vocale doit durer au maximum dix minutes.",
  message_attachment_limit: "Ce message contient trop de pièces jointes.",
  attachment_kind_mismatch: "Cette pièce jointe ne correspond pas au format du message.",
  attachment_role_mismatch: "Le rôle de cette pièce jointe n’est pas valide.",
  track_pack_total_size_limit: "Le pack de pistes dépasse la taille totale autorisée.",
  collaboration_attachment_limit: "Une demande de collaboration accepte trois pièces jointes maximum.",
  idempotency_conflict: "Cette action a déjà été utilisée avec un autre contenu.",
  invalid_request: "La pièce jointe n’est pas valide.",
  upload_failed: "Le fichier n’a pas pu être téléversé.",
  finalize_failed: "Le fichier a été envoyé mais n’a pas pu être finalisé.",
  discard_failed: "Le téléversement n’a pas pu être supprimé.",
  signed_url_failed: "Le fichier privé ne peut pas être ouvert pour le moment.",
  load_failed: "Les pièces jointes ne peuvent pas être chargées pour le moment.",
  mutation_failed: "L’action sur la pièce jointe a échoué.",
  unknown: "Une erreur inattendue a interrompu le téléversement.",
};

type ErrorLike = { code?: unknown; message?: unknown };

export class MessagingAttachmentsError extends Error {
  readonly code: MessagingAttachmentsErrorCode;
  readonly serverCode: string | null;
  readonly originalError: unknown;

  constructor(
    code: MessagingAttachmentsErrorCode,
    options: { serverCode?: string | null; originalError?: unknown } = {},
  ) {
    super(messages[code]);
    this.name = "MessagingAttachmentsError";
    this.code = code;
    this.serverCode = options.serverCode ?? null;
    this.originalError = options.originalError;
  }
}

export function toMessagingAttachmentsError(
  error: unknown,
  fallback: MessagingAttachmentsErrorCode,
) {
  if (error instanceof MessagingAttachmentsError) return error;
  const candidate = error && typeof error === "object" ? error as ErrorLike : {};
  const serverMessage = typeof candidate.message === "string" ? candidate.message.trim() : "";
  const code = stableCodes.has(serverMessage as MessagingAttachmentsErrorCode)
    ? serverMessage as MessagingAttachmentsErrorCode
    : fallback;
  return new MessagingAttachmentsError(code, {
    serverCode: typeof candidate.code === "string" ? candidate.code : null,
    originalError: error,
  });
}

export function invalidMessagingAttachmentRequest() {
  return new MessagingAttachmentsError("invalid_request");
}
