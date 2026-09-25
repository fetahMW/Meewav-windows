import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { demoProfile } from "../profile.data";
import type { ProfilePrivateDashboard } from "../profile.private.service";
import ProfilePrivateModuleView from "./ProfilePrivateModuleView";

afterEach(cleanup);

const emptyDashboard: ProfilePrivateDashboard = {
  ownerUserId: "00000000-0000-4000-8000-000000000001",
  transactions: [],
  contracts: [],
  hardware: [],
  organizationInvitations: [],
  security: {
    email: "owner@example.test",
    emailConfirmed: true,
    lastSignInAt: "2026-07-16T10:00:00.000Z",
    accountCreatedAt: "2026-06-01T10:00:00.000Z",
    mfaVerifiedFactors: 1,
    mfaAvailable: true,
  },
  wallet: { activityNet: 0, incomeTotal: 0, expenseTotal: 0, currency: "EUR", latestActivityAt: null },
  loadedAt: "2026-07-16T10:00:00.000Z",
};

const callbacks = {
  onToggleProfileVisibility: vi.fn(),
  onEditProfile: vi.fn(),
  onViewerPreview: vi.fn(),
  onBack: vi.fn(),
  onOpenQuickAction: vi.fn(),
  onToast: vi.fn(),
};

const visibility = { bio: true, role: true, grade: true, collab: true, viewer: false };

describe("ProfilePrivateModuleView data states", () => {
  it("keeps the existing module shell while announcing a secure loading state", () => {
    render(<ProfilePrivateModuleView
      {...callbacks}
      moduleId="transactions"
      profile={demoProfile}
      profileVisibility={visibility}
      dashboard={null}
      dataStatus="loading"
      dataError={null}
      allowDemoActions={false}
      onRetry={vi.fn()}
      presentation="embedded"
    />);

    expect(screen.getByRole("heading", { name: "Transactions" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Synchronisation de l’espace privé");
  });

  it("renders retry and a truthful empty state without demo rows", () => {
    const onRetry = vi.fn();
    const { rerender } = render(<ProfilePrivateModuleView
      {...callbacks}
      moduleId="contracts"
      profile={demoProfile}
      profileVisibility={visibility}
      dashboard={null}
      dataStatus="error"
      dataError="Service temporairement indisponible"
      allowDemoActions={false}
      onRetry={onRetry}
      presentation="embedded"
    />);

    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(onRetry).toHaveBeenCalledOnce();

    rerender(<ProfilePrivateModuleView
      {...callbacks}
      moduleId="contracts"
      profile={demoProfile}
      profileVisibility={visibility}
      dashboard={emptyDashboard}
      dataStatus="ready"
      dataError={null}
      allowDemoActions={false}
      onRetry={onRetry}
      presentation="embedded"
    />);

    expect(screen.getByText("Aucun contrat")).toBeInTheDocument();
    expect(screen.queryByText("Aurora Tapes")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nouveau modèle" })).toBeDisabled();
  });
});
