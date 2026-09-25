import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoomToolsFixture } from "../roomTools.fixtures";
import { reduceCommand } from "../roomTools.service";
import type { RoomToolsCommand } from "../roomTools.types";
import { readWaveSubmissionAudio } from "../waveAudioRules";
import WaveGatePanel from "./WaveGatePanel";

vi.mock("../waveAudioRules", async importOriginal => ({ ...await importOriginal<typeof import("../waveAudioRules")>(), readWaveSubmissionAudio: vi.fn(async () => ({ bars: 4, durationSeconds: 8 })) }));
const commands = vi.fn();
function Harness() {
  const [state, setState] = useState(() => {
    const fixture = createRoomToolsFixture("wave");
    const item = fixture.wave!.submissions[0];
    item.lifecycleStatus = "RECEIVED"; item.status = "received"; item.vote = undefined;
    fixture.wave!.submissions = [item];
    reduceCommand(fixture, { type: "wave.submissions.quarantine", submissionIds: [item.id] });
    return fixture;
  });
  const execute = async (command: RoomToolsCommand) => {
    const next = structuredClone(state); reduceCommand(next, command, "host"); commands(command, next); setState(next);
  };
  return <MemoryRouter><WaveGatePanel quarantine wave={state.wave!} role="host" roomId="quarantine-test" source="demo" accountId="host" disabled={false} execute={execute} /></MemoryRouter>;
}
beforeEach(() => {
  commands.mockClear();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, blob: async () => new Blob(["audio"]) })));
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:corrected") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Atelier de quarantaine", () => {
  it("remplace avec un fichier attribué à l’artiste sans le publier au vote", async () => {
    render(<Harness />);
    const queue = screen.getByRole("region", { name: "Boucles en quarantaine" });
    fireEvent.click(within(queue).getByRole("button", { name: /Remplacer/ }));
    const dialog = screen.getByRole("dialog", { name: "Remplacer le fichier" });
    expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
    fireEvent.change(dialog.querySelector('input[type="file"]')!, { target: { files: [new File(["audio"], "export anonyme.wav", { type: "audio/wav" })] } });
    expect(dialog).toHaveTextContent("Eliott Waves");
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Remplacer" })));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const [command, next] = commands.mock.calls[0];
    expect(command).toMatchObject({ type: "wave.submission.version", patch: { fileName: expect.stringContaining("Eliott Waves"), mediaUrl: "blob:corrected" } });
    expect(next.wave.submissions[0]).toMatchObject({ quarantined: true, lifecycleStatus: "NEEDS_REVIEW", contributor: { name: "Eliott Waves" } });
    expect(within(queue).getAllByRole("article")).toHaveLength(1);
    expect(commands).toHaveBeenCalledTimes(1);
  });
  it("garde la boucle et le fichier d’origine si l’analyse du remplacement échoue", async () => {
    vi.mocked(readWaveSubmissionAudio).mockRejectedValueOnce(new Error("Durée incompatible"));
    render(<Harness />);
    fireEvent.click(within(screen.getByRole("region", { name: "Boucles en quarantaine" })).getByRole("button", { name: /Remplacer/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(dialog.querySelector('input[type="file"]')!, { target: { files: [new File(["audio"], "test.wav", { type: "audio/wav" })] } });
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Remplacer" })));
    expect(dialog).toHaveTextContent("Durée incompatible");
    expect(commands).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "Boucles en quarantaine" })).toBeInTheDocument();
  });
  it("télécharge avec le nom de l’artiste via un fichier local, même pour une URL distante", async () => {
    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { clicks.push(this.download); expect(this.href).toBe("blob:corrected"); });
    render(<Harness />);
    await act(async () => fireEvent.click(within(screen.getByRole("region", { name: "Boucles en quarantaine" })).getByRole("button", { name: /Télécharger/ })));
    expect(clicks).toHaveLength(1);
    expect(clicks[0]).toContain("Eliott Waves");
    expect(clicks[0]).toMatch(/v\d+\.(wav|mp3)$/);
    expect(commands).not.toHaveBeenCalled();
  });
});
