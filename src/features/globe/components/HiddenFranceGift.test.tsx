import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Map as MapLibreMap } from "maplibre-gl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  getState: vi.fn(),
  mountLayer: vi.fn(),
}));

vi.mock("../api/globeTreasure.api", () => ({
  claimGlobeTreasure: mocks.claim,
  getGlobeTreasureState: mocks.getState,
}));

vi.mock("../maplibre/hiddenFranceGiftLayer", () => ({
  mountHiddenFranceGiftLayer: mocks.mountLayer,
}));

import HiddenFranceGift, {
  isHiddenFranceGiftSearchCommand,
  shouldEnableLocalGiftDevelopmentPreview,
} from "./HiddenFranceGift";

const map = {} as MapLibreMap;

function createController() {
  return {
    setVisible: vi.fn(),
    setInteractive: vi.fn(),
    pulse: vi.fn().mockResolvedValue(undefined),
    celebrate: vi.fn().mockResolvedValue(undefined),
    dismiss: vi.fn().mockResolvedValue(undefined),
    resetPulse: vi.fn(),
    hideImmediately: vi.fn(),
    focusFromSecretSearch: vi.fn(),
    focusForPreview: vi.fn(),
    getState: vi.fn().mockReturnValue({
      phase: "idle",
      visible: false,
      interactive: false,
      loaded: true,
      rendered: true,
    }),
    remove: vi.fn(),
  };
}

