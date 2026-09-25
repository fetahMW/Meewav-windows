import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  CheckCircle2,
  Clock3,
  Euro,
  Gauge,
  Info,
  LockKeyhole,
  RefreshCcw,
  Scale,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { TremplinArtist } from "./tremplinArtistData";
import { trackTremplinEvent } from "./tremplinAnalytics";
import TremplinDemoBanner from "./TremplinDemoBanner";
import MeewavTokenIcon from "./MeewavTokenIcon";
import {
  TREMPLIN_PLATFORM_CONFIG,
  type TremplinArtistToken,
  type TremplinKycStatus,
} from "./tremplinTokenData";
import { TREMPLIN_COPY, TREMPLIN_TRANSACTION_COPY } from "./tremplinCopy";
import { TREMPLIN_FEATURE_FLAGS } from "./tremplinFeatureFlags";
import {
  tremplinApiQuoteRepository,
  tremplinDemoQuoteRepository,
  type TremplinQuote,
} from "./tremplinQuoteService";
import "./tremplin-token-flow.css";

type FlowStep = 1 | 2 | 3 | 4;
type TokenFlowMode = "buy" | "sell";
type ResaleInputMode = "quantity" | "percentage" | "all";

export type TremplinTokenFlowOperation = TremplinQuote;

export type TremplinTokenFlowProps = {
  artist: TremplinArtist;
  token: TremplinArtistToken;
  initialMode: TokenFlowMode;
  backLabel?: string;
  onClose: () => void;
  onConfirm: (operation: TremplinTokenFlowOperation) => void;
};

const BUY_PRESETS = [10, 25, 50, 100] as const;
const SELL_PERCENT_PRESETS = [25, 50, 75, 100] as const;
const STEP_LABELS = TREMPLIN_TRANSACTION_COPY.steps;
const quoteRepository = TREMPLIN_FEATURE_FLAGS.apiTransactions
  ? tremplinApiQuoteRepository
  : tremplinDemoQuoteRepository;

const currencyFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const tokenFormatter = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
});

function formatCurrency(value: number) {
  return currencyFormatter.format(Number.isFinite(value) ? value : 0);
}

function formatTokenQuantity(value: number) {
  return tokenFormatter.format(Number.isFinite(value) ? value : 0);
}

function formatPercent(value: number) {
  return `${percentFormatter.format(Number.isFinite(value) ? value : 0)} %`;
}

