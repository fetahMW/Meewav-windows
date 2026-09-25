export type MessagingCollaborationErrorCode =
  | "authentication_required"
  | "blocked_relationship"
  | "collaboration_request_not_found"
  | "collaboration_request_already_resolved"
  | "invalid_collaboration_scope"
  | "invalid_collaboration_status_filter"
  | "invalid_collaboration_cursor"
  | "invalid_collaboration_decision"
  | "collaboration_request_required"
  | "invalid_idempotency_key"
  | "idempotency_conflict"
  | "invalid_request"
  | "load_failed"
  | "mutation_failed"
  | "unknown";

const stableServerCodes = new Set<MessagingCollaborationErrorCode>([
  "authentication_required",
  "blocked_relationship",
  "collaboration_request_not_found",
  "collaboration_request_already_resolved",
  "invalid_collaboration_scope",
  "invalid_collaboration_status_filter",
  "invalid_collaboration_cursor",
  "invalid_collaboration_decision",
  "collaboration_request_required",
  "invalid_idempotency_key",
  "idempotency_conflict",
]);

const messages: Record<MessagingCollaborationErrorCode, string> = {
  authentication_required: "Ta session a expiré. Reconnecte-toi pour ouvrir les collaborations.",
  blocked_relationship: "Cette collaboration n’est plus disponible pour cette relation.",
  collaboration_request_not_found: "Cette demande de collaboration n’est plus disponible.",
  collaboration_request_already_resolved: "Cette demande a déjà reçu une réponse.",
  invalid_collaboration_scope: "Cette vue de collaborations n’est pas valide.",
  invalid_collaboration_status_filter: "Ce filtre de collaborations n’est pas valide.",
  invalid_collaboration_cursor: "La page de collaborations demandée n’est plus disponible.",
  invalid_collaboration_decision: "Cette réponse de collaboration n’est pas valide.",
  collaboration_request_required: "La demande de collaboration est manquante.",
  invalid_idempotency_key: "Cette action ne peut pas être sécurisée. Réessaie.",
  idempotency_conflict: "Cette action a déjà été utilisée pour une autre demande.",
  invalid_request: "La demande envoyée n’est pas valide.",
  load_failed: "Impossible de charger les collaborations pour le moment.",
  mutation_failed: "L’action n’a pas pu être enregistrée. Réessaie dans un instant.",
  unknown: "Une erreur inattendue a interrompu les collaborations.",
};

type ErrorLike = { code?: unknown; message?: unknown };

export class MessagingCollaborationError extends Error {
  readonly code: MessagingCollaborationErrorCode;
  readonly serverCode: string | null;
  readonly originalError: unknown;

  constructor(
    code: MessagingCollaborationErrorCode,
    options: { serverCode?: string | null; originalError?: unknown } = {},
  ) {
    super(messages[code]);
    this.name = "MessagingCollaborationError";
    this.code = code;
    this.serverCode = options.serverCode ?? null;
    this.originalError = options.originalError;
  }
}

export function toMessagingCollaborationError(
  error: unknown,
  fallbackCode: "load_failed" | "mutation_failed" | "unknown",
) {
  if (error instanceof MessagingCollaborationError) return error;
  const candidate = error && typeof error === "object" ? error as ErrorLike : {};
  const serverMessage = typeof candidate.message === "string" ? candidate.message.trim() : "";
  const postgresCode = typeof candidate.code === "string" ? candidate.code : null;
  const code = stableServerCodes.has(serverMessage as MessagingCollaborationErrorCode)
    ? serverMessage as MessagingCollaborationErrorCode
    : fallbackCode;
  return new MessagingCollaborationError(code, {
    serverCode: postgresCode,
    originalError: error,
  });
}

export function invalidMessagingCollaborationRequest() {
  return new MessagingCollaborationError("invalid_request");
}
