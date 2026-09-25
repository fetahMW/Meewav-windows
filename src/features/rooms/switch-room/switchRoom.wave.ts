import {supabase} from "../../../lib/supabaseClient";
import {SupabaseWaveInfraAdapter} from "../wave-infra";
import {resolveRoomLaunchAudio} from "../launch/roomLaunchAudio";
import type {SwitchConfig,SwitchState} from "./switchRoom.domain";
const infra=new SupabaseWaveInfraAdapter();
const pending=new Map<string,{sessionId:string;assetId?:string;uploadId?:string;sha256:string;confirmed:boolean;acceptedAt:string}>();
export async function prepareLiveWaveSwitch(roomId:string,state:SwitchState,config:SwitchConfig,requestId:string){
 if(!("launch" in config)||!config.launch.baseLoop?.mediaPath)throw new Error("Importe la boucle de base avant de préparer la Wave.");
 const base=config.launch.baseLoop;
 const prepared=await supabase.rpc("rooms_prepare_wave_switch_v1",{p_room_id:roomId,p_expected_version:state.version,p_config:config});
 if(prepared.error||!prepared.data?.sessionId)throw new Error(prepared.error?.message?.startsWith("switch_")?"La préparation de cette Wave a changé. Vérifie ses réglages.":"Le service de préparation Wave n’est pas disponible. Le live reste ici.");
 let job=pending.get(requestId);
 if(!job){const bytes=await (await fetch(await resolveRoomLaunchAudio(base.mediaPath!))).arrayBuffer();const sha256=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),b=>b.toString(16).padStart(2,"0")).join("");job={sessionId:prepared.data.sessionId,sha256,confirmed:false,acceptedAt:new Date().toISOString()};pending.set(requestId,job);}
 if(!job.confirmed){
  const body=await (await fetch(await resolveRoomLaunchAudio(base.mediaPath!))).blob();
  const ticket=(await infra.requestAssetUploadTicket({waveId:job.sessionId,purpose:"HOST_BASE_LOOP",category:"drums",fileName:base.fileName!,byteSize:body.size,claimedMimeType:base.mimeType!,sha256:job.sha256,terms:{termsVersion:"switch-host-base-v1",acceptedAt:job.acceptedAt},idempotencyKey:`switch-base:${requestId}`})).data;
  const receipt=await infra.uploadAsset(ticket,body);
  await infra.confirmAssetUpload({waveId:job.sessionId,uploadId:ticket.uploadId,assetId:ticket.assetId,byteSize:receipt.byteSize,sha256:job.sha256,eTag:receipt.eTag,idempotencyKey:`switch-confirm:${requestId}`});
  job.assetId=ticket.assetId;job.uploadId=ticket.uploadId;job.confirmed=true;
 }
 const deadline=Date.now()+90000;
 while(true){const status=(await infra.getAssetProcessingStatus(job.sessionId,job.assetId!)).data;
  if(status.state==="READY")break;
  if(["REJECTED","PROCESSING_FAILED","EXPIRED"].includes(status.state))throw new Error("Le traitement de la boucle a échoué. Le live reste dans sa room actuelle.");
  if(Date.now()>deadline)throw new Error("La boucle est encore en traitement. Réessaie pour reprendre la vérification ; aucune invitation n’a été envoyée.");
  await new Promise(resolve=>setTimeout(resolve,1500));
 }
 const result=await supabase.rpc("rooms_complete_wave_switch_base_v1",{p_room_id:roomId,p_expected_version:state.version,p_asset_id:job.assetId});
 if(result.error)throw new Error("La base n’est pas encore compatible et prête pour le Beat. Vérifie sa durée et son tempo avant de réessayer.");
}
