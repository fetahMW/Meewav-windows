import { createRef } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import RoomLaunchDialog from "./RoomLaunchDialog";
import { RuntimeProvider } from '../../../runtime/RuntimeProvider';

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), measure: vi.fn(), save: vi.fn(), createLive: vi.fn(), createCage: vi.fn() }));
vi.mock("react-router-dom", async (original) => ({ ...await original<typeof import("react-router-dom")>(), useNavigate: () => mocks.navigate }));
vi.mock("../../auth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("./CageLaunchDialog", () => ({ default: () => <section aria-label="Préparer La Cage complète" /> }));
vi.mock("../place/GreenHouse", () => ({ default: ({ onReady, readyLabel }: { onReady: () => Promise<void>; readyLabel: string }) => <button onClick={onReady}>{readyLabel}</button> }));
vi.mock("../tools/waveAudioRules", async (original) => ({ ...await original<typeof import("../tools/waveAudioRules")>(), measureWaveAudio: mocks.measure }));
vi.mock("./roomLaunchAudio", async (original) => ({ ...await original<typeof import("./roomLaunchAudio")>(), saveRoomLaunchAudio: mocks.save }));
vi.mock("./createLiveRoom", () => ({ createLivePlace: mocks.createLive, createLiveCage: mocks.createCage }));
vi.mock("../place/RoomProductionPreparation", () => ({ default: ({ stage, onSetupChange, onReadinessChange }: { stage: string; onSetupChange: (value: unknown) => void; onReadinessChange?: (value: unknown) => void }) =>
  <div role="region" aria-label="Studio Meewav · préparation de la Room"><span>{stage}</span><button onClick={() => { onSetupChange({ cameraId: 'camera-qa', microphoneId: 'micro-qa', cameraIds: ['camera-qa'], layout: 'split' }); onReadinessChange?.({ video: true, microphone: true, music: false, pending: false }); }}>Préparer les sources QA</button></div> }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.navigate.mockClear();
  mocks.measure.mockResolvedValue(245);
  mocks.save.mockResolvedValue("/__meewav_room_launch_audio__/test-ui");
  mocks.createLive.mockResolvedValue('a8333bbe-dbb6-43d4-83bc-0a23b6bc00d3');
  mocks.createCage.mockResolvedValue('a8333bbe-dbb6-43d4-83bc-0a23b6bc00d3');
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:test-base"), revokeObjectURL: vi.fn() }));
});
afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals(); });