function parsePositiveNumber(rawValue: string) {
  const parsed = Number(rawValue.trim().replace(",", "."));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function isRapidExit(token: TremplinArtistToken) {
  if (!token.userPosition.acquiredAt) return false;
  const acquiredAt = new Date(token.userPosition.acquiredAt).getTime();
  const elapsedHours = (Date.now() - acquiredAt) / 3_600_000;
  return elapsedHours >= 0 && elapsedHours < TREMPLIN_PLATFORM_CONFIG.rapidExitWindowHours;
}

function buildOperationReference(artistId: string) {
  const date = new Date();
  const compactDate = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  const compactTime = `${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}${String(date.getSeconds()).padStart(2, "0")}`;
  const entropy = globalThis.crypto?.randomUUID?.().replace(/-/g, "").slice(0, 8).toUpperCase()
    ?? date.getTime().toString(36).toUpperCase();
  return `MW-T-${artistId.slice(0, 4).toUpperCase()}-${compactDate}-${compactTime}-${entropy}`;
}

type QuoteSummaryProps = {
  quote: TremplinQuote;
  symbol: string;
  detailed?: boolean;
  expired?: boolean;
};

function QuoteSummary({ quote, symbol, detailed = false, expired = false }: QuoteSummaryProps) {
  const isPurchase = quote.operation === "purchase";
  const mainAmount = isPurchase ? quote.amountPaidEur : quote.netAmountEur;
  const quantity = isPurchase ? quote.estimatedTokenQuantity : quote.quantityResold;

  return (
    <section className="tremplin-token-flow__quote" aria-label="Estimation de l’opération">
      <div>
        <span className="tremplin-token-flow__eyebrow">
          <Gauge aria-hidden="true" /> {TREMPLIN_TRANSACTION_COPY.estimate}
        </span>
        <h4>Montant ou quantité estimé avant confirmation</h4>
      </div>

      <div className="tremplin-token-flow__quote-hero">
        <span>{isPurchase ? "Quantité estimée" : "Montant net estimé"}</span>
        <strong>
          {isPurchase ? `${formatTokenQuantity(quantity)} ${symbol}` : formatCurrency(mainAmount)}
        </strong>
        <small>
          {isPurchase
            ? `Pour un montant total de ${formatCurrency(quote.amountPaidEur)}`
            : `Pour ${formatTokenQuantity(quantity)} ${symbol} revendus`}
        </small>
      </div>

      <div className="tremplin-token-flow__quote-validity">
        <Clock3 aria-hidden="true" />
        <span>Estimation valable jusqu’à {new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(quote.expiresAt))}</span>
      </div>
      <details className="tremplin-token-flow__quote-meta">
        <summary>Détails techniques de l’estimation</summary>
        <span>Référence : {quote.quoteId}</span>
        <span>Source : {quote.source === "demo" ? "service de démonstration" : "serveur MeeWav"}</span>
      </details>
      {expired ? <p className="tremplin-token-flow__expired" role="alert">Cette estimation a expiré. Recalcule-la avant de continuer.</p> : null}

      <div className="tremplin-token-flow__rows">
        {detailed ? <><div className="tremplin-token-flow__row">
          <span>Valeur avant</span>
          <strong>{formatCurrency(quote.priceBeforeEur)} / jeton</strong>
        </div>
        <div className="tremplin-token-flow__row">
          <span>Valeur estimée après</span>
          <strong>{formatCurrency(quote.priceAfterEur)} / jeton</strong>
        </div>
        <div className="tremplin-token-flow__row">
          <span>Variation estimée du prix</span>
          <strong>{formatPercent(quote.priceImpactPercent)}</strong>
        </div></> : null}

        <div className="tremplin-token-flow__row"><span>Frais totaux estimés</span><strong>{formatCurrency(quote.totalFeesEur)}</strong></div>
        {isPurchase ? <div className="tremplin-token-flow__row is-total"><span>Part reçue directement par l’artiste</span><strong>{formatCurrency(quote.artistAmountEur)}</strong></div> : null}

        {detailed && quote.feeLines.map((fee) => (
          <div className="tremplin-token-flow__row" key={fee.id}>
            <span>{fee.label}</span>
            <strong>{formatCurrency(fee.amountEur)}</strong>
          </div>
        ))}

        {detailed && isPurchase && quote.distributionLines.map((distribution) => (
          <div className="tremplin-token-flow__row" key={distribution.id}>
            <span>{distribution.label}</span>
            <strong>{formatCurrency(distribution.amountEur)}</strong>
          </div>
        ))}

        {detailed && !isPurchase && (
          <div className="tremplin-token-flow__row">
            <span>Valeur estimée avant frais</span>
            <strong>{formatCurrency(quote.estimatedValueBeforeFeesEur)}</strong>
          </div>
        )}

        {detailed ? <div className="tremplin-token-flow__row">
          <span>Part du nombre total de jetons après l’opération</span>
          <strong>{formatPercent(quote.ownershipShareAfterPercent)}</strong>
        </div> : null}

        {detailed && (
          <div className="tremplin-token-flow__row is-total">
            <span>{isPurchase ? "Total payé" : "Montant net estimé"}</span>
            <strong>{formatCurrency(mainAmount)}</strong>
          </div>
        )}
      </div>
    </section>
  );
}

