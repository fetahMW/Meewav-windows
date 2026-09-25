import {
  CalendarClock,
  Check,
  ChevronRight,
  Clock3,
  Inbox,
  PackageCheck,
  RefreshCw,
  Send,
  UsersRound,
  X,
  XCircle,
} from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createMarketplaceIdempotencyKey,
  marketplaceRepository,
  type MarketplaceRepository,
} from "./market.service";
import type {
  MarketplaceIntentRole,
  MarketplaceIntentRow,
  MarketplaceIntentStatus,
} from "./market.types";
import "./market-intent-center.css";

type IntentFilter = "all" | MarketplaceIntentStatus;
type PendingDecision = { intentId: string; action: "accept" | "decline" | "cancel" } | null;

type MarketIntentCenterProps = {
  initialRole?: MarketplaceIntentRole;
  onClose: () => void;
  onIntentChanged?: (intent: MarketplaceIntentRow) => void;
  repository?: MarketplaceRepository;
};

const STATUS_LABELS: Record<MarketplaceIntentStatus, string> = {
  pending: "En attente",
  accepted: "Acceptée",
  declined: "Refusée",
  cancelled: "Annulée",
  expired: "Expirée",
};

const KIND_LABELS: Record<MarketplaceIntentRow["kind"], string> = {
  rental_request: "Demande de location",
  service_booking: "Réservation de service",
  collective_join: "Participation collective",
};

const FILTERS: Array<{ id: IntentFilter; label: string }> = [
  { id: "all", label: "Toutes" },
  { id: "pending", label: "En attente" },
  { id: "accepted", label: "Acceptées" },
  { id: "declined", label: "Refusées" },
  { id: "cancelled", label: "Annulées" },
];

const INTENTS_PAGE_SIZE = 100;

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: value.includes("T") ? "short" : undefined,
  }).format(date);
}

function intentSchedule(intent: MarketplaceIntentRow) {
  const startsOn = formatDate(intent.starts_on);
  const endsOn = formatDate(intent.ends_on);
  if (startsOn && endsOn) return `${startsOn} → ${endsOn}`;
  const requestedFor = formatDate(intent.requested_for);
  if (requestedFor) return requestedFor;
  if (intent.requested_quantity > 1) return `${intent.requested_quantity} participations`;
  return "Date à convenir";
}

function formatSnapshotAmount(snapshot: Record<string, unknown>) {
  const rawAmount = snapshot.unit_amount_minor;
  const currency = snapshot.currency_code === "EUR" ? "EUR" : null;
  if (!Number.isSafeInteger(rawAmount) || Number(rawAmount) < 0 || !currency) return null;
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(Number(rawAmount) / 100);
}

