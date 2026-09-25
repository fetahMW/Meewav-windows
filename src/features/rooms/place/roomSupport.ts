export const SUPPORT_THROW_COUNTS = [1, 2, 3, 5] as const;
export type SupportThrowCount = (typeof SUPPORT_THROW_COUNTS)[number];

const euros = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
export const formatSupportAmount = (cents: number) => euros.format(cents / 100);

/** Parse decimal input directly into cents: no floating-point money arithmetic. */
export function parseSupportAmount(value: string): number | null {
  const match = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function splitSupportAmount(totalCents: number, count: SupportThrowCount): number[] {
  if (!Number.isSafeInteger(totalCents) || totalCents < count || !SUPPORT_THROW_COUNTS.includes(count)) {
    throw new Error("Le montant doit permettre au moins un centime par lancer.");
  }
  const base = Math.floor(totalCents / count);
  const extra = totalCents % count;
  return Array.from({ length: count }, (_, index) => base + (index < extra ? 1 : 0));
}

export interface RoomSupportWallet {
  mode: "demo" | "unavailable";
  getBalance: () => number | null;
  subscribe: (listener: () => void) => () => void;
  addFunds: (cents: number, operationId: string) => Promise<void>;
  send: (cents: number, recipientId: string, operationId: string) => Promise<void>;
}

/** Demo-only ledger. A live room must use a server/payment adapter, never this balance. */
export function createDemoSupportWallet(initialCents = 1_000): RoomSupportWallet {
  if (!Number.isSafeInteger(initialCents) || initialCents < 0) throw new Error("Solde invalide.");
  let balance = initialCents;
  const listeners = new Set<() => void>();
  const operations = new Map<string, string>();
  const apply = (delta: number, signature: string, operationId: string) => {
    if (!operationId || !Number.isSafeInteger(delta) || delta === 0) throw new Error("Montant invalide.");
    const previous = operations.get(operationId);
    if (previous !== undefined) {
      if (previous !== signature) throw new Error("Cette opération a déjà été utilisée.");
      return;
    }
    const next = balance + delta;
    if (next < 0) throw new Error("Ajoute des fonds pour continuer tes lancers.");
    if (!Number.isSafeInteger(next)) throw new Error("Montant invalide.");
    balance = next;
    operations.set(operationId, signature);
    listeners.forEach((listener) => listener());
  };
  return {
    mode: "demo",
    getBalance: () => balance,
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async addFunds(cents, operationId) {
      if (cents <= 0) throw new Error("Montant invalide.");
      apply(cents, `credit:${cents}`, operationId);
    },
    async send(cents, recipientId, operationId) {
      if (cents <= 0 || !recipientId) throw new Error("Soutien invalide.");
      apply(-cents, `send:${recipientId}:${cents}`, operationId);
    },
  };
}

const unavailableWallet: RoomSupportWallet = {
  mode: "unavailable",
  getBalance: () => null,
  subscribe: () => () => {},
  async addFunds() { throw new Error("Le paiement sécurisé n’est pas encore disponible."); },
  async send() { throw new Error("Le paiement sécurisé n’est pas encore disponible."); },
};
const demoWallets = new Map<string, RoomSupportWallet>();
export function getRoomSupportWallet(source: string, userId: string | null | undefined): RoomSupportWallet {
  if (source !== "demo" || !userId) return unavailableWallet;
  let wallet = demoWallets.get(userId);
  if (!wallet) { wallet = createDemoSupportWallet(); demoWallets.set(userId, wallet); }
  return wallet;
}
