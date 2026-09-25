import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoomToolsFixture } from "../roomTools.fixtures";
import type { RoomToolsCommand } from "../roomTools.types";
import WaveSequencerPanel from "./WaveSequencerPanel";

function waveFixture() {
  const wave = createRoomToolsFixture("wave").wave;
  if (!wave) throw new Error("fixture_wave_missing");
  return structuredClone(wave);
}

function firstEligibleCandidate(wave: ReturnType<typeof waveFixture>) {
  const candidate = wave.submissions.find((submission) => submission.status === "analysis"
    && submission.rightsConfirmed
    && submission.bars === wave.baseLoop.bars
    && Math.abs(submission.bpm - wave.baseLoop.bpm) <= 2);
  if (!candidate) throw new Error("eligible_vote_candidate_missing");
  return candidate;
}

beforeEach(() => {
  Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: vi.fn() });
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:wave-import") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});

afterEach(cleanup);

describe("WaveSequencerPanel — Vote du public", () => {
  it("uses one dense queue and an anchored full-width control dock", () => {
    const wave = waveFixture();
    const active = wave.submissions.find((submission) => submission.vote?.open);
    if (!active) throw new Error("open_vote_candidate_missing");
    const { container } = render(<WaveSequencerPanel wave={wave} role="host" source="demo" disabled={false} execute={vi.fn()} />);

    expect(screen.queryByText("Vote du public")).not.toBeInTheDocument();
    expect(container.querySelector(".wave-vote-inbox__queue")).toBeInTheDocument();
    expect(container.querySelector(".wave-vote-dock")).toBeInTheDocument();
    expect(container.querySelector(".wave-vote-dock__identity")).toBeInTheDocument();
    expect(container.querySelector(".wave-vote-dock__transport")).not.toBeInTheDocument();
    expect(container.querySelector(".wave-vote-dock__duration")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Importer une boucle" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Télécharger la boucle de ${active.contributor.name}` })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Supprimer la candidate" })).toBeInTheDocument();
    expect(container.querySelector(".wave-vote-dock__launch")).toBeInTheDocument();
    expect(container.querySelector(".wave-public-vote__layout")).not.toBeInTheDocument();
    expect(container.querySelector(".wave-public-vote__stage")).not.toBeInTheDocument();
    expect(screen.queryByText("Tunnel Vox")).not.toBeInTheDocument();
    expect(screen.getAllByText(active.contributor.name)).toHaveLength(2);
    expect(screen.getByRole("slider", { name: `Volume de ${active.contributor.name}` })).toBeInTheDocument();
    expect(screen.queryByText("CANDIDAT SÉLECTIONNÉ")).not.toBeInTheDocument();
    expect(screen.queryByText("PRÊTE")).not.toBeInTheDocument();
    expect(screen.getByText("VOTE EN DIRECT")).toBeInTheDocument();
    expect(screen.getByText("Chronomètre")).toBeInTheDocument();
  });

  it("opens a dedicated import modal and adds the host loop to the vote queue", async () => {
    const wave = waveFixture();
    wave.submissions.forEach((submission) => { submission.vote = undefined; });
    const execute = vi.fn<(command: RoomToolsCommand) => Promise<unknown>>().mockResolvedValue(undefined);
    const { container } = render(<WaveSequencerPanel wave={wave} role="host" source="demo" accountId="host" disabled={false} execute={execute} />);

    fireEvent.click(screen.getByRole("button", { name: "Importer une boucle" }));
    expect(screen.getByRole("dialog", { name: "Importer une boucle" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Artiste" }), { target: { value: "Nova Keys" } });
    const file = new File(["audio"], "nova-loop.mp3", { type: "audio/mpeg" });
    const fileInput = container.querySelector<HTMLInputElement>('.wave-vote-import-modal input[type="file"]');
    if (!fileInput) throw new Error("wave_import_input_missing");
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Je confirme que cette boucle/ }));
    fireEvent.click(screen.getByRole("button", { name: "Ajouter au vote" }));

    await waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      type: "wave.submission.add",
      submission: expect.objectContaining({
        contributor: expect.objectContaining({ name: "Nova Keys" }),
        fileName: "nova-loop.mp3",
        status: "received",
      }),
    })));
    const added = vi.mocked(execute).mock.calls.find(([command]) => command.type === "wave.submission.add")?.[0];
    if (!added || added.type !== "wave.submission.add") throw new Error("wave_import_command_missing");
    await waitFor(() => expect(execute).toHaveBeenCalledWith({ type: "wave.submission.status", submissionId: added.submission.id, status: "analysis" }));
  });

  it("downloads the currently selected candidate from the bottom launcher", () => {
    const wave = waveFixture();
    const selected = wave.submissions.find((submission) => submission.vote?.open);
    if (!selected) throw new Error("open_vote_candidate_missing");
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    render(<WaveSequencerPanel wave={wave} role="host" source="demo" disabled={false} execute={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: `Télécharger la boucle de ${selected.contributor.name}` }));
    expect(click).toHaveBeenCalledOnce();
  });

  it("links the selected queue row to the control dock and keeps its metadata coherent", () => {
    const wave = waveFixture();
    wave.submissions.forEach((submission) => { submission.vote = undefined; });
    const candidates = wave.submissions.filter((submission) => submission.status === "analysis"
      && submission.rightsConfirmed
      && submission.bars === wave.baseLoop.bars
      && Math.abs(submission.bpm - wave.baseLoop.bpm) <= 2);
    const target = candidates[1] ?? candidates[0];
    if (!target) throw new Error("eligible_vote_candidate_missing");
    const execute = vi.fn<(command: RoomToolsCommand) => Promise<unknown>>().mockResolvedValue(undefined);
    const { container } = render(<WaveSequencerPanel wave={wave} role="host" source="demo" disabled={false} execute={execute} />);

    const row = screen.getByRole("button", { name: `Sélectionner ${target.contributor.name}` });
    expect(row).toHaveAttribute("aria-controls", "wave-vote-control-dock");
    expect(row.querySelector(".wave-vote-row__identity strong")).toHaveTextContent(target.contributor.name);
    expect(row.querySelector(".wave-vote-row__grade")).toHaveClass("mw-grade-badge--lg");
    expect(row.querySelector(".wave-vote-row__identity .wave-vote-row__grade")).toBeInTheDocument();
    expect(row.querySelector(".wave-vote-row__decision")).not.toBeInTheDocument();
    fireEvent.click(row);

    expect(row).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector("#wave-vote-control-dock .wave-vote-dock__candidate strong")).toHaveTextContent(target.contributor.name);
    expect(screen.queryByText(target.title)).not.toBeInTheDocument();
    expect(container.querySelector("#wave-vote-control-dock .wave-vote-dock__candidate")).toHaveTextContent(target.contributor.name);
    expect(execute).toHaveBeenCalledWith({ type: "wave.submission.select", submissionId: target.id });
  });

  it("closes the official vote through the existing command", () => {
    const wave = waveFixture();
    const execute = vi.fn<(command: RoomToolsCommand) => Promise<unknown>>().mockResolvedValue(undefined);
    render(<WaveSequencerPanel wave={wave} role="host" source="demo" disabled={false} execute={execute} />);

    fireEvent.click(screen.getByRole("button", { name: "Clôturer et appliquer le verdict" }));
    expect(execute).toHaveBeenCalledWith({ type: "wave.vote.open", submissionId: "loop-4", open: false });
  });

  it("sends the selected listening mode and duration when launching", () => {
    const wave = waveFixture();
    wave.submissions.forEach((submission) => { submission.vote = undefined; });
    const candidate = firstEligibleCandidate(wave);
    const execute = vi.fn<(command: RoomToolsCommand) => Promise<unknown>>().mockResolvedValue(undefined);
    render(<WaveSequencerPanel wave={wave} role="host" source="demo" disabled={false} execute={execute} />);

    fireEvent.click(screen.getByRole("button", { name: "Écoute officielle en solo" }));
    fireEvent.click(screen.getByRole("button", { name: "Durée du vote" }));
    fireEvent.click(screen.getByRole("option", { name: "45 secondes" }));
    fireEvent.click(screen.getByRole("button", { name: "Lancer le vote" }));

    expect(execute).toHaveBeenCalledWith({
      type: "wave.vote.open",
      submissionId: candidate.id,
      open: true,
      durationSeconds: 45,
      listeningMode: "solo",
    });
  });

  it("locks the other candidates while an official vote is running", () => {
    const wave = waveFixture();
    render(<WaveSequencerPanel wave={wave} role="host" source="demo" disabled={false} execute={vi.fn()} />);

    const otherCandidate = screen.getAllByRole("button", { name: /Sélectionner/i }).find((button) => button.getAttribute("aria-pressed") === "false");
    expect(otherCandidate).toBeDisabled();
  });

  it("retire le verdict précédent de la file dès que la boucle suivante passe au vote", () => {
    const wave = waveFixture();
    wave.submissions.forEach((submission) => { submission.vote = undefined; });
    const candidates = wave.submissions.filter((submission) => submission.status === "analysis"
      && submission.rightsConfirmed
      && submission.bars === wave.baseLoop.bars
      && Math.abs(submission.bpm - wave.baseLoop.bpm) <= 2);
    const previous = candidates[0];
    const next = candidates[1];
    if (!previous || !next) throw new Error("two_eligible_vote_candidates_missing");
    previous.status = "accepted";
    previous.vote = { open: false, hidden: false, durationSeconds: 30, thresholdPercent: 60, submissionVersion: previous.version, votes: {}, outcome: "accepted", finalizedAt: "2026-08-28T19:00:00.000Z" };
    next.vote = { open: true, hidden: true, durationSeconds: 30, thresholdPercent: 60, submissionVersion: next.version, votes: {}, outcome: null, openedAt: "2026-08-28T19:01:00.000Z" };

    render(<WaveSequencerPanel wave={wave} role="host" source="demo" disabled={false} execute={vi.fn()} />);

    expect(screen.queryByRole("button", { name: `Sélectionner ${previous.contributor.name}` })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Sélectionner ${next.contributor.name}` })).toBeInTheDocument();
  });

  it("plays the candidate and the collective beat in beat mode", async () => {
    const wave = waveFixture();
    wave.submissions.forEach((submission) => { submission.vote = undefined; });
    render(<WaveSequencerPanel wave={wave} role="host" source="demo" disabled={false} execute={vi.fn()} />);

    const selected = firstEligibleCandidate(wave);
    fireEvent.click(screen.getByRole("button", { name: `Préécouter ${selected.contributor.name}` }));
    await vi.waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2));
  });

  it("fails closed in live until the immutable server preview is ready", () => {
    const wave = waveFixture();
    wave.submissions.forEach((submission) => { submission.vote = undefined; });
    const execute = vi.fn<(command: RoomToolsCommand) => Promise<unknown>>().mockResolvedValue(undefined);
    render(<WaveSequencerPanel wave={wave} role="host" source="live" disabled={false} execute={execute} />);

    const launch = screen.getByRole("button", { name: "Aperçu officiel en préparation" });
    expect(launch).toBeDisabled();
    fireEvent.click(launch);
    expect(execute).not.toHaveBeenCalledWith(expect.objectContaining({ type: "wave.vote.open", open: true }));
  });

  it("unlocks a server-backed candidate preview", () => {
    const wave = waveFixture();
    wave.submissions.forEach((submission) => { submission.vote = undefined; });
    const selected = firstEligibleCandidate(wave);
    render(<WaveSequencerPanel wave={wave} role="host" source="live" disabled={false} execute={vi.fn()} officialPreviews={{ [selected.id]: { status: "ready", mediaUrl: "https://cdn.example.test/preview.wav" } }} />);

    expect(screen.getByRole("button", { name: "Lancer le vote" })).toBeEnabled();
    expect(screen.getByRole("button", { name: `Préécouter ${selected.contributor.name}` })).toBeEnabled();
  });
});