export default function MarketIntentCenter({
  initialRole = "buyer",
  onClose,
  onIntentChanged,
  repository = marketplaceRepository,
}: MarketIntentCenterProps) {
  const [role, setRole] = useState<MarketplaceIntentRole>(initialRole);
  const [filter, setFilter] = useState<IntentFilter>("all");
  const [intents, setIntents] = useState<MarketplaceIntentRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [pendingIntentId, setPendingIntentId] = useState<string | null>(null);
  const [decision, setDecision] = useState<PendingDecision>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const buyerTabRef = useRef<HTMLButtonElement>(null);
  const sellerTabRef = useRef<HTMLButtonElement>(null);
  const requestRef = useRef(0);
  const mountedRef = useRef(true);
  const onCloseRef = useRef(onClose);
  const pendingIntentIdRef = useRef(pendingIntentId);
  const decisionRef = useRef(decision);
  const decisionTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    pendingIntentIdRef.current = pendingIntentId;
  }, [pendingIntentId]);

  useEffect(() => {
    decisionRef.current = decision;
  }, [decision]);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    setStatus("loading");
    setError("");
    setDecision(null);
    try {
      const rows = await repository.listMyIntents({
        role,
        status: filter === "all" ? null : filter,
        limit: INTENTS_PAGE_SIZE,
      });
      if (!mountedRef.current || requestId !== requestRef.current) return;
      setIntents(rows);
      setStatus("ready");
    } catch {
      if (!mountedRef.current || requestId !== requestRef.current) return;
      setIntents([]);
      setStatus("error");
      setError("Impossible de charger les demandes Market. Réessaie dans un instant.");
    }
  }, [filter, repository, role]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const backgroundLayers = document.querySelectorAll<HTMLElement>(".market-shell, .market-primary-rail");
    backgroundLayers.forEach((layer) => layer.setAttribute("inert", ""));
    window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (pendingIntentIdRef.current) return;
        if (decisionRef.current) {
          setDecision(null);
          window.requestAnimationFrame(() => decisionTriggerRef.current?.focus());
          return;
        }
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      )].filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === first || !dialogRef.current.contains(activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeElement === last || activeElement === dialogRef.current || !dialogRef.current.contains(activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      backgroundLayers.forEach((layer) => layer.removeAttribute("inert"));
      previousFocus?.focus();
    };
  }, []);

  const counts = useMemo(() => ({
    pending: intents.filter((intent) => intent.status === "pending").length,
    accepted: intents.filter((intent) => intent.status === "accepted").length,
  }), [intents]);
  const isDisplayLimitReached = intents.length >= INTENTS_PAGE_SIZE;

  const chooseRole = (nextRole: MarketplaceIntentRole) => {
    if (pendingIntentId) return;
    setRole(nextRole);
    setFilter("all");
  };

  const handleRoleKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    currentRole: MarketplaceIntentRole,
  ) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const tabs = [
      { role: "buyer" as const, ref: buyerTabRef },
      { role: "seller" as const, ref: sellerTabRef },
    ];
    const currentIndex = tabs.findIndex((tab) => tab.role === currentRole);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? (currentIndex - 1 + tabs.length) % tabs.length
          : (currentIndex + 1) % tabs.length;
    const next = tabs[nextIndex];
    chooseRole(next.role);
    next.ref.current?.focus();
  };

  const askDecision = (
    intentId: string,
    action: NonNullable<PendingDecision>["action"],
    trigger: HTMLButtonElement,
  ) => {
    if (pendingIntentId) return;
    decisionTriggerRef.current = trigger;
    setDecision((current) => current?.intentId === intentId && current.action === action
      ? null
      : { intentId, action });
  };

  const dismissDecision = () => {
    setDecision(null);
    window.requestAnimationFrame(() => decisionTriggerRef.current?.focus());
  };

  const requestClose = () => {
    if (pendingIntentId) return;
    if (decision) {
      dismissDecision();
      return;
    }
    onClose();
  };

  const applyDecision = async () => {
    if (!decision || pendingIntentId) return;
    const current = decision;
    setPendingIntentId(current.intentId);
    setError("");
    try {
      const result = current.action === "cancel"
        ? await repository.cancelIntent(
          current.intentId,
          createMarketplaceIdempotencyKey("intent-cancel"),
        )
        : await repository.updateIntentStatus(
          current.intentId,
          current.action === "accept" ? "accepted" : "declined",
          createMarketplaceIdempotencyKey(`intent-${current.action}`),
        );
      const changedIntent = intents.find((intent) => intent.intent_id === current.intentId);
      const nextIntent = changedIntent
        ? { ...changedIntent, status: result.status, updated_at: new Date().toISOString() }
        : null;
      setIntents((rows) => rows.flatMap((intent) => {
        if (intent.intent_id !== current.intentId) return [intent];
        if (filter !== "all" && filter !== result.status) return [];
        return nextIntent ? [nextIntent] : [];
      }));
      if (nextIntent) onIntentChanged?.(nextIntent);
      setDecision(null);
      window.requestAnimationFrame(() => {
        const trigger = decisionTriggerRef.current;
        if (trigger?.isConnected) trigger.focus();
        else dialogRef.current?.querySelector<HTMLElement>("#market-intents-panel")?.focus();
      });
    } catch {
      setError("La demande n’a pas été modifiée. Son état précédent est conservé.");
    } finally {
      setPendingIntentId(null);
    }
  };

  return (
    <div className="market-intents-layer">
      <button
        type="button"
        className="market-intents-layer__backdrop"
        aria-hidden="true"
        tabIndex={-1}
        disabled={Boolean(pendingIntentId)}
        onClick={requestClose}
      />
      <section
        ref={dialogRef}
        className="market-intents"
        role="dialog"
        aria-modal="true"
        aria-labelledby="market-intents-title"
        tabIndex={-1}
      >
        <header className="market-intents__header">
          <div className="market-intents__symbol"><Inbox aria-hidden="true" /></div>
          <div>
            <span>Activité Market</span>
            <h2 id="market-intents-title">Demandes et réservations</h2>
            <p>Retrouve ici les demandes envoyées et celles reçues sur tes annonces.</p>
          </div>
          <button type="button" onClick={requestClose} disabled={Boolean(pendingIntentId)} aria-label="Fermer">
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="market-intents__roles" role="tablist" aria-label="Côté de la demande">
          <button
            ref={buyerTabRef}
            id="market-intents-buyer-tab"
            type="button"
            role="tab"
            aria-selected={role === "buyer"}
            aria-controls="market-intents-panel"
            tabIndex={role === "buyer" ? 0 : -1}
            className={role === "buyer" ? "is-active" : ""}
            disabled={Boolean(pendingIntentId)}
            onClick={() => chooseRole("buyer")}
            onKeyDown={(event) => handleRoleKeyDown(event, "buyer")}
          >
            <Send aria-hidden="true" /> Mes demandes
          </button>
          <button
            ref={sellerTabRef}
            id="market-intents-seller-tab"
            type="button"
            role="tab"
            aria-selected={role === "seller"}
            aria-controls="market-intents-panel"
            tabIndex={role === "seller" ? 0 : -1}
            className={role === "seller" ? "is-active" : ""}
            disabled={Boolean(pendingIntentId)}
            onClick={() => chooseRole("seller")}
            onKeyDown={(event) => handleRoleKeyDown(event, "seller")}
          >
            <PackageCheck aria-hidden="true" /> Demandes reçues
          </button>
          <div className="market-intents__summary" aria-label="Résumé des demandes affichées">
            <span><Clock3 aria-hidden="true" /> {counts.pending} en attente</span>
            <span><Check aria-hidden="true" /> {counts.accepted} acceptée{counts.accepted === 1 ? "" : "s"}</span>
          </div>
        </div>

        <nav className="market-intents__filters" aria-label="Filtrer les demandes">
          {FILTERS.map((item) => (
            <button
              type="button"
              key={item.id}
              className={filter === item.id ? "is-active" : ""}
              aria-pressed={filter === item.id}
              disabled={Boolean(pendingIntentId)}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
          <button type="button" className="market-intents__refresh" onClick={() => { void load(); }} disabled={status === "loading" || Boolean(pendingIntentId)}>
            <RefreshCw aria-hidden="true" /> Actualiser
          </button>
        </nav>

        {error ? <div className="market-intents__error" role="alert">{error}</div> : null}

        <div
          id="market-intents-panel"
          className="market-intents__content"
          role="tabpanel"
          aria-labelledby={`market-intents-${role}-tab`}
          aria-busy={status === "loading"}
          tabIndex={0}
        >
          {status === "loading" ? (
            <div className="market-intents__loading" role="status">
              <i /><i /><i />
              <span>Synchronisation des demandes…</span>
            </div>
          ) : intents.length === 0 ? (
            <div className="market-intents__empty">
              <Inbox aria-hidden="true" />
              <h3>{role === "buyer" ? "Aucune demande envoyée" : "Aucune demande reçue"}</h3>
              <p>{filter === "all" ? "Les prochaines activités apparaîtront ici, sans mélanger les paiements ou les messages." : "Aucune demande ne correspond à ce filtre."}</p>
            </div>
          ) : (
            <>
              {isDisplayLimitReached ? (
                <p className="market-intents__limit" role="status">
                  Les {INTENTS_PAGE_SIZE} demandes les plus récentes sont affichées. Utilise les filtres pour affiner la liste.
                </p>
              ) : null}
              <div className="market-intents__list">
                {intents.map((intent) => {
                const isPending = intent.status === "pending";
                const canBuyerCancel = role === "buyer" && (isPending || intent.status === "accepted");
                const amount = formatSnapshotAmount(intent.pricing_snapshot);
                const isConfirming = decision?.intentId === intent.intent_id;
                const partyName = role === "seller" ? intent.buyer_display_name : intent.seller_display_name;
                return (
                  <article key={intent.intent_id} className="market-intent-card" data-status={intent.status}>
                    <div className="market-intent-card__icon">
                      {intent.kind === "collective_join" ? <UsersRound aria-hidden="true" /> : <CalendarClock aria-hidden="true" />}
                    </div>
                    <div className="market-intent-card__main">
                      <div className="market-intent-card__eyebrow">
                        <span>{KIND_LABELS[intent.kind]}</span>
                        <span className="market-intent-card__status">{STATUS_LABELS[intent.status]}</span>
                      </div>
                      <h3>{intent.listing_title}</h3>
                      <div className="market-intent-card__facts">
                        <span>{role === "seller" ? "Par" : "Avec"} <strong>{partyName || "Profil indisponible"}</strong></span>
                        <span>{intentSchedule(intent)}</span>
                        {amount ? <span>{amount}{intent.requested_quantity > 1 ? ` × ${intent.requested_quantity}` : ""}</span> : null}
                      </div>
                      {intent.note ? <p>{intent.note}</p> : null}
                    </div>
                    <div className="market-intent-card__actions">
                      {isPending && role === "seller" ? <>
                        <button type="button" className="is-primary" onClick={(event) => askDecision(intent.intent_id, "accept", event.currentTarget)} disabled={Boolean(pendingIntentId)}>
                          <Check aria-hidden="true" /> Accepter
                        </button>
                        <button type="button" onClick={(event) => askDecision(intent.intent_id, "decline", event.currentTarget)} disabled={Boolean(pendingIntentId)}>
                          <XCircle aria-hidden="true" /> Refuser
                        </button>
                      </> : null}
                      {canBuyerCancel ? (
                        <button type="button" onClick={(event) => askDecision(intent.intent_id, "cancel", event.currentTarget)} disabled={Boolean(pendingIntentId)}>
                          <XCircle aria-hidden="true" /> Annuler
                        </button>
                      ) : null}
                      {!isPending && !canBuyerCancel ? <span className="market-intent-card__done"><ChevronRight aria-hidden="true" /> État enregistré</span> : null}
                    </div>
                    {isConfirming ? (
                      <div className="market-intent-card__confirm" role="group" aria-live="polite" aria-label="Confirmer la modification">
                        <span>{decision.action === "accept" ? "Accepter cette demande ?" : decision.action === "decline" ? "Refuser cette demande ?" : "Annuler cette demande ?"}</span>
                        <button type="button" onClick={dismissDecision} disabled={pendingIntentId === intent.intent_id}>Retour</button>
                        <button type="button" className="is-confirm" autoFocus onClick={() => { void applyDecision(); }} disabled={pendingIntentId === intent.intent_id}>
                          {pendingIntentId === intent.intent_id ? "Enregistrement…" : "Confirmer"}
                        </button>
                      </div>
                    ) : null}
                  </article>
                );
                })}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