it('opens Studio inside the Desktop launch sequence after configuration and carries its setup into the Room', async () => {
  vi.stubGlobal('meewavDesktop', {
    version: 1,
    getCapabilities: async () => ({ runtime: 'desktop-windows', screenCapture: true, windowCapture: true, systemAudioCapture: false, professionalAudioDriver: false }),
  });
  render(<RuntimeProvider><RoomLaunchDialog closeRef={createRef()} onClose={() => undefined} /></RuntimeProvider>);
  fireEvent.click(screen.getByRole('button', { name: /^La Place/ }));
  fireEvent.change(screen.getByLabelText('Titre du direct'), { target: { value: 'Place QA' } });
  expect(await screen.findByLabelText('Sujet de la rencontre')).toBeVisible();
  expect(screen.queryByRole('region', { name: 'Studio Meewav · préparation de la Room' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Préparer OBS MiWave' }));
  expect(screen.getByRole('region', { name: 'Studio Meewav · préparation de la Room' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Préparer les sources QA' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
  expect(screen.getByRole('region', { name: 'Lancement de la Room' })).toBeVisible();
  expect(screen.queryByText('Résumé')).not.toBeInTheDocument();
  expect(screen.queryByText('Green Room')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Créer ma Room LIVE' }));
  await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/rooms/place?room=a8333bbe-dbb6-43d4-83bc-0a23b6bc00d3'));
  expect(mocks.createLive).toHaveBeenCalledOnce();
  expect(JSON.parse(sessionStorage.getItem('meewav:room-production-setup:v1:a8333bbe-dbb6-43d4-83bc-0a23b6bc00d3')!)).toEqual({
    cameraId: 'camera-qa', microphoneId: 'micro-qa', cameraIds: ['camera-qa'], layout: 'split',
  });
});

function settings() {
  render(<RoomLaunchDialog closeRef={createRef()} onClose={() => undefined} />);
  fireEvent.click(screen.getByRole("button", { name: /^La Wave/ }));
  fireEvent.change(screen.getByLabelText("Titre du direct"), { target: { value: "Beat collectif" } });
  fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
}

it.each([
  ['La Loge', 'Titre de l’avant-première'],
  ['La Classe', 'Tarif du cours'],
  ['La Scène', 'Programme · un titre par ligne'],
  ['La Wave', 'Tempo (BPM)'],
])('shows the existing %s configuration before Studio and preserves it on return', async (name, field) => {
  vi.stubGlobal('meewavDesktop', {
    version: 1,
    getCapabilities: async () => ({ runtime: 'desktop-windows', screenCapture: true, windowCapture: true, systemAudioCapture: false, professionalAudioDriver: false }),
  });
  render(<RuntimeProvider><RoomLaunchDialog closeRef={createRef()} onClose={() => undefined} /></RuntimeProvider>);
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));
  await screen.findByText('OBS MiWave');
  fireEvent.change(screen.getByLabelText('Titre du direct'), { target: { value: 'Configuration QA' } });
  expect(screen.getByLabelText(field)).toBeVisible();
  if (name === 'La Wave') {
    expect(screen.getByRole('button', { name: 'Préparer OBS MiWave' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Son long' }));
    fireEvent.change(screen.getByLabelText('Fichier de la boucle de base'), { target: { files: [new File(['audio'], 'base.wav', { type: 'audio/wav' })] } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Préparer OBS MiWave' })).toBeEnabled());
  }
  fireEvent.click(screen.getByRole('button', { name: 'Préparer OBS MiWave' }));
  expect(screen.getByRole('region', { name: 'Studio Meewav · préparation de la Room' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Retour' }));
  expect(screen.getByLabelText(field)).toBeVisible();
  if (name === 'La Wave') {
    expect(screen.getByText('base.wav')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Préparer OBS MiWave' })).toBeEnabled();
  }
});

it.each([/^Accès direct host/, /^Provisoire/])("opens each demo host via %s without creating a launch session", (shortcutName) => {
  const onClose = vi.fn();
  render(<RoomLaunchDialog closeRef={createRef()} onClose={onClose} />);
  const shortcuts = screen.getAllByRole("button", { name: shortcutName });
  expect(shortcuts).toHaveLength(6);
  shortcuts.forEach((button, index) => {
    fireEvent.click(button);
    expect(mocks.navigate).toHaveBeenLastCalledWith(
      expect.stringContaining(`/rooms/${["loge", "place", "wave", "cage", "classe", "scene"][index]}?demoRole=host&source=launch-preview&demoSession=`),
      { state: { roomsHomeReturnTo: "/rooms/home" } },
    );
  });
  expect(onClose).toHaveBeenCalledTimes(6);
  expect(localStorage.length).toBe(0);
  expect(mocks.save).not.toHaveBeenCalled();
});

it("requires verified audio and preserves a long base with an independent 4-bar contribution limit", async () => {
  settings();
  expect(screen.getByRole("button", { name: "Continuer" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Longueur maximale des instruments (mesures)"), { target: { value: "4" } });
  fireEvent.click(screen.getByRole("button", { name: "Son long" }));
  fireEvent.change(screen.getByLabelText("Fichier de la boucle de base"), { target: { files: [new File(["audio"], "piano.wav", { type: "audio/wav" })] } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Continuer" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
  fireEvent.click(screen.getByRole("button", { name: "Régler mon matériel" }));
  expect(mocks.navigate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Ouvrir ma régie" }));
  await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith(expect.stringContaining("/rooms/wave?launchSession=")));
  const saved = JSON.parse(localStorage.getItem(localStorage.key(0)!)!);
  expect(saved.configuration).toMatchObject({ values: { maxSubmissionBars: "4" }, baseLoop: { durationSeconds: 245, format: "long", mediaPath: "/__meewav_room_launch_audio__/test-ui" } });
  expect(saved.configuration.baseLoop.mediaUrl).toBeUndefined();
});

it("rejects unreadable audio and blocks launch again when the file is removed", async () => {
  settings(); mocks.measure.mockRejectedValueOnce(new Error("Fichier audio illisible"));
  const input = screen.getByLabelText("Fichier de la boucle de base");
  const file = new File(["audio"], "bad.wav", { type: "audio/wav" });
  fireEvent.change(input, { target: { files: [file] } });
  expect(await screen.findByRole("alert")).toHaveTextContent("illisible");
  expect(screen.getByRole("button", { name: "Continuer" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Son long" }));
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Continuer" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Retirer la boucle de base" }));
  expect(screen.getByRole("button", { name: "Continuer" })).toBeDisabled();
});

it('routes the Cage card to the full competition preparation', async () => {
  vi.stubGlobal('meewavDesktop', { version: 1, getCapabilities: async () => ({ runtime: 'desktop-windows', screenCapture: true, windowCapture: true, systemAudioCapture: false, professionalAudioDriver: false }) });
  render(<RuntimeProvider><RoomLaunchDialog closeRef={createRef()} onClose={() => undefined} /></RuntimeProvider>);
  fireEvent.click(screen.getByRole('button', { name: /^La Cage/ }));
  expect(await screen.findByRole('region', { name: 'Préparer La Cage complète' })).toBeVisible();
  expect(mocks.createCage).not.toHaveBeenCalled();
});
