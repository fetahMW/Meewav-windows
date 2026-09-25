import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlaceDemoState } from "./place.fixtures";
import PlaceViewerRoomBar from "./PlaceViewerRoomBar";
import { RoomPresentationProvider, WAVE_ROOM_PRESENTATION } from "../roomPresentation";

afterEach(cleanup);

describe("PlaceViewerRoomBar", () => {
  it("keeps the shared Wave Viewer navbar, with only Quitter at the top and audience on the video", () => {
    const leave = vi.fn();
    render(<RoomPresentationProvider presentation={WAVE_ROOM_PRESENTATION}><PlaceViewerRoomBar room={createPlaceDemoState()} canEngage goldenUnavailable={false} onOpenDonation={vi.fn()} onLike={vi.fn()} onGoldenLike={vi.fn()} onLeaveRoom={leave} /></RoomPresentationProvider>);
    expect(screen.queryByRole("navigation", { name: "Informations et actions de la Room" })).not.toBeInTheDocument();
    expect(document.querySelector(".wave-viewer-exit")?.querySelectorAll("button")).toHaveLength(1);
    expect(screen.queryByTitle("Audience actuelle")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Quitter" }));
    expect(leave).toHaveBeenCalledOnce();
  });
  it("groups the Room identity, indicators and exit in the viewer bottom bar", () => {
    const onOpenDonation = vi.fn();
    const onLike = vi.fn();
    const onGoldenLike = vi.fn();
    const onLeaveRoom = vi.fn();

    render(
      <PlaceViewerRoomBar
        room={createPlaceDemoState()}
        canEngage
        goldenUnavailable={false}
        onOpenDonation={onOpenDonation}
        onLike={onLike}
        onGoldenLike={onGoldenLike}
        onLeaveRoom={onLeaveRoom}
      />,
    );

    expect(screen.getByRole("navigation", { name: "Informations et actions de la Room" })).toBeVisible();
    expect(screen.getByText("Open Studio — À contretemps")).toBeVisible();
    expect(screen.getByText("La Place · Naya Oris")).toBeVisible();
    expect(screen.getByTitle("Audience actuelle")).toHaveTextContent("1,8 k");

    fireEvent.click(screen.getByRole("button", { name: /Ouvrir la bourse/ }));
    fireEvent.click(screen.getByRole("button", { name: /Golden Likes/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Likes/ }));
    fireEvent.click(screen.getByRole("button", { name: "Quitter" }));

    expect(onOpenDonation).toHaveBeenCalledTimes(1);
    expect(onGoldenLike).toHaveBeenCalledTimes(1);
    expect(onLike).toHaveBeenCalledTimes(1);
    expect(onLeaveRoom).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".place-donation-hat")).toBeNull();
    expect(document.querySelector(".place-room-shellbar__money-bag")).not.toBeNull();
  });
});
