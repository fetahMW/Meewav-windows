import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabaseClient";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ROOM_LIVE_CALL_MAX_CONTACTS = 8;

export type RoomLiveCallPartyRole = "host" | "contact";
export type RoomLiveCallStatus = "pending" | "accepted" | "declined" | "cancelled" | "ended" | "expired";
export type RoomLiveCallRoute = "preview" | "public";
export type RoomLiveCallMode = "private" | "public";
export type RoomLiveCallRealtimeStatus = "idle" | "connecting" | "connected" | "degraded";

export type RoomLiveCallInvitation = {
  invitationId: string;
  roomId: string;
  roomTitle: string;
  hostProfileId: string;
  hostUsername: string | null;
  hostDisplayName: string;
  hostAvatarUrl: string | null;
  contactProfileId: string;
  contactUsername: string | null;
  contactDisplayName: string;
  contactAvatarUrl: string | null;
  partyRole: RoomLiveCallPartyRole;
  status: RoomLiveCallStatus;
  callMode: RoomLiveCallMode;
  routeMode: RoomLiveCallRoute;
  isOnAir: boolean;
  routeRevision: number;
  invitationExpiresAt: string;
  sessionExpiresAt: string | null;
  createdAt: string;
};

export type RoomLiveCallContact = {
  profileId: string;
  conversationId: string;
  displayName: string;
  username: string | null;
  avatarUrl: string;
  isVerified: boolean;
  isOnline: boolean;
  activeInvitationId: string | null;
  activeInvitationStatus: RoomLiveCallStatus | null;
  activeCallMode: RoomLiveCallMode | null;
  activeRouteMode: RoomLiveCallRoute | null;
  activeInvitationExpiresAt: string | null;
};

type RoomLiveCallContactRow = {
  contact_profile_id: unknown;
  direct_conversation_id: unknown;
  username: unknown;
  display_name: unknown;
  avatar_url: unknown;
  is_online: unknown;
  active_invitation_id: unknown;
  active_invitation_status: unknown;
  active_call_mode: unknown;
  active_route_mode: unknown;
  active_invitation_expires_at: unknown;
};

type RoomLiveCallInvitationRow = {
  invitation_id: unknown;
  room_id: unknown;
  room_title: unknown;
  host_profile_id: unknown;
  host_username: unknown;
  host_display_name: unknown;
  host_avatar_url: unknown;
  contact_profile_id: unknown;
  contact_username: unknown;
  contact_display_name: unknown;
  contact_avatar_url: unknown;
  party_role: unknown;
  status: unknown;
  call_mode: unknown;
  route_mode: unknown;
  is_on_air: unknown;
  route_revision: unknown;
  invitation_expires_at: unknown;
  session_expires_at: unknown;
  created_at: unknown;
};

type RoomLiveCallMutationResult = {
  ok?: unknown;
  invitation_id?: unknown;
  status?: unknown;
  call_mode?: unknown;
  route_mode?: unknown;
  is_on_air?: unknown;
  route_revision?: unknown;
  invitation_expires_at?: unknown;
  session_expires_at?: unknown;
  idempotent?: unknown;
  error?: unknown;
};

export type RoomLiveCallInviteResult = {
  invitationId: string;
  status: RoomLiveCallStatus;
  callMode: RoomLiveCallMode;
  routeMode: RoomLiveCallRoute;
  isOnAir: boolean;
  routeRevision: number;
  invitationExpiresAt: string | null;
  sessionExpiresAt: string | null;
  idempotent: boolean;
};

export type RoomLiveCallStateResult = {
  invitationId: string;
  callMode: RoomLiveCallMode;
  routeMode: RoomLiveCallRoute | null;
  isOnAir: boolean;
  routeRevision: number;
  idempotent: boolean;
};

export type RoomLiveCallSubscription = {
  unsubscribe: () => void;
};

export class RoomLiveCallServiceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "RoomLiveCallServiceError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RoomLiveCallServiceError("invalid_response", `Réponse d’appel invalide (${field}).`);
  }
  return value;
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function positiveInteger(value: unknown, field: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new RoomLiveCallServiceError("invalid_response", `Réponse d’appel invalide (${field}).`);
  }
  return parsed;
}

