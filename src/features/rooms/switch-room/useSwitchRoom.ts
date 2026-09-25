import {useCallback,useEffect,useRef,useState} from "react";
import type {PlaceRoomState} from "../place/place.types";
import {switchRoomService} from "./switchRoom.service";
import type {Experience,SwitchConfig,SwitchState} from "./switchRoom.domain";
export function useSwitchRoom(room:PlaceRoomState,initial:Experience,actor:string,isHost:boolean,enabled:boolean){
 const [displayed,setDisplayed]=useState<Experience>(initial);
 const [state,setState]=useState<SwitchState|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[deferred,setDeferred]=useState<number|null>(null),[fresh,setFresh]=useState(false);
 const inflight=useRef(false),epoch=useRef(0),request=useRef<{id:string;version:number;target:Experience;signature:string}|null>(null);
 const refresh=useCallback(async()=>{const generation=epoch.current;try{const next=await switchRoomService.get(room,initial,actor);if(generation!==epoch.current)return;setState(old=>!old||next.version>=old.version?next:old);if(isHost||next.acceptedVersion>=next.version)setDisplayed(next.current);setFresh(true);}catch(e){if(generation===epoch.current){setFresh(false);setError((e as Error).message);}}},[room.id,room.source,room.host.id,initial,actor,isHost]);
 useEffect(()=>{epoch.current++;setState(null);setDisplayed(initial);setError("");setDeferred(null);setFresh(false);if(!enabled)return;void refresh();const stop=switchRoomService.subscribe(room,()=>void refresh());const resume=()=>{setFresh(false);void refresh();};window.addEventListener("online",resume);const visibility=()=>{if(document.visibilityState==="visible")resume();};document.addEventListener("visibilitychange",visibility);const timer=setInterval(()=>void refresh(),15000);return()=>{epoch.current++;stop();clearInterval(timer);window.removeEventListener("online",resume);document.removeEventListener("visibilitychange",visibility);};},[refresh,enabled]);
 const commit=async(target:Experience,config?:SwitchConfig)=>{if(inflight.current||!state||!isHost)return;inflight.current=true;setBusy(true);setError("");try{const signature=JSON.stringify(config);if(!request.current||request.current.version!==state.version||request.current.target!==target||request.current.signature!==signature)request.current={id:crypto.randomUUID(),version:state.version,target,signature};await switchRoomService.commit(room,actor,state,target,request.current.id,config);await refresh();return true;}catch(e){setError((e as Error).message);return false;}finally{inflight.current=false;setBusy(false);}};
 const accept=async()=>{if(inflight.current||!state)return;inflight.current=true;setBusy(true);try{await switchRoomService.accept(room,actor,state);await refresh();setDeferred(null);}catch(e){setError((e as Error).message);await refresh();}finally{inflight.current=false;setBusy(false);}};
 const waiting=Boolean(state&&(!fresh||(!isHost&&state.acceptedVersion<state.version)));
 const simulate=async()=>{if(room.source!=="demo"||!state||busy)return;setBusy(true);setError("");try{await switchRoomService.commit(room,room.host.id,state,"scene",crypto.randomUUID(),{program:"Présentation du prochain passage",duration:5,evaluation:true});await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 return {displayed,simulate,source:room.source,state,error,busy,fresh,current:state?.current??initial,waiting,invite:waiting&&fresh&&deferred!==state?.version,commit,accept,defer:()=>setDeferred(state?.version??null),refresh};
}
export type SwitchController=ReturnType<typeof useSwitchRoom>;

