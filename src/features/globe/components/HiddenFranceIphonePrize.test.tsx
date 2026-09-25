import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Map as MapLibreMap } from "maplibre-gl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mountLayer: vi.fn(),
}));

vi.mock("../maplibre/hiddenFranceGiftLayer", () => ({
  mountHiddenFranceIphonePrizeLayer: mocks.mountLayer,
}));

import HiddenFranceIphonePrize, {
  isHiddenFranceIphoneSearchCommand,
  requestHiddenFranceIphoneSecretFocus,
} from "./HiddenFranceIphonePrize";

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
    getState: vi.fn(),
    remove: vi.fn(),
  };
}

beforeEach(() => {
  window.requestAnimationFrame = (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  };
  mocks.mountLayer.mockReturnValue(createController());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("HiddenFranceIphonePrize", () => {
  it("recognises only the exact shtata000 fly-to command", () => {
    expect(isHiddenFranceIphoneSearchCommand("shtata000")).toBe(true);
    expect(isHiddenFranceIphoneSearchCommand("  SHTATA000  ")).toBe(true);
    expect(isHiddenFranceIphoneSearchCommand("shtata00")).toBe(false);
    expect(isHiddenFranceIphoneSearchCommand("shtata007")).toBe(false);
  });

  it("restores the hidden model before flying to it from the secret command", async () => {
    const controller = createController();
    mocks.mountLayer.mockReturnValue(controller);
    render(<HiddenFranceIphonePrize map={map} />);
    await waitFor(() => expect(mocks.mountLayer).toHaveBeenCalledWith(
      map,
      expect.objectContaining({ initiallyVisible: true, initiallyInteractive: true }),
    ));

    act(() => requestHiddenFranceIphoneSecretFocus());

    expect(controller.setVisible).toHaveBeenCalledWith(true);
    expect(controller.setInteractive).toHaveBeenCalledWith(true);
    expect(controller.focusFromSecretSearch).toHaveBeenCalledTimes(1);
  });

  it("announces the iPhone 16 win and dismisses the 3D prize after validation", async () => {
    const user = userEvent.setup();
    const controller = createController();
    mocks.mountLayer.mockReturnValue(controller);
    render(<HiddenFranceIphonePrize map={map} />);
    await waitFor(() => expect(mocks.mountLayer).toHaveBeenCalledTimes(1));

    const options = mocks.mountLayer.mock.calls[0]?.[1] as { onActivate: () => void };
    act(() => options.onActivate());

    expect(await screen.findByRole("heading", {
      name: "Félicitations, vous venez de gagner l’iPhone 16.",
    })).toBeInTheDocument();
    expect(controller.celebrate).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Valider ma découverte" }));
    await waitFor(() => expect(controller.dismiss).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
