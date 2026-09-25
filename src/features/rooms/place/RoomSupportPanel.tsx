import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, Check, Plus, WalletCards, X } from "lucide-react";
import { LiveMonetizationIcon } from "./LiveMonetizationIcon";
import { createPlaceClientId } from "./placeClientId";
import { formatSupportAmount as money, parseSupportAmount, splitSupportAmount, SUPPORT_THROW_COUNTS, type RoomSupportWallet, type SupportThrowCount } from "./roomSupport";
import "./room-support-panel.css";
import type { PreparedSupport } from "./useRoomSupportThrows";

type Props = {
  hostId: string;
  hostName: string;
  wallet: RoomSupportWallet;
  canEngage: boolean;
  onClose: () => void;
  prepared?: PreparedSupport | null;
  onPrepare: (amounts: number[]) => void;
  onCancelPrepared?: () => void;
};

export default function RoomSupportPanel({ hostName, wallet, canEngage, onClose, prepared, onPrepare, onCancelPrepared }: Props) {
  const balance = useSyncExternalStore(wallet.subscribe, wallet.getBalance, wallet.getBalance);
  const [view, setView] = useState<"support" | "funds">("support");
  const [amount, setAmount] = useState(() => prepared ? String(prepared.amounts.slice(prepared.sent).reduce((sum, value) => sum + value, 0) / 100) : "10");
  const [funds, setFunds] = useState("10");
  const [count, setCount] = useState<SupportThrowCount>(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const busy = useRef(false);
  const panel = useRef<HTMLElement>(null);
  const addFundsTrigger = useRef<HTMLButtonElement>(null);
  const backToSupport = useRef<HTMLButtonElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus();
    return () => { mounted.current = false; if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => { if (view === "funds") backToSupport.current?.focus(); }, [view]);
  const returnToSupport = () => { setView("support"); setError(""); requestAnimationFrame(() => addFundsTrigger.current?.focus()); };
  const total = parseSupportAmount(amount);
  const addedFunds = parseSupportAmount(funds);
  const draft = total !== null && total >= count ? splitSupportAmount(total, count) : [];
  const amounts = draft;
  const remaining = amounts.reduce((sum, value) => sum + value, 0);
  const insufficient = balance !== null && remaining > balance;
  const available = wallet.mode === "demo" && canEngage;
  const breakdown = [...new Set(amounts)].map((value) => `${amounts.filter((item) => item === value).length} × ${money(value)}`).join(" + ");
  const prepareThrows = () => {
    if (!available || !amounts.length || insufficient || pending) return;
    try {
      onPrepare(amounts);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Les lancers n’ont pas pu être préparés.");
    }
  };
  const addFunds = async () => {
    if (busy.current || !available || !addedFunds) return;
    busy.current = true; setPending(true); setError("");
    try {
      await wallet.addFunds(addedFunds, createPlaceClientId());
      if (!mounted.current) return;
      setFeedback(`${money(addedFunds)} ajoutés au solde de démonstration.`);
      returnToSupport();
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "Le rechargement n’a pas pu être confirmé."); }
    finally { busy.current = false; if (mounted.current) setPending(false); }
  };

  return <aside ref={panel} className="place-donation-drawer room-support-panel" role="dialog" aria-modal="false" aria-labelledby="place-donation-title" tabIndex={-1}
    onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); if (view === "funds") returnToSupport(); else onClose(); } }}>
    <header>
      <span className="room-support-panel__emblem"><LiveMonetizationIcon /></span>
      <span><small>LA BOURSE</small><strong id="place-donation-title">{view === "funds" ? "Ajouter des fonds" : `Soutenir ${hostName}`}</strong></span>
      <button type="button" className="room-support-panel__close" onClick={onClose} aria-label="Fermer la bourse"><X aria-hidden="true" /></button>
    </header>
    <div className="room-support-panel__wallet">
      <WalletCards aria-hidden="true" /><span><small>{wallet.mode === "demo" ? "Solde démo" : "Mon portefeuille"}</small><strong>{balance === null ? "Bientôt disponible" : money(balance)}</strong></span>
      {view === "support" && <button ref={addFundsTrigger} type="button" onClick={() => { setView("funds"); setError(""); }}><Plus aria-hidden="true" />Ajouter des fonds</button>}
    </div>
    {view === "funds" ? <>
      <button ref={backToSupport} type="button" className="room-support-panel__back" onClick={returnToSupport}><ArrowLeft aria-hidden="true" />Retour aux lancers</button>
      <div className="room-support-panel__choices" role="group" aria-label="Montant à ajouter">
        {[10, 20, 50].map((value) => <button type="button" key={value} aria-pressed={addedFunds === value * 100} onClick={() => setFunds(String(value))}>{value} €</button>)}
      </div>
      <label className="room-support-panel__amount">Montant à ajouter (€)<input inputMode="decimal" value={funds} onChange={(event) => setFunds(event.target.value)} placeholder="10,00" maxLength={10} /></label>
      <p className="room-support-panel__hint">Les fonds restent disponibles pour tes prochains soutiens.</p>
      <button className="room-support-panel__launch" type="button" disabled={!available || !addedFunds || pending} onClick={() => void addFunds()}><Plus aria-hidden="true" />{pending ? "Ajout en cours…" : `Ajouter ${money(addedFunds ?? 0)}${wallet.mode === "demo" ? " · démo" : ""}`}</button>
    </> : <>
      {prepared && <p className="room-support-panel__hint">{prepared.amounts.length - prepared.sent} lancer(s) encore prêts dans la barre d’actions de la scène. Tu peux les remplacer ou les annuler ici.</p>}
      <fieldset disabled={pending}>
        <legend>Ton budget total</legend>
        <div className="room-support-panel__choices" role="group" aria-label="Budget du soutien">
          {[2, 5, 10, 20].map((value) => <button type="button" key={value} aria-pressed={total === value * 100} onClick={() => setAmount(String(value))}>{value} €</button>)}
        </div>
        <label className="room-support-panel__amount">Montant libre (€)<input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="10,00" maxLength={10} /></label>
        <div className="room-support-panel__split-label">Répartir en</div>
        <div className="room-support-panel__choices" role="group" aria-label="Nombre de lancers">
          {SUPPORT_THROW_COUNTS.map((value) => <button type="button" key={value} aria-pressed={count === value} onClick={() => setCount(value)}>{value} {value === 1 ? "lancer" : "lancers"}</button>)}
        </div>
      </fieldset>
      <div className="room-support-panel__preview">
        <strong>{amounts.length ? breakdown : "Saisis un montant valide"}</strong>
        <small>{amounts.length ? `${money(remaining)} au total · aucun envoi à cette étape` : "Deux décimales maximum, un centime minimum par lancer."}</small>
      </div>
      {insufficient && <p className="room-support-panel__hint">Il manque {money(remaining - (balance ?? 0))} à ton solde. Ajoute des fonds pour continuer.</p>}
      <p className="room-support-panel__hint">Ensuite, clique sur la petite bourse au bas de la scène pour chaque lancer.</p>
      <button className="room-support-panel__launch" type="button" disabled={!available || !amounts.length || insufficient || pending} onClick={prepareThrows}>
        <Check aria-hidden="true" />{`Préparer ${count} ${count === 1 ? "lancer" : "lancers"}`}
      </button>
      {prepared && onCancelPrepared && <button type="button" className="room-support-panel__back" disabled={pending} onClick={() => { onCancelPrepared(); onClose(); }}>Annuler les lancers préparés · garder mon solde</button>}
    </>}
    <div className="room-support-panel__feedback" role="status" aria-live="polite" key={feedback}>{feedback}</div>
    {error && <p role="alert" className="room-support-panel__error">{error}</p>}
    <small className="room-support-panel__disclaimer">{wallet.mode === "demo" ? "Démonstration · fonds fictifs, aucun débit réel." : "Le paiement sécurisé n’est pas encore raccordé. Aucun débit possible."}{!canEngage && " Rejoins la room pour soutenir son créateur."}</small>
  </aside>;
}
