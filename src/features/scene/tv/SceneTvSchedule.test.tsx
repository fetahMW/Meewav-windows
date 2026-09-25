import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  addDaysToDateKey,
  getCurrentProgram,
  getDateKeyInTimeZone,
  getNextProgram,
  resolveProgramSource,
} from "./sceneTvGuide.engine";
import {
  SCENE_TV_GUIDE_DEMO_NOW,
  SCENE_TV_GUIDE_FIXTURE,
  SCENE_TV_MAIN_CHANNEL_ID,
  SCENE_TV_TIME_ZONE,
} from "./sceneTvGuide.fixtures";
import { SCENE_TV_REMINDERS_STORAGE_KEY } from "./sceneTvReminders";
import SceneTvSchedule from "./SceneTvSchedule";

describe("MeeWav TV linear channel", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("switches the single official channel on immediately at the scheduled programme", () => {
    const current = getCurrentProgram(
      SCENE_TV_GUIDE_FIXTURE.programs,
      SCENE_TV_GUIDE_DEMO_NOW,
      { channelId: SCENE_TV_MAIN_CHANNEL_ID },
    );
    const next = getNextProgram(
      SCENE_TV_GUIDE_FIXTURE.programs,
      SCENE_TV_GUIDE_DEMO_NOW,
      { channelId: SCENE_TV_MAIN_CHANNEL_ID },
    );
    const source = current
      ? resolveProgramSource(current, SCENE_TV_GUIDE_FIXTURE.sources)
      : null;

    render(<SceneTvSchedule now={SCENE_TV_GUIDE_DEMO_NOW} />);

    expect(current).not.toBeNull();
    expect(next).not.toBeNull();
    expect(source).not.toBeNull();
    expect(screen.getByRole("heading", { name: "MEEWAV TV" })).toBeVisible();
    expect(screen.getByText("La chaîne officielle de MeeWav.")).toBeVisible();
    expect(screen.getAllByText(current?.title ?? "").length).toBeGreaterThan(0);
    expect(screen.getAllByText(next?.title ?? "").length).toBeGreaterThan(0);

    const videos = document.querySelectorAll("video");
    expect(videos).toHaveLength(1);
    expect(videos[0]).toHaveAttribute("src", source?.mediaUrl);
    expect(videos[0]).toHaveAttribute("autoplay");
    expect(videos[0]).toHaveAttribute("playsinline");
    expect(videos[0].muted).toBe(true);
    expect(screen.getByRole("group", { name: "Contrôles de MeeWav TV" })).toBeVisible();
    const context = screen.getByRole("complementary", { name: "Contexte de l’antenne" });
    expect(context).toBeVisible();
    expect(within(context).queryByText(current?.title ?? "")).not.toBeInTheDocument();
    expect(within(context).getByText("1 h 18 restantes")).toBeVisible();
    expect(screen.queryByText("Données de démonstration")).not.toBeInTheDocument();
    expect(document.querySelector(".scene-tv-now__next")).toHaveAttribute(
      "aria-label",
      expect.stringContaining(next?.title ?? ""),
    );
    expect(document.querySelector('.scene-tv-program-row[aria-current="true"]')).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: `Progression du programme ${current?.title}` }))
      .toHaveAttribute("aria-valuenow", "13");

    const currentPeriodTab = screen.getByRole("tab", { name: "Maintenant" });
    const guidePanel = screen.getByRole("tabpanel");
    expect(currentPeriodTab).toHaveAttribute("aria-controls", guidePanel.id);
    expect(guidePanel).toHaveAttribute("aria-labelledby", currentPeriodTab.id);
    expect(guidePanel.querySelector("ol.scene-tv-guide__list")).toBeInTheDocument();
    expect(guidePanel).toHaveAttribute("data-continuity", "continuous");
    const rows = [...guidePanel.querySelectorAll<HTMLElement>(".scene-tv-program-row")];
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.every((row, index) => (
      index === 0
      || row.dataset.startsAt === rows[index - 1].dataset.endsAt
    ))).toBe(true);
    expect(guidePanel.querySelector(".scene-tv-program-row__now-line")).toBeInTheDocument();
  });

  it("uses the canonical MW signature across the station ID and persistent watermark", () => {
    render(<SceneTvSchedule now={SCENE_TV_GUIDE_DEMO_NOW} />);

    expect(screen.getByRole("status", { name: "Vous regardez MeeWav TV" })).toBeVisible();
    const marks = document.querySelectorAll<HTMLImageElement>('.scene-tv-mark img');
    expect(marks.length).toBeGreaterThanOrEqual(2);
    marks.forEach((mark) => expect(mark.src).toContain("signature-mw.svg"));
    expect(document.querySelector(".scene-tv-player__lower-third")).toBeVisible();
  });

  it("synchronizes playback on metadata and exposes an explicit start action when autoplay is blocked", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(new Error("blocked"));
    render(<SceneTvSchedule now={SCENE_TV_GUIDE_DEMO_NOW} />);

    const player = document.querySelector("video") as HTMLVideoElement;
    fireEvent.loadedMetadata(player);

    await waitFor(() => expect(play).toHaveBeenCalled());
    expect(await screen.findByRole("button", { name: "Regarder MeeWav TV" })).toBeVisible();
  });

  it("keeps fourteen days of programming accessible without rendering a catalogue of channels", async () => {
    const user = userEvent.setup();
    render(<SceneTvSchedule now={SCENE_TV_GUIDE_DEMO_NOW} />);

    await user.click(screen.getByRole("tab", { name: "Programme" }));
    const dayChooser = screen.getByLabelText("Choisir un jour de programmation");
    expect(within(dayChooser).getAllByRole("button")).toHaveLength(14);
    expect(within(dayChooser).getByRole("button", { name: /^Aujourd’hui/ })).toBeVisible();
    expect(within(dayChooser).getByRole("button", { name: /^Demain/ })).toBeVisible();

    expect(screen.queryByText(/MeeWav Hip-Hop TV/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Top Rooms/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Rooms populaires/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/À voir sur MeeWav TV/i)).not.toBeInTheDocument();
  });

  it("stores a reminder only after an explicit action", async () => {
    const user = userEvent.setup();
    render(<SceneTvSchedule now={SCENE_TV_GUIDE_DEMO_NOW} />);

    expect(window.localStorage.getItem(SCENE_TV_REMINDERS_STORAGE_KEY)).toBe("[]");
    await user.click(screen.getByRole("tab", { name: "Demain" }));
    const reminder = screen.getAllByRole("button", { name: "Me rappeler" })[0];
    await user.click(reminder);

    expect(reminder).toHaveAttribute("aria-pressed", "true");
    expect(reminder).toHaveTextContent("Rappel activé");
    expect(JSON.parse(window.localStorage.getItem(SCENE_TV_REMINDERS_STORAGE_KEY) ?? "[]"))
      .toHaveLength(1);
  });

  it("opens the canonical La Scène publication only through the explicit catch-up action", async () => {
    const user = userEvent.setup();
    const onPlayVideo = vi.fn();
    render(
      <SceneTvSchedule
        now={SCENE_TV_GUIDE_DEMO_NOW}
        onPlayVideo={onPlayVideo}
      />,
    );

    const current = getCurrentProgram(
      SCENE_TV_GUIDE_FIXTURE.programs,
      SCENE_TV_GUIDE_DEMO_NOW,
      { channelId: SCENE_TV_MAIN_CHANNEL_ID },
    );
    const source = current
      ? resolveProgramSource(current, SCENE_TV_GUIDE_FIXTURE.sources)
      : null;

    await user.click(screen.getByRole("button", { name: /^Voir dans La Scène/ }));
    expect(onPlayVideo).toHaveBeenCalledWith(source?.publishedVideoId);
  });

  it("identifies a selected Room as a live simulcast without exposing a Rooms catalogue", async () => {
    const user = userEvent.setup();
    const onOpenRoom = vi.fn();
    const roomProgram = SCENE_TV_GUIDE_FIXTURE.programs.find((program) => (
      resolveProgramSource(program, SCENE_TV_GUIDE_FIXTURE.sources)?.kind === "room-simulcast"
    ));
    const roomSource = roomProgram
      ? resolveProgramSource(roomProgram, SCENE_TV_GUIDE_FIXTURE.sources)
      : null;
    expect(roomProgram).toBeDefined();
    expect(roomSource?.kind).toBe("room-simulcast");
    const roomNow = new Date(
      (Date.parse(roomProgram!.startsAt) + Date.parse(roomProgram!.endsAt)) / 2,
    );
    render(
      <SceneTvSchedule
        now={roomNow}
        onOpenRoom={onOpenRoom}
      />,
    );

    expect(screen.getAllByText("EN DIRECT").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /Voir l’événement dans Rooms/ }));
    expect(onOpenRoom).toHaveBeenCalledWith(roomSource?.roomId);
    expect(screen.queryByText(/Rooms populaires/i)).not.toBeInTheDocument();
  });

  it("labels tomorrow from the injected clock instead of a hardcoded fixture date", async () => {
    const user = userEvent.setup();
    render(<SceneTvSchedule now={SCENE_TV_GUIDE_DEMO_NOW} />);

    await user.click(screen.getByRole("tab", { name: "Demain" }));
    expect(screen.getByRole("heading", { name: "Demain sur MeeWav TV" })).toBeVisible();

    const todayKey = getDateKeyInTimeZone(SCENE_TV_GUIDE_DEMO_NOW, SCENE_TV_TIME_ZONE)!;
    const tomorrowKey = addDaysToDateKey(todayKey, 1)!;
    const tomorrow = new Date(`${tomorrowKey}T12:00:00Z`);
    const expectedLabel = new Intl.DateTimeFormat("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "Europe/Paris",
    }).format(tomorrow);
    expect(screen.getByText(expectedLabel)).toBeVisible();
  });

  it("announces the next programme before the linear handoff", () => {
    const current = getCurrentProgram(
      SCENE_TV_GUIDE_FIXTURE.programs,
      SCENE_TV_GUIDE_DEMO_NOW,
      { channelId: SCENE_TV_MAIN_CHANNEL_ID },
    )!;
    const next = getNextProgram(
      SCENE_TV_GUIDE_FIXTURE.programs,
      new Date(Date.parse(current.endsAt) - 45_000),
      { channelId: SCENE_TV_MAIN_CHANNEL_ID },
    )!;

    render(
      <SceneTvSchedule now={new Date(Date.parse(current.endsAt) - 45_000)} />,
    );

    expect(document.querySelector(".scene-tv-player__next-up")).toHaveAttribute(
      "aria-label",
      expect.stringContaining(`Ensuite, ${next.title}`),
    );
  });

  it("emits 25, 50, 75 and completed analytics once per programme", async () => {
    const analytics: string[] = [];
    const listener = (event: Event) => {
      analytics.push((event as CustomEvent<{ event: string }>).detail.event);
    };
    window.addEventListener("meewav:analytics", listener);

    const current = getCurrentProgram(
      SCENE_TV_GUIDE_FIXTURE.programs,
      SCENE_TV_GUIDE_DEMO_NOW,
      { channelId: SCENE_TV_MAIN_CHANNEL_ID },
    )!;
    const startsAt = Date.parse(current.startsAt);
    const duration = Date.parse(current.endsAt) - startsAt;
    const at = (ratio: number) => new Date(startsAt + duration * ratio);
    const { rerender } = render(<SceneTvSchedule now={at(0.26)} />);

    await waitFor(() => expect(analytics).toContain("tv_program_25"));
    rerender(<SceneTvSchedule now={at(0.30)} />);
    rerender(<SceneTvSchedule now={at(0.51)} />);
    await waitFor(() => expect(analytics).toContain("tv_program_50"));
    rerender(<SceneTvSchedule now={at(0.76)} />);
    await waitFor(() => expect(analytics).toContain("tv_program_75"));
    rerender(<SceneTvSchedule now={new Date(Date.parse(current.endsAt))} />);
    await waitFor(() => expect(analytics).toContain("tv_program_completed"));

    expect(analytics.filter((event) => event === "tv_program_25")).toHaveLength(1);
    expect(analytics.filter((event) => event === "tv_program_50")).toHaveLength(1);
    expect(analytics.filter((event) => event === "tv_program_75")).toHaveLength(1);
    expect(analytics.filter((event) => event === "tv_program_completed")).toHaveLength(1);
    window.removeEventListener("meewav:analytics", listener);
  });

  it("falls back to the continuity playlist when the editorial schedule has a gap", () => {
    render(
      <SceneTvSchedule
        guide={{ ...SCENE_TV_GUIDE_FIXTURE, programs: [] }}
        now={SCENE_TV_GUIDE_DEMO_NOW}
      />,
    );

    expect(screen.getAllByText("La Scène en continu").length).toBeGreaterThan(0);
    expect(document.querySelectorAll("video")).toHaveLength(1);
    expect(document.querySelector(".scene-tv-now__next")).toBeInTheDocument();
    expect(document.querySelectorAll(".scene-tv-program-row").length).toBeGreaterThan(1);
    expect(screen.queryByText("L’antenne reste active.")).not.toBeInTheDocument();
  });
});
