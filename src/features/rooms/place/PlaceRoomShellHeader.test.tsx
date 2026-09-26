import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CAGE_ROOM_PRESENTATION, LOGE_ROOM_PRESENTATION, RoomPresentationProvider } from "../roomPresentation";
import { createPlaceDemoState } from "./place.fixtures";
import PlaceRoomShellHeader from "./PlaceRoomShellHeader";
import { placeRoomTime } from "./placeRoomTime";

afterEach(() => {
  cleanup();
  placeRoomTime.setEnabled(false);
  placeRoomTime.configure(3, 0);
});

describe("PlaceRoomShellHeader", () => {
  it("places Cage switch room beside the call button and keeps the mixer timer out of the header", () => {
    placeRoomTime.setEnabled(true);
    const { container } = render(<RoomPresentationProvider presentation={CAGE_ROOM_PRESENTATION}><PlaceRoomShellHeader room={createPlaceDemoState()} isHost switchSlot={<button>Switch Room</button>} endConfirmationOpen={false} onEndConfirmationOpen={vi.fn()} onEndRoom={vi.fn()} /></RoomPresentationProvider>);
    expect(screen.getByRole("button", { name: "Switch Room" }).previousElementSibling).toHaveClass("place-live-call");
    expect(container.querySelector(".place-room-shellbar__broadcast-cluster")).toBeEmptyDOMElement();
    expect(screen.queryByLabelText(/Compte à rebours/)).toBeNull();
  });
  it("shows the complete live control line with one Terminer action", () => {
    const room = createPlaceDemoState();
    const onEndConfirmationOpen = vi.fn();

    render(
      <PlaceRoomShellHeader
        room={room}
        isHost
        endConfirmationOpen={false}
        onEndConfirmationOpen={onEndConfirmationOpen}
        onEndRoom={vi.fn()}
        onLeaveRoom={vi.fn()}
      />,
    );

    const toolbar = screen.getByRole("toolbar", { name: "Actions de la Room" });
    expect(within(toolbar).getAllByRole("button")).toHaveLength(1);
    fireEvent.click(within(toolbar).getByRole("button", { name: "Terminer" }));
    expect(onEndConfirmationOpen).toHaveBeenCalledWith(true);
    expect(screen.queryByText("Naya Oris")).not.toBeInTheDocument();
    expect(screen.queryByText("Open Studio — À contretemps")).not.toBeInTheDocument();
    expect(screen.getByLabelText("MEEWAV / La Place")).toBeVisible();
    expect(screen.getByTitle("Audience actuelle")).toHaveTextContent("1,8 k");
    const shellbar = screen.getByRole("banner", { name: "Bandeau de La Place" });
    expect(Array.from(shellbar.children).slice(0, 3).map((child) => child.className)).toEqual([
      "place-room-shellbar__identity",
      "place-room-shellbar__broadcast-cluster",
      "place-room-shellbar__host-side",
    ]);
    const countdownSlot = document.querySelector(".place-room-shellbar__broadcast-cluster");
    expect(countdownSlot).toHaveAttribute("data-countdown-active", "false");
    expect(countdownSlot).toBeEmptyDOMElement();
    expect(screen.getByLabelText(/En live depuis/)).toHaveClass("place-room-shellbar__live-since");
    expect(screen.getByText("EN DIRECT")).toBeVisible();
    expect(screen.getByTitle("Likes")).toHaveTextContent("12,8 k");
    expect(screen.getByTitle("Golden Likes")).toHaveTextContent("214");
    expect(screen.getByTitle("Soutien reçu")).toHaveTextContent("842");
    const counterChildren = Array.from(document.querySelectorAll(".place-room-shellbar__counters > *"));
    expect(counterChildren[0]).toHaveClass("place-live-call");
    expect(within(counterChildren[0] as HTMLElement).getByRole("button", { name: "Appeler des contacts dans le live" })).toBeVisible();
    expect(counterChildren[1]).toHaveAttribute("title", "Soutien reçu");
    expect(Array.from(document.querySelectorAll(".place-room-shellbar__counters > output")).map((counter) => counter.getAttribute("title"))).toEqual([
      "Soutien reçu",
      "Golden Likes",
      "Likes",
    ]);
    const moneyBag = screen.getByTitle("Soutien reçu").querySelector(".place-room-shellbar__money-bag");
    expect(moneyBag?.tagName).toBe("IMG");
    expect(moneyBag).toHaveAttribute("src", "/images/rooms/place/money-bag.svg");
    expect(document.querySelector(".place-donation-hat.is-tip-jar")).toBeNull();
  });

  it("offers the live host a compact production entry without replacing Terminer", () => {
    const openProduction = vi.fn();
    const room = createPlaceDemoState();
    const { rerender } = render(
      <PlaceRoomShellHeader
        room={room}
        isHost
        productionSlot={<button type="button" onClick={openProduction}>Régie</button>}
        endConfirmationOpen={false}
        onEndConfirmationOpen={vi.fn()}
        onEndRoom={vi.fn()}
      />,
    );

    const toolbar = screen.getByRole("toolbar", { name: "Actions de la Room" });
    expect(within(toolbar).getAllByRole("button")).toHaveLength(2);
    fireEvent.click(within(toolbar).getByRole("button", { name: "Régie" }));
    expect(openProduction).toHaveBeenCalledOnce();
    expect(within(toolbar).getByRole("button", { name: "Terminer" })).toBeVisible();

    rerender(
      <PlaceRoomShellHeader
        room={{ ...room, status: "ended" }}
        isHost
        productionSlot={<button type="button">Régie</button>}
        endConfirmationOpen={false}
        onEndConfirmationOpen={vi.fn()}
        onEndRoom={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Régie" })).not.toBeInTheDocument();
  });

  it("turns the same action area into Quitter once the Room has ended", () => {
    const room = { ...createPlaceDemoState(), status: "ended" as const };
    const onLeaveRoom = vi.fn();

    render(
      <PlaceRoomShellHeader
        room={room}
        isHost
        endConfirmationOpen
        onEndConfirmationOpen={vi.fn()}
        onEndRoom={vi.fn()}
        onLeaveRoom={onLeaveRoom}
      />,
    );

    const toolbar = screen.getByRole("toolbar", { name: "Actions de la Room" });
    expect(within(toolbar).getAllByRole("button")).toHaveLength(1);
    fireEvent.click(within(toolbar).getByRole("button", { name: "Quitter" }));
    expect(onLeaveRoom).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "Confirmer la fin du live" })).not.toBeInTheDocument();
    expect(screen.getByText("LIVE TERMINÉ")).toBeInTheDocument();
  });

  it("reserves the same countdown slot before and after activation without rendering TIME", () => {
    placeRoomTime.configure(3, 0);
    render(
      <PlaceRoomShellHeader
        room={createPlaceDemoState()}
        isHost
        endConfirmationOpen={false}
        onEndConfirmationOpen={vi.fn()}
        onEndRoom={vi.fn()}
      />,
    );

    const slotBefore = document.querySelector<HTMLElement>(".place-room-shellbar__broadcast-cluster");
    expect(slotBefore).toHaveAttribute("data-countdown-active", "false");
    expect(slotBefore).toBeEmptyDOMElement();
    expect(slotBefore?.parentElement).toBe(screen.getByRole("banner", { name: "Bandeau de La Place" }));

    act(() => placeRoomTime.setEnabled(true));

    const slotWhileActive = document.querySelector<HTMLElement>(".place-room-shellbar__broadcast-cluster");
    expect(slotWhileActive).toBe(slotBefore);
    expect(slotWhileActive).toHaveAttribute("data-countdown-active", "true");
    expect(screen.getByLabelText("Compte à rebours 03:00")).toBeVisible();
    expect(screen.queryByText("TIME")).not.toBeInTheDocument();

    act(() => placeRoomTime.setEnabled(false));

    const slotAfter = document.querySelector<HTMLElement>(".place-room-shellbar__broadcast-cluster");
    expect(slotAfter).toBe(slotBefore);
    expect(slotAfter).toHaveAttribute("data-countdown-active", "false");
    expect(slotAfter).toBeEmptyDOMElement();
  });

  it("uses the gold La Loge theme without changing the room controls", () => {
    render(
      <RoomPresentationProvider presentation={LOGE_ROOM_PRESENTATION}>
        <PlaceRoomShellHeader
          room={createPlaceDemoState()}
          isHost
          endConfirmationOpen={false}
          onEndConfirmationOpen={vi.fn()}
          onEndRoom={vi.fn()}
          onLeaveRoom={vi.fn()}
        />
      </RoomPresentationProvider>,
    );

    expect(screen.getByRole("banner", { name: "Bandeau de La Loge" })).toHaveAttribute("data-room-theme", "gold");
    expect(screen.getByLabelText("MEEWAV / La Loge")).toBeVisible();
    expect(document.querySelector(".meewav-pillar-brand__loge-copy")).toHaveTextContent("La Loge");
    expect(document.querySelector(".meewav-pillar-brand__loge-title-star")).not.toBeInTheDocument();
    expect(document.querySelector(".mw-grade-badge")).not.toBeInTheDocument();
    expect(screen.getByText("EN DIRECT")).toBeVisible();
    expect(screen.getByRole("toolbar", { name: "Actions de la Room" })).toBeVisible();
  });

  it("keeps the viewer top band minimal without host controls", () => {
    render(
      <PlaceRoomShellHeader
        room={createPlaceDemoState()}
        isHost={false}
        endConfirmationOpen={false}
        onEndConfirmationOpen={vi.fn()}
        onEndRoom={vi.fn()}
      />,
    );

    expect(screen.getByRole("banner", { name: "Bandeau de La Place" })).toHaveAttribute("data-room-role", "viewer");
    expect(screen.getByLabelText("MEEWAV / La Place")).toBeVisible();
    expect(screen.getByText("EN DIRECT")).toBeVisible();
    expect(screen.queryByText("Open Studio — À contretemps")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Appeler des contacts dans le live" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Terminer" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Indicateurs de la Room")).not.toBeInTheDocument();
    expect(screen.queryByRole("toolbar", { name: "Actions de la Room" })).not.toBeInTheDocument();
  });
});
