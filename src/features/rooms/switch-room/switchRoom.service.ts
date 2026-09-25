import {prepareSwitchTools,switchToolsKey,switchActivityBlock} from "./switchRoom.preparation";
import { supabase } from "../../../lib/supabaseClient";
import type { PlaceRoomState } from "../place/place.types";
import { assertCurrentInvitation, destinationBlock, validateSwitchConfig, type Experience, type SceneSwitchConfig, type SwitchConfig, type SwitchState } from "./switchRoom.domain";
const key=(roomId:string)=>`meewav:room-experience:v1:${roomId}`;
const eventName="meewav:room-experience";
type DemoSnapshot=SwitchState & { hostId:string; hostName:string; hostAvatar:string; replies:Record<string,number>; requests:Record<string,{version:number;target:Experience}>; sceneConfig?:SceneSwitchConfig; lastRequestAt:number };
export function readDemoExperience(roomId:string):DemoSnapshot|null{try{return JSON.parse(localStorage.getItem(key(roomId))??"null");}catch{return null;}}
function save(state:DemoSnapshot){localStorage.setItem(key(state.roomId),JSON.stringify(state));window.dispatchEvent(new CustomEvent(eventName,{detail:state.roomId}));}
async function locked<T>(roomId:string,action:()=>Promise<T>|T):Promise<T>{if(!navigator.locks)throw new Error("Ce navigateur ne permet pas de synchroniser ce changement de démonstration.");return navigator.locks.request(key(roomId),action);}
function rpcError(error:{message?:string}|null){if(error)throw new Error(error.message?.startsWith("switch_")?({switch_forbidden:"Seul le host de ce live peut changer la room.",switch_conflict:"La room a changé. Réessayez depuis sa version actuelle.",switch_busy:"Terminez ou clôturez l’activité en cours avant de changer de room.",switch_access:"Ce passage n’est pas compatible avec les règles d’accès actuelles.",switch_rate_limit:"Attendez quelques secondes avant un nouveau changement.",switch_stale:"Cette invitation a changé. Actualisez la proposition.",switch_class_selection:"Sélectionnez entre 1 et 24 élèves encore présents dans la file.",switch_class_seats_conflict:"Des places existantes appartiennent à d’autres élèves. Gérez-les dans la Classe avant de changer la sélection.",switch_private_media:"Terminez le talkback ou l’appel privé avant de changer de room."}[error.message]??"Le changement n’est pas disponible pour cette expérience."):"Le service Switch Room est indisponible. Le live continue ici.");}
export const switchRoomService={
 async get(room:PlaceRoomState,initial:Experience,actor:string):Promise<SwitchState>{
  if(room.source==="demo")return locked(room.id,()=>{let s=readDemoExperience(room.id);if(!s){s={roomId:room.id,current:initial,from:initial,version:0,changeId:null,changedAt:null,acceptedVersion:0,available:true,hostId:room.host.id,hostName:room.host.displayName,hostAvatar:room.host.avatarUrl,replies:{},requests:{},lastRequestAt:0};}if(s.replies[actor]===undefined){s.replies[actor]=s.version;save(s);}return {...s,prepared:[...new Set([initial,...(s.prepared??[]),...(s.sceneConfig?["scene" as const]:[])])],acceptedVersion:s.replies[actor]};});
  const r=await supabase.rpc("rooms_get_experience_v1",{p_room_id:room.id});rpcError(r.error);if(!r.data)throw new Error("Le live n’est plus accessible.");return r.data as SwitchState;
 },
 async commit(room:PlaceRoomState,actor:string,state:SwitchState,target:Experience,requestId:string,config?:SwitchConfig):Promise<void>{
  const blocked=destinationBlock(state.current,target);if(blocked)throw new Error(blocked);
  if(room.source==="demo")return locked(room.id,async()=>{const s=readDemoExperience(room.id);if(!s||s.hostId!==actor)throw new Error("Seul le host peut changer la room.");const prior=s.requests[requestId];if(prior){if(prior.target!==target)throw new Error("Cette demande a déjà été utilisée.");return;}if(s.version!==state.version)throw new Error("La room a changé. Réessayez.");if(Date.now()-s.lastRequestAt<5000)throw new Error("Attendez quelques secondes avant un nouveau changement.");
   if(s.current==="place") {const raw=sessionStorage.getItem(`meewav:demo:place-conversation:v1:${room.id}`);const tools=raw?JSON.parse(raw):null;if(tools&&(tools.floor.current||tools.floor.queue.length||["running","paused"].includes(tools.floor.status)||tools.clash&&!["ended","cancelled"].includes(tools.clash.status)||tools.challenges.some((c:{status:string})=>!["done","cancelled"].includes(c.status))))throw new Error("Clôturez le tour de parole, le clash et les défis en cours avant de changer.");}
   const {roomToolsRepository}=await import("../tools/roomTools.service");
   if(s.current!=="place"){
    const tools=await roomToolsRepository.load(s.current,room.id);
    const reason=switchActivityBlock(tools);if(reason)throw new Error(reason);
    localStorage.setItem(switchToolsKey(room.id,s.current),JSON.stringify(tools));
   }
   if(target==="classe") {
    if(!config)throw new Error("Sélectionnez les élèves avant de continuer.");
    validateSwitchConfig(target,config);
    if(!("launch" in config))throw new Error("Configuration de classe incorrecte.");
    const selected=config.studentIds!.map(id=>room.queue.find(p=>p.profile.id===id&&id!==room.host.id));
    if(selected.some(p=>!p))throw new Error("Un élève a quitté la file. Vérifiez votre sélection.");
    const saved=JSON.parse(localStorage.getItem(switchToolsKey(room.id,"classe"))??"null");
    const classroom=saved??prepareSwitchTools("classe",room.id,config,{id:s.hostId,name:s.hostName,avatarUrl:s.hostAvatar});
    if(saved?.classe?.seats.some((seat:{number:number;person?:{id:string}})=>seat.person&&seat.person.id!==config.studentIds![seat.number-1]))throw new Error("Des places existantes appartiennent à d’autres élèves. Conservez leur sélection.");
    const people=selected.map((p,i)=>({id:p!.profile.id,name:p!.profile.displayName,avatarUrl:p!.profile.avatarUrl,role:"Élève",place:i+1,access:"Accordé manuellement" as const,microphone:"off" as const,camera:"off" as const}));
    classroom.classe!.people=[...classroom.classe!.people.filter((p:{id:string})=>p.id===s.hostId),...people];
    classroom.classe!.seats=Array.from({length:24},(_,i)=>({number:i+1,person:people[i],status:people[i]?"reserved" as const:"free" as const,canSpeak:false,canShareScreen:false,handRaised:false}));
    classroom.revision=Math.max(classroom.revision,saved?.revision??0)+1;
    localStorage.setItem(switchToolsKey(room.id,"classe"),JSON.stringify(classroom));
   }
   if(target!=="place"&&!localStorage.getItem(switchToolsKey(room.id,target))){
    if(!config)throw new Error("Préparez cette expérience avant d’inviter le public.");
    validateSwitchConfig(target,config);
    const tools=prepareSwitchTools(target,room.id,config,{id:s.hostId,name:s.hostName,avatarUrl:s.hostAvatar});
    localStorage.setItem(switchToolsKey(room.id,target),JSON.stringify(tools));
   }
   s.prepared=[...new Set([...(s.prepared??[]),s.current,target])];
   s.from=s.current;s.current=target;s.version++;s.changeId=requestId;s.changedAt=new Date().toISOString();s.lastRequestAt=Date.now();s.requests[requestId]={version:s.version,target};s.replies[actor]=s.version;save(s);
  });
  if(target==="wave"&&!state.prepared?.includes("wave")){if(!config)throw new Error("Préparez la boucle de base.");const {prepareLiveWaveSwitch}=await import("./switchRoom.wave");await prepareLiveWaveSwitch(room.id,state,config,requestId);}
  const r=await supabase.rpc("rooms_switch_experience_v1",{p_room_id:room.id,p_expected_version:state.version,p_request_id:requestId,p_destination:target,p_config:config??{}});rpcError(r.error);
 },
 async accept(room:PlaceRoomState,actor:string,state:SwitchState){
  if(room.source==="demo")return locked(room.id,()=>{const s=readDemoExperience(room.id);if(!s)throw new Error("Session indisponible");assertCurrentInvitation(s,state.version,state.changeId);s.replies[actor]=s.version;save(s);});
  const r=await supabase.rpc("rooms_accept_experience_v1",{p_room_id:room.id,p_version:state.version,p_change_id:state.changeId});rpcError(r.error);
 },
 subscribe(room:PlaceRoomState,refresh:()=>void){
  if(room.source==="demo"){const changed=(e:StorageEvent)=>{if(e.key===key(room.id))refresh();};const local=(e:Event)=>{if((e as CustomEvent).detail===room.id)refresh();};window.addEventListener("storage",changed);window.addEventListener(eventName,local);return()=>{window.removeEventListener("storage",changed);window.removeEventListener(eventName,local);};}
  const channel=supabase.channel(`room-experience:${room.id}:${crypto.randomUUID()}`).on("postgres_changes",{event:"*",schema:"public",table:"rooms_v2",filter:`id=eq.${room.id}`},refresh).subscribe(status=>{if(status==="SUBSCRIBED")refresh();});return()=>{void supabase.removeChannel(channel);};
 }
};
export function assertDemoExperience(roomId:string,type:Experience,actor:string){const s=readDemoExperience(roomId);if(s&&(s.current!==type||(s.version>0&&s.replies[actor]!==s.version)))throw new Error("Cette expérience n’est plus active ou vous n’avez pas encore accepté le changement.");}
