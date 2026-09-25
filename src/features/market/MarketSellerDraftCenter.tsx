import { useCallback, useEffect, useRef, useState } from "react";
import { FilePenLine, Image, Plus, RefreshCw } from "lucide-react";
import type { MarketplaceOwnerDraft, MarketplacePillar } from "./market.types";
import { createMarketplaceIdempotencyKey, marketplaceRepository, type MarketplaceOwnerListingSummary, type MarketplaceRepository } from "./market.service";
import {
  useMarketplaceSellerDrafts,
  type MarketplaceDraftRepository,
} from "./useMarketplaceSellerDrafts";
import "./market-seller-draft-center.css";

const PILLAR_LABELS: Record<MarketplacePillar, string> = {
  new: "Neuf",
  used: "Occasion",
  rental: "Location",
  services: "Service",
  collective: "Collectif",
};

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatPrice(amountMinor: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export type MarketSellerDraftCenterProps = {
  enabled?: boolean;
  repository?: MarketplaceDraftRepository;
  lifecycleRepository?: Pick<MarketplaceRepository, "listMyListings" | "setListingStatus">;
  onResume: (draft: MarketplaceOwnerDraft) => void;
  onCreate?: () => void;
  onCatalogChanged?: () => void;
};

export function MarketSellerDraftCenter({
  enabled = true,
  repository,
  lifecycleRepository = marketplaceRepository,
  onResume,
  onCreate,
  onCatalogChanged,
}: MarketSellerDraftCenterProps) {
  const { drafts, status, error, refresh } = useMarketplaceSellerDrafts({
    enabled,
    repository,
  });
  const [listings, setListings] = useState<MarketplaceOwnerListingSummary[]>([]);
  const [listingsError, setListingsError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const actionRunning = useRef(false);
  const listRequest = useRef(0);
  const loadListings = useCallback(async () => {
    if (!enabled) return;
    const request = ++listRequest.current;
    try {
      const items = await lifecycleRepository.listMyListings();
      if (listRequest.current === request) { setListings(items); setListingsError(""); }
    } catch {
      if (listRequest.current === request) setListingsError("Impossible de charger tes annonces en ligne. Réessaie.");
    }
  }, [enabled, lifecycleRepository]);
  useEffect(() => {
    if (!enabled) { ++listRequest.current; setListings([]); setListingsError(""); return; }
    void loadListings();
    return () => { ++listRequest.current; };
  }, [enabled, loadListings]);
  const changeStatus = async (listingId: string, version: number, next: "published" | "paused") => {
    if (actionRunning.current) return;
    actionRunning.current = true;
    setBusyId(listingId); setActionNotice("");
    try {
      await lifecycleRepository.setListingStatus({
        listingId, expectedVersion: version, status: next,
        idempotencyKey: createMarketplaceIdempotencyKey(`listing-${next}`),
      });
      setActionNotice(next === "published" ? "Annonce visible dans le catalogue." : "Annonce retirée du catalogue.");
      onCatalogChanged?.();
    } catch {
      setActionNotice("Cette annonce n’a pas changé. Vérifie ses informations et réessaie.");
    } finally {
      await Promise.allSettled([refresh(), loadListings()]);
      actionRunning.current = false;
      setBusyId(null);
    }
  };

  return (
    <section className="market-seller-drafts" aria-labelledby="market-seller-drafts-title">
      <header className="market-seller-drafts__header">
        <div>
          <span className="market-seller-drafts__eyebrow">Tes annonces</span>
          <h2 id="market-seller-drafts-title">Mes annonces</h2>
          <p>Reprends un brouillon, publie-le ou retire une annonce du catalogue.</p>
        </div>
        {onCreate ? (
          <button type="button" className="market-seller-drafts__create" onClick={onCreate}>
            <Plus aria-hidden="true" />
            Nouvelle annonce
          </button>
        ) : null}
      </header>

      {error ? (
        <div className="market-seller-drafts__notice" role="status">
          <span>{error.message}</span>
          <button type="button" onClick={() => void refresh()}>
            <RefreshCw aria-hidden="true" />
            Réessayer
          </button>
        </div>
      ) : null}
      {listingsError ? <div className="market-seller-drafts__notice" role="alert"><span>{listingsError}</span><button type="button" onClick={() => void loadListings()}><RefreshCw aria-hidden="true" />Réessayer</button></div> : null}
      {actionNotice ? <p role="status" className="market-seller-drafts__status">{actionNotice}</p> : null}

      {listings.some((item) => item.status !== "draft") ? <div className="market-seller-drafts__active">
        <h3>En ligne et retirées</h3>
        <ul className="market-seller-drafts__list">{listings.filter((item) => item.status !== "draft").map((item) => <li key={item.id}>
          <div className="market-seller-drafts__icon" aria-hidden="true"><Image /></div>
          <div className="market-seller-drafts__copy"><span>{PILLAR_LABELS[item.pillar]} · {item.status === "published" ? "En ligne" : "Retirée"}</span><strong>{item.title}</strong><small>Modifiée le {formatUpdatedAt(item.updatedAt)}</small></div>
          <button type="button" className="market-seller-drafts__resume" disabled={busyId !== null}
            onClick={() => void changeStatus(item.id, item.version, item.status === "published" ? "paused" : "published")}>{busyId === item.id ? "Enregistrement…" : item.status === "published" ? "Retirer" : "Remettre en ligne"}</button>
        </li>)}</ul>
      </div> : null}

      <h3 className="market-seller-drafts__section-title">Brouillons</h3>

      {status === "loading" && drafts.length === 0 ? (
        <div className="market-seller-drafts__loading" role="status">
          <span />
          <span />
          <span />
          <span className="sr-only">Chargement de tes brouillons…</span>
        </div>
      ) : null}

      {status === "ready" && drafts.length === 0 ? (
        <div className="market-seller-drafts__empty">
          <FilePenLine aria-hidden="true" />
          <strong>Aucun brouillon en attente</strong>
          <span>Une annonce enregistrée apparaîtra ici, uniquement pour toi.</span>
        </div>
      ) : null}

      {drafts.length > 0 ? (
        <ul className="market-seller-drafts__list">
          {drafts.map((draft) => (
            <li key={draft.listingId}>
              <div className="market-seller-drafts__icon" aria-hidden="true">
                {draft.media[0]?.sourceUrl ? (
                  <img src={draft.media[0].sourceUrl} alt="" />
                ) : (
                  <Image />
                )}
              </div>
              <div className="market-seller-drafts__copy">
                <span>{PILLAR_LABELS[draft.input.pillar]} · modifié le {formatUpdatedAt(draft.updatedAt)}</span>
                <strong>{draft.input.title}</strong>
                <small>
                  {formatPrice(draft.input.unitAmountMinor)} · {draft.input.mediaFileIds.length} média
                  {draft.input.mediaFileIds.length > 1 ? "s" : ""}
                </small>
              </div>
              <div className="market-seller-drafts__actions"><button
                type="button" className="market-seller-drafts__resume" onClick={() => onResume(draft)}
                aria-label={`Reprendre le brouillon ${draft.input.title}`}>Reprendre</button>
                <button type="button" className="market-seller-drafts__publish" disabled={busyId !== null}
                  onClick={() => void changeStatus(draft.listingId, draft.version, "published")}>{busyId === draft.listingId ? "Publication…" : "Publier"}</button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
