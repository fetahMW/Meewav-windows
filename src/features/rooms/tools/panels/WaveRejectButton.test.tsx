import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import WaveRejectButton from "./WaveRejectButton";

afterEach(cleanup);
const setup = (onReject = vi.fn().mockResolvedValue(undefined)) => {
  render(<WaveRejectButton title="Basse A" className="is-danger" disabled={false} onReject={onReject} />);
  return { button: screen.getByRole("button", { name: "Refuser Basse A" }), onReject };
};
describe("Refus rapide des boucles", () => {
  it.each([
    ["Ne convient pas à ce beat", "fit"], ["Catégorie déjà complète", "duplicate"], ["À retravailler", "quality"],
  ])("refuse en un clic avec le motif %s", async (label, reason) => {
    const { button, onReject } = setup();
    fireEvent.mouseEnter(button);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(screen.getAllByRole("menuitem")).toHaveLength(3);
    expect(onReject).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: label }));
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(onReject).toHaveBeenCalledExactlyOnceWith(reason, label);
  });
  it("permet de quitter au clavier sans refuser", () => {
    const { button, onReject } = setup();
    fireEvent.keyDown(button, { key: "ArrowDown" });
    expect(screen.getAllByRole("menuitem")[0]).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(screen.getAllByRole("menuitem")[1]).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(button).toHaveFocus();
    expect(onReject).not.toHaveBeenCalled();
  });
  it("garde le menu ouvert après le clic quand la souris quitte le bouton", () => {
    vi.useFakeTimers();
    try {
      const { button, onReject } = setup();
      fireEvent.click(button); fireEvent.mouseLeave(button);
      act(() => vi.advanceTimersByTime(100));
      fireEvent.mouseEnter(screen.getByRole("menu"));
      act(() => vi.advanceTimersByTime(300));
      expect(screen.getByRole("menu")).toBeInTheDocument();
      fireEvent.mouseLeave(screen.getByRole("menu"));
      act(() => vi.advanceTimersByTime(250));
      expect(screen.getByRole("menu")).toBeInTheDocument();
      fireEvent.pointerDown(document.body);
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expect(onReject).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it("bloque les doubles envois et garde le menu en cas d’échec", async () => {
    let fail!: (reason: Error) => void;
    const onReject = vi.fn().mockImplementationOnce(() => new Promise<void>((_, reject) => { fail = reject; })).mockResolvedValue(undefined);
    const { button } = setup(onReject);
    fireEvent.click(button);
    const choice = screen.getByRole("menuitem", { name: "À retravailler" });
    fireEvent.click(choice); fireEvent.click(choice);
    expect(onReject).toHaveBeenCalledTimes(1);
    expect(choice).toBeDisabled();
    await act(async () => fail(new Error("offline")));
    expect(screen.getByRole("alert")).toHaveTextContent("n’a pas été enregistré");
    fireEvent.click(choice);
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(onReject).toHaveBeenCalledTimes(2);
  });
});
