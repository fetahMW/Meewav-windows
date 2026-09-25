export type MessagingArtistGroupsErrorCode =
  | "authentication_required"
  | "artist_group_not_found"
  | "artist_group_not_active"
  | "artist_group_membership_required"
  | "artist_group_admin_required"
  | "artist_group_owner_required"
  | "artist_group_member_not_found"
  | "artist_group_invitee_not_found"
  | "artist_group_invitation_not_found"
  | "artist_group_invitation_already_resolved"
  | "artist_group_invitation_expired"
  | "artist_group_invitation_pending"
  | "artist_group_already_member"
  | "artist_group_owner_transfer_required"
  | "artist_group_member_quota_reached"
  | "artist_group_membership_quota_reached"
  | "artist_group_owner_quota_reached"
  | "artist_group_creation_rate_limit"
  | "artist_group_invitation_rate_limit"
  | "artist_group_delete_confirmation_mismatch"
  | "blocked_relationship"
  | "idempotency_conflict"
  | "invalid_idempotency_key"
  | "invalid_request"
  | "load_failed"
  | "mutation_failed"
  | "unknown";

const stableCodes = new Set<MessagingArtistGroupsErrorCode>([
  "authentication_required", "artist_group_not_found", "artist_group_not_active",
  "artist_group_membership_required", "artist_group_admin_required", "artist_group_owner_required",
  "artist_group_member_not_found", "artist_group_invitee_not_found",
  "artist_group_invitation_not_found", "artist_group_invitation_already_resolved",
  "artist_group_invitation_expired", "artist_group_invitation_pending", "artist_group_already_member",
  "artist_group_owner_transfer_required", "artist_group_member_quota_reached",
  "artist_group_membership_quota_reached", "artist_group_owner_quota_reached",
  "artist_group_creation_rate_limit", "artist_group_invitation_rate_limit",
  "artist_group_delete_confirmation_mismatch", "blocked_relationship",
  "idempotency_conflict", "invalid_idempotency_key",
]);

const messages: Record<MessagingArtistGroupsErrorCode, string> = {
  authentication_required: "Ta session a expiré. Reconnecte-toi pour ouvrir tes groupes.",
  artist_group_not_found: "Ce groupe n’est plus disponible.",
  artist_group_not_active: "Ce groupe est archivé ou fermé.",
  artist_group_membership_required: "Tu ne fais plus partie de ce groupe.",
  artist_group_admin_required: "Cette action est réservée aux responsables du groupe.",
  artist_group_owner_required: "Cette action est réservée au propriétaire du groupe.",
  artist_group_member_not_found: "Ce membre n’est plus dans le groupe.",
  artist_group_invitee_not_found: "Ce profil ne peut pas être invité.",
  artist_group_invitation_not_found: "Cette invitation n’est plus disponible.",
  artist_group_invitation_already_resolved: "Cette invitation a déjà reçu une réponse.",
  artist_group_invitation_expired: "Cette invitation a expiré.",
  artist_group_invitation_pending: "Une invitation est déjà en attente pour ce profil.",
  artist_group_already_member: "Ce profil fait déjà partie du groupe.",
  artist_group_owner_transfer_required: "Transfère d’abord la propriété du groupe avant de le quitter.",
  artist_group_member_quota_reached: "Ce groupe a atteint sa limite de membres.",
  artist_group_membership_quota_reached: "Tu as atteint ta limite de groupes actifs.",
  artist_group_owner_quota_reached: "Tu as atteint ta limite de groupes créés.",
  artist_group_creation_rate_limit: "Trop de groupes ont été créés aujourd’hui. Réessaie plus tard.",
  artist_group_invitation_rate_limit: "Trop d’invitations ont été envoyées aujourd’hui.",
  artist_group_delete_confirmation_mismatch: "Le nom de confirmation ne correspond pas au groupe.",
  blocked_relationship: "Cette action n’est pas disponible pour cette relation.",
  idempotency_conflict: "Cette action sécurisée a déjà été utilisée avec d’autres données.",
  invalid_idempotency_key: "Cette action ne peut pas être sécurisée. Réessaie.",
  invalid_request: "La demande envoyée n’est pas valide.",
  load_failed: "Impossible de charger les groupes pour le moment.",
  mutation_failed: "L’action n’a pas pu être enregistrée.",
  unknown: "Une erreur inattendue a interrompu les groupes.",
};

type ErrorLike = { code?: unknown; message?: unknown };

export class MessagingArtistGroupsError extends Error {
  readonly code: MessagingArtistGroupsErrorCode;
  readonly serverCode: string | null;
  readonly originalError: unknown;

  constructor(
    code: MessagingArtistGroupsErrorCode,
    options: { serverCode?: string | null; originalError?: unknown } = {},
  ) {
    super(messages[code]);
    this.name = "MessagingArtistGroupsError";
    this.code = code;
    this.serverCode = options.serverCode ?? null;
    this.originalError = options.originalError;
  }
}

export function toMessagingArtistGroupsError(
  error: unknown,
  fallback: "load_failed" | "mutation_failed" | "unknown",
) {
  if (error instanceof MessagingArtistGroupsError) return error;
  const candidate = error && typeof error === "object" ? error as ErrorLike : {};
  const message = typeof candidate.message === "string" ? candidate.message.trim() : "";
  const code = stableCodes.has(message as MessagingArtistGroupsErrorCode)
    ? message as MessagingArtistGroupsErrorCode
    : fallback;
  return new MessagingArtistGroupsError(code, {
    serverCode: typeof candidate.code === "string" ? candidate.code : null,
    originalError: error,
  });
}

export function invalidMessagingArtistGroupsRequest() {
  return new MessagingArtistGroupsError("invalid_request");
}
