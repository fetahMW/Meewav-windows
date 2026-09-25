import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createPlaceDemoState } from "./place.fixtures";
import PlaceGuestMediaControls from "./PlaceGuestMediaControls";

afterEach(() => { cleanup(); vi.useRealTimers(); });
function setup() {
  const room = createPlaceDemoState();
  const participant = room.participants.find((item) => item.id === "guest-a")!;
  const channel = room.channels.find((item) => item.participantId === participant.id || item.participantId === participant.profile.id)!;
  const props = { room, participant, isHost: true, onMute: vi.fn(), onCamera: vi.fn() };
  return { props, channel };
}

it("garde les libellés accessibles sans bulle ni title au focus", () => {
  const { props } = setup();
  render(<PlaceGuestMediaControls {...props} />);
  for (const button of screen.getAllByRole("button")) {
    expect(button).not.toHaveAttribute("title");
    fireEvent.focus(button);
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(button).toHaveAttribute("aria-label");
    expect(button).not.toHaveAttribute("aria-describedby");
    fireEvent.blur(button);
  }
});

it("ne montre aucune bulle même après un survol prolongé", () => {
  vi.useFakeTimers();
  const { props } = setup();
  render(<PlaceGuestMediaControls {...props} />);
  for (const button of screen.getAllByRole("button")) {
    fireEvent.mouseEnter(button);
    act(() => vi.advanceTimersByTime(500));
    fireEvent.mouseLeave(button);
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.mouseEnter(button);
    act(() => vi.advanceTimersByTime(999));
    expect(screen.queryByRole("tooltip")).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("tooltip")).toBeNull();
    act(() => vi.advanceTimersByTime(3_000));
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.mouseLeave(button);
    expect(screen.queryByRole("tooltip")).toBeNull();
  }
});

it("synchronise les états avec le room partagé et autorise sans forcer une réactivation locale", () => {
  const { props, channel } = setup();
  const { rerender } = render(<PlaceGuestMediaControls {...props} />);
  channel.isHostForcedMuted = true;
  channel.isMuted = true;
  props.participant.isCameraEnabled = false;
  props.participant.isHostForcedCameraOff = true;
  rerender(<PlaceGuestMediaControls {...props} />);
  const mic = screen.getByRole("button", { name: /Autoriser le micro/ });
  expect(mic).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(mic);
  expect(props.onMute).toHaveBeenCalledWith(channel.id);
  fireEvent.click(screen.getByRole("button", { name: /Autoriser la caméra/ }));
  expect(props.onCamera).toHaveBeenCalledWith(props.participant.profile.id, true);
});

it("ne rallume pas une caméra coupée par l’artiste", () => {
  const { props } = setup();
  props.participant.isCameraEnabled = false;
  props.participant.isHostForcedCameraOff = false;
  render(<PlaceGuestMediaControls {...props} />);
  const camera = screen.getByRole("button", { name: /déjà coupée/ });
  expect(camera).toBeDisabled();
  fireEvent.click(camera);
  expect(props.onCamera).not.toHaveBeenCalled();
});

it("désactive les commandes hors Host et le micro sans canal associé", () => {
  const { props } = setup();
  const { rerender } = render(<PlaceGuestMediaControls {...props} isHost={false} />);
  for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
  rerender(<PlaceGuestMediaControls {...props} room={{ ...props.room, channels: [] }} />);
  expect(screen.getByRole("button", { name: /micro à l’antenne/ })).toBeDisabled();
});