function statusValue(value: unknown): RoomLiveCallStatus {
  if (value === "pending" || value === "accepted" || value === "declined" || value === "cancelled" || value === "ended" || value === "expired") {
    return value;
  }
  throw new RoomLiveCallServiceError("invalid_response", "État d’appel inconnu.");
}

function routeValue(value: unknown): RoomLiveCallRoute {
  if (value === "preview" || value === "public") return value;
  throw new RoomLiveCallServiceError("invalid_response", "Routage d’appel inconnu.");
}

function callModeValue(value: unknown): RoomLiveCallMode {
  if (value === "private" || value === "public") return value;
  throw new RoomLiveCallServiceError("invalid_response", "Mode d’appel inconnu.");
}

function partyRoleValue(value: unknown): RoomLiveCallPartyRole {
  if (value === "host" || value === "contact") return value;
  throw new RoomLiveCallServiceError("invalid_response", "Rôle d’appel inconnu.");
}

function invitationFromRow(row: RoomLiveCallInvitationRow): RoomLiveCallInvitation {
  return {
    invitationId: requiredString(row.invitation_id, "invitation_id"),
    roomId: requiredString(row.room_id, "room_id"),
    roomTitle: requiredString(row.room_title, "room_title"),
    hostProfileId: requiredString(row.host_profile_id, "host_profile_id"),
    hostUsername: nullableString(row.host_username),
    hostDisplayName: requiredString(row.host_display_name, "host_display_name"),
    hostAvatarUrl: nullableString(row.host_avatar_url),
    contactProfileId: requiredString(row.contact_profile_id, "contact_profile_id"),
    contactUsername: nullableString(row.contact_username),
    contactDisplayName: requiredString(row.contact_display_name, "contact_display_name"),
    contactAvatarUrl: nullableString(row.contact_avatar_url),
    partyRole: partyRoleValue(row.party_role),
    status: statusValue(row.status),
    callMode: callModeValue(row.call_mode),
    routeMode: routeValue(row.route_mode),
    isOnAir: row.is_on_air === true,
    routeRevision: positiveInteger(row.route_revision, "route_revision"),
    invitationExpiresAt: requiredString(row.invitation_expires_at, "invitation_expires_at"),
    sessionExpiresAt: nullableString(row.session_expires_at),
    createdAt: requiredString(row.created_at, "created_at"),
  };
}

function contactFromRow(row: RoomLiveCallContactRow): RoomLiveCallContact {
  const activeStatus = nullableString(row.active_invitation_status);
  const activeRoute = nullableString(row.active_route_mode);
  const activeCallMode = nullableString(row.active_call_mode);
  return {
    profileId: requiredString(row.contact_profile_id, "contact_profile_id"),
    conversationId: requiredString(row.direct_conversation_id, "direct_conversation_id"),
    displayName: requiredString(row.display_name, "display_name"),
    username: nullableString(row.username),
    avatarUrl: nullableString(row.avatar_url) ?? "/avatars/utilisateur.png",
    // The canonical contact projection does not currently expose this display
    // decoration. Eligibility never depends on a client-side verified flag.
    isVerified: false,
    isOnline: row.is_online === true,
    activeInvitationId: nullableString(row.active_invitation_id),
    activeInvitationStatus: activeStatus ? statusValue(activeStatus) : null,
    activeCallMode: activeCallMode ? callModeValue(activeCallMode) : null,
    activeRouteMode: activeRoute ? routeValue(activeRoute) : null,
    activeInvitationExpiresAt: nullableString(row.active_invitation_expires_at),
  };
}

