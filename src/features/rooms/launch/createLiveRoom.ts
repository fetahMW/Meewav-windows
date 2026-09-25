import { supabase } from '../../../lib/supabaseClient';
import type { RoomLaunchConfiguration } from './roomLaunch';
import { validateRoomLaunch } from './roomLaunch';

/** Same rooms_v2 + host enrollment contract as Android liveRooms.ts.
 * Keep a caller-owned UUID across retries: a lost response must not create another Room.
 */
export async function createLivePlace(config: RoomLaunchConfiguration, requestId: string) {
  const invalid = validateRoomLaunch(config);
  if (invalid) throw new Error(invalid);
  if (config.roomType !== 'place') throw new Error('La création LIVE de cette expérience attend le raccordement de ses réglages.');
  if (config.access !== 'public') throw new Error('Le contrat LIVE actuel ne garantit pas un accès privé. Choisis Public ou conserve la préparation locale.');
  if (String(config.values.topic || '').trim()) throw new Error('Le sujet séparé n’est pas enregistré par le contrat LIVE actuel. Utilise le champ Présentation.');
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Connecte-toi pour ouvrir une Room.');
  const existing = await supabase.from('rooms_v2').select('id,host_id,type,status').eq('id', requestId).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    if (existing.data.host_id !== user.id || existing.data.type !== 'place' || existing.data.status !== 'live') throw new Error('Cette demande correspond à une Room indisponible.');
  } else {
    const result = await supabase.from('rooms_v2').insert({
      id: requestId, host_id: user.id, type: 'place', title: config.title.trim(),
      description: config.description.trim() || null, status: 'live',
      livekit_room_name: `room-${requestId}`, queue_open: Boolean(config.values.queueOpen), video_format: 'landscape',
    }).select('id').single();
    if (result.error) throw result.error;
    if (result.data?.id !== requestId) throw new Error('Création non confirmée. Réessaie avec la même demande.');
  }
  const membership = await supabase.from('room_participants_v2').upsert({
    room_id: requestId, user_id: user.id, role: 'host', left_at: null,
  }, { onConflict: 'room_id,user_id' });
  if (membership.error) throw membership.error;
  return requestId;
}
