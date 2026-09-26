import { supabase } from '../../../lib/supabaseClient';
import { validateRoomLaunch, type RoomLaunchConfiguration } from './roomLaunch';
import { prepareLiveWaveSwitch } from '../switch-room/switchRoom.wave';

/** Atomic, idempotent creation. A Wave remains private until its base is READY. */
export async function createLiveRoom(config: RoomLaunchConfiguration, requestId: string) {
  const invalid=validateRoomLaunch(config);
  if(invalid)throw new Error(invalid);
  if(config.access!=='public')throw new Error('Choisis un accès public pour cette room.');
  const {data,error}=await supabase.rpc('rooms_create_desktop_v1',{p_configuration:config,p_request_id:requestId});
  if(error)throw new Error(error.message.includes('launch_request_conflict') ? 'Cette préparation a changé. Ferme le lancement puis recommence avec les nouveaux réglages.' : 'Création LIVE non confirmée. Réessaie pour reprendre la même room.');
  if(data?.id!==requestId)throw new Error('Le serveur n’a pas confirmé la room demandée.');
  if(config.roomType==='wave'&&!data.ready){
    await prepareLiveWaveSwitch(requestId,{roomId:requestId,current:'place',from:'place',version:data.version,changeId:null,changedAt:null,acceptedVersion:0,available:true},{launch:config},requestId);
    const completed=await supabase.rpc('rooms_complete_desktop_wave_v1',{p_room_id:requestId,p_request_id:requestId});
    if(completed.error||completed.data!==requestId)throw new Error('La Wave reste en préparation privée. Réessaie pour confirmer sa mise en direct.');
  }
  return requestId;
}
export async function createLivePlace(config:RoomLaunchConfiguration,requestId:string){
  if(config.roomType!=='place')throw new Error('Choisis La Place.');
  return createLiveRoom(config,requestId);
}
