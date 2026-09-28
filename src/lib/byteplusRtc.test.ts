import {afterEach,describe,expect,it,vi} from 'vitest';
import type {IRTCEngine} from '@byteplus/rtc';
import {Room,Track,type BytePlusAccess} from './byteplusRtc';

const access:BytePlusAccess={appId:'test',token:'001testtoken',roomName:'room-test',roomId:'room',identity:'host',role:'host',canPublish:true,
  expiresAt:new Date(Date.now()+120_000).toISOString(),members:[{identity:'artist',role:'guest',canPublish:true,canReceive:true}]};
function media(kind='audio',enabled=true){return {kind,enabled,readyState:'live',stop:vi.fn()} as unknown as MediaStreamTrack;}
function fixture(){
  const listeners=new Map<string,(...args:any[])=>void>();
  const remote=media(),mix=media();
  const sdk={on:vi.fn((name,fn)=>listeners.set(name,fn)),joinRoom:vi.fn().mockResolvedValue(undefined),leaveRoom:vi.fn().mockResolvedValue(undefined),
    setAudioProfile:vi.fn().mockResolvedValue(undefined),setAudioSourceType:vi.fn().mockResolvedValue(undefined),setExternalAudioTrack:vi.fn().mockResolvedValue(undefined),
    publishStream:vi.fn().mockResolvedValue(undefined),unpublishStream:vi.fn().mockResolvedValue(undefined),
    setPlaybackVolume:vi.fn(),subscribeStream:vi.fn().mockResolvedValue(undefined),unsubscribeStream:vi.fn().mockResolvedValue(undefined),
    subscribeScreen:vi.fn().mockResolvedValue(undefined),unsubscribeScreen:vi.fn().mockResolvedValue(undefined),
    getRemoteStreamTrack:vi.fn(()=>remote),updateToken:vi.fn().mockResolvedValue(undefined)};
  const gains:Array<{gain:{value:number};connect:ReturnType<typeof vi.fn>;disconnect:ReturnType<typeof vi.fn>}>=[];
  const context={createMediaStreamDestination:()=>({stream:{getAudioTracks:()=>[mix],getTracks:()=>[mix]}}),
    createMediaStreamSource:()=>({connect:vi.fn((target)=>target),disconnect:vi.fn()}),
    createGain:()=>{const gain={gain:{value:1},connect:vi.fn((target)=>target),disconnect:vi.fn()};gains.push(gain);return gain;},
    resume:vi.fn().mockResolvedValue(undefined),close:vi.fn().mockResolvedValue(undefined)};
  const destroy=vi.fn(),refresh=vi.fn().mockResolvedValue(access);
  const room=new Room({engineFactory:async()=>({engine:sdk as unknown as IRTCEngine,destroy}),audioContextFactory:()=>context as unknown as AudioContext});
  vi.stubGlobal('MediaStream',class{constructor(public tracks:MediaStreamTrack[]){}getTracks(){return this.tracks;}});
  return {room,sdk,destroy,refresh,context,gains,emit:(event:string,value?:unknown)=>listeners.get(event)?.(value)};
}
afterEach(()=>vi.unstubAllGlobals());
describe('BytePlus transport réel du studio',()=>{
  it('mixe les entrées logiques sur MAIN sans ouvrir la préécoute muette',async()=>{
    const f=fixture();await f.room.connect(access.appId,access.token,{access});
    const voice=media('audio',false),music=media();
    const v=await f.room.localParticipant.publishTrack(voice,{name:'meewav.voice',source:Track.Source.Microphone});
    const m=await f.room.localParticipant.publishTrack(music,{name:'meewav.music',source:Track.Source.Microphone});
    expect(f.sdk.setAudioSourceType).toHaveBeenCalledWith(0,0);
    expect(f.sdk.publishStream).toHaveBeenCalledTimes(1);
    expect(f.gains.map(g=>g.gain.value)).toEqual([0,1]);
    await v.unmute();expect(f.gains[0].gain.value).toBe(1);
    await m.mute();expect(f.gains[1].gain.value).toBe(0);
    await f.room.localParticipant.unpublishTrack(voice);expect(f.sdk.unpublishStream).not.toHaveBeenCalled();
    await f.room.disconnect();expect(voice.stop).not.toHaveBeenCalled();expect(music.stop).not.toHaveBeenCalled();expect(f.destroy).toHaveBeenCalledOnce();
  });
  it('ignore les annonces de pairs sans autorisation serveur',async()=>{
    const f=fixture();await f.room.connect(access.appId,access.token,{access,refreshAccess:f.refresh});
    f.emit('onUserPublishStream',{userId:'intruder',mediaType:1});
    await vi.waitFor(()=>expect(f.refresh).toHaveBeenCalled());
    expect(f.sdk.subscribeStream).not.toHaveBeenCalled();
    f.emit('onUserPublishStream',{userId:'artist',mediaType:1});
    await vi.waitFor(()=>expect(f.sdk.subscribeStream).toHaveBeenCalledWith('artist',1));
    expect(f.sdk.setPlaybackVolume).toHaveBeenCalledWith('artist',0,0);
    await f.room.disconnect();
  });
  it('ferme immédiatement les entrées et abonnements révoqués à la mise à jour',async()=>{
    const f=fixture();await f.room.connect(access.appId,access.token,{access,refreshAccess:f.refresh});
    const voice=media();await f.room.localParticipant.publishTrack(voice,{name:'voice'});
    f.emit('onUserPublishStream',{userId:'artist',mediaType:1});
    await vi.waitFor(()=>expect(f.room.remoteParticipants.get('artist')?.trackPublications.size).toBe(1));
    f.refresh.mockResolvedValue({...access,canPublish:false,members:[]});f.emit('onTokenWillExpire');
    await vi.waitFor(()=>expect(voice.enabled).toBe(false));
    expect(f.gains[0].gain.value).toBe(0);
    await vi.waitFor(()=>expect(f.sdk.unsubscribeStream).toHaveBeenCalledWith('artist',3));
    await f.room.disconnect();
  });
  it('refuse la publication locale pour un viewer',async()=>{
    const f=fixture();await f.room.connect(access.appId,access.token,{access:{...access,role:'viewer',canPublish:false}});
    await expect(f.room.localParticipant.publishTrack(media())).rejects.toThrow('non autorisée');
    expect(f.sdk.publishStream).not.toHaveBeenCalled();await f.room.disconnect();
  });
  it('annule une ouverture de caméra en attente lorsque le bouton est coupé',async()=>{
    const f=fixture();await f.room.connect(access.appId,access.token,{access});
    const camera=media('video');let release!:(stream:MediaStream)=>void;
    vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:vi.fn(()=>new Promise<MediaStream>(resolve=>{release=resolve;}))}});
    const pending=f.room.setCameraEnabled(true);
    await f.room.setCameraEnabled(false);
    release({getTracks:()=>[camera],getVideoTracks:()=>[camera]} as unknown as MediaStream);
    await pending;
    expect(camera.stop).toHaveBeenCalledOnce();
    expect(f.room.localParticipant.videoTrackPublications.size).toBe(0);
    await f.room.disconnect();
  });
  it('ferme le micro si le SDK refuse le renouvellement des droits',async()=>{
    const f=fixture();await f.room.connect(access.appId,access.token,{access,refreshAccess:f.refresh});
    const voice=media();await f.room.localParticipant.publishTrack(voice,{name:'voice'});
    f.refresh.mockResolvedValue({...access,token:'new-token',canPublish:false});
    f.sdk.updateToken.mockRejectedValueOnce(new Error('denied'));
    f.emit('onTokenWillExpire');
    await vi.waitFor(()=>expect(voice.enabled).toBe(false));
    await vi.waitFor(()=>expect(f.destroy).toHaveBeenCalledOnce());
    expect(f.room.localParticipant.permissions.canPublish).toBe(false);
  });
});
