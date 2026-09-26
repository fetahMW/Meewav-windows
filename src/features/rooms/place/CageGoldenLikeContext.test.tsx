import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getGoldenLikeState, giveGoldenLike } from "../../goldenLikes/goldenLikeApi";
import { LIVE_ROOM_PRESENTATIONS, RoomPresentationProvider } from "../roomPresentation";
import type { RoomPerson } from "../tools/roomTools.types";
import { createPlaceDemoState } from "./place.fixtures";
import CageArtistGoldenLike from "./CageArtistGoldenLike";
import { CageGoldenLikeProvider, useCageGoldenLikes } from "./CageGoldenLikeContext";
import PlaceChatSocialActions from "./PlaceChatSocialActions";

vi.mock("../../goldenLikes/goldenLikeApi", () => ({ getGoldenLikeState: vi.fn(), giveGoldenLike: vi.fn() }));
const available = (artistId: string) => ({ ok: true, artistId, goldenLikesCount: 4, authenticated: true,
  usedToday: false, availableToday: true, givenToThisArtistToday: false });
const artists: RoomPerson[] = [
  { id: "artist-a", name: "Artiste A", role: "Rappeur", avatarUrl: "/artist-a.jpg", microphone: "ready", camera: "ready" },
  { id: "artist-b", name: "Artiste B", role: "Chanteuse", avatarUrl: "/artist-b.jpg", microphone: "ready", camera: "ready" },
];

