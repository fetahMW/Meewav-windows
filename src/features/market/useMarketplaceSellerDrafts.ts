import { useCallback, useEffect, useRef, useState } from "react";
import { toMarketplaceServiceError } from "./market.errors";
import {
  createMarketplaceIdempotencyKey,
  marketplaceRepository,
  type MarketplaceRepository,
} from "./market.service";
import type {
  MarketplaceListingDraftInput,
  MarketplaceOwnerDraft,
} from "./market.types";

export type MarketplaceDraftRepository = Pick<
  MarketplaceRepository,
  "listMyListingDrafts" | "updateListingDraft"
>;

export type MarketplaceSellerDraftsStatus = "idle" | "loading" | "ready" | "error";

export type MarketplaceSellerDraftsError = {
  code: string;
  message: string;
};

const DRAFT_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  unauthenticated: "Reconnecte-toi pour retrouver tes brouillons.",
  forbidden: "Ce brouillon ne t’appartient pas ou n’est plus modifiable.",
  not_found: "Ce brouillon n’existe plus.",
  conflict: "Ce brouillon a été modifié ailleurs. La version la plus récente va être rechargée.",
  invalid_request: "Les informations du brouillon sont incomplètes.",
  load_failed: "Impossible de charger tes brouillons pour le moment.",
  mutation_failed: "La modification n’a pas été enregistrée. Ton brouillon précédent est conservé.",
};

function draftError(error: unknown, fallback: "load_failed" | "mutation_failed") {
  const normalized = toMarketplaceServiceError(error, fallback);
  return {
    code: normalized.code,
    message: DRAFT_ERROR_MESSAGES[normalized.code] ?? DRAFT_ERROR_MESSAGES[fallback],
  };
}

export function useMarketplaceSellerDrafts({
  enabled = true,
  repository = marketplaceRepository,
  limit = 50,
}: {
  enabled?: boolean;
  repository?: MarketplaceDraftRepository;
  limit?: number;
} = {}) {
  const [drafts, setDrafts] = useState<MarketplaceOwnerDraft[]>([]);
  const [status, setStatus] = useState<MarketplaceSellerDraftsStatus>("idle");
  const [error, setError] = useState<MarketplaceSellerDraftsError | null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const savingIdsRef = useRef<Set<string>>(new Set());
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    if (!enabled) return false;
    const requestId = ++requestRef.current;
    setStatus("loading");
    setError(null);
    try {
      const nextDrafts = await repository.listMyListingDrafts(limit);
      if (requestRef.current !== requestId) return false;
      setDrafts(nextDrafts);
      setStatus("ready");
      return true;
    } catch (caught) {
      if (requestRef.current !== requestId) return false;
      setError(draftError(caught, "load_failed"));
      setStatus("error");
      return false;
    }
  }, [enabled, limit, repository]);

  useEffect(() => {
    if (!enabled) {
      ++requestRef.current;
      setDrafts([]);
      setStatus("idle");
      setError(null);
      setSavingIds(new Set());
      savingIdsRef.current = new Set();
      return;
    }
    void load();
  }, [enabled, load]);

  const updateDraft = useCallback(async (
    draft: MarketplaceOwnerDraft,
    input: MarketplaceListingDraftInput,
  ) => {
    if (!enabled || savingIdsRef.current.has(draft.listingId)) return false;
    setError(null);
    setSavingIds((current) => {
      const next = new Set(current).add(draft.listingId);
      savingIdsRef.current = next;
      return next;
    });
    try {
      await repository.updateListingDraft({
        listingId: draft.listingId,
        expectedVersion: draft.version,
        input,
        idempotencyKey: createMarketplaceIdempotencyKey("draft-update"),
      });
      await load();
      return true;
    } catch (caught) {
      const nextError = draftError(caught, "mutation_failed");
      setError(nextError);
      if (nextError.code === "conflict" || nextError.code === "not_found") {
        await load();
        setError(nextError);
      }
      return false;
    } finally {
      setSavingIds((current) => {
        const next = new Set(current);
        next.delete(draft.listingId);
        savingIdsRef.current = next;
        return next;
      });
    }
  }, [enabled, load, repository]);

  return {
    drafts,
    status,
    error,
    savingIds,
    refresh: load,
    updateDraft,
  };
}