beforeEach(() => {
  window.history.replaceState({}, "", "/globe");
  window.sessionStorage.clear();
  window.requestAnimationFrame = (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  };
  window.cancelAnimationFrame = vi.fn();
  mocks.getState.mockResolvedValue({
    ok: true,
    state: "available",
    available: true,
    claimed: false,
    claimedByMe: false,
    claimStatus: null,
    endsAt: null,
    serverTime: null,
  });
  mocks.mountLayer.mockReturnValue(createController());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function activateMountedGift() {
  const options = mocks.mountLayer.mock.calls[0]?.[1] as { onActivate: () => void };
  act(() => options.onActivate());
}

describe("HiddenFranceGift", () => {
  it("reconnaît le nom mémorisable du cadeau et son ancien code secret", () => {
    expect(isHiddenFranceGiftSearchCommand("SHTATA")).toBe(true);
    expect(isHiddenFranceGiftSearchCommand("  shtata  ")).toBe(true);
    expect(isHiddenFranceGiftSearchCommand("SHTATA007")).toBe(true);
    expect(isHiddenFranceGiftSearchCommand("  shtata007  ")).toBe(true);
    expect(isHiddenFranceGiftSearchCommand("SHTATA008")).toBe(false);
  });

  it("garde le cadeau visible dans le Globe local sans affaiblir la production", () => {
    expect(shouldEnableLocalGiftDevelopmentPreview({
      dev: true,
      mode: "development",
      hostname: "127.0.0.1",
      forceLive: false,
    })).toBe(true);
    expect(shouldEnableLocalGiftDevelopmentPreview({
      dev: true,
      mode: "development",
      hostname: "127.0.0.1",
      forceLive: true,
    })).toBe(false);
    expect(shouldEnableLocalGiftDevelopmentPreview({
      dev: false,
      mode: "production",
      hostname: "meewav.com",
      forceLive: false,
    })).toBe(false);
  });

  it("transmet la commande secrète au contrôleur du cadeau", async () => {
    const controller = createController();
    mocks.mountLayer.mockReturnValue(controller);

    render(<HiddenFranceGift map={map} ownerProfileId={null} />);
    await waitFor(() => expect(mocks.mountLayer).toHaveBeenCalledTimes(1));

    act(() => window.dispatchEvent(new Event("meewav:hidden-france-gift:secret-focus")));

    expect(controller.focusFromSecretSearch).toHaveBeenCalledTimes(1);
  });

  it("restaure uniquement le cadeau d'aperçu avant le fly secret", async () => {
    window.history.replaceState({}, "", "/globe?hidden-gift-preview=1");
    window.sessionStorage.setItem("meewav:hidden-france-gift:preview-dismissed:v1", "true");
    const controller = createController();
    mocks.mountLayer.mockReturnValue(controller);

    render(<HiddenFranceGift map={map} ownerProfileId={null} />);
    await waitFor(() => expect(controller.setVisible).toHaveBeenCalledWith(false));

    act(() => window.dispatchEvent(new Event("meewav:hidden-france-gift:secret-focus")));

    expect(window.sessionStorage.getItem("meewav:hidden-france-gift:preview-dismissed:v1")).toBeNull();
    expect(controller.setVisible).toHaveBeenLastCalledWith(true);
    expect(controller.setInteractive).toHaveBeenLastCalledWith(true);
    expect(controller.focusFromSecretSearch).toHaveBeenCalledTimes(1);
  });

  it("ouvre un aperçu local honnête depuis le query flag sans appeler Supabase", async () => {
    window.history.replaceState({}, "", "/globe?hidden-gift-preview=1");
    const controller = createController();
    mocks.mountLayer.mockReturnValue(controller);
    const user = userEvent.setup();

    render(<HiddenFranceGift map={map} ownerProfileId={null} focusReady />);

    await waitFor(() => expect(controller.setVisible).toHaveBeenCalledWith(true));
    expect(controller.focusForPreview).toHaveBeenCalledTimes(1);
    expect(mocks.getState).not.toHaveBeenCalled();

    activateMountedGift();

    expect(await screen.findByRole("dialog", { name: "Tu as trouvé le cadeau secret." })).toBeVisible();
    expect(screen.getByText(/aucune récompense réelle n’est réservée/i)).toBeVisible();
    expect(screen.getByText(/aucune attribution Supabase/i)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Terminer l’aperçu" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(controller.dismiss).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem("meewav:hidden-france-gift:preview-dismissed:v1")).toBe("true");
  });

  it("ne félicite le joueur réel qu’après la réponse atomique won_by_you", async () => {
    const controller = createController();
    mocks.mountLayer.mockReturnValue(controller);
    mocks.claim.mockResolvedValue({
      ok: true,
      outcome: "won_by_you",
      claimed: true,
      claimedByMe: true,
      claimStatus: "pending_review",
      idempotentReplay: false,
      claimedAt: "2026-07-19T12:00:00.000Z",
      rewardLabel: "Récompense secrète Meewav",
    });
    const user = userEvent.setup();

    render(<HiddenFranceGift map={map} ownerProfileId="166f48b4-1e89-4fc6-918f-9f93f27b93ac" />);
    await waitFor(() => expect(controller.setVisible).toHaveBeenCalledWith(true));

    activateMountedGift();

    expect(await screen.findByRole("dialog", { name: "Le signal t’a choisi." })).toBeVisible();
    expect(mocks.claim).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Récompense secrète Meewav")).toBeVisible();
    expect(controller.celebrate).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Valider ma découverte" }));

    await waitFor(() => expect(controller.dismiss).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("masque le modèle et n’annonce pas un gain si un autre joueur vient de réclamer le cadeau", async () => {
    const controller = createController();
    mocks.mountLayer.mockReturnValue(controller);
    mocks.claim.mockResolvedValue({
      ok: true,
      outcome: "already_claimed",
      claimed: true,
      claimedByMe: false,
      claimStatus: null,
      idempotentReplay: false,
      claimedAt: null,
      rewardLabel: null,
    });

    render(<HiddenFranceGift map={map} ownerProfileId="166f48b4-1e89-4fc6-918f-9f93f27b93ac" />);
    await waitFor(() => expect(controller.setVisible).toHaveBeenCalledWith(true));

    activateMountedGift();

    expect(await screen.findByRole("dialog", { name: "Le cadeau vient d’être trouvé." })).toBeVisible();
    expect(controller.hideImmediately).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Le signal t’a choisi.")).not.toBeInTheDocument();
  });
});
