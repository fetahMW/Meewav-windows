import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { useWaveTransportState, WaveTransportProvider } from "../../wave-transport/WaveTransportProvider";
import { createRoomToolsFixture } from "../roomTools.fixtures";
import WaveVoteQueuePanel from "./WaveVoteQueuePanel";

function TransportState() {
  const state = useWaveTransportState();
  return <output aria-label="Candidate du vote">{state?.candidate?.id ?? "aucune"}</output>;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })));
  vi.stubGlobal("AudioContext", vi.fn(function () {
    const samples = new Float32Array(800);
    return {
      currentTime: 0,
      decodeAudioData: vi.fn(async () => ({ duration: 8, length: 800, sampleRate: 100, numberOfChannels: 1, getChannelData: () => samples })),
      close: vi.fn(async () => undefined),
    };
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("WaveVoteQueuePanel", () => {
  it("charge immédiatement dans le transport la nouvelle carte sélectionnée", async () => {
    const fixture = createRoomToolsFixture("wave", "wave-vote-selection").wave!;
    const wave = {
      ...fixture,
      submissions: fixture.submissions.map(item => item.vote ? { ...item, vote: { ...item.vote, open: false } } : item),
    };
    const candidates = wave.submissions.filter(item => item.lifecycleStatus
      ? item.lifecycleStatus === "READY_FOR_VOTE" : item.status === "analysis");

    render(<MemoryRouter><WaveTransportProvider toolsVisible>
      <TransportState />
      <WaveVoteQueuePanel wave={wave} role="host" disabled={false} source="demo" execute={vi.fn().mockResolvedValue(undefined)} />
    </WaveTransportProvider></MemoryRouter>);

    await waitFor(() => expect(screen.getByLabelText("Candidate du vote")).toHaveTextContent(candidates[0].id));
    const cards = screen.getAllByRole("article");
    fireEvent.click(cards[1]);

    await waitFor(() => expect(screen.getByLabelText("Candidate du vote")).toHaveTextContent(candidates[1].id));
    expect(cards[1]).toHaveAttribute("data-selected", "true");
  });
});
