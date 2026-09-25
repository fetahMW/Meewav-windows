import type { RoomPresentation } from "../roomPresentation";
import { defaultRoomLaunch, validateRoomLaunch, type RoomLaunchConfiguration } from "../launch/roomLaunch";
import { validateCageLaunch, type CageLaunchConfiguration } from "../launch/cageLaunch";
export type Experience = RoomPresentation["id"];
export type SwitchState = { roomId:string; current:Experience; from:Experience; version:number; changeId:string|null; changedAt:string|null; acceptedVersion:number; available:boolean; prepared?:Experience[] };
export type SceneSwitchConfig = { program:string; duration:number; evaluation:boolean };
export type SwitchConfig = SceneSwitchConfig | { launch:RoomLaunchConfiguration; studentIds?:string[] } | { cage:CageLaunchConfiguration };
export const DESTINATIONS: {id:Experience;name:string;description:string}[] = [
 {id:"place",name:"La Place",description:"Échanges libres"},
 {id:"scene",name:"La Scène",description:"Performances live"},
 {id:"cage",name:"La Cage",description:"Battles"},
 {id:"classe",name:"La Classe",description:"Cours et transmission"},
 {id:"wave",name:"La Wave",description:"Création collective"},
 {id:"loge",name:"La Loge",description:"Rencontres VIP"},
];
export const destinationName=(id:Experience)=>DESTINATIONS.find(d=>d.id===id)?.name ?? id;
export function destinationBlock(current:Experience,target:Experience) { return current===target ? "Room actuelle" : null; }
export function normalizeSwitchConfig(target:Experience,config:SwitchConfig):Exclude<SwitchConfig,SceneSwitchConfig> {
 if("program" in config){const launch=defaultRoomLaunch("scene");launch.title="Suite du live";launch.values={...launch.values,...config};return {launch};}
 return config;
}
export function validateSwitchConfig(target:Experience,config:SwitchConfig) {
 const normalized=normalizeSwitchConfig(target,config);
 if("cage" in normalized){if(target!=="cage")throw new Error("Configuration de destination incorrecte.");const error=validateCageLaunch(normalized.cage);if(error)throw new Error(error);return;}
 if(target==="classe") {
  const ids="studentIds" in normalized?normalized.studentIds:undefined;
  if(!ids||ids.length<1||ids.length>24||new Set(ids).size!==ids.length)throw new Error("Sélectionnez entre 1 et 24 élèves distincts dans la file d’attente.");
 }
 const launch=normalized.launch;
 if(launch.roomType!==target)throw new Error("Configuration de destination incorrecte.");
 const error=validateRoomLaunch(launch);if(error)throw new Error(error);
 if(target==="scene"&&String(launch.values.program).split("\n").filter(l=>l.trim()).length>24)throw new Error("Le programme est limité à 24 passages.");
}
export function validateSceneConfig(config:SceneSwitchConfig){validateSwitchConfig("scene",config);}
export function assertCurrentInvitation(state:SwitchState,version:number,changeId:string|null){
 if(version!==state.version||changeId!==state.changeId)throw new Error("Cette invitation a changé. Retrouvez la proposition actuelle.");
}