function rawErrorCode(error: unknown) {
  if (!isRecord(error)) return "live_call_failed";
  const message = typeof error.message === "string" ? error.message : "";
  const details = typeof error.details === "string" ? error.details : "";
  const hint = typeof error.hint === "string" ? error.hint : "";
  const combined = `${message} ${details} ${hint}`;
  const knownCode = [
    "authentication_required",
    "live_call_host_required",
    "live_call_direct_contact_required",
    "live_call_contact_banned",
    "live_call_contact_room_access_revoked",
    "live_call_contact_busy",
    "live_call_contact_onstage",
    "live_call_already_active",
    "live_call_invitation_rate_limit",
    "live_call_host_active_limit",
    "live_call_contact_invitation_limit",
    "live_call_room_capacity",
    "live_call_invitation_expired",
    "live_call_contact_no_longer_eligible",
    "live_call_invitation_already_responded",
    "live_call_route_revision_conflict",
    "live_call_on_air_revision_conflict",
    "live_call_on_air_not_ready",
    "live_call_on_air_forbidden",
    "live_call_private_mode",
    "live_call_session_expired",
    "live_call_not_active",
    "live_call_public_route_forbidden",
    "live_call_invitation_not_found",
    "live_call_party_required",
  ].find((candidate) => combined.includes(candidate));
  if (knownCode) return knownCode;
  return typeof error.code === "string" && error.code.length > 0 ? error.code : "live_call_failed";
}

export function roomLiveCallErrorMessage(code: string) {
  switch (code) {
    case "authentication_required":
      return "Reconnectez-vous pour utiliser les appels du live.";
    case "live_call_host_required":
      return "Seul le host d’une Room en direct peut lancer cet appel.";
    case "live_call_direct_contact_required":
      return "Ce profil n’est plus un contact direct de votre messagerie.";
    case "live_call_contact_banned":
      return "Ce contact ne peut pas rejoindre cette Room.";
    case "live_call_contact_room_access_revoked":
      return "L’accès de ce contact à la Room a été retiré.";
    case "live_call_contact_busy":
      return "Ce contact est déjà engagé dans un autre appel.";
    case "live_call_contact_onstage":
      return "Ce contact est déjà à l’antenne dans cette Room.";
    case "live_call_already_active":
      return "Un appel est déjà actif avec ce contact.";
    case "live_call_invitation_rate_limit":
      return "Trop d’appels ont été lancés. Patientez un instant.";
    case "live_call_host_active_limit":
      return "Vous avez trop d’appels en attente ou en cours. Terminez-en un avant de continuer.";
    case "live_call_contact_invitation_limit":
      return "Ce contact reçoit déjà trop d’appels. Réessayez un peu plus tard.";
    case "live_call_room_capacity":
      return "La limite d’appels simultanés de la Room est atteinte.";
    case "live_call_invitation_expired":
      return "Cet appel a expiré.";
    case "live_call_contact_no_longer_eligible":
      return "Cet appel n’est plus autorisé.";
    case "live_call_invitation_already_responded":
      return "Cet appel a déjà reçu une réponse.";
    case "live_call_route_revision_conflict":
      return "Le routage audio a changé. L’état vient d’être actualisé.";
    case "live_call_on_air_revision_conflict":
      return "L’état de l’antenne a changé. Il vient d’être actualisé.";
    case "live_call_on_air_not_ready":
      return "L’appel public n’est pas encore prêt pour l’antenne.";
    case "live_call_on_air_forbidden":
      return "L’autorisation de diffuser cet appel vient d’être retirée.";
    case "live_call_private_mode":
      return "Cet appel a été accepté en mode privé et ne peut pas être diffusé.";
    case "live_call_session_expired":
      return "La session de cet appel a expiré.";
    case "live_call_not_active":
      return "Cet appel n’est plus actif.";
    case "live_call_public_route_forbidden":
      return "Cet appel ne peut pas être envoyé dans le direct.";
    case "live_call_invitation_not_found":
      return "Cet appel n’existe plus.";
    case "live_call_party_required":
      return "Vous ne participez pas à cet appel.";
    case "selection_empty":
      return "Sélectionnez au moins un contact.";
    case "selection_too_large":
      return `Vous pouvez appeler jusqu’à ${ROOM_LIVE_CALL_MAX_CONTACTS} contacts à la fois.`;
    case "invalid_request":
      return "La demande d’appel est invalide.";
    case "infrastructure_unavailable":
      return "Les appels du live ne sont pas encore disponibles.";
    default:
      return "L’appel n’a pas pu être mis à jour. Réessayez.";
  }
}

