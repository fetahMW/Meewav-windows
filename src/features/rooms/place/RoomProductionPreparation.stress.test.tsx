import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import RoomProductionPreparation from './RoomProductionPreparation';
import { readRoomDevicePreferences } from './roomDevicePreferences';
const mocks = vi.hoisted(() => ({ camera: vi.fn(), microphone: vi.fn(), music: vi.fn(), list: vi.fn(), screens: vi.fn(), screen: vi.fn(), captureAvailable: false }));
const dialogMethods = Object.fromEntries(['showModal', 'close'].map(key => [key, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, key)]));
vi.mock('../../../runtime/RuntimeProvider', () => ({ useRuntime: () => ({ canCaptureWindow: mocks.captureAvailable }) }));
vi.mock('../../../runtime/DesktopMediaDevices', () => ({ DesktopMediaDevices: class {
  enumerate = mocks.list; captureCamera = mocks.camera; captureMicrophone = mocks.microphone; captureMusic = mocks.music;
  screenSources = mocks.screens; captureScreen = mocks.screen;
  watch() { return () => {}; }
} }));
vi.mock('../../../runtime/RoomVideoProgram', () => ({ RoomVideoProgram: class {
  stream = {}; program = { layout: 'full', sourceIds: [] as string[] }; sources = new Map<string, MediaStream>();
  async add(id: string, stream: MediaStream) { this.sources.set(id, stream); }
  remove(id: string) { this.sources.delete(id); }
  clear() { this.sources.clear(); this.blank(); }
  blank() { this.program = { layout: 'full', sourceIds: [] }; }
  take(scene: typeof this.program) { this.program = structuredClone(scene); }
  hasSignal(id: string) { return this.sources.get(id)?.getVideoTracks().some(t => t.readyState === 'live' && !t.muted); }
  dispose() { this.clear(); }
} }));
function capture(kind = 'video') {
  const track = Object.assign(new EventTarget(), { kind, readyState: 'live', muted: false, enabled: true, stop: vi.fn(), getSettings: () => ({}) });
  track.stop.mockImplementation(() => { track.readyState = 'ended'; });
  return { track, stream: { getTracks: () => [track], getVideoTracks: () => kind === 'video' ? [track] : [], getAudioTracks: () => kind === 'audio' ? [track] : [] } as unknown as MediaStream };
}
function setup(onStart = vi.fn(), onStop = vi.fn()) {
  return { onStart, onStop, ...render(<RoomProductionPreparation roomId="qa" liveRoom onAir={false} publicationStatus="disconnected" onStart={onStart} onStop={onStop} />) };
}
async function addCamera() {
  await choose('Périphérique vidéo', 'Caméra QA');
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter cette caméra' }));
}
async function choose(label: string, option: string) {
  fireEvent.click(screen.getByRole('combobox', { name: label }));
  fireEvent.click(await screen.findByRole('option', { name: option }));
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.captureAvailable = false;
  localStorage.clear();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  mocks.list.mockResolvedValue([{ kind: 'videoinput', deviceId: 'cam', label: 'Caméra QA' }, { kind: 'audioinput', deviceId: 'mic', label: 'Micro QA' }]);
});
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  for (const [key, descriptor] of Object.entries(dialogMethods)) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, key, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, key);
  }
});
it('cancels delayed permission after releasing sources and prevents a stale camera returning', async () => {
  let resolve!: (stream: MediaStream) => void;
  mocks.camera.mockImplementation(() => new Promise<MediaStream>(done => { resolve = done; }));
  setup(); await addCamera();
  expect(screen.getByLabelText('Périphérique vidéo')).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Libérer les sources' }));
  const source = capture();
  await act(async () => { resolve(source.stream); });
  expect(source.track.stop).toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Retirer Caméra QA' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Passer en direct' })).toBeDisabled();
});
it('cleans up a capture resolving after the artist leaves the studio', async () => {
  let resolve!: (stream: MediaStream) => void;
  mocks.camera.mockImplementation(() => new Promise<MediaStream>(done => { resolve = done; }));
  const view = setup(); await addCamera(); view.unmount();
  const source = capture(); await act(async () => { resolve(source.stream); });
  expect(source.track.stop).toHaveBeenCalled();
});
it('explains denied permission and allows retry without duplicate acquisition', async () => {
  mocks.camera.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError')).mockResolvedValueOnce(capture().stream);
  setup(); await addCamera();
  expect(await screen.findByRole('alert')).toHaveTextContent('Accès refusé');
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter cette caméra' }));
  await screen.findByRole('button', { name: 'Retirer Caméra QA' });
  expect(mocks.camera).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('invalidates the prepared output on unplugging a camera and preserves the rest of the studio', async () => {
  const source = capture(); mocks.camera.mockResolvedValue(source.stream);
  setup(); await addCamera(); await screen.findByRole('button', { name: 'Retirer Caméra QA' });
  fireEvent.click(screen.getByRole('button', { name: 'Appliquer le plan' }));
  expect(screen.getByRole('button', { name: 'Passer en direct' })).toBeEnabled();
  act(() => { source.track.readyState = 'ended'; source.track.dispatchEvent(new Event('ended')); });
  expect(screen.getByRole('alert')).toHaveTextContent('déconnectée');
  expect(screen.getByRole('button', { name: 'Passer en direct' })).toBeDisabled();
});
it('persists the selected microphone before starting and rejects repeated start clicks', async () => {
  mocks.camera.mockResolvedValue(capture().stream);
  const start = vi.fn(() => { expect(readRoomDevicePreferences().microphoneId).toBe('mic'); return true; });
  setup(start); await addCamera(); await screen.findByRole('button', { name: 'Retirer Caméra QA' });
  await choose('Micro / interface audio Windows', 'Micro QA');
  fireEvent.click(screen.getByRole('button', { name: 'Appliquer le plan' }));
  const button = screen.getByRole('button', { name: 'Passer en direct' });
  fireEvent.click(button); fireEvent.click(button);
  await waitFor(() => expect(start).toHaveBeenCalledOnce()); expect(button).toBeDisabled();
});
it('releases microphone when Web Audio creation fails', async () => {
  const source = capture('audio'); mocks.microphone.mockResolvedValue(source.stream);
  vi.stubGlobal('AudioContext', class { constructor() { throw new Error('Audio indisponible'); } });
  setup(); await choose('Micro / interface audio Windows', 'Micro QA');
  fireEvent.click(screen.getByRole('button', { name: 'Tester le micro' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Audio indisponible');
  expect(source.track.stop).toHaveBeenCalled();
});
it('survives 20 add/remove cycles with exactly one active camera at a time', async () => {
  const captures = Array.from({ length: 20 }, () => capture());
  captures.forEach(item => mocks.camera.mockResolvedValueOnce(item.stream));
  setup();
  for (const item of captures) {
    await addCamera();
    const remove = await screen.findByRole('button', { name: 'Retirer Caméra QA' });
    fireEvent.click(remove);
    expect(item.track.stop).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Retirer Caméra QA' })).not.toBeInTheDocument();
  }
}, 15000);

it('stops broadcasting without discarding the prepared cameras and composition', async () => {
  const source = capture(); mocks.camera.mockResolvedValue(source.stream);
  const view = setup(); await addCamera(); await screen.findByRole('button', { name: 'Retirer Caméra QA' });
  fireEvent.click(screen.getByRole('button', { name: 'Appliquer le plan' }));
  view.rerender(<RoomProductionPreparation roomId="qa" liveRoom onAir publicationStatus="connected" onStart={view.onStart} onStop={view.onStop} />);
  fireEvent.click(screen.getByRole('button', { name: 'Arrêter la diffusion' }));
  expect(view.onStop).toHaveBeenCalledOnce();
  expect(source.track.stop).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Retirer Caméra QA' })).toBeInTheDocument();
});

it('uses the existing room voice engine and channel controls instead of acquiring a second microphone', async () => {
  const voice = capture('audio');
  const roomAudio = {
    levels: { voiceGain: .7, voiceMuted: false, musicGain: .5, musicMuted: false },
    voiceStream: null, voiceDeviceId: 'mic', monitoring: false,
    onChange: vi.fn(), onToggleMonitoring: vi.fn(), prepareMicrophone: vi.fn().mockResolvedValue(undefined),
    startVoicePreview: vi.fn().mockResolvedValue(voice.stream), onOpenEffects: vi.fn(),
  };
  const onStart = vi.fn();
  render(<RoomProductionPreparation roomId="qa" liveRoom onAir={false} publicationStatus="disconnected" onStart={onStart} onStop={vi.fn()} roomAudio={roomAudio} />);
  await choose('Micro / interface audio Windows', 'Micro QA');
  fireEvent.click(screen.getByRole('button', { name: 'Tester le micro' }));
  await waitFor(() => expect(roomAudio.startVoicePreview).toHaveBeenCalledOnce());
  expect(roomAudio.prepareMicrophone).toHaveBeenCalledOnce();
  expect(mocks.microphone).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('slider', { name: 'Volume · Ma voix' }), { target: { value: '-6' } });
  expect(roomAudio.onChange).toHaveBeenLastCalledWith({ voiceGain: expect.closeTo(.501187, 5) });
  fireEvent.click(screen.getByRole('button', { name: 'Couper · Ma voix' }));
  expect(roomAudio.onChange).toHaveBeenLastCalledWith({ voiceMuted: true });
  fireEvent.click(screen.getByRole('button', { name: 'Effets de ma voix' }));
  expect(roomAudio.onOpenEffects).toHaveBeenCalledOnce();
  expect(onStart).not.toHaveBeenCalled();
});

it('offers split immediately, requires two cameras and keeps preparation private until explicit start', async () => {
  mocks.list.mockResolvedValue([
    { kind: 'videoinput', deviceId: 'cam', label: 'Caméra QA' },
    { kind: 'videoinput', deviceId: 'instrument', label: 'Caméra instrument' },
  ]);
  const first = capture(), second = capture();
  mocks.camera.mockResolvedValueOnce(first.stream).mockResolvedValueOnce(second.stream);
  const view = setup();
  fireEvent.click(screen.getByRole('button', { name: /Écran fractionné/ }));
  expect(screen.getByRole('combobox', { name: 'Source de la zone B' })).toBeVisible();
  await addCamera(); await screen.findByRole('button', { name: 'Retirer Caméra QA' });
  expect(screen.getByRole('button', { name: 'Appliquer le plan' })).toBeDisabled();
  await choose('Périphérique vidéo', 'Caméra instrument');
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter cette caméra' }));
  await screen.findByRole('button', { name: 'Retirer Caméra instrument' });
  expect(mocks.camera.mock.calls.map(call => call[0])).toEqual(['cam', 'instrument']);
  expect(screen.getByRole('combobox', { name: 'Source de la zone B' })).toHaveTextContent('Caméra instrument');
  // Swap the two views without reacquiring either camera.
  await choose('Source de la zone A', 'Caméra instrument');
  await choose('Source de la zone B', 'Caméra QA');
  expect(mocks.camera).toHaveBeenCalledTimes(2);
  fireEvent.change(screen.getByRole('slider', { name: 'Position du séparateur A B' }), { target: { value: '65' } });
  fireEvent.click(screen.getByRole('button', { name: 'Appliquer le plan' }));
  expect(view.onStart).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Passer en direct' }));
  await waitFor(() => expect(view.onStart).toHaveBeenCalledOnce());
  view.unmount();
  expect(first.track.stop).toHaveBeenCalledOnce(); expect(second.track.stop).toHaveBeenCalledOnce();
});

async function openCapturePicker() {
  mocks.captureAvailable = true;
  mocks.screens.mockResolvedValue([
    { id: 'screen:1:0', name: 'Écran principal', thumbnail: '' },
    { id: 'screen:2:0', name: 'Écran studio', thumbnail: '' },
    { id: 'window:8:0', name: 'Logiciel musical', thumbnail: '' },
  ]);
  // jsdom has no top layer; emulate the native dialog's open state only.
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } });
  const view = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Choisir un partage' }));
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Logiciel musical' })).toBeEnabled());
  return { ...view, dialog };
}

it('chooses a specific window by thumbnail without publishing or sharing audio', async () => {
  const source = capture(); mocks.screen.mockResolvedValue(source.stream);
  const view = await openCapturePicker();
  fireEvent.click(within(view.dialog).getByRole('button', { name: 'Fenêtres' }));
  expect(within(view.dialog).queryByRole('button', { name: 'Écran principal' })).not.toBeInTheDocument();
  fireEvent.click(within(view.dialog).getByRole('button', { name: 'Logiciel musical' }));
  expect(mocks.screen).not.toHaveBeenCalled();
  fireEvent.click(within(view.dialog).getByRole('button', { name: 'Ajouter à l’aperçu' }));
  await screen.findByRole('button', { name: 'Retirer Logiciel musical' });
  expect(mocks.screen).toHaveBeenCalledOnce();
  expect(mocks.screen).toHaveBeenCalledWith('window:8:0', false);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(view.onStart).not.toHaveBeenCalled();
  view.unmount(); expect(source.track.stop).toHaveBeenCalledOnce();
});

it('clears stale capture choices on refresh and lets the artist cancel without capturing', async () => {
  const { dialog } = await openCapturePicker();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Écran studio' }));
  mocks.screens.mockResolvedValue([]);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Actualiser' }));
  await waitFor(() => expect(within(dialog).queryByRole('button', { name: 'Écran studio' })).not.toBeInTheDocument());
  expect(within(dialog).getByRole('button', { name: 'Ajouter à l’aperçu' })).toBeDisabled();
  const parentKeys = vi.fn();
  document.addEventListener('keydown', parentKeys);
  try {
    fireEvent.keyDown(dialog, { key: 'Tab' });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(parentKeys).not.toHaveBeenCalled();
  } finally { document.removeEventListener('keydown', parentKeys); }
  fireEvent(dialog, new Event('cancel', { bubbles: false, cancelable: true }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(mocks.screen).not.toHaveBeenCalled();
});

it('keeps a capture failure visible in the modal and allows a retry', async () => {
  mocks.screen.mockRejectedValueOnce(new Error('Fenêtre fermée')).mockResolvedValueOnce(capture().stream);
  const { dialog } = await openCapturePicker();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Logiciel musical' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Ajouter à l’aperçu' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Fenêtre fermée');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Ajouter à l’aperçu' }));
  await screen.findByRole('button', { name: 'Retirer Logiciel musical' });
  expect(mocks.screen).toHaveBeenCalledTimes(2);
});
