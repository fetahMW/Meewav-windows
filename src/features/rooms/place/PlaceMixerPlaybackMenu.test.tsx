import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { WaveTransportProvider, useWaveTransport } from "../wave-transport/WaveTransportProvider";
import PlaceMixerPlaybackMenu from "./PlaceMixerPlaybackMenu";

let transport: NonNullable<ReturnType<typeof useWaveTransport>>;
function MenuHarness({ canLoop = true }: { canLoop?: boolean }) {
  const current = useWaveTransport()!;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"ordered" | "shuffle" | "loop">("ordered");
  const [active, setActive] = useState(true);
  useEffect(() => {
    transport = current;
    current.engine.setGrid({ bpm: 124, beatsPerBar: 4, origin: 0 });
  }, [current]);
  return <PlaceMixerPlaybackMenu open={open} onOpenChange={setOpen} mode={mode} onModeChange={setMode}
    canLoop={canLoop} loopActive={active} onToggleLoop={() => setActive(value => !value)} />;
}
function openMenu(canLoop = true) {
  render(<WaveTransportProvider toolsVisible><MenuHarness canLoop={canLoop} /></WaveTransportProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Options de lecture" }));
  return screen.getByRole("menu", { name: "Mode de lecture" });
}
afterEach(cleanup);

describe("options de lecture · Wave", () => {
  it("garde les trois modes de playlist avec A/B libre et les quatre longueurs", () => {
    const menu = openMenu();
    for (const name of ["Lecture dans l’ordre", "Lecture aléatoire", "Lecture en boucle"]) {
      expect(within(menu).getByRole("menuitemradio", { name })).toBeVisible();
    }
    expect(within(menu).getByRole("menuitemcheckbox", { name: "Désactiver la boucle A–B" })).toBeVisible();
    const lengths = within(menu).getByRole("group", { name: "Longueur de la zone A/B" });
    expect(within(lengths).getByRole("menuitemradio", { name: "Libre A–B" })).toBeVisible();
    for (const bars of [4, 8, 16, 32]) expect(within(lengths).getByRole("menuitemradio", { name: `${bars} mesures` })).toBeVisible();
    expect(within(menu).getByText("124 BPM · 4/4")).toBeVisible();
  });

  it.each(["Lecture aléatoire", "Lecture en boucle", "Lecture dans l’ordre"])("mémorise %s après réouverture sans changer A/B", name => {
    openMenu();
    act(() => transport.engine.setRegion(16, 8));
    const region = transport.engine.getSnapshot().region;
    fireEvent.click(screen.getByRole("menuitemradio", { name }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "Options de lecture" });
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    expect(screen.getByRole("menuitemradio", { name })).toHaveAttribute("aria-checked", "true");
    expect(transport.engine.getSnapshot().region).toEqual(region);
  });

  it("change la longueur sans fermer les options ni perdre le mode de playlist", () => {
    openMenu();
    fireEvent.click(screen.getByRole("menuitemradio", { name: "16 mesures" }));
    expect(screen.getByRole("menuitemradio", { name: "16 mesures" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemradio", { name: "Lecture dans l’ordre" })).toHaveAttribute("aria-checked", "true");
    const state = transport.engine.getSnapshot();
    expect(state.region!.end - state.region!.start).toBeCloseTo(16 * 4 * 60 / 124);
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Désactiver la boucle A–B" }));
    fireEvent.click(screen.getByRole("button", { name: "Options de lecture" }));
    expect(screen.getByRole("menuitemcheckbox", { name: "Activer la boucle A–B" })).toHaveAttribute("aria-checked", "false");
  });

  it("désactive les réglages de zone sans fichier et conserve la navigation clavier", () => {
    const menu = openMenu(false);
    expect(within(menu).getByRole("menuitemradio", { name: "Libre A–B" })).toBeDisabled();
    for (const bars of [4, 8, 16, 32]) expect(within(menu).getByRole("menuitemradio", { name: `${bars} mesures` })).toBeDisabled();
    expect(screen.getByRole("menuitemradio", { name: "Lecture dans l’ordre" })).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(screen.getByRole("menuitemradio", { name: "Lecture aléatoire" })).toHaveFocus();
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Options de lecture" })).toHaveFocus();
  });
});
