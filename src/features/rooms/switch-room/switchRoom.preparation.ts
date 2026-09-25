import {createRoomToolsFixture} from "../tools/roomTools.fixtures";
import {applyRoomLaunchTools} from "../launch/roomLaunch";
import {initializeCageCompetition} from "../tools/cageCompetition";
import {normalizeWaveState} from "../tools/waveTools.domain";
import type {RoomToolsState,SpecializedRoomId} from "../tools/roomTools.types";
import {normalizeSwitchConfig,type SwitchConfig} from "./switchRoom.domain";
export const switchToolsKey=(roomId:string,type:string)=>`meewav:switch-tools:v1:${roomId}:${type}`;
export function prepareSwitchTools(type:SpecializedRoomId,roomId:string,config:SwitchConfig,host:{id:string;name:string;avatarUrl:string}):RoomToolsState {
 const state=createRoomToolsFixture(type,roomId),c=normalizeSwitchConfig(type,config);
 state.gifts.transactions=[];state.gifts.redemptions=[];state.gifts.stock=[];
 if(state.scene){const s=state.scene;s.people=[{...host,role:"Host",microphone:"ready",camera:"ready"}];s.program=[];s.prompter.texts=[];s.prompter.activeTextId="";s.prompter.playing=false;s.evaluation.byPerformance={};s.evaluation.viewerCompletedPerformanceIds=[];s.fundraiser={...s.fundraiser,title:"",description:"",beneficiary:"",status:"draft",visibleInLive:false,collectedAmount:0,contributionCount:0};}
 if(state.classe){const s=state.classe;s.people=[{...host,role:"Host",microphone:"ready",camera:"ready"}];s.seats=s.seats.map(seat=>({...seat,person:undefined,status:"free",canSpeak:false,canShareScreen:false,handRaised:false}));s.raisedHands=[];s.questions=[];s.resources=[];s.featuredQuestionId=null;s.activeSpeakerId=null;s.publicCallStudentId=null;s.privateTalkStudentId=null;s.screenShareOwnerId=null;}
 if(state.loge){const s=state.loge;s.questions=[];s.moments=[];s.preview={...s.preview,title:"",description:"",mediaName:"",mediaPath:null,playing:false,transportStatus:"idle",sessionId:null,startedAt:null,positionSeconds:0,expiresAt:null,durationSeconds:null,channels:null,sampleRate:null,waveformPeaks:[]};}
 if(state.cage&&"cage" in c){delete state.cage.demoPresentation;initializeCageCompetition(state.cage,c.cage,[]);}
 if("launch" in c)applyRoomLaunchTools(state,{id:roomId,createdAt:new Date().toISOString(),configuration:c.launch});
 if(state.wave)normalizeWaveState(state.wave);
 return state;
}
export function switchActivityBlock(state:RoomToolsState):string|null {
 const {scene,classe,cage,wave,loge}=state;
 if(scene&&(scene.program.some(e=>e.status==="live")||scene.prompter.playing||Object.values(scene.evaluation.byPerformance).some(e=>e.open)||scene.fundraiser.status==="live"))return "Clôturez le passage, l’évaluation ou la cagnotte en cours dans la Scène.";
 if(classe?.privateTalkStudentId)return "Terminez l’échange privé avec l’élève avant de changer de room.";
 if(classe?.activeSpeakerId||classe?.publicCallStudentId)return "Terminez la prise de parole de l’élève avant de changer de room.";
 if(wave?.playing||wave?.submissions.some(s=>s.vote?.open))return "Mettez le Beat en pause et clôturez le vote avant de changer de room. Les boucles et le SAS sont conservés.";
 if(cage?.votingOpen||cage?.runtime?.matches.some(m=>["LIVE","VOTING","COUNTDOWN","PAUSED"].includes(m.status))||["countdown","live-a","live-b","paused","incident"].includes(cage?.battleStatus??""))return "Terminez le combat et son vote avant de changer de room. Le tableau et les résultats sont conservés.";
 if(loge?.preview.playing||loge?.moments.some(m=>m.status==="live"))return "Terminez l’écoute ou le moment privé avant de changer de room.";
 return null;
}
