import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoomToolsFixture } from "../tools/roomTools.fixtures";
import { roomToolsRepository } from "../tools/roomTools.service";
import type { RoomPerson } from "../tools/roomTools.types";
import { createPlaceDemoState, PLACE_DEMO_PROFILES } from "./place.fixtures";
import type { PlaceStageParticipant } from "./placeStageLayoutEngine";
import CageStageProgram, { CageStageProgramView, cageStageRemaining, resolveCageFeed } from "./CageStageProgram";

function setup(source: "demo" | "live" = "demo") {
  const room = { ...createPlaceDemoState(), source };
  const onStage = room.participants.filter((participant) => (
    participant.status === "host" || participant.status === "onstage"
  )) as PlaceStageParticipant[];
  const cage = createRoomToolsFixture("cage", room.id).cage!;
  const onOpenProfile = vi.fn();
  return { room, onStage, cage, onOpenProfile };
}

function renderProgram(source: "demo" | "live" = "demo", programMuted = true) {
  const props = setup(source);
  const result = render(
    <CageStageProgramView
      cage={props.cage}
      room={props.room}
      onStage={props.onStage}
      liveKitVideoTracks={[]}
      useRtcVideo={false}
      programMuted={programMuted}
      onOpenProfile={props.onOpenProfile}
    />,
  );
  return { ...props, ...result };
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CageStageProgram", () => {
  it("applies the local return volume to the fallback video", async () => {
    const props=setup();
    props.cage.currentMatchId=null;
    const {container,rerender}=render(<CageStageProgramView {...props} liveKitVideoTracks={[]} useRtcVideo={false} programMuted={false} playbackVolume={0.25}/>);
    await waitFor(()=>expect(container.querySelector("video")?.volume).toBe(0.25));
    rerender(<CageStageProgramView {...props} liveKitVideoTracks={[]} useRtcVideo={false} programMuted={false} playbackVolume={0}/>);
    await waitFor(()=>expect(container.querySelector("video")?.volume).toBe(0));
  });

  it("renders the active duel as two stable face-to-face video returns", () => {
    const { container } = renderProgram();
    const program = container.querySelector<HTMLElement>(".cage-stage-program")!;
    const feeds = Array.from(container.querySelectorAll<HTMLElement>(".cage-stage-feed"));

    expect(program).toHaveAttribute("data-battle-status", "live-b");
    expect(program).toHaveAttribute("data-active-side", "B");
    expect(feeds).toHaveLength(2);
    expect(feeds[0]).not.toHaveClass("is-live");
    expect(feeds[1]).toHaveClass("is-live");
    expect(feeds.every((feed) => feed.dataset.feed === "demo")).toBe(true);
    expect(screen.getByText("Rook")).toBeVisible();
    expect(screen.getByText("Zélie")).toBeVisible();
    expect(screen.getByText("PROGRAM · FACE-À-FACE")).toBeVisible();
    expect(screen.getAllByRole("region", { name: /Retour vidéo de/ })).toHaveLength(2);
    expect(screen.queryByText("VAINQUEUR")).not.toBeInTheDocument();
  });

  it("keeps exactly the active demo feed as the audio fallback", () => {
    const { container } = renderProgram("demo", false);
    const videos = Array.from(container.querySelectorAll<HTMLVideoElement>(".cage-stage-feed video"));
    expect(videos).toHaveLength(2);
    expect(videos[0].muted).toBe(true);
    expect(videos[1].muted).toBe(false);
  });

  it("keeps the last on-air opponent highlighted while the Régie is paused", () => {
    const { room, onStage, cage, onOpenProfile } = setup();
    cage.battleStatus = "paused";
    cage.battleActiveSide = "B";
    const { container } = render(
      <CageStageProgramView cage={cage} room={room} onStage={onStage} liveKitVideoTracks={[]} useRtcVideo={false} programMuted onOpenProfile={onOpenProfile} />,
    );

    const renderedProgram = container.querySelector<HTMLElement>(".cage-stage-program")!;
    expect(renderedProgram).toHaveAttribute("data-active-side", "B");
    expect(renderedProgram.querySelector(".cage-stage-feed.is-b")).toHaveClass("is-live");
    expect(screen.getByText("Match en pause")).toBeVisible();
  });

  it("never substitutes an unrelated camera when live identities do not match", () => {
    const { container } = renderProgram("live");
    expect(container.querySelectorAll(".cage-stage-feed[data-feed='missing']")).toHaveLength(2);
    expect(screen.getAllByText("Flux caméra en attente")).toHaveLength(2);
    expect(screen.queryByText("Naya Oris")).not.toBeInTheDocument();
  });

  it("reveals the validated scores and winner only after the verdict", () => {
    const { room, onStage, cage, onOpenProfile } = setup();
    const current = cage.matches.find((match) => match.id === cage.currentMatchId)!;
    cage.matches = cage.matches.map((match) => match.id === current.id
      ? { ...match, status: "done", winnerId: current.competitorB.id }
      : match);
    cage.battleStatus = "done";
    cage.resultsHidden = false;
    cage.votingOpen = false;
    const { container } = render(
      <CageStageProgramView cage={cage} room={room} onStage={onStage} liveKitVideoTracks={[]} useRtcVideo={false} programMuted onOpenProfile={onOpenProfile} />,
    );

    expect(screen.getByText("VAINQUEUR")).toBeVisible();
    expect(screen.getByText("VERDICT RÉVÉLÉ")).toBeVisible();
    const winnerFeed = container.querySelector<HTMLElement>(".cage-stage-feed.is-winner")!;
    expect(within(winnerFeed).getByText(String(current.scoreB))).toBeVisible();
  });

  it("uses the exact participant identity before considering the demo fallback", () => {
    const { onStage, cage } = setup();
    const participant = onStage[1];
    const person: RoomPerson = {
      ...cage.matches[0].competitorA,
      id: participant.profile.id,
      name: "Concurrent exact",
    };

    const assignment = resolveCageFeed(person, "A", onStage, false);
    expect(assignment).toMatchObject({ exact: true, trackIdentity: participant.profile.id });
    expect(assignment?.participant.profile).toMatchObject({ id: person.id, displayName: person.name });
  });

  it("keeps a valid timer when a persisted start date is malformed", () => {
    const { cage } = setup();
    cage.battleStartedAt = "not-a-date";
    cage.battleElapsedSeconds = 7;
    expect(cageStageRemaining(cage)).toBe((cage.passageDurationSeconds ?? 120) - 7);
  });

  it("updates the video return as soon as the shared Régie command changes side", async () => {
    const room = {
      ...createPlaceDemoState(PLACE_DEMO_PROFILES.host.id),
      id: "cage-stage-program-subscription",
      source: "demo" as const,
    };
    const onStage = room.participants.filter((participant) => (
      participant.status === "host" || participant.status === "onstage"
    )) as PlaceStageParticipant[];
    const { container } = render(
      <CageStageProgram room={room} isHost isGuest={false} onStage={onStage} liveKitVideoTracks={[]} useRtcVideo={false} programMuted onOpenProfile={vi.fn()} />,
    );

    await waitFor(() => expect(container.querySelector(".cage-stage-program")).toHaveAttribute("data-active-side", "B"));
    await act(async () => {
      await roomToolsRepository.execute("cage", room.id, "host", { type: "cage.battle", status: "live-a" }, room.host.id);
    });
    await waitFor(() => expect(container.querySelector(".cage-stage-program")).toHaveAttribute("data-active-side", "A"));
  });
});


describe("Cage stage current media state", () => {
  it("uses the admitted participant media flags instead of stale roster metadata", () => {
    const { onStage } = setup();
    const source = { ...onStage[0], isCameraEnabled: true, isMicrophoneEnabled: true };
    const person: RoomPerson = { id: source.profile.id, name: source.profile.displayName, camera: "off", microphone: "off" };
    const feed = resolveCageFeed(person, "A", [source], false);
    expect(feed?.participant.isCameraEnabled).toBe(true);
    expect(feed?.participant.isMicrophoneEnabled).toBe(true);
    const muted = resolveCageFeed({ ...person, camera: "ready", microphone: "ready" }, "A", [{ ...source, isCameraEnabled: false, isMicrophoneEnabled: false }], false);
    expect(muted?.participant.isCameraEnabled).toBe(false);
    expect(muted?.participant.isMicrophoneEnabled).toBe(false);
  });
});
