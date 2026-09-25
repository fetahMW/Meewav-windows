export type MessagingServiceErrorCode =
  | "authentication_required"
  | "blocked_relationship"
  | "classe_message_host_required"
  | "classe_message_active_seat_required"
  | "not_a_conversation_member"
  | "not_an_active_conversation_member"
  | "messageable_profile_not_found"
  | "conversation_not_found"
  | "conversation_deleted"
  | "group_conversation_not_found"
  | "message_not_found"
  | "message_delete_not_allowed"
  | "message_forward_unsupported"
  | "message_forward_attachments_unsupported"
  | "invitation_not_found"
  | "invitation_already_responded"
  | "idempotency_conflict"
  | "idempotency_result_not_found"
  | "message_rate_limit"
  | "group_creation_rate_limit"
  | "report_rate_limit"
  | "unsupported_reaction"
  | "message_kind_not_enabled_in_phase_a"
  | "invalid_request"
  | "load_failed"
  | "mutation_failed"
  | "unknown";

const serverErrorCodes = new Set<MessagingServiceErrorCode>([
  "authentication_required",
  "blocked_relationship",
  "classe_message_host_required",
  "classe_message_active_seat_required",
  "not_a_conversation_member",
  "not_an_active_conversation_member",
  "messageable_profile_not_found",
  "conversation_not_found",
  "conversation_deleted",
  "group_conversation_not_found",
  "message_not_found",
  "message_delete_not_allowed",
  "message_forward_unsupported",
  "message_forward_attachments_unsupported",
  "invitation_not_found",
  "invitation_already_responded",
  "idempotency_conflict",
  "idempotency_result_not_found",
  "message_rate_limit",
  "group_creation_rate_limit",
  "report_rate_limit",
  "unsupported_reaction",
  "message_kind_not_enabled_in_phase_a",
]);

const errorMessages: Record<MessagingServiceErrorCode, string> = {
  authentication_required: "Ta session a expiré. Reconnecte-toi pour ouvrir la messagerie.",
  blocked_relationship: "Cette action n’est pas disponible pour cette relation.",
  classe_message_host_required: "Seul le Host de cette Classe peut envoyer ce message.",
  classe_message_active_seat_required: "Cet élève n’occupe plus une place active dans la Classe.",
  not_a_conversation_member: "Tu n’as plus accès à cette conversation.",
  not_an_active_conversation_member: "Tu ne fais plus partie de cette conversation.",
  messageable_profile_not_found: "Ce profil ne peut pas être contacté pour le moment.",
  conversation_not_found: "Cette conversation n’existe plus.",
  conversation_deleted: "Cette conversation a été supprimée.",
  group_conversation_not_found: "Ce groupe de discussion n’existe plus.",
  message_not_found: "Ce message n’est plus disponible.",
  message_delete_not_allowed: "Tu peux uniquement supprimer tes propres messages.",
  message_forward_unsupported: "Ce type de message ne peut pas encore être transféré.",
  message_forward_attachments_unsupported: "Cette pièce jointe privée ne peut pas encore être transférée en toute sécurité.",
  invitation_not_found: "Cette invitation n’est plus disponible.",
  invitation_already_responded: "Cette invitation a déjà reçu une réponse.",
  idempotency_conflict: "Cette action a déjà été utilisée avec un autre contenu.",
  idempotency_result_not_found: "Le résultat de cette action n’est plus disponible.",
  message_rate_limit: "Tu envoies beaucoup de messages. Attends un instant avant de réessayer.",
  group_creation_rate_limit: "La limite de créations de groupes est atteinte pour aujourd’hui.",
  report_rate_limit: "La limite de signalements est atteinte pour aujourd’hui.",
  unsupported_reaction: "Cette réaction n’est pas disponible.",
  message_kind_not_enabled_in_phase_a: "Ce format n’est pas encore disponible dans la messagerie connectée.",
  invalid_request: "La demande envoyée n’est pas valide.",
  load_failed: "Impossible de charger la messagerie pour le moment.",
  mutation_failed: "L’action n’a pas pu être enregistrée. Réessaie dans un instant.",
  unknown: "Une erreur inattendue a interrompu la messagerie.",
};

type ErrorLike = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
};

export class MessagingServiceError extends Error {
  readonly code: MessagingServiceErrorCode;
  readonly serverCode: string | null;
  readonly originalError: unknown;

  constructor(
    code: MessagingServiceErrorCode,
    options: { serverCode?: string | null; originalError?: unknown } = {},
  ) {
    super(errorMessages[code]);
    this.name = "MessagingServiceError";
    this.code = code;
    this.serverCode = options.serverCode ?? null;
    this.originalError = options.originalError;
  }
}

function readErrorLike(error: unknown): ErrorLike {
  return error && typeof error === "object" ? error as ErrorLike : {};
}

export function toMessagingServiceError(
  error: unknown,
  fallbackCode: MessagingServiceErrorCode,
) {
  if (error instanceof MessagingServiceError) return error;

  const candidate = readErrorLike(error);
  const serverMessage = typeof candidate.message === "string" ? candidate.message.trim() : "";
  const postgresCode = typeof candidate.code === "string" ? candidate.code : null;
  const stableCode = serverErrorCodes.has(serverMessage as MessagingServiceErrorCode)
    ? serverMessage as MessagingServiceErrorCode
    : fallbackCode;

  return new MessagingServiceError(stableCode, {
    serverCode: postgresCode,
    originalError: error,
  });
}

export function invalidMessagingRequest() {
  return new MessagingServiceError("invalid_request");
}
