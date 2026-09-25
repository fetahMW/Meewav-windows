import { getDesktopApplicationMode } from "../../runtime/applicationMode";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";
import { isProfileLocalPreviewEnabled } from "./profile.preview";

type JsonRecord = Record<string, unknown>;

export type ProfileTransactionRecord = {
  id: string;
  user_id: string;
  title: string;
  category: string;
  amount: number | string;
  currency: string;
  occurred_at: string;
  image_url: string | null;
  is_token_trade: boolean;
  token_label: string | null;
  metadata: unknown;
  created_at: string;
};

export type ProfileContractRecord = {
  id: string;
  user_id: string;
  title: string;
  contract_type: string;
  status: string;
  amount_label: string | null;
  parties: string | null;
  source: string | null;
  details: string | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

export type ProfileHardwareRecord = {
  id: string;
  user_id: string;
  name: string;
  device_type: string;
  status: string;
  latency_label: string | null;
  accent_hex: string | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

export type ProfileOrganizationInvitationRecord = {
  id: string;
  user_id: string;
  recipient_name: string;
  handle: string;
  space_name: string;
  role: string;
  status: string;
  permissions: unknown;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

export type ProfileSecuritySnapshot = {
  email: string | null;
  emailConfirmed: boolean;
  lastSignInAt: string | null;
  accountCreatedAt: string | null;
  mfaVerifiedFactors: number;
  mfaAvailable: boolean;
};

export type ProfileWalletSummary = {
  /**
   * Net value of the legacy profile activity rows. It is deliberately not
   * presented as a withdrawable balance: only a payment ledger can own that.
   */
  activityNet: number;
  incomeTotal: number;
  expenseTotal: number;
  currency: string;
  latestActivityAt: string | null;
};

export type ProfilePrivateDashboard = {
  ownerUserId: string;
  transactions: ProfileTransactionRecord[];
  contracts: ProfileContractRecord[];
  hardware: ProfileHardwareRecord[];
  organizationInvitations: ProfileOrganizationInvitationRecord[];
  security: ProfileSecuritySnapshot;
  wallet: ProfileWalletSummary;
  loadedAt: string;
};

export type ProfilePrivateServiceErrorCode =
  | "not-authenticated"
  | "owner-mismatch"
  | "private-data-load-failed";

export class ProfilePrivateServiceError extends Error {
  readonly code: ProfilePrivateServiceErrorCode;

  constructor(code: ProfilePrivateServiceErrorCode, message: string) {
    super(message);
    this.name = "ProfilePrivateServiceError";
    this.code = code;
  }
}

const TRANSACTION_SELECT = "id,user_id,title,category,amount,currency,occurred_at,image_url,is_token_trade,token_label,metadata,created_at";
const CONTRACT_SELECT = "id,user_id,title,contract_type,status,amount_label,parties,source,details,metadata,created_at,updated_at";
const HARDWARE_SELECT = "id,user_id,name,device_type,status,latency_label,accent_hex,metadata,created_at,updated_at";
const INVITATION_SELECT = "id,user_id,recipient_name,handle,space_name,role,status,permissions,metadata,created_at,updated_at";

function asFiniteAmount(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

export function createWalletSummary(rows: ProfileTransactionRecord[]): ProfileWalletSummary {
  const signedAmounts = rows.map((row) => {
    const amount = asFiniteAmount(row.amount);
    const metadata = asRecord(row.metadata);
    const direction = typeof metadata.direction === "string" ? metadata.direction.toLowerCase() : "";
    const category = row.category.toLowerCase();
    const isExpense = amount < 0
      || direction === "debit"
      || direction === "expense"
      || /expense|dépense|debit|débit|retrait|withdraw/.test(category);
    return isExpense ? -Math.abs(amount) : Math.abs(amount);
  });
  const incomeTotal = signedAmounts.filter((amount) => amount > 0).reduce((sum, amount) => sum + amount, 0);
  const expenseTotal = Math.abs(signedAmounts.filter((amount) => amount < 0).reduce((sum, amount) => sum + amount, 0));
  const currency = rows.find((row) => row.currency)?.currency || "EUR";

  return {
    activityNet: incomeTotal - expenseTotal,
    incomeTotal,
    expenseTotal,
    currency,
    latestActivityAt: rows[0]?.occurred_at ?? null,
  };
}

function mapSecuritySnapshot(user: User, mfaData: unknown): ProfileSecuritySnapshot {
  const factors = asRecord(mfaData);
  const allFactors = Array.isArray(factors.all) ? factors.all : [];
  const verifiedFactors = allFactors.filter((factor) => {
    const record = asRecord(factor);
    return record.status === "verified";
  });

  return {
    email: user.email ?? null,
    emailConfirmed: Boolean(user.email_confirmed_at),
    lastSignInAt: user.last_sign_in_at ?? null,
    accountCreatedAt: user.created_at ?? null,
    mfaVerifiedFactors: verifiedFactors.length,
    mfaAvailable: true,
  };
}

function loadFailure() {
  return new ProfilePrivateServiceError(
    "private-data-load-failed",
    "Les données privées n’ont pas pu être chargées. Réessaie dans un instant.",
  );
}

export function createProfilePrivateRepository(client: SupabaseClient = supabase) {
  return {
    async getOwnerDashboard(expectedOwnerUserId?: string): Promise<ProfilePrivateDashboard> {
      const { data: authData, error: authError } = await client.auth.getUser();
      const user = authData.user;
      if (authError || !user) {
        throw new ProfilePrivateServiceError("not-authenticated", "Ta session a expiré. Reconnecte-toi pour ouvrir cet espace privé.");
      }
      if (expectedOwnerUserId && expectedOwnerUserId !== user.id) {
        throw new ProfilePrivateServiceError("owner-mismatch", "Cette session ne peut pas lire l’espace privé demandé.");
      }

      const ownerUserId = user.id;
      const [transactionsResult, contractsResult, hardwareResult, invitationsResult, mfaResult] = await Promise.all([
        client.from("profile_transactions").select(TRANSACTION_SELECT).eq("user_id", ownerUserId).order("occurred_at", { ascending: false }),
        client.from("profile_contracts").select(CONTRACT_SELECT).eq("user_id", ownerUserId).order("updated_at", { ascending: false }),
        client.from("profile_hardware_devices").select(HARDWARE_SELECT).eq("user_id", ownerUserId).order("updated_at", { ascending: false }),
        client.from("profile_organization_invitations").select(INVITATION_SELECT).eq("user_id", ownerUserId).order("updated_at", { ascending: false }),
        client.auth.mfa.listFactors(),
      ]);

      if (transactionsResult.error || contractsResult.error || hardwareResult.error || invitationsResult.error) {
        throw loadFailure();
      }

      const transactions = (transactionsResult.data ?? []) as unknown as ProfileTransactionRecord[];
      const mfaData = mfaResult.error ? null : mfaResult.data;
      const security = mfaData
        ? mapSecuritySnapshot(user, mfaData)
        : { ...mapSecuritySnapshot(user, {}), mfaAvailable: false };

      return {
        ownerUserId,
        transactions,
        contracts: (contractsResult.data ?? []) as unknown as ProfileContractRecord[],
        hardware: (hardwareResult.data ?? []) as unknown as ProfileHardwareRecord[],
        organizationInvitations: (invitationsResult.data ?? []) as unknown as ProfileOrganizationInvitationRecord[],
        security,
        wallet: createWalletSummary(transactions),
        loadedAt: new Date().toISOString(),
      };
    },
  };
}

export const profilePrivateRepository = createProfilePrivateRepository();

export function isProfilePrivateDemoEnabled() {
  const mode = getDesktopApplicationMode();
  if (mode) return mode === "demo";
  return isProfileLocalPreviewEnabled()
    || (import.meta.env.DEV && import.meta.env.VITE_PROFILE_PRIVATE_DEMO === "true");
}