beforeEach(() => {
  vi.mocked(getGoldenLikeState).mockImplementation(async id => available(id));
  vi.mocked(giveGoldenLike).mockResolvedValue({ ok: true, reason: "golden_like_sent", goldenLikesCount: 5 });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function(this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function(this: HTMLDialogElement) { this.removeAttribute("open"); } });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

function setup(source: "demo" | "live" = "live", canEngage = true, viewerId = "viewer") {
  const room = { ...createPlaceDemoState(), source, currentUserHasGoldenLiked: false };
  const hostSend = vi.fn(async () => true);
  const ui = render(<CageGoldenLikeProvider key={source} room={room} viewerId={viewerId} canEngage={canEngage} enabled>
    <RoomPresentationProvider presentation={LIVE_ROOM_PRESENTATIONS.cage}>
      <PlaceChatSocialActions room={room} canEngage={canEngage} goldenUnavailable={false} onLike={vi.fn()} onGoldenLike={hostSend} onOpenDonation={vi.fn()} />
      {artists.map(person => <CageArtistGoldenLike key={person.id} person={person} canEngage={canEngage} viewerId={viewerId} />)}
    </RoomPresentationProvider>
  </CageGoldenLikeProvider>);
  return { ...ui, hostSend, room };
}
async function offer(name: string) {
  fireEvent.click(await screen.findByRole("button", { name: new RegExp(`Offrir un Golden Like à ${name}(,|$)`) }));
  fireEvent.click(screen.getByRole("button", { name: "Offrir mon Golden Like" }));
}

describe("Cage support recipients", () => {
  it("waits for availability before offering a gift and allows a failed lookup to be retried", async () => {
    let finish!: (value: Awaited<ReturnType<typeof getGoldenLikeState>>) => void;
    vi.mocked(getGoldenLikeState).mockImplementation(id => id === artists[0].id
      ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(available(id)));
    setup();
    expect(screen.getByRole("button", { name: "Chargement du Golden Like pour Artiste A" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Offrir un Golden Like à Artiste A/ })).not.toBeInTheDocument();
    await act(async () => { finish({ ...available(artists[0].id), ok: false, availableToday: false }); });
    const retry = await screen.findByRole("button", { name: "Réessayer de charger le Golden Like pour Artiste A" });
    vi.mocked(getGoldenLikeState).mockImplementation(async id => available(id));
    fireEvent.click(retry);
    expect(await screen.findByRole("button", { name: "Offrir un Golden Like à Artiste A" })).toBeEnabled();
    expect(giveGoldenLike).not.toHaveBeenCalled();
  });

  it("credits artist B, keeps the host recipient separate and consumes the one shared allowance", async () => {
    const { hostSend, room } = setup();
    await waitFor(() => expect(getGoldenLikeState).toHaveBeenCalledWith(artists[1].id));
    expect(screen.getAllByRole("button", { name: /Aimer la vidéo/ })).toHaveLength(1);
    await offer(artists[1].name);
    await waitFor(() => expect(giveGoldenLike).toHaveBeenCalledWith(artists[1].id));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(hostSend).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /déjà offert à Artiste B/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /indisponible aujourd’hui pour Artiste A/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: new RegExp(`indisponible aujourd’hui pour ${room.host.displayName}`) })).toBeDisabled();
  });

  it("uses the existing host action and prevents a second gift to an artist", async () => {
    const { hostSend, room } = setup();
    await offer(room.host.displayName);
    await waitFor(() => expect(hostSend).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(giveGoldenLike).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /indisponible aujourd’hui pour Artiste A/ })).toBeDisabled();
  });

  it("rechecks the server quota before sending, including use from another surface", async () => {
    const { container } = setup();
    await waitFor(() => expect(getGoldenLikeState).toHaveBeenCalledWith(artists[0].id));
    vi.mocked(getGoldenLikeState).mockImplementation(async id => ({ ...available(id), usedToday: true, availableToday: false, givenArtistId: "another-artist" }));
    await offer(artists[0].name);
    await waitFor(() => expect(screen.getByRole("alert")).toBeVisible());
    expect(giveGoldenLike).not.toHaveBeenCalled();
    expect(container.querySelector(".live-action-burst--golden")).toBeNull();
  });

  it("keeps failed sends retryable and only celebrates confirmed delivery", async () => {
    vi.mocked(giveGoldenLike).mockRejectedValueOnce(new Error("offline"));
    const { container } = setup();
    await offer(artists[0].name);
    await waitFor(() => expect(screen.getByRole("alert")).toBeVisible());
    expect(container.querySelector(".live-action-burst--golden")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Offrir mon Golden Like" }));
    await waitFor(() => expect(container.querySelector(".live-action-burst--golden")).not.toBeNull());
    expect(giveGoldenLike).toHaveBeenCalledTimes(2);
  });

  it("keeps demo reactions local", async () => {
    setup("demo");
    await offer(artists[0].name);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(getGoldenLikeState).not.toHaveBeenCalled();
    expect(giveGoldenLike).not.toHaveBeenCalled();
  });

  it("does not offer self-support or allow a passive viewer to send", () => {
    setup("live", false);
    expect(screen.queryByRole("button", { name: /Offrir un Golden Like/ })).not.toBeInTheDocument();
    expect(getGoldenLikeState).not.toHaveBeenCalled();
    cleanup();
    setup("live", true, artists[0].id);
    expect(screen.queryByRole("button", { name: /Offrir un Golden Like à Artiste A/ })).not.toBeInTheDocument();
  });

  it("locks concurrent artist requests until delivery finishes", async () => {
    const room = { ...createPlaceDemoState(), source: "live" as const, currentUserHasGoldenLiked: false };
    let controls!: NonNullable<ReturnType<typeof useCageGoldenLikes>>;
    function Probe() { controls = useCageGoldenLikes()!; return null; }
    let finish!: (value: Awaited<ReturnType<typeof giveGoldenLike>>) => void;
    vi.mocked(giveGoldenLike).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(<CageGoldenLikeProvider room={room} viewerId="viewer" canEngage enabled><Probe /></CageGoldenLikeProvider>);
    let first!: Promise<boolean>;
    act(() => { first = controls.giveArtist(artists[0].id); });
    await waitFor(() => expect(giveGoldenLike).toHaveBeenCalledOnce());
    await act(async () => { expect(await controls.giveArtist(artists[1].id)).toBe(false); });
    await act(async () => { finish({ ok: true, reason: "golden_like_sent", goldenLikesCount: 5 }); expect(await first).toBe(true); });
    expect(giveGoldenLike).toHaveBeenCalledOnce();
  });

  it("does not consume the allowance when an optimistic host reaction rolls back", async () => {
    const room = { ...createPlaceDemoState(), source: "live" as const, currentUserHasGoldenLiked: false };
    let controls!: NonNullable<ReturnType<typeof useCageGoldenLikes>>;
    function Probe() { controls = useCageGoldenLikes()!; return null; }
    const view = (optimistic: boolean) => <CageGoldenLikeProvider room={{ ...room, currentUserHasGoldenLiked: optimistic }} viewerId="viewer" canEngage enabled><Probe /></CageGoldenLikeProvider>;
    let finish!: (sent: boolean) => void;
    const sendHost = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
    const ui = render(view(false));
    let request!: Promise<boolean>;
    act(() => { request = controls.giveHost(sendHost); });
    await waitFor(() => expect(sendHost).toHaveBeenCalledOnce());
    ui.rerender(view(true));
    await act(async () => { finish(false); expect(await request).toBe(false); });
    ui.rerender(view(false));
    await act(async () => { expect(await controls.giveArtist(artists[1].id)).toBe(true); });
    expect(giveGoldenLike).toHaveBeenCalledWith(artists[1].id);
  });
});