export function TremplinTokenFlow({
  artist,
  token,
  initialMode,
  backLabel = "Retour au Tremplin",
  onClose,
  onConfirm,
}: TremplinTokenFlowProps) {
  const [step, setStep] = useState<FlowStep>(1);
  const [mode] = useState<TokenFlowMode>(initialMode);
  const [buyAmount, setBuyAmount] = useState("");
  const [resaleInputMode, setResaleInputMode] = useState<ResaleInputMode | null>(null);
  const [sellQuantity, setSellQuantity] = useState("");
  const [sellPercentage, setSellPercentage] = useState(0);
  const [allSaleAcknowledged, setAllSaleAcknowledged] = useState(false);
  const [riskAccepted, setRiskAccepted] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [operationReference, setOperationReference] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [quoteRevision, setQuoteRevision] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  // The connected mock profile is already verified. Production must provide
  // this status from the server and recalculate the quote authoritatively.
  const kycStatus: TremplinKycStatus = "verified";
  const kycVerified = kycStatus === "verified";
  const currentQuantity = token.userPosition.quantity;
  const rapidExit = isRapidExit(token);

  const requestedSellQuantity = useMemo(() => {
    if (resaleInputMode === null) return 0;
    if (resaleInputMode === "all") return currentQuantity;
    if (resaleInputMode === "percentage") {
      return currentQuantity * Math.min(100, Math.max(0, sellPercentage)) / 100;
    }
    return parsePositiveNumber(sellQuantity);
  }, [currentQuantity, resaleInputMode, sellPercentage, sellQuantity]);

  const quote = useMemo<TremplinQuote>(() => {
    void quoteRevision;
    if (mode === "buy") {
      return quoteRepository.createQuote({
        operation: "purchase",
        token,
        amountEur: parsePositiveNumber(buyAmount),
        kycStatus,
      });
    }

    return quoteRepository.createQuote({
      operation: "resale",
      token,
      quantity: requestedSellQuantity,
      kycStatus,
      rapidExit,
    });
  }, [buyAmount, kycStatus, mode, quoteRevision, rapidExit, requestedSellQuantity, token]);

  const quoteExpired = quoteRepository.isExpired(quote, new Date(clock));

  const isPurchase = quote.operation === "purchase";
  const hasInput = isPurchase
    ? quote.amountPaidEur > 0
    : quote.quantityResold > 0 && requestedSellQuantity <= currentQuantity;
  const canProceed = hasInput && quote.eligible && !quoteExpired && (resaleInputMode !== "all" || allSaleAcknowledged);
  const hasEditedOperationInput = isPurchase
    ? buyAmount.trim().length > 0
    : resaleInputMode !== null && (resaleInputMode !== "quantity" || sellQuantity.trim().length > 0);
  const finalAmount = isPurchase ? quote.amountPaidEur : quote.netAmountEur;
  const finalQuantity = isPurchase ? quote.estimatedTokenQuantity : quote.quantityResold;
  const retainedQuantity = Math.max(0, quote.userQuantityAfter);
  const artistShare = isPurchase ? quote.artistAmountEur : 0;
  const initialSellAmount = isPurchase ? 0 : quote.quantityResold * token.userPosition.averagePurchasePriceEur;
  const acquisitionDate = token.userPosition.acquiredAt
    ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(token.userPosition.acquiredAt))
    : "non renseignée";
  const quoteCreatedAt = Date.parse(quote.createdAt);
  const purchaseResaleDate = Number.isFinite(quoteCreatedAt)
    ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(quoteCreatedAt + TREMPLIN_PLATFORM_CONFIG.rapidExitWindowHours * 60 * 60 * 1000))
    : "indiquée avant la confirmation";
  const requestClose = () => {
    const hasUnfinishedInput = step < 4 && (hasEditedOperationInput || step > 1);
    if (hasUnfinishedInput && !window.confirm("Quitter cette simulation ? Les informations saisies seront perdues.")) return;
    onClose();
  };

  useEffect(() => {
    if (step > 1) stepHeadingRef.current?.focus();
    if (step === 2) trackTremplinEvent("purchase_summary_viewed", { artistId: artist.id, operation: mode });
  }, [artist.id, mode, step]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const refreshQuote = () => {
    setClock(Date.now());
    setQuoteRevision((revision) => revision + 1);
    setErrorMessage("");
  };

  const advance = () => {
    setErrorMessage("");
    if (!canProceed) {
      setErrorMessage(quoteExpired ? "Cette estimation a expiré. Recalcule-la avant de continuer." : quote.blockedReasons[0] || "Choisis un montant valide pour continuer.");
      return;
    }
    if (step < 3) setStep((current) => (current + 1) as FlowStep);
  };

  const confirmOperation = () => {
    setErrorMessage("");
    if (isConfirming) return;
    if (quoteExpired) {
      setErrorMessage("Cette estimation a expiré. Recalcule-la avant de confirmer.");
      return;
    }
    if (!kycVerified || !quote.eligible) {
      setErrorMessage(quote.blockedReasons[0] || "Ton identité doit être vérifiée avant cette opération.");
      return;
    }
    if (!riskAccepted) {
      setErrorMessage("Confirme avoir compris les frais, le fonctionnement de la valeur et le risque de perte.");
      return;
    }

    setIsConfirming(true);
    try {
      onConfirm(quote);
      trackTremplinEvent(mode === "buy" ? "purchase_confirmed" : "resale_confirmed", { artistId: artist.id, quoteId: quote.quoteId, demo: quote.source === "demo" });
      setOperationReference(buildOperationReference(artist.id));
      setStep(4);
    } catch {
      setIsConfirming(false);
      setErrorMessage("La demande n’a pas pu être préparée. Réessayez sans modifier l’opération.");
    }
  };

  const renderAmountStep = () => (
    <div className="tremplin-token-flow__screen">
      <div className="tremplin-token-flow__intro">
        <span className="tremplin-token-flow__eyebrow">
          <MeewavTokenIcon /> Jeton d’artiste · {token.symbol}
        </span>
        <h3 ref={stepHeadingRef} tabIndex={-1}>
          {mode === "buy" ? `Quel montant souhaites-tu utiliser pour acheter des jetons ${token.symbol} ?` : `Revendre des jetons ${token.symbol}`}
        </h3>
        <p>
          {mode === "buy"
            ? `Une partie du montant revient à ${artist.name}. Le détail, les frais et les risques sont affichés avant la confirmation.`
            : "Choisis la quantité que tu souhaites proposer à la revente. Le montant final, les frais et le délai éventuel seront confirmés avant l’opération."}
        </p>
      </div>

      <div className="tremplin-token-flow__two-column">
        <section className="tremplin-token-flow__panel" aria-label={mode === "buy" ? "Montant de l’achat" : "Quantité à revendre"}>
          <div className="tremplin-token-flow__panel-heading">
            <div>
              <h4>{mode === "buy" ? "Montant de l’achat" : "Jetons à revendre"}</h4>
              <p>{mode === "buy" ? "Choisis un montant dans les limites affichées. Aucun montant n’est présélectionné." : "Choisis une quantité, un pourcentage ou tout revendre."}</p>
            </div>
            <div className="tremplin-token-flow__balance">
              <span>Tu détiens</span>
              <strong>{formatTokenQuantity(currentQuantity)} {token.symbol}</strong>
            </div>
          </div>

          {mode === "buy" ? (
            <>
              <label className="tremplin-token-flow__amount-field">
                <Euro aria-hidden="true" />
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  aria-label="Montant de l’achat en euros"
                  value={buyAmount}
                  placeholder="0"
                  onChange={(event) => setBuyAmount(event.target.value)}
                />
                <span>EUR</span>
              </label>
              <div className="tremplin-token-flow__presets" aria-label="Montants suggérés">
                {BUY_PRESETS.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    className={parsePositiveNumber(buyAmount) === amount ? "is-active" : ""}
                    onClick={() => setBuyAmount(String(amount))}
                  >
                    {amount} €
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="tremplin-token-flow__sell-kind" role="tablist" aria-label="Méthode de revente">
                <button type="button" role="tab" aria-selected={resaleInputMode === "quantity"} className={resaleInputMode === "quantity" ? "is-active" : ""} onClick={() => { setResaleInputMode("quantity"); setAllSaleAcknowledged(false); }}>Quantité</button>
                <button type="button" role="tab" aria-selected={resaleInputMode === "percentage"} className={resaleInputMode === "percentage" ? "is-active" : ""} onClick={() => { setResaleInputMode("percentage"); setAllSaleAcknowledged(false); }}>Pourcentage</button>
                <button type="button" role="tab" aria-selected={resaleInputMode === "all"} className={resaleInputMode === "all" ? "is-active" : ""} onClick={() => { setResaleInputMode("all"); setAllSaleAcknowledged(false); }}>Tout revendre</button>
              </div>

              {resaleInputMode === null ? <div className="tremplin-token-flow__empty-estimate"><Scale aria-hidden="true" /><span><strong>Choisis une méthode de revente.</strong><small>Aucune quantité ni estimation n’est présélectionnée.</small></span></div> : null}

              {resaleInputMode === "quantity" && (
                <label className="tremplin-token-flow__amount-field">
                  <MeewavTokenIcon />
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    aria-label={`Quantité de ${token.symbol} à revendre`}
                    value={sellQuantity}
                    placeholder="0"
                    onChange={(event) => setSellQuantity(event.target.value)}
                  />
                  <span>{token.symbol}</span>
                </label>
              )}

              {resaleInputMode === "percentage" && (
                <div className="tremplin-token-flow__range">
                  <div className="tremplin-token-flow__range-labels">
                    <span>Part des jetons détenus</span>
                    <strong>{sellPercentage} % · {formatTokenQuantity(requestedSellQuantity)} {token.symbol}</strong>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={sellPercentage}
                    aria-label="Pourcentage de jetons à revendre"
                    onChange={(event) => setSellPercentage(Number(event.target.value))}
                  />
                  <div className="tremplin-token-flow__sell-presets">
                    {SELL_PERCENT_PRESETS.map((percent) => (
                      <button key={percent} type="button" className={sellPercentage === percent ? "is-active" : ""} onClick={() => setSellPercentage(percent)}>{percent} %</button>
                    ))}
                  </div>
                </div>
              )}

              {resaleInputMode === "all" && (
                <>
                  <div className="tremplin-token-flow__quote-hero">
                    <span>Tous mes jetons</span>
                    <strong>{formatTokenQuantity(currentQuantity)} {token.symbol}</strong>
                    <small>Ta part restante sera de 0 % après confirmation.</small>
                  </div>
                  <label className="tremplin-token-flow__consent">
                    <input type="checkbox" checked={allSaleAcknowledged} onChange={(event) => setAllSaleAcknowledged(event.target.checked)} />
                    <span>Je confirme vouloir revendre la totalité de mes jetons {token.symbol}.</span>
                  </label>
                </>
              )}
            </>
          )}

          {rapidExit && mode === "sell" ? (
            <div className="tremplin-token-flow__warning" role="note">
              <AlertTriangle aria-hidden="true" />
              <span>Une revente aussi rapide entraîne des frais importants. Le montant net estimé peut être inférieur au montant initial correspondant.</span>
            </div>
          ) : (
            <div className="tremplin-token-flow__hint" role="note">
              <Info aria-hidden="true" />
              <span>{TREMPLIN_COPY.serverRecalculation}</span>
            </div>
          )}

          {hasEditedOperationInput && !canProceed && quote.blockedReasons.length > 0 && (
            <p className="tremplin-token-flow__error" role="alert">{quote.blockedReasons[0]}</p>
          )}
          {mode === "buy" && parsePositiveNumber(buyAmount) > 0 ? <aside className="tremplin-token-flow__artist-share"><span>Part reçue directement par {artist.name}</span><strong>{formatCurrency(artistShare)}</strong><small>sur un total de {formatCurrency(finalAmount)} · affichée avant toute confirmation</small></aside> : null}
          {mode === "sell" && hasInput ? <aside className="tremplin-token-flow__artist-share"><span>Après cette revente</span><strong>{formatTokenQuantity(retainedQuantity)} {token.symbol} conservés</strong><small>Montant initial correspondant : {formatCurrency(initialSellAmount)} · montant net estimé : {formatCurrency(finalAmount)}</small><small>Jetons acquis le {acquisitionDate} · exécution et délai confirmés ensuite</small></aside> : null}
        </section>

        {hasInput ? <QuoteSummary quote={quote} symbol={token.symbol} expired={quoteExpired} /> : <section className="tremplin-token-flow__quote is-empty" aria-label="Estimation en attente"><Gauge aria-hidden="true" /><h4>Ton estimation apparaîtra ici.</h4><p>{mode === "buy" ? "Saisis un montant pour voir la quantité, les frais et la part destinée à l’artiste." : "Choisis une quantité pour voir le montant net, les frais et les conditions de revente."}</p></section>}
      </div>
    </div>
  );

  const renderSummaryStep = () => (
    <div className="tremplin-token-flow__screen">
      <div className="tremplin-token-flow__intro">
        <span className="tremplin-token-flow__eyebrow"><Gauge aria-hidden="true" /> Récapitulatif</span>
        <h3 ref={stepHeadingRef} tabIndex={-1}>Vérifie les informations essentielles.</h3>
        <p>Les montants sont estimés et seront recalculés au moment de la confirmation.</p>
      </div>
      <div className="tremplin-token-flow__two-column">
        <QuoteSummary quote={quote} symbol={token.symbol} detailed expired={quoteExpired} />
        <section className="tremplin-token-flow__risk-panel" aria-label="Informations essentielles avant confirmation">
          <span className="tremplin-token-flow__eyebrow"><Scale aria-hidden="true" /> {mode === "buy" ? "Ce que l’achat signifie" : "Ce que la revente signifie"}</span>
          <div className="tremplin-token-flow__rows">
            {isPurchase ? <div className="tremplin-token-flow__row is-total"><span>Part reçue directement par {artist.name}</span><strong>{formatCurrency(quote.artistAmountEur)}</strong></div> : null}
            <div className="tremplin-token-flow__row"><span>Frais totaux</span><strong>{formatCurrency(quote.totalFeesEur)}</strong></div>
            <div className="tremplin-token-flow__row"><span>Part du nombre total de jetons après</span><strong>{formatPercent(quote.ownershipShareAfterPercent)}</strong></div>
            <div className="tremplin-token-flow__row"><span>Condition de revente</span><strong>{isPurchase ? `À partir du ${purchaseResaleDate}` : "Délai confirmé avant exécution"}</strong></div>
          </div>
          <details className="tremplin-token-flow__mechanism-details"><summary>Détails du mécanisme de calcul de la valeur</summary><div className="tremplin-token-flow__rows"><div className="tremplin-token-flow__row"><span>Prix actuel estimé</span><strong>{formatCurrency(quote.priceBeforeEur)}</strong></div><div className="tremplin-token-flow__row"><span>Prix estimé après l’opération</span><strong>{formatCurrency(quote.priceAfterEur)}</strong></div><div className="tremplin-token-flow__row"><span>Variation estimée du prix unitaire après l’opération</span><strong>{formatPercent(quote.priceImpactPercent)}</strong></div></div><p>{TREMPLIN_TRANSACTION_COPY.mechanism} : cette estimation neutre varie selon l’ensemble des achats et des reventes et sera recalculée avant confirmation.</p></details>
          {quoteExpired ? <button type="button" className="tremplin-token-flow__button" onClick={refreshQuote}><RefreshCcw aria-hidden="true" /> Recalculer l’estimation</button> : null}
        </section>
      </div>
    </div>
  );

  const renderReviewStep = () => (
    <div className="tremplin-token-flow__screen">
      <div className="tremplin-token-flow__intro">
        <span className="tremplin-token-flow__eyebrow"><ShieldCheck aria-hidden="true" /> Règles et risques</span>
        <h3 ref={stepHeadingRef} tabIndex={-1}>Lis les règles avant de confirmer.</h3>
        <p>La valeur peut baisser, la revente peut ne pas être immédiate et aucun gain n’est garanti.</p>
      </div>

      <div className="tremplin-token-flow__two-column">
        <QuoteSummary quote={quote} symbol={token.symbol} detailed expired={quoteExpired} />

        <section className="tremplin-token-flow__risk-panel" aria-label="Protections et risques">
          <div className={`tremplin-token-flow__kyc${kycVerified ? "" : " is-blocked"}`}>
            {kycVerified ? <UserCheck aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}
            <span>
              <strong>{kycVerified ? "Identité de démonstration prête pour la simulation." : "Vérification d’identité requise."}</strong><br />
              En production, MeeWav devra contrôler ce statut et la limite de 5 % avant chaque opération.
            </span>
          </div>

          <h4>Ce que tu dois savoir</h4>
          <div className="tremplin-token-flow__risk-list">
            <div className="tremplin-token-flow__risk-item"><RefreshCcw aria-hidden="true" /><div><strong>Valeur variable</strong><span>Elle dépend de l’ensemble des achats et des reventes.</span></div></div>
            <div className="tremplin-token-flow__risk-item"><AlertTriangle aria-hidden="true" /><div><strong>Risque de perte</strong><span>Tu peux récupérer moins que ton montant initial.</span></div></div>
            <div className="tremplin-token-flow__risk-item"><Scale aria-hidden="true" /><div><strong>Limite de 5 %</strong><span>Elle porte sur le nombre total de jetons de cet artiste et sera contrôlée à la confirmation.</span></div></div>
            <div className="tremplin-token-flow__risk-item"><LockKeyhole aria-hidden="true" /><div><strong>Revente encadrée</strong><span>Une durée minimale et des fenêtres de revente limitent les comportements impulsifs.</span></div></div>
            <div className="tremplin-token-flow__risk-item"><LockKeyhole aria-hidden="true" /><div><strong>Estimation temporaire</strong><span>Les valeurs sont recalculées lors de la confirmation.</span></div></div>
          </div>

          <label className="tremplin-token-flow__consent">
            <input type="checkbox" checked={riskAccepted} onChange={(event) => { setRiskAccepted(event.target.checked); if (event.target.checked) trackTremplinEvent("risk_acknowledged", { artistId: artist.id, operation: mode }); }} />
            <span>Je comprends que je peux perdre tout ou partie du montant utilisé, que la revente peut ne pas être immédiate et qu’aucun gain ne m’est garanti.</span>
          </label>

          {errorMessage && <p className="tremplin-token-flow__error" role="alert">{errorMessage}</p>}
        </section>
      </div>
    </div>
  );

  const renderConfirmationStep = () => (
    <div className="tremplin-token-flow__screen">
      <section className="tremplin-token-flow__confirmation" role="status" aria-live="polite">
        <div className="tremplin-token-flow__confirmation-icon"><CheckCircle2 aria-hidden="true" /></div>
        <span className="tremplin-token-flow__eyebrow"><Sparkles aria-hidden="true" /> Simulation terminée</span>
        <h3 ref={stepHeadingRef} tabIndex={-1}>{mode === "buy" ? `La simulation d’achat pour ${artist.name} est terminée.` : "Ta simulation de revente est terminée."}</h3>
        <p>
          Aucune transaction réelle n’a été effectuée. En production, le serveur devra recalculer le prix,
          les frais, la part artiste, ton identité et la limite de détention avant toute confirmation.
        </p>
        <div className="tremplin-token-flow__confirmation-summary">
          <div><span>{mode === "buy" ? "Total utilisé" : "Montant net estimé"}</span><strong>{formatCurrency(finalAmount)}</strong></div>
          <div><span>Quantité estimée</span><strong>{formatTokenQuantity(finalQuantity)} {token.symbol}</strong></div>
          <div><span>Valeur après</span><strong>{formatCurrency(quote.priceAfterEur)}</strong></div>
          <div><span>Référence de simulation</span><strong>{operationReference}</strong></div>
        </div>
      </section>
    </div>
  );

  return (
    <div className="tremplin-token-flow-page">
      <section
        ref={dialogRef}
        className="tremplin-token-flow"
        role="region"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        style={{
          "--token-accent": artist.accent.primary,
          "--token-accent-2": artist.accent.secondary,
        } as CSSProperties}
      >
        <TremplinDemoBanner compact />
        <header className="tremplin-token-flow__header">
          <div className="tremplin-token-flow__identity">
            <div className="tremplin-token-flow__portrait">
              <img src={artist.portrait} alt="" />
              <span className="tremplin-token-flow__symbol">{token.symbol}</span>
            </div>
            <div className="tremplin-token-flow__identity-copy">
              <span className="tremplin-token-flow__eyebrow"><BadgeCheck aria-hidden="true" /> Identité de démonstration</span>
              <h2 id={titleId}>{mode === "buy" ? `Simuler un achat · ${token.symbol}` : `Simuler une revente · ${token.symbol}`}</h2>
              <p id={descriptionId}>{artist.name} · détention limitée à 5 % du nombre total de jetons</p>
            </div>
          </div>
          <button ref={closeButtonRef} className="tremplin-token-flow__close" type="button" aria-label={backLabel} title={backLabel} onClick={requestClose}><ArrowLeft aria-hidden="true" /><span>Retour</span></button>
        </header>

        <div className="tremplin-token-flow__steps" aria-label={`Étape ${step} sur 4`}>
          {STEP_LABELS.map((label, index) => {
            const number = index + 1;
            const complete = number < step;
            return (
              <div key={label} className={`tremplin-token-flow__step${number === step ? " is-active" : ""}${complete ? " is-complete" : ""}`} aria-current={number === step ? "step" : undefined}>
                <span className="tremplin-token-flow__step-index">{complete ? <Check aria-hidden="true" size={14} /> : number}</span>
                <span className="tremplin-token-flow__step-label">{label}</span>
              </div>
            );
          })}
        </div>
        <p className="tremplin-token-flow__mobile-step" aria-hidden="true">Étape {step} sur 4 · {STEP_LABELS[step - 1]}</p>

        <div className="tremplin-token-flow__body">
          {step === 1 && renderAmountStep()}
          {step === 2 && renderSummaryStep()}
          {step === 3 && renderReviewStep()}
          {step === 4 && renderConfirmationStep()}
        </div>

        <footer className="tremplin-token-flow__footer">
          <div className="tremplin-token-flow__footer-note">
            <ShieldCheck aria-hidden="true" />
            <span>Démo : identité, frais et limite seront contrôlés par le serveur en production.</span>
          </div>
          <div className="tremplin-token-flow__footer-actions">
            {step > 1 && step < 4 && (
              <button type="button" className="tremplin-token-flow__button" onClick={() => { setStep((current) => (current - 1) as FlowStep); setErrorMessage(""); }}>
                <ArrowLeft aria-hidden="true" /> Retour
              </button>
            )}
            {step < 3 && (
              <button type="button" className="tremplin-token-flow__button is-primary" disabled={!canProceed} onClick={advance}>
                {step === 1 ? "Voir le récapitulatif" : "Voir les règles et risques"} <ArrowRight aria-hidden="true" />
              </button>
            )}
            {step === 3 && (
              <button type="button" className="tremplin-token-flow__button is-primary" aria-label={mode === "buy" ? `Simuler l’achat de ${formatTokenQuantity(finalQuantity)} ${token.symbol} pour ${formatCurrency(finalAmount)}` : `Simuler la revente de ${formatTokenQuantity(finalQuantity)} ${token.symbol}`} disabled={!canProceed || !riskAccepted || !kycVerified || isConfirming} onClick={confirmOperation}>
                {isConfirming ? "Préparation…" : <><span className="tremplin-token-flow__confirm-label is-full">{mode === "buy" ? `Simuler l’achat de ${formatTokenQuantity(finalQuantity)} ${token.symbol} pour ${formatCurrency(finalAmount)}` : `Simuler la revente de ${formatTokenQuantity(finalQuantity)} ${token.symbol}`}</span><span className="tremplin-token-flow__confirm-label is-compact">{mode === "buy" ? `Simuler · ${formatTokenQuantity(finalQuantity)} ${token.symbol} · ${formatCurrency(finalAmount)}` : `Simuler · ${formatTokenQuantity(finalQuantity)} ${token.symbol}`}</span></>} <Check aria-hidden="true" />
              </button>
            )}
            {step === 4 && (
              <button type="button" className="tremplin-token-flow__button is-primary" onClick={onClose}>Fermer <Check aria-hidden="true" /></button>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
}

export default TremplinTokenFlow;