function serviceError(error: unknown) {
  if (error instanceof RoomLiveCallServiceError) return error;
  const code = rawErrorCode(error);
  if (code === "42P01" || code === "PGRST202" || code === "PGRST205") {
    return new RoomLiveCallServiceError("infrastructure_unavailable", roomLiveCallErrorMessage("infrastructure_unavailable"));
  }
  return new RoomLiveCallServiceError(code, roomLiveCallErrorMessage(code));
}

function assertUuid(value: string) {
  if (!UUID_PATTERN.test(value)) {
    throw new RoomLiveCallServiceError("invalid_request", roomLiveCallErrorMessage("invalid_request"));
  }
}

function mutationObject(data: unknown): RoomLiveCallMutationResult {
  if (!isRecord(data)) throw serviceError(new RoomLiveCallServiceError("invalid_response", "Réponse d’appel invalide."));
  return data as RoomLiveCallMutationResult;
}

function mutationResult(data: unknown): RoomLiveCallInviteResult {
  const row = mutationObject(data);
  const embeddedError = nullableString(row.error);
  if (row.ok === false || embeddedError) {
    const code = embeddedError ?? "live_call_failed";
    throw new RoomLiveCallServiceError(code, roomLiveCallErrorMessage(code));
  }
  return {
    invitationId: requiredString(row.invitation_id, "invitation_id"),
    status: statusValue(row.status),
    callMode: row.call_mode === undefined ? "private" : callModeValue(row.call_mode),
    routeMode: row.route_mode === undefined ? "preview" : routeValue(row.route_mode),
    isOnAir: row.is_on_air === true,
    routeRevision: row.route_revision === undefined ? 1 : positiveInteger(row.route_revision, "route_revision"),
    invitationExpiresAt: nullableString(row.invitation_expires_at),
    sessionExpiresAt: nullableString(row.session_expires_at),
    idempotent: row.idempotent === true,
  };
}

function stateMutationResult(data: unknown): RoomLiveCallStateResult {
  const row = mutationObject(data);
  const embeddedError = nullableString(row.error);
  if (row.ok === false || embeddedError) {
    const code = embeddedError ?? "live_call_failed";
    throw new RoomLiveCallServiceError(code, roomLiveCallErrorMessage(code));
  }
  return {
    invitationId: requiredString(row.invitation_id, "invitation_id"),
    callMode: row.call_mode === undefined ? "private" : callModeValue(row.call_mode),
    routeMode: row.route_mode === undefined ? null : routeValue(row.route_mode),
    isOnAir: row.is_on_air === true,
    routeRevision: positiveInteger(row.route_revision, "route_revision"),
    idempotent: row.idempotent === true,
  };
}

export function createRoomLiveCallClientRequestId() {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new RoomLiveCallServiceError("secure_random_unavailable", "Impossible de sécuriser cette demande d’appel.");
  }
  return globalThis.crypto.randomUUID();
}

