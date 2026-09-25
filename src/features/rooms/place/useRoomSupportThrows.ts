import { useEffect, useRef, useState } from "react";
import { createPlaceClientId } from "./placeClientId";
import { SUPPORT_THROW_COUNTS, type RoomSupportWallet } from "./roomSupport";

export type PreparedSupport = { id: string; context: string; amounts: number[]; sent: number };
export type LiveSupportAction = { remaining: number; nextCents: number | null; pending: boolean; burst: { id: string; cents: number } | null };

export function useRoomSupportThrows({ wallet, recipientId, context, canEngage, onSent, onError }: {
  wallet: RoomSupportWallet; recipientId: string; context: string; canEngage: boolean;
  onSent?: (cents: number, operationId: string) => void; onError: (message: string) => void;
}) {
  const [series, setSeries] = useState<PreparedSupport | null>(null);
  const [pending, setPending] = useState(false);
  const [burst, setBurst] = useState<{ id: string; cents: number; context: string } | null>(null);
  const currentSeries = useRef<PreparedSupport | null>(null);
  const currentContext = useRef(context);
  currentContext.current = context;
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { currentSeries.current = null; setSeries(null); setBurst(null); }, [context]);
  useEffect(() => {
    if (!burst) return;
    const timer = window.setTimeout(() => setBurst(null), 1_200);
    return () => window.clearTimeout(timer);
  }, [burst]);
  const prepared = series?.context === context ? series : null;
  const remaining = prepared ? prepared.amounts.length - prepared.sent : 0;

  const prepare = (amounts: number[]) => {
    const total = amounts.reduce((sum, amount) => sum + amount, 0);
    if (busy.current || !canEngage || wallet.mode !== "demo") throw new Error("La préparation n’est pas disponible pour le moment.");
    if (!SUPPORT_THROW_COUNTS.some((count) => count === amounts.length) || amounts.some((amount) => !Number.isSafeInteger(amount) || amount <= 0) || !Number.isSafeInteger(total)) throw new Error("Montants invalides.");
    if (total > (wallet.getBalance() ?? 0)) throw new Error("Ajoute des fonds pour préparer ces lancers.");
    const next = { id: createPlaceClientId(), context, amounts: [...amounts], sent: 0 };
    currentSeries.current = next;
    setSeries(next);
    setBurst(null);
  };
  const cancel = () => {
    if (busy.current) return;
    currentSeries.current = null;
    setSeries(null);
    setBurst(null);
  };
  const launch = async () => {
    const active = currentSeries.current;
    if (busy.current || !active || active.context !== context || !canEngage || wallet.mode !== "demo") return;
    const cents = active.amounts[active.sent];
    if (!cents) return;
    busy.current = true; setPending(true);
    const operationId = `${active.id}:${active.sent}`;
    try {
      await wallet.send(cents, recipientId, operationId);
      if (mounted.current && currentContext.current === context) {
        const next = { ...active, sent: active.sent + 1 };
        currentSeries.current = next;
        setSeries(next);
        setBurst({ id: operationId, cents, context });
        onSent?.(cents, operationId);
      }
    } catch (cause) {
      if (mounted.current && currentContext.current === context) onError(cause instanceof Error ? cause.message : "Le lancer n’a pas pu être confirmé.");
    } finally { busy.current = false; if (mounted.current) setPending(false); }
  };
  const action: LiveSupportAction = { remaining, nextCents: prepared?.amounts[prepared.sent] ?? null, pending, burst: burst?.context === context ? burst : null };
  return { prepared: remaining > 0 ? prepared : null, action, prepare, cancel, launch };
}
