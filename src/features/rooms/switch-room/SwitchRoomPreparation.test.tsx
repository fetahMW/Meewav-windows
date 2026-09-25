import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {SwitchRoomPreparation} from "./SwitchRoomPreparation";
import {createPlaceDemoState} from "../place/place.fixtures";
import {defaultRoomLaunch} from "../launch/roomLaunch";
import {validateSwitchConfig} from "./switchRoom.domain";
afterEach(cleanup);
it("accepts 8 queued students and passes their IDs to the switch",async()=>{
 const room=createPlaceDemoState();room.queueOpen=false;
 const template=room.queue[0];
 room.queue=Array.from({length:24},(_,i)=>({...template,id:`queue-${i}`,profile:{...template.profile,id:`student-${i}`,displayName:`Élève ${i+1}`}}));
 const submit=vi.fn(),open=vi.fn();
 render(<SwitchRoomPreparation target="classe" busy={false} room={room} onQueueOpen={open} onBack={()=>{}} onSubmit={submit}/>);
 fireEvent.click(screen.getByRole("button",{name:"Ouvrir la file d’attente"}));expect(open).toHaveBeenCalledWith(true);
 const button=screen.getByRole("button",{name:"Préparer et continuer dans La Classe"});expect(button).toBeDisabled();
 room.queue.slice(0,8).forEach(p=>fireEvent.click(screen.getByLabelText(p.profile.displayName)));expect(button).toBeEnabled();
 fireEvent.click(button);
 await waitFor(()=>expect(submit).toHaveBeenCalledOnce());expect(submit.mock.calls[0][0].studentIds).toEqual(room.queue.slice(0,8).map(p=>p.profile.id));
});
it("rejects missing or duplicate student IDs",()=>{
 const launch=defaultRoomLaunch("classe");
 expect(()=>validateSwitchConfig("classe",{launch})).toThrow(/24/);
 expect(()=>validateSwitchConfig("classe",{launch,studentIds:Array(24).fill("same")})).toThrow(/24/);
});
