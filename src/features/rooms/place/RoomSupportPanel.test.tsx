import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RoomSupportPanel from "./RoomSupportPanel";
import { createDemoSupportWallet, getRoomSupportWallet, type RoomSupportWallet } from "./roomSupport";
import { useRoomSupportThrows } from "./useRoomSupportThrows";

afterEach(cleanup);
function Harness({ wallet, onSent = vi.fn(), context = "room-a" }: { wallet: RoomSupportWallet; onSent?: (cents: number, id: string) => void; context?: string }) {
  const [open, setOpen] = useState(true);
  const support = useRoomSupportThrows({ wallet, recipientId: "host", context, canEngage: true, onSent, onError: vi.fn() });
  return <>
    <button type="button" disabled={support.action.pending} onClick={() => support.action.remaining ? void support.launch() : setOpen(true)}>Bourse navbar · {support.action.remaining}</button>
    <button type="button" onClick={() => setOpen(true)}>Configurer la bourse</button>
    {support.action.burst && <output>Animation du lancer {support.action.burst.cents}</output>}
    {open && <RoomSupportPanel hostId="host" hostName="PUFf" wallet={wallet} canEngage onClose={() => setOpen(false)} prepared={support.prepared} onPrepare={support.prepare} onCancelPrepared={support.cancel} />}
  </>;
}

describe("Room support preparation and navbar throws", () => {
  it("prepares without spending, closes the panel, then sends five separate navbar throws", async () => {
    const wallet = createDemoSupportWallet(1000); const onSent = vi.fn();
    render(<Harness wallet={wallet} onSent={onSent} />);
    fireEvent.click(screen.getByRole("button", { name: "5 lancers" }));
    fireEvent.click(screen.getByRole("button", { name: "Préparer 5 lancers" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(wallet.getBalance()).toBe(1000); expect(onSent).not.toHaveBeenCalled();
    for (let i = 1; i <= 5; i++) {
      fireEvent.click(screen.getByRole("button", { name: `Bourse navbar · ${6 - i}` }));
      await waitFor(() => expect(onSent).toHaveBeenCalledTimes(i));
      expect(wallet.getBalance()).toBe(1000 - i * 200);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    }
    expect(onSent.mock.calls.map(([cents]) => cents)).toEqual([200, 200, 200, 200, 200]);
    expect(screen.getByText("Animation du lancer 200")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bourse navbar · 0" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument(); expect(onSent).toHaveBeenCalledTimes(5);
  });

  it("adds funds without sending and preserves the chosen split", async () => {
    const wallet = createDemoSupportWallet(0); const onSent = vi.fn();
    render(<Harness wallet={wallet} onSent={onSent} />);
    fireEvent.click(screen.getByRole("button", { name: "5 lancers" }));
    expect(screen.getByRole("button", { name: "Préparer 5 lancers" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Ajouter des fonds" }));
    fireEvent.click(screen.getByRole("button", { name: /Ajouter 10/ }));
    await waitFor(() => expect(wallet.getBalance()).toBe(1000));
    expect(screen.getByRole("button", { name: "Préparer 5 lancers" })).toBeEnabled(); expect(onSent).not.toHaveBeenCalled();
  });

  it("ignores duplicate clicks while the navbar debit is pending", async () => {
    const wallet = createDemoSupportWallet(1000); const send = wallet.send;
    let release!: () => void;
    wallet.send = vi.fn(async (cents: number, recipient: string, operation: string) => { await new Promise<void>((resolve) => { release = resolve; }); await send(cents, recipient, operation); });
    render(<Harness wallet={wallet} />);
    fireEvent.click(screen.getByRole("button", { name: "5 lancers" }));
    fireEvent.click(screen.getByRole("button", { name: "Préparer 5 lancers" }));
    const button = screen.getByRole("button", { name: "Bourse navbar · 5" });
    fireEvent.click(button); fireEvent.click(button);
    expect(wallet.send).toHaveBeenCalledTimes(1); expect(screen.queryByText("Animation du lancer 200")).not.toBeInTheDocument();
    await act(async () => { release(); });
    expect(wallet.getBalance()).toBe(800); expect(screen.getByRole("button", { name: "Bourse navbar · 4" })).toBeEnabled();
  });

  it("keeps unspent funds when cancelling the remaining prepared throws", async () => {
    const wallet = createDemoSupportWallet(1000); render(<Harness wallet={wallet} />);
    fireEvent.click(screen.getByRole("button", { name: "5 lancers" }));
    fireEvent.click(screen.getByRole("button", { name: "Préparer 5 lancers" }));
    fireEvent.click(screen.getByRole("button", { name: "Bourse navbar · 5" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Bourse navbar · 4" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Configurer la bourse" }));
    fireEvent.click(screen.getByRole("button", { name: /Annuler les lancers préparés/ }));
    expect(wallet.getBalance()).toBe(800); expect(screen.getByRole("button", { name: "Bourse navbar · 0" })).toBeInTheDocument();
  });

  it("clears preparation when changing room and never revives it on return", () => {
    const wallet = createDemoSupportWallet(1000); const view = render(<Harness wallet={wallet} />);
    fireEvent.click(screen.getByRole("button", { name: "Préparer 1 lancer" }));
    view.rerender(<Harness wallet={wallet} context="room-b" />);
    expect(screen.getByRole("button", { name: "Bourse navbar · 0" })).toBeInTheDocument();
    view.rerender(<Harness wallet={wallet} context="room-a" />);
    expect(screen.getByRole("button", { name: "Bourse navbar · 0" })).toBeInTheDocument(); expect(wallet.getBalance()).toBe(1000);
  });

  it("does not allow simulated funds in a live room", () => {
    render(<Harness wallet={getRoomSupportWallet("live", "viewer")} />);
    expect(screen.getByRole("button", { name: "Préparer 1 lancer" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Ajouter des fonds" }));
    expect(screen.getByRole("button", { name: /Ajouter 10/ })).toBeDisabled();
  });
});
