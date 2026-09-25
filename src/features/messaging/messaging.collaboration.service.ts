import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";
import {
  invalidMessagingCollaborationRequest,
  toMessagingCollaborationError,
} from "./messaging.collaboration.errors";
import type {
  MessagingCollaborationDecision,
  MessagingCollaborationRequestRow,
  MessagingCollaborationStatus,
  MessagingCollaborationTransitionResult,
  MessagingCollaborationViewedResult,
  MessagingCollaborationRequestWithAttachmentsRow,
  MessagingListCollaborationsInput,
} from "./messaging.collaboration.types";
import { mapCollaborationAttachments } from "./messaging.attachments.adapters";
import type { MessagingCollaborationWithAttachmentsRow } from "./messaging.attachments.types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COLLABORATION_STATUSES = new Set<MessagingCollaborationStatus>([
  "pending",
  "accepted",
  "declined",
  "cancelled",
  "expired",
]);

function assertUuid(value: string) {
  if (!UUID_PATTERN.test(value)) throw invalidMessagingCollaborationRequest();
}

function assertIdempotencyKey(value: string) {
  const length = value.trim().length;
  if (length < 8 || length > 128) throw invalidMessagingCollaborationRequest();
}

function assertListInput(input: MessagingListCollaborationsInput) {
  const scope = input.scope ?? "received";
  if (!new Set(["received", "sent", "accepted"]).has(scope)) {
    throw invalidMessagingCollaborationRequest();
  }
  if (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100)) {
    throw invalidMessagingCollaborationRequest();
  }
  if (input.statuses !== undefined && input.statuses !== null) {
    if (input.statuses.length < 1 || input.statuses.length > 5 || input.statuses.some((status) => !COLLABORATION_STATUSES.has(status))) {
      throw invalidMessagingCollaborationRequest();
    }
    if (scope === "accepted" && (input.statuses.length !== 1 || input.statuses[0] !== "accepted")) {
      throw invalidMessagingCollaborationRequest();
    }
  }
  if (input.cursor) {
    assertUuid(input.cursor.request_id);
    if (!input.cursor.sort_at || Number.isNaN(new Date(input.cursor.sort_at).getTime())) {
      throw invalidMessagingCollaborationRequest();
    }
  }
}

function rows<T>(data: unknown): T[] {
  if (!Array.isArray(data)) throw toMessagingCollaborationError(null, "load_failed");
  return data as T[];
}

function object<T>(data: unknown): T {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw toMessagingCollaborationError(null, "mutation_failed");
  }
  return data as T;
}

function secureUuid() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  throw new Error("secure_random_uuid_unavailable");
}

export function createMessagingCollaborationIdempotencyKey(scope = "collaboration") {
  const prefix = scope
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "collaboration";
  return `${prefix}:${secureUuid()}`;
}

export type MessagingCollaborationRepository = ReturnType<typeof createMessagingCollaborationRepository>;

export function createMessagingCollaborationRepository(client: SupabaseClient = supabase) {
  return {
    async listMyCollaborationRequests(
      input: MessagingListCollaborationsInput = {},
    ): Promise<MessagingCollaborationRequestRow[]> {
      assertListInput(input);
      const { data, error } = await client.rpc("list_my_collaboration_requests_v2", {
        p_scope: input.scope ?? "received",
        p_statuses: input.statuses ?? null,
        p_cursor: input.cursor ?? null,
        p_limit: input.limit ?? 30,
      });
      if (error) throw toMessagingCollaborationError(error, "load_failed");
      return rows<MessagingCollaborationWithAttachmentsRow & MessagingCollaborationRequestRow>(data)
        .map((row) => mapCollaborationAttachments(row) as MessagingCollaborationRequestWithAttachmentsRow);
    },

    async markCollaborationRequestViewed(requestId: string) {
      assertUuid(requestId);
      const { data, error } = await client.rpc("mark_collaboration_request_viewed_v1", {
        p_request_id: requestId,
      });
      if (error) throw toMessagingCollaborationError(error, "mutation_failed");
      return object<MessagingCollaborationViewedResult>(data);
    },

    async respondToCollaborationRequest(
      requestId: string,
      decision: MessagingCollaborationDecision,
      idempotencyKey: string,
    ) {
      assertUuid(requestId);
      if (decision !== "accept" && decision !== "decline") {
        throw invalidMessagingCollaborationRequest();
      }
      assertIdempotencyKey(idempotencyKey);
      const { data, error } = await client.rpc("respond_to_collaboration_request_v1", {
        p_request_id: requestId,
        p_decision: decision,
        p_idempotency_key: idempotencyKey.trim(),
      });
      if (error) throw toMessagingCollaborationError(error, "mutation_failed");
      return object<MessagingCollaborationTransitionResult>(data);
    },

    async cancelCollaborationRequest(requestId: string, idempotencyKey: string) {
      assertUuid(requestId);
      assertIdempotencyKey(idempotencyKey);
      const { data, error } = await client.rpc("cancel_collaboration_request_v1", {
        p_request_id: requestId,
        p_idempotency_key: idempotencyKey.trim(),
      });
      if (error) throw toMessagingCollaborationError(error, "mutation_failed");
      return object<MessagingCollaborationTransitionResult>(data);
    },
  };
}

export const messagingCollaborationRepository = createMessagingCollaborationRepository();
