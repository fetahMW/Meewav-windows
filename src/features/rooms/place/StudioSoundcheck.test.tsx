import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import StudioSoundcheck from './StudioSoundcheck';

const outputStop = vi.fn();
const close = vi.fn().mockResolvedValue(undefined);
class Recorder {
  static current: Recorder;
  static isTypeSupported = () => true;
  state = 'inactive'; mimeType = 'video/webm';
  onstop: (() => void) | null = null;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { Recorder.current = this; }
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['test'], { type: this.mimeType }) }); this.onstop?.(); }
}
function input(kind = 'audio') {
  return Object.assign(new EventTarget(), { id: kind, readyState: 'live', kind, stop: vi.fn() }) as unknown as MediaStreamTrack;
}
beforeEach(() => {
  vi.clearAllMocks();
  close.mockResolvedValue(undefined);
  vi.stubGlobal('MediaRecorder', Recorder);
  vi.stubGlobal('MediaStream', class {});
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  vi.stubGlobal('AudioContext', class {
    state = 'running'; resume = vi.fn().mockResolvedValue(undefined); close = close;
    createMediaStreamSource = node;
    createMediaStreamDestination = () => ({ ...node(), stream: { getAudioTracks: () => [{ kind: 'audio' }], getTracks: () => [{ stop: outputStop }] } });
    createDynamicsCompressor = () => ({ ...node(), threshold: {}, ratio: {}, knee: {}, attack: {}, release: {} });
  });
  URL.createObjectURL = vi.fn(() => 'blob:private-rehearsal'); URL.revokeObjectURL = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('records a local rehearsal, offers the actual file and never stops borrowed input tracks', async () => {
  const voice = input(); const camera = input('video');
  const view = render(<StudioSoundcheck video={{ id: 'video', getVideoTracks: () => [camera] } as MediaStream} voice={voice} music={null} onAir={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer un essai' }));
  fireEvent.click(await screen.findByRole('button', { name: /Arrêter/ }));
  expect(screen.getByRole('link', { name: 'Télécharger l’essai' })).toHaveAttribute('href', 'blob:private-rehearsal');
  expect(outputStop).toHaveBeenCalledOnce();
  expect(voice.stop).not.toHaveBeenCalled(); expect(camera.stop).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Effacer' }));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-rehearsal');
  view.unmount();
});

it('cancels a rehearsal when broadcast starts and cleans the local recorder', async () => {
  const voice = input();
  const view = render(<StudioSoundcheck video={null} voice={voice} music={null} onAir={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer un essai' }));
  await screen.findByRole('button', { name: /Arrêter/ });
  view.rerender(<StudioSoundcheck video={null} voice={voice} music={null} onAir />);
  expect(Recorder.current.state).toBe('inactive');
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Enregistrer un essai' })).toBeDisabled();
  expect(voice.stop).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
});

it('ends and preserves a partial rehearsal when an input is disconnected', async () => {
  const voice = input();
  render(<StudioSoundcheck video={null} voice={voice} music={null} onAir={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer un essai' }));
  await screen.findByRole('button', { name: /Arrêter/ });
  act(() => voice.dispatchEvent(new Event('ended')));
  await waitFor(() => expect(screen.getByRole('link')).toHaveAttribute('download', 'meewav-essai.webm'));
  expect(outputStop).toHaveBeenCalledOnce();
});

it('limits private recordings to thirty seconds', async () => {
  vi.useFakeTimers();
  render(<StudioSoundcheck video={null} voice={input()} music={null} onAir={false} />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Enregistrer un essai' })); });
  expect(Recorder.current.state).toBe('recording');
  act(() => { vi.advanceTimersByTime(30_000); });
  expect(Recorder.current.state).toBe('inactive');
  expect(screen.getByRole('link', { name: 'Télécharger l’essai' })).toBeInTheDocument();
});
