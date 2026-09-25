export type MessagingProjectsErrorCode =
  | "invalid_request"
  | "authentication_required"
  | "permission_denied"
  | "not_found"
  | "conflict"
  | "owner_transfer_required"
  | "blocked_relationship"
  | "quota_exceeded"
  | "load_failed"
  | "mutation_failed";

const PROJECT_ERROR_MESSAGES: Record<MessagingProjectsErrorCode, string> = {
  invalid_request: "Les informations du projet sont incomplètes ou invalides.",
  authentication_required: "Reconnecte-toi pour accéder à tes projets.",
  permission_denied: "Tu n’as pas l’autorisation d’effectuer cette action.",
  not_found: "Ce projet ou cette invitation n’est plus disponible.",
  conflict: "Le projet a changé entre-temps. Recharge-le avant de réessayer.",
  owner_transfer_required: "Transfère d’abord la propriété du projet.",
  blocked_relationship: "Cette action n’est pas disponible pour cette relation.",
  quota_exceeded: "La limite de projets, membres ou tâches est atteinte.",
  load_failed: "Impossible de charger les projets pour le moment.",
  mutation_failed: "L’action n’a pas pu être enregistrée.",
};

export class MessagingProjectsError extends Error {
  readonly code: MessagingProjectsErrorCode;
  readonly originalError: unknown;

  constructor(code: MessagingProjectsErrorCode, cause?: unknown) {
    super(PROJECT_ERROR_MESSAGES[code]);
    this.name = "MessagingProjectsError";
    this.code = code;
    this.originalError = cause;
  }
}

function errorMessage(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const candidate = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
  return [candidate.message, candidate.details, candidate.hint, candidate.code]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLocaleLowerCase("en-US");
}

export function invalidMessagingProjectsRequest() {
  return new MessagingProjectsError("invalid_request");
}

export function toMessagingProjectsError(
  error: unknown,
  fallback: "load_failed" | "mutation_failed" = "mutation_failed",
) {
  if (error instanceof MessagingProjectsError) return error;
  const message = errorMessage(error);
  if (message.includes("authentication_required") || message.includes("jwt")) {
    return new MessagingProjectsError("authentication_required", error);
  }
  if (message.includes("owner_transfer_required")) {
    return new MessagingProjectsError("owner_transfer_required", error);
  }
  if (message.includes("blocked_relationship")) {
    return new MessagingProjectsError("blocked_relationship", error);
  }
  if (message.includes("permission_denied") || message.includes("forbidden") || message.includes("42501")) {
    return new MessagingProjectsError("permission_denied", error);
  }
  if (message.includes("not_found") || message.includes("project_deleted") || message.includes("p0002")) {
    return new MessagingProjectsError("not_found", error);
  }
  if (message.includes("conflict") || message.includes("40001") || message.includes("23505")) {
    return new MessagingProjectsError("conflict", error);
  }
  if (message.includes("quota") || message.includes("limit") || message.includes("rate")) {
    return new MessagingProjectsError("quota_exceeded", error);
  }
  if (message.includes("invalid_")) return invalidMessagingProjectsRequest();
  return new MessagingProjectsError(fallback, error);
}
