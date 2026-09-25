import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {SwitchRoomButton,SwitchRoomInvitation} from "./SwitchRoom";
import type {SwitchController} from "./useSwitchRoom";
import {assertCurrentInvitation,validateSceneConfig} from "./switchRoom.domain";
afterEach(cleanup);
function controller():SwitchController{return {displayed:"place",source:"demo",simulate:vi.fn(),state:{roomId:"one",current:"scene",from:"place",version:1,changeId:"change",changedAt:null,acceptedVersion:0,available:true},error:"",busy:false,fresh:true,current:"scene",waiting:true,invite:true,commit:vi.fn(),accept:vi.fn(),defer:vi.fn(),refresh:vi.fn()};}
it("Escape and the close button defer without accepting; keyboard focus stays in the invitation",async()=>{
 const c=controller();render(<SwitchRoomInvitation controller={c} hostName="Malo Beat"/>);
 const dialog=screen.getByRole("dialog");const close=screen.getByRole("button",{name:"Pas maintenant, fermer"});await waitFor(()=>expect(close).toHaveFocus());
 fireEvent.keyDown(close,{key:"Tab",shiftKey:true});expect(screen.getByRole("button",{name:"Pas maintenant"})).toHaveFocus();
 fireEvent.keyDown(dialog,{key:"Escape"});expect(c.defer).toHaveBeenCalledOnce();expect(c.accept).not.toHaveBeenCalled();
 fireEvent.click(close);expect(c.defer).toHaveBeenCalledTimes(2);
});
it("waits until another dialog is closed before showing the invitation",async()=>{
 const other=document.createElement("div");other.setAttribute("role","dialog");document.body.append(other);
 render(<SwitchRoomInvitation controller={controller()} hostName="Malo Beat"/>);
 expect(screen.queryByRole("dialog",{name:/On continue/})).not.toBeInTheDocument();other.remove();
 await screen.findByRole("dialog",{name:/On continue/});
});
it("offers all six experiences and disables only the current room",()=>{
 const c=controller();render(<SwitchRoomButton controller={c} enabled/>);fireEvent.click(screen.getByRole("button",{name:"Switch Room"}));
 expect(screen.getByRole("button",{name:/La Scène.*Room actuelle/})).toBeDisabled();expect(screen.getByRole("button",{name:/La Wave/})).toBeEnabled();
});
it("uses the launch validation and refuses stale invitations",()=>{
 expect(()=>validateSceneConfig({program:"",duration:5,evaluation:true})).toThrow();expect(()=>validateSceneConfig({program:"Concert",duration:0,evaluation:true})).toThrow();
 expect(()=>assertCurrentInvitation(controller().state!,0,"old")).toThrow();
});

import {createPlaceDemoState} from "../place/place.fixtures";
it("keeps provisional rooms isolated while host and viewer share the same session",()=>{
 const types=["place","scene","cage","classe","wave","loge"];
 const ids=types.map(type=>createPlaceDemoState("host",type).id);
 expect(new Set(ids).size).toBe(6);
 types.forEach((type,i)=>expect(createPlaceDemoState("viewer",type).id).toBe(ids[i]));
});
