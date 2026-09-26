import { afterEach, expect, it, vi } from "vitest";
import { defaultRoomLaunch, createRoomLaunchSession, readRoomLaunchSession, validateRoomLaunch, ROOM_LAUNCH_SPECS, type RoomLaunchType } from "./roomLaunch";
import { ROOMS_HOME_CATALOG } from "../home/roomsHome.fixtures";
import { getRoomsHomeRails } from "../home/roomsHome.selectors";
import { DemoRoomToolsRepository } from "../tools/roomTools.service";
import type { WaveBaseLoop } from "../tools/roomTools.types";
vi.mock("./roomLaunchAudio", async (original) => ({ ...await original<typeof import("./roomLaunchAudio")>(), resolveRoomLaunchAudio: vi.fn(async () => "blob:restored-base") }));
const base = (bpm = 92, bars: 4 | 8 | 16 = 8): WaveBaseLoop => ({ title: "Ma vraie base", bars, bpm, key: "Am", kind: "Base", format: "loop", fileName: "base.wav", fileSize: 8192, mimeType: "audio/wav", durationSeconds: 60 / bpm * 4 * bars, mediaPath: "/__meewav_room_launch_audio__/test" });
afterEach(() => localStorage.clear());
it.each(Object.keys(ROOM_LAUNCH_SPECS) as RoomLaunchType[])("restores the distinct %s launch snapshot", (type) => {
  const config = defaultRoomLaunch(type); expect(validateRoomLaunch(config)).not.toBeNull(); config.title = "Mon direct";
  if (type === "wave") config.baseLoop = base();
  const session = createRoomLaunchSession(config); config.title = "Changed";
  expect(readRoomLaunchSession(session.id)?.configuration.title).toBe("Mon direct");
  expect(readRoomLaunchSession(session.id)?.configuration.roomType).toBe(type);
});
it("rejects invalid tempo and empty programs", () => {
  const wave = defaultRoomLaunch("wave"); wave.title = "Wave"; wave.values.bpm = 0;
  expect(validateRoomLaunch(wave)).toContain("Tempo");
  const scene = defaultRoomLaunch("scene"); scene.title = "Concert"; scene.values.program = " \n "; expect(validateRoomLaunch(scene)).toContain("passage");
});

it("applies launch settings once, keeping later Wave edits intact", async () => {
  const config = defaultRoomLaunch("wave"); config.title = "Création du soir"; config.values.bpm = 118; config.values.key = "Dm"; config.values.submissionsOpen = false;
  config.baseLoop = base(118);
  const session = createRoomLaunchSession(config); const repository = new DemoRoomToolsRepository();
  const state = await repository.load("wave", session.id);
  expect(state.wave).toMatchObject({ title: config.title, submissionsOpen: false, baseLoop: { bpm: 118, key: "Dm" } });
  expect(state.wave?.submissions).toEqual([]);
  expect(state.wave?.layers).toHaveLength(1);
  expect(state.wave?.baseLoop.mediaUrl).toBe("blob:restored-base");
  await repository.execute("wave", session.id, "host", { type: "wave.submissions.setOpen", open: true });
  expect((await repository.load("wave", session.id)).wave?.submissionsOpen).toBe(true);
});

it("blocks Wave launch and legacy snapshots without an imported base", () => {
  const config = defaultRoomLaunch("wave"); config.title = "Ma Wave";
  expect(validateRoomLaunch(config)).toContain("boucle de base");
  expect(() => createRoomLaunchSession(config)).toThrow("boucle de base");
  localStorage.setItem("meewav:room-launch:v1:legacy", JSON.stringify({ id: "legacy", configuration: config }));
  expect(readRoomLaunchSession("legacy")).toBeNull();
});

it.each([4, 8, 16] as const)("opens a %s bar base and restores it for the host", async (bars) => {
  const config = defaultRoomLaunch("wave"); config.title = "Ma Wave"; config.baseLoop = base(92, bars);
  const session = createRoomLaunchSession(config);
  const restored = await new DemoRoomToolsRepository().projectionForRole("wave", session.id, "host", "puff");
  expect(restored.wave?.baseLoop).toMatchObject({ bars, title: "Ma vraie base", mediaUrl: "blob:restored-base" });
});

it("preserves a long base in full, rejects mismatched loop lengths and unreadable media", () => {
  const config = defaultRoomLaunch("wave"); config.title = "Ma Wave"; config.baseLoop = { ...base(), durationSeconds: 183.7 };
  expect(validateRoomLaunch(config)).toContain("Son long");
  config.baseLoop.format = "long";
  const session = createRoomLaunchSession(config);
  expect(readRoomLaunchSession(session.id)?.configuration.baseLoop?.durationSeconds).toBe(183.7);
  config.baseLoop.durationSeconds = NaN;
  expect(validateRoomLaunch(config)).toContain("vérification");
  config.baseLoop = { ...base(), fileName: "fake.exe", mimeType: "application/octet-stream" };
  expect(validateRoomLaunch(config)).not.toBeNull();
  config.baseLoop = { ...base(), mediaPath: undefined, mediaUrl: "blob:temporary" };
  expect(() => createRoomLaunchSession(config)).toThrow("Enregistre");
});

it("applies Class capacity, Loge preview and Scene program to the respective tools", async () => {
  const repository = new DemoRoomToolsRepository();
  const classroom = defaultRoomLaunch("classe"); classroom.title = "Cours"; classroom.values.seats = 8; classroom.values.handsOpen = false;
  const lesson = await repository.load("classe", createRoomLaunchSession(classroom).id);
  expect(lesson.classe?.seats).toHaveLength(8); expect(lesson.classe?.handsOpen).toBe(false);
  const loge = defaultRoomLaunch("loge"); loge.title = "Rencontre"; loge.values.previewTitle = "Album inédit"; loge.values.liveOnly = false;
  expect((await repository.load("loge", createRoomLaunchSession(loge).id)).loge?.preview).toMatchObject({ title: "Album inédit", liveOnly: false, replayIncluded: true });
  const scene = defaultRoomLaunch("scene"); scene.title = "Concert"; scene.values.program = "Intro\nPiano solo"; scene.values.duration = 7;
  const concert = await repository.load("scene", createRoomLaunchSession(scene).id);
  expect(concert.scene?.program.map((item) => [item.title, item.durationMinutes])).toEqual([["Intro", 7], ["Piano solo", 7]]);
});
it.each(["cage", "wave", "classe", "scene", "loge", "place"] as const)("fills %s rails in both formats without mixing categories", (type) => {
  const catalog = ROOMS_HOME_CATALOG.filter((room) => room.roomType === type && room.country === "FR");
  for (const format of ["all", "horizontal", "vertical"] as const) {
    const rails = getRoomsHomeRails(format, catalog).filter((rail) => rail.items.length);
    expect(rails.length).toBeGreaterThanOrEqual(4);
    expect(rails.every((rail) => rail.items.length === 10 && rail.items.every((room) => room.roomType === type && (format === "all" || room.mediaFormat === format)))).toBe(true);
  }
});

it('starts a new Cage without demo fighters or an ongoing competition', async () => {
  const config = defaultRoomLaunch('cage'); config.title = 'Nouvelle Cage';
  const state = await new DemoRoomToolsRepository().load('cage', createRoomLaunchSession(config).id);
  expect(state.cage?.runtime?.participants).toHaveLength(0);
  expect(state.cage?.matches).toHaveLength(0);
  expect(state.cage?.votingOpen).toBe(false);
  expect(state.cage?.demoPresentation).toBeUndefined();
});