export function createRoomLiveCallRepository(client: SupabaseClient = supabase) {
  return {
    async listContacts(roomId: string, search?: string | null, limit = 50) {
      assertUuid(roomId);
      const normalizedSearch = search?.trim() || null;
      if (normalizedSearch && normalizedSearch.length > 80) {
        throw new RoomLiveCallServiceError("invalid_request", roomLiveCallErrorMessage("invalid_request"));
      }
      const normalizedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
      const { data, error } = await client.rpc("rooms_list_live_call_contacts_v1", {
        p_room_id: roomId,
        p_search: normalizedSearch,
        p_limit: normalizedLimit,
      });
      if (error) throw serviceError(error);
      if (!Array.isArray(data)) throw new RoomLiveCallServiceError("invalid_response", "Liste de contacts invalide.");
      return (data as RoomLiveCallContactRow[]).map(contactFromRow);
    },

    async listMine(limit = 30) {
      const normalizedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
      const { data, error } = await client.rpc("rooms_list_my_live_call_invitations_v1", {
        p_limit: normalizedLimit,
      });
      if (error) throw serviceError(error);
      if (!Array.isArray(data)) throw new RoomLiveCallServiceError("invalid_response", "Liste d’appels invalide.");
      return (data as RoomLiveCallInvitationRow[]).map(invitationFromRow);
    },

    async inviteContact(roomId: string, contactProfileId: string, clientRequestId: string, callMode: RoomLiveCallMode = "private") {
      assertUuid(roomId);
      assertUuid(contactProfileId);
      assertUuid(clientRequestId);
      if (callMode !== "private" && callMode !== "public") {
        throw new RoomLiveCallServiceError("invalid_request", roomLiveCallErrorMessage("invalid_request"));
      }
      const { data, error } = await client.rpc("rooms_invite_live_call_contact_v1", {
        p_room_id: roomId,
        p_contact_profile_id: contactProfileId,
        p_client_request_id: clientRequestId,
        p_call_mode: callMode,
      });
      if (error) throw serviceError(error);
      return mutationResult(data);
    },

    async respond(invitationId: string, accept: boolean) {
      assertUuid(invitationId);
      const { data, error } = await client.rpc("rooms_respond_live_call_invitation_v1", {
        p_invitation_id: invitationId,
        p_accept: accept,
      });
      if (error) throw serviceError(error);
      return mutationResult(data);
    },

    async setRoute(invitationId: string, routeMode: RoomLiveCallRoute, expectedRevision: number) {
      assertUuid(invitationId);
      if (routeMode !== "preview" && routeMode !== "public") {
        throw new RoomLiveCallServiceError("invalid_request", roomLiveCallErrorMessage("invalid_request"));
      }
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
        throw new RoomLiveCallServiceError("invalid_request", roomLiveCallErrorMessage("invalid_request"));
      }
      const { data, error } = await client.rpc("rooms_set_live_call_route_v1", {
        p_invitation_id: invitationId,
        p_route_mode: routeMode,
        p_expected_revision: expectedRevision,
      });
      if (error) throw serviceError(error);
      return stateMutationResult(data);
    },

    async setOnAir(invitationId: string, enabled: boolean, expectedRevision: number) {
      assertUuid(invitationId);
      if (typeof enabled !== "boolean" || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
        throw new RoomLiveCallServiceError("invalid_request", roomLiveCallErrorMessage("invalid_request"));
      }
      const { data, error } = await client.rpc("rooms_set_live_call_on_air_v1", {
        p_invitation_id: invitationId,
        p_enabled: enabled,
        p_expected_revision: expectedRevision,
      });
      if (error) throw serviceError(error);
      return stateMutationResult(data);
    },

    async end(invitationId: string) {
      assertUuid(invitationId);
      const { data, error } = await client.rpc("rooms_end_live_call_invitation_v1", {
        p_invitation_id: invitationId,
      });
      if (error) throw serviceError(error);
      return mutationResult(data);
    },

    subscribe(onChange: () => void, onStatus?: (status: RoomLiveCallRealtimeStatus) => void): RoomLiveCallSubscription {
      let disposed = false;
      onStatus?.("connecting");
      const channel: RealtimeChannel = client
        .channel("rooms:live-calls:mine")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "room_live_call_invitations_v1" },
          () => {
            if (!disposed) onChange();
          },
        );

      void (async () => {
        try {
          await client.realtime.setAuth();
          if (disposed) return;
          channel.subscribe((status) => {
            if (disposed) return;
            if (status === "SUBSCRIBED") {
              onStatus?.("connected");
              // Re-read the RLS projection after the subscription boundary so
              // an update occurring between the initial SELECT and SUBSCRIBED
              // cannot be missed.
              onChange();
            } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              onStatus?.("degraded");
            }
          });
        } catch {
          if (!disposed) onStatus?.("degraded");
        }
      })();

      return {
        unsubscribe: () => {
          disposed = true;
          onStatus?.("idle");
          void client.removeChannel(channel);
        },
      };
    },
  };
}

export type RoomLiveCallRepository = ReturnType<typeof createRoomLiveCallRepository>;

export const roomLiveCallRepository = createRoomLiveCallRepository();
