import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import RoomProductionPreparation from './RoomProductionPreparation';
import { readRoomDevicePreferences } from './roomDevicePreferences';
const mocks = vi.hoisted(() => ({ camera: vi.fn(), microphone: vi.fn(), music: vi.fn(), list: vi.fn() }));
vi.mock('../../../runtime/RuntimeProvider', () => ({ useRuntime: () => ({ canCaptureWindow: false }) }));
vi.mock('../../../runtime/DesktopMediaDevices', () => ({ DesktopMediaDevices: class {
  enumerate = mocks.list; captureCamera = mocks.camera; captureMicrophone = mocks.microphone; captureMusic = mocks.music;
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
  await screen.findByRole('option', { name: 'Caméra QA' });
  fireEvent.change(screen.getByLabelText('Périphérique vidéo'), { target: { value: 'cam' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter cette caméra' }));
}
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  mocks.list.mockResolvedValue([{ kind: 'videoinput', deviceId: 'cam', label: 'Caméra QA' }, { kind: 'audioinput', deviceId: 'mic', label: 'Micro QA' }]);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
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
  fireEvent.change(screen.getByLabelText('Micro / interface audio Windows'), { target: { value: 'mic' } });
  fireEvent.click(screen.getByRole('button', { name: 'Appliquer le plan' }));
  const button = screen.getByRole('button', { name: 'Passer en direct' });
  fireEvent.click(button); fireEvent.click(button);
  expect(start).toHaveBeenCalledOnce(); expect(button).toBeDisabled();
});
it('releases microphone when Web Audio creation fails', async () => {
  const source = capture('audio'); mocks.microphone.mockResolvedValue(source.stream);
  vi.stubGlobal('AudioContext', class { constructor() { throw new Error('Audio indisponible'); } });
  setup(); await screen.findAllByRole('option', { name: 'Micro QA' });
  fireEvent.change(screen.getByLabelText('Micro / interface audio Windows'), { target: { value: 'mic' } });
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
});

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
