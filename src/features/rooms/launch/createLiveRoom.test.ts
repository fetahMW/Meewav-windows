import { beforeEach, describe, expect, it, vi } from 'vitest';
const backend = vi.hoisted(() => ({ from: vi.fn(), getUser: vi.fn() }));
vi.mock('../../../lib/supabaseClient', () => ({ supabase: { from: backend.from, auth: { getUser: backend.getUser } } }));
import { createLivePlace } from './createLiveRoom';
import { defaultRoomLaunch } from './roomLaunch';
beforeEach(() => vi.resetAllMocks());
describe('Generic LIVE contract', () => {
  it('never opens a publicly accessible Room requested as private', async () => {
    const config = { ...defaultRoomLaunch('place'), title: 'QA', access: 'invitation' as const };
    await expect(createLivePlace(config, 'request')).rejects.toThrow('accès privé');
    expect(backend.from).not.toHaveBeenCalled();
  });
  it('retries enrollment on the same Room without inserting a duplicate', async () => {
    backend.getUser.mockResolvedValue({ data: { user: { id: 'host' } }, error: null });
    const insert = vi.fn();
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'request', host_id: 'host', type: 'place', status: 'live' }, error: null });
    backend.from.mockImplementation((table) => table === 'rooms_v2' ? { select: () => ({ eq: () => ({ maybeSingle }) }), insert } : { upsert });
    await expect(createLivePlace({ ...defaultRoomLaunch('place'), title: 'QA' }, 'request')).resolves.toBe('request');
    expect(insert).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledWith({ room_id: 'request', user_id: 'host', role: 'host', left_at: null }, { onConflict: 'room_id,user_id' });
  });
});

it('opens a Cage with the same empty-room contract as iOS and enrolls its host', async () => {
  const { createLiveCage } = await import('./createLiveRoom');
  backend.getUser.mockResolvedValue({ data: { user: { id: 'host' } }, error: null });
  const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  const single = vi.fn().mockResolvedValue({ data: { id: 'request' }, error: null });
  const insert = vi.fn(() => ({ select: () => ({ single }) }));
  const upsert = vi.fn().mockResolvedValue({ error: null });
  backend.from.mockImplementation(table => table === 'rooms_v2' ? { select: () => ({ eq: () => ({ maybeSingle }) }), insert } : { upsert });
  await expect(createLiveCage({ ...defaultRoomLaunch('cage'), title: 'Cage artistes' }, 'request')).resolves.toBe('request');
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({ type: 'cage', queue_open: false, status: 'live', video_format: 'landscape' }));
  expect(upsert).toHaveBeenCalledOnce();
});
it('refuses private Cage publication before making any backend call', async () => {
  const { createLiveCage } = await import('./createLiveRoom');
  await expect(createLiveCage({ ...defaultRoomLaunch('cage'), title: 'Privée', access: 'invitation' }, 'request')).rejects.toThrow('accès privé');
  expect(backend.from).not.toHaveBeenCalled();
});
