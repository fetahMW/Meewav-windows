import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export type MessagingRealtimeDomain =
  | "conversation"
  | "collaboration"
  | "project"
  | "group";

export type MessagingRealtimeChange = {
  version: 1;
  domain: MessagingRealtimeDomain;
  entityId: string;
  operation: "insert" | "update" | "delete";
  sourceTable: string;
  occurredAt: string | null;
};

export type MessagingRealtimeStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "degraded";

export type UseMessagingRealtimeOptions = {
  enabled: boolean;
  profileId: string | null;
  onChange: (change: MessagingRealtimeChange) => void;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const domains = new Set<MessagingRealtimeDomain>([
  "conversation",
  "collaboration",
  "project",
  "group",
]);
const operations = new Set(["insert", "update", "delete"] as const);

export function messagingRealtimeDeduplicationKey(change: MessagingRealtimeChange) {
  // A single conversation RPC can update both its content and its member row.
  // Keeping the source table in the key prevents a later member invalidation
  // from erasing the content invalidation that refreshes an open thread.
  return `${change.domain}:${change.entityId}:${change.sourceTable}`;
}

function parseChange(value: unknown): MessagingRealtimeChange | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const domain = row.domain;
  const operation = typeof row.operation === "string"
    ? row.operation.toLocaleLowerCase("en-US")
    : "";
  if (
    row.version !== 1
    || typeof domain !== "string"
    || !domains.has(domain as MessagingRealtimeDomain)
    || typeof row.entity_id !== "string"
    || !UUID_PATTERN.test(row.entity_id)
    || !operations.has(operation as "insert" | "update" | "delete")
    || typeof row.source_table !== "string"
  ) return null;

  return {
    version: 1,
    domain: domain as MessagingRealtimeDomain,
    entityId: row.entity_id,
    operation: operation as MessagingRealtimeChange["operation"],
    sourceTable: row.source_table,
    occurredAt: typeof row.occurred_at === "string" ? row.occurred_at : null,
  };
}

/**
 * Subscribes to one private, per-user Broadcast topic.
 *
 * Polling remains enabled in the domain hooks as a recovery path. Realtime is
 * only an invalidation signal; every screen reloads its RLS-protected RPC
 * projection before displaying a change.
 */
export function useMessagingRealtime({
  enabled,
  profileId,
  onChange,
}: UseMessagingRealtimeOptions) {
  const [status, setStatus] = useState<MessagingRealtimeStatus>("idle");
  const callbackRef = useRef(onChange);
  callbackRef.current = onChange;

  useEffect(() => {
    if (!enabled || !profileId || !UUID_PATTERN.test(profileId)) {
      setStatus("idle");
      return undefined;
    }

    let disposed = false;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const pending = new Map<string, MessagingRealtimeChange>();
    const topic = `messaging:user:${profileId}`;
    const channel = supabase.channel(topic, {
      config: {
        private: true,
        broadcast: { self: false },
      },
    });

    setStatus("connecting");
    channel.on("broadcast", { event: "messaging_change" }, ({ payload }) => {
      if (disposed) return;
      const change = parseChange(payload);
      if (!change) return;
      pending.set(messagingRealtimeDeduplicationKey(change), change);
      if (flushTimer !== null) return;
      // One RPC can touch the root, members and activity tables. Collapse that
      // burst before reloading an RLS projection to avoid a client-side fetch
      // storm while keeping the interface effectively instant.
      flushTimer = setTimeout(() => {
        flushTimer = null;
        const changes = [...pending.values()];
        pending.clear();
        if (!disposed) changes.forEach((item) => callbackRef.current(item));
      }, 80);
    });

    void (async () => {
      try {
        await supabase.realtime.setAuth();
        if (disposed) return;
        channel.subscribe((nextStatus) => {
          if (disposed) return;
          if (nextStatus === "SUBSCRIBED") setStatus("connected");
          else if (nextStatus === "CHANNEL_ERROR" || nextStatus === "TIMED_OUT") {
            setStatus("degraded");
          }
        });
      } catch {
        if (!disposed) setStatus("degraded");
      }
    })();

    return () => {
      disposed = true;
      if (flushTimer !== null) clearTimeout(flushTimer);
      pending.clear();
      void supabase.removeChannel(channel);
    };
  }, [enabled, profileId]);

  return { status };
}

export { parseChange as parseMessagingRealtimeChange };
