import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ViewerMixerContext, type ViewerMixerValue } from "./ViewerMixerContext";
import { DEFAULT_VIEWER_LEVELS } from "./viewerSendAudio";
import ViewerGreenHouseAudioCheck from "./ViewerGreenHouseAudioCheck";
import { PlaceAudienceJourney } from "./PlaceStudioPanel";
import { createPlaceDemoState, PLACE_DEMO_PROFILES } from "./place.fixtures";
import { PLACE_ROOM_PRESENTATION, RoomPresentationProvider } from "../roomPresentation";
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
function mixer() {
 const track={id:"personal-master",kind:"audio",readyState:"live",stop:vi.fn()} as unknown as MediaStreamTrack;
 return { levels:structuredClone(DEFAULT_VIEWER_LEVELS), outputTrack:track, engine:{status:"running",inputState:()=>"active"}, meters:{voice:.3,music:0,system:0,master:.3}, prepareVoice:vi.fn(async()=>track),toggleMute:vi.fn() } as unknown as ViewerMixerValue;
}
describe("Green House personal audio",()=>{
 it("requires explicit verification of the real bus and invalidates it when levels or devices change",async()=>{
  const mix=mixer(), onVerified=vi.fn();
  const {rerender}=render(<ViewerMixerContext.Provider value={mix}><ViewerGreenHouseAudioCheck onVerified={onVerified}/></ViewerMixerContext.Provider>);
  expect(onVerified).toHaveBeenLastCalledWith(false);
  expect(screen.getByRole("meter",{name:"Niveau du Master personnel"})).toHaveAttribute("value","0.3");
  fireEvent.click(screen.getByRole("checkbox"));
  await waitFor(()=>expect(onVerified).toHaveBeenLastCalledWith(true));
  rerender(<ViewerMixerContext.Provider value={{...mix,levels:{...mix.levels,master:{gain:.4,muted:false}}}}><ViewerGreenHouseAudioCheck onVerified={onVerified}/></ViewerMixerContext.Provider>);
  await waitFor(()=>expect(onVerified).toHaveBeenLastCalledWith(false));
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  rerender(<ViewerMixerContext.Provider value={{...mix,outputTrack:null}}><ViewerGreenHouseAudioCheck onVerified={onVerified}/></ViewerMixerContext.Provider>);
  expect(screen.getByRole("checkbox")).toBeDisabled();
 });
 it("does not unmute an intentionally muted Master or capture anything just by entering",()=>{
  const mix=mixer();mix.levels.master.muted=true;
  render(<ViewerMixerContext.Provider value={mix}><ViewerGreenHouseAudioCheck onVerified={vi.fn()}/></ViewerMixerContext.Provider>);
  expect(screen.getByText(/Master coupé/)).toBeVisible();expect(mix.prepareVoice).not.toHaveBeenCalled();expect(mix.toggleMute).not.toHaveBeenCalled();
 });
 it("tests the existing microphone, captures only camera, and preserves the Master when leaving Green House",async()=>{
  const mix=mixer(), onMarkReady=vi.fn(async()=>undefined);
  const camera={kind:"video",stop:vi.fn(),enabled:true};
  const stream={getTracks:()=>[camera],getVideoTracks:()=>[camera],getAudioTracks:()=>[]};
  const capture=vi.fn(async()=>stream);
  vi.stubGlobal("navigator",{...navigator,mediaDevices:{getUserMedia:capture}});
  vi.spyOn(HTMLMediaElement.prototype,"play").mockResolvedValue();
  const room=createPlaceDemoState(PLACE_DEMO_PROFILES.viewerA.id);
  room.participants=room.participants.filter((p)=>p.profile.id!==room.currentUserProfile!.id);
  const invite={...room.queue[0],profile:room.currentUserProfile!,status:"accepted" as const};room.queue=[invite];
  const props={room,isGuest:false,onMarkReady,onJoinQueue:vi.fn(),onLeaveQueue:vi.fn(),onAcceptInvitation:vi.fn(),onDeclineInvitation:vi.fn()};
  const view=render(<RoomPresentationProvider presentation={PLACE_ROOM_PRESENTATION}><ViewerMixerContext.Provider value={mix}><PlaceAudienceJourney {...props}/></ViewerMixerContext.Provider></RoomPresentationProvider>);
  expect(capture).not.toHaveBeenCalled();expect(screen.getByRole("button",{name:"Je suis prêt"})).toBeDisabled();
  fireEvent.click(screen.getByRole("button",{name:"Activer mon aperçu"}));
  await waitFor(()=>expect(capture).toHaveBeenCalledWith({video:true,audio:false}));
  expect(mix.prepareVoice).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("checkbox"));
  await waitFor(()=>expect(screen.getByRole("button",{name:"Je suis prêt"})).toBeEnabled());
  fireEvent.click(screen.getByRole("button",{name:"Je suis prêt"}));expect(onMarkReady).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button",{name:"Micro"}));expect(mix.toggleMute).toHaveBeenCalledWith("voice");
  view.unmount();expect(camera.stop).toHaveBeenCalled();expect(mix.outputTrack!.stop).not.toHaveBeenCalled();
 });
});
