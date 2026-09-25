import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { requestPlaceLiveKitAccess } from './placeLiveKit.service';

const ROOM_ID = '5da0f3e9-4009-4d5c-ab47-6d680e369ba3';

describe('Place LiveKit access', () => {
  it('reports the deployed legacy grant contract without retrying an unsafe client-selected identity', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: null, error: {
      context: new Response(JSON.stringify({ error: 'roomName et identity requis' }), { status: 400 }),
    } });
    const client = { functions: { invoke } } as unknown as SupabaseClient;

    await expect(requestPlaceLiveKitAccess(ROOM_ID, client)).rejects.toThrow('La vidéo LIVE attend une mise à jour du serveur MeeWav');
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('livekit-token', { body: { roomId: ROOM_ID } });
  });
});
