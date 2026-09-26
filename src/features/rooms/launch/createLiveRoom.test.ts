import { beforeEach, describe, expect, it, vi } from 'vitest';
const backend=vi.hoisted(()=>({rpc:vi.fn(),prepare:vi.fn()}));
vi.mock('../../../lib/supabaseClient',()=>({supabase:{rpc:backend.rpc}}));
vi.mock('../switch-room/switchRoom.wave',()=>({prepareLiveWaveSwitch:backend.prepare}));
import {createLivePlace,createLiveRoom} from './createLiveRoom';
import {defaultRoomLaunch} from './roomLaunch';
beforeEach(()=>vi.resetAllMocks());
describe('Création LIVE atomique',()=>{
  it('refuse de transformer une demande privée en room publique',async()=>{
    await expect(createLivePlace({...defaultRoomLaunch('place'),title:'QA',access:'invitation'},'request')).rejects.toThrow('accès public');
    expect(backend.rpc).not.toHaveBeenCalled();
  });
  it.each(['place','scene','classe','loge'] as const)('reprend la même demande %s sans écriture client séparée',async kind=>{
    const config={...defaultRoomLaunch(kind),title:'QA'};
    backend.rpc.mockResolvedValue({data:{id:'request',ready:true,version:0},error:null});
    await expect(createLiveRoom(config,'request')).resolves.toBe('request');
    await expect(createLiveRoom(config,'request')).resolves.toBe('request');
    expect(backend.rpc).toHaveBeenCalledWith('rooms_create_desktop_v1',{p_configuration:config,p_request_id:'request'});
    expect(backend.prepare).not.toHaveBeenCalled();
  });
  it('ne navigue jamais vers une création non confirmée',async()=>{
    backend.rpc.mockResolvedValue({data:null,error:{message:'network'}});
    await expect(createLivePlace({...defaultRoomLaunch('place'),title:'QA'},'request')).rejects.toThrow('non confirmée');
  });
});
