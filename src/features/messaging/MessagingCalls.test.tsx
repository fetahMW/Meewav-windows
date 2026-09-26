import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ action: vi.fn(), media: vi.fn(), connect: vi.fn(), dispose: vi.fn(), permission: vi.fn(), stop: vi.fn(), setAuth: vi.fn() }));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ user: { id: "self" } }) }));
vi.mock("./messaging.flags", () => ({ resolveMessagingRuntimeMode: () => "supabase" }));
vi.mock("../../lib/supabaseClient", () => ({ supabase: { realtime: { setAuth: mock.setAuth }, removeChannel: vi.fn(),
  channel: () => ({ on() { return this; }, subscribe() { return this; } }) } }));
vi.mock("./messaging.calls", () => ({ directCallAction: mock.action, isActiveDirectCall: (call: any) => call && ["ringing", "accepted"].includes(call.status),
  DirectCallTransport: class { constructor(...args: unknown[]) { mock.media(...args); } connect = mock.connect; dispose = mock.dispose; } }));
import MessagingCalls, { requestDirectCall } from "./MessagingCalls";
const incoming = { id: "call", peerId: "peer", peerName: "Contact", incoming: true, status: "ringing", kind: "audio", conversationId: "conversation" };
beforeEach(() => {
  vi.clearAllMocks(); mock.setAuth.mockResolvedValue(undefined); mock.connect.mockResolvedValue(undefined); mock.dispose.mockResolvedValue(undefined);
  mock.permission.mockResolvedValue({ getTracks: () => [{ stop: mock.stop }] });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: mock.permission } });
  mock.action.mockImplementation(async action => action === "accept" ? { ...incoming, status: "accepted" } : action === "end" ? { ...incoming, status: "ended" } : incoming);
});
afterEach(cleanup);
it("does not capture or heartbeat a call accepted on another device", async () => {
  mock.action.mockResolvedValue({ ...incoming, status: "accepted" });
  render(<MemoryRouter><MessagingCalls /></MemoryRouter>);
  await waitFor(() => expect(mock.action).toHaveBeenCalledWith("peek", undefined));
  expect(mock.permission).not.toHaveBeenCalled(); expect(mock.media).not.toHaveBeenCalled(); expect(screen.queryByRole("dialog")).toBeNull();
});
it("requires explicit acceptance and permission before connecting incoming media", async () => {
  render(<MemoryRouter><MessagingCalls /></MemoryRouter>);
  const accept = await screen.findByRole("button", { name: "Accepter" });
  expect(mock.permission).not.toHaveBeenCalled(); expect(mock.media).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(accept); });
  await waitFor(() => expect(mock.connect).toHaveBeenCalledOnce());
  expect(mock.permission).toHaveBeenCalledWith({ audio: true, video: false }); expect(mock.stop).toHaveBeenCalled();
  expect(mock.action).toHaveBeenCalledWith("accept", incoming.id);
  expect(screen.getByRole("button", { name: "Couper le micro" })).toBeDisabled();
  act(() => mock.media.mock.calls[0][4].ready());
  expect(screen.getByRole("button", { name: "Couper le micro" })).toBeEnabled();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Raccrocher" })); });
  expect(mock.dispose).toHaveBeenCalled();
});
it("requires leaving a Room before answering a private call", async () => {
  render(<MemoryRouter initialEntries={["/rooms/place?room=room-id"]}><MessagingCalls /></MemoryRouter>);
  expect(await screen.findByRole("button", { name: "Accepter" })).toBeDisabled();
  expect(mock.permission).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Quitter la Room pour répondre" }));
  expect(screen.getByRole("button", { name: "Accepter" })).toBeEnabled();
  expect(mock.media).not.toHaveBeenCalled();
});
it.each(["/rooms/place?room=room-id", "/studio"])("does not accept after navigating to %s during the permission prompt", async path => {
  let grant!: (value: unknown) => void;
  mock.permission.mockImplementation(() => new Promise(resolve => { grant = resolve; }));
  render(<MemoryRouter><Link to={path}>Ouvrir la Room</Link><MessagingCalls /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "Accepter" }));
  fireEvent.click(screen.getByRole("link", { name: "Ouvrir la Room" }));
  await act(async () => { grant({ getTracks: () => [{ stop: mock.stop }] }); });
  expect(mock.stop).toHaveBeenCalled();
  expect(mock.action).not.toHaveBeenCalledWith("accept", incoming.id);
  expect(mock.connect).not.toHaveBeenCalled();
});
it("waits for the previous engine to finish disposing before connecting another call", async () => {
  let release!: () => void;
  const disposal = new Promise<void>(resolve => { release = resolve; });
  mock.dispose.mockReturnValue(disposal);
  mock.action.mockImplementation(async action => action === "accept" ? { ...incoming, status: "accepted" }
    : action === "start_audio" ? { ...incoming, id: "second", incoming: false, status: "accepted" }
      : action === "end" ? { ...incoming, status: "ended" } : incoming);
  render(<MemoryRouter><MessagingCalls /></MemoryRouter>);
  const accept = await screen.findByRole("button", { name: "Accepter" });
  await act(async () => { fireEvent.click(accept); });
  await waitFor(() => expect(mock.connect).toHaveBeenCalledTimes(1));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Raccrocher" })); });
  await act(async () => { requestDirectCall("conversation-two", "audio"); });
  expect(mock.media).toHaveBeenCalledTimes(2);
  expect(mock.connect).toHaveBeenCalledTimes(1);
  await act(async () => { release(); });
  await waitFor(() => expect(mock.connect).toHaveBeenCalledTimes(2));
});
it("does not start an outgoing call if the studio opens during microphone permission", async () => {
  mock.action.mockResolvedValue(null);
  let grant!: (value: unknown) => void;
  mock.permission.mockImplementation(() => new Promise(resolve => { grant = resolve; }));
  render(<MemoryRouter><Link to="/studio">Studio</Link><MessagingCalls /></MemoryRouter>);
  await act(async () => { requestDirectCall("conversation", "audio"); });
  fireEvent.click(screen.getByRole("link", { name: "Studio" }));
  await act(async () => { grant({ getTracks: () => [{ stop: mock.stop }] }); });
  expect(mock.action.mock.calls.some(([action]) => action === "start_audio")).toBe(false);
  expect(mock.connect).not.toHaveBeenCalled();
});
it("stops an accepted private call when opening the studio", async () => {
  render(<MemoryRouter><Link to="/studio">Studio</Link><MessagingCalls /></MemoryRouter>);
  const accept = await screen.findByRole("button", { name: "Accepter" });
  await act(async () => { fireEvent.click(accept); });
  await waitFor(() => expect(mock.connect).toHaveBeenCalledOnce());
  await act(async () => { fireEvent.click(screen.getByRole("link", { name: "Studio" })); });
  expect(mock.dispose).toHaveBeenCalled();
  expect(mock.action).toHaveBeenCalledWith("end", incoming.id);
  expect(screen.queryByRole("button", { name: "Couper le micro" })).toBeNull();
});
