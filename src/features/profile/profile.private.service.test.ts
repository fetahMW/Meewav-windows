import type { SupabaseClient, User } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  createProfilePrivateRepository,
  createWalletSummary,
  ProfilePrivateServiceError,
  type ProfileTransactionRecord,
} from "./profile.private.service";

const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_ID = "00000000-0000-4000-8000-000000000002";

const transaction: ProfileTransactionRecord = {
  id: "00000000-0000-4000-8000-000000000101",
  user_id: OWNER_ID,
  title: "Licence Nocturne",
  category: "Revenu",
  amount: "84.50",
  currency: "EUR",
  occurred_at: "2026-07-15T10:00:00.000Z",
  image_url: null,
  is_token_trade: false,
  token_label: null,
  metadata: { status: "completed", reference: "MW-101" },
  created_at: "2026-07-15T10:00:00.000Z",
};

function createQuery(data: unknown[] = [], error: unknown = null) {
  const order = vi.fn().mockResolvedValue({ data, error });
  const eq = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ eq });
  return { select, eq, order };
}

function createClient(options?: { transactionError?: unknown }) {
  const queries = {
    profile_transactions: createQuery([transaction], options?.transactionError ?? null),
    profile_contracts: createQuery([], null),
    profile_hardware_devices: createQuery([], null),
    profile_organization_invitations: createQuery([], null),
  };
  const from = vi.fn((table: keyof typeof queries) => queries[table]);
  const getUser = vi.fn().mockResolvedValue({
    data: {
      user: {
        id: OWNER_ID,
        email: "owner@example.test",
        email_confirmed_at: "2026-07-01T10:00:00.000Z",
        created_at: "2026-06-01T10:00:00.000Z",
        last_sign_in_at: "2026-07-16T10:00:00.000Z",
      } as User,
    },
    error: null,
  });
  const listFactors = vi.fn().mockResolvedValue({
    data: { all: [{ id: "factor-1", status: "verified", factor_type: "totp" }], totp: [], phone: [] },
    error: null,
  });
  const client = { from, auth: { getUser, mfa: { listFactors } } } as unknown as SupabaseClient;
  return { client, from, getUser, listFactors, queries };
}

describe("profile private repository", () => {
  it("loads every private table through an explicit owner filter", async () => {
    const mocks = createClient();
    const repository = createProfilePrivateRepository(mocks.client);

    const dashboard = await repository.getOwnerDashboard(OWNER_ID);

    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual([
      "profile_transactions",
      "profile_contracts",
      "profile_hardware_devices",
      "profile_organization_invitations",
    ]);
    for (const query of Object.values(mocks.queries)) {
      expect(query.eq).toHaveBeenCalledWith("user_id", OWNER_ID);
    }
    expect(dashboard.transactions).toHaveLength(1);
    expect(dashboard.wallet).toMatchObject({ activityNet: 84.5, incomeTotal: 84.5, expenseTotal: 0, currency: "EUR" });
    expect(dashboard.security).toMatchObject({ emailConfirmed: true, mfaVerifiedFactors: 1, mfaAvailable: true });
  });

  it("rejects an owner id that does not match the authenticated session before querying tables", async () => {
    const mocks = createClient();
    const repository = createProfilePrivateRepository(mocks.client);

    await expect(repository.getOwnerDashboard(OTHER_ID)).rejects.toMatchObject({ code: "owner-mismatch" });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("normalizes table failures to a private load error without leaking backend details", async () => {
    const mocks = createClient({ transactionError: { message: "sensitive postgres detail", code: "42501" } });
    const repository = createProfilePrivateRepository(mocks.client);

    await expect(repository.getOwnerDashboard()).rejects.toEqual(expect.objectContaining({
      code: "private-data-load-failed",
      message: "Les données privées n’ont pas pu être chargées. Réessaie dans un instant.",
    }));
  });
});

describe("private wallet summary", () => {
  it("derives activity totals without pretending they are a withdrawable ledger balance", () => {
    const summary = createWalletSummary([
      transaction,
      { ...transaction, id: "expense", category: "Retrait", amount: 20, metadata: {} },
      { ...transaction, id: "expense-direction", category: "Frais", amount: 4.5, metadata: { direction: "debit" } },
    ]);

    expect(summary).toMatchObject({ activityNet: 60, incomeTotal: 84.5, expenseTotal: 24.5 });
  });

  it("exposes a stable typed error for unauthenticated sessions", async () => {
    const client = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: "missing" } }),
      },
    } as unknown as SupabaseClient;

    await expect(createProfilePrivateRepository(client).getOwnerDashboard()).rejects.toBeInstanceOf(ProfilePrivateServiceError);
  });
});
