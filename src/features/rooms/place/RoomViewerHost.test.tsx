import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,describe,expect,it,vi} from "vitest";
import RoomViewerHost from "./RoomViewerHost";
import {createPlaceDemoState,PLACE_DEMO_PROFILES} from "./place.fixtures";
import {getFollowState,getPublicPreProfile,setFollowState} from "../../globe/api/preProfile.api";
vi.mock("../../globe/api/preProfile.api",()=>({getFollowState:vi.fn(),getPublicPreProfile:vi.fn(),setFollowState:vi.fn()}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
describe("Room viewer host actions",()=>{
 it("shows the canonical follower count and persists follow",async()=>{
  vi.mocked(getPublicPreProfile).mockResolvedValue({followers_count:1200} as Awaited<ReturnType<typeof getPublicPreProfile>>);
  vi.mocked(getFollowState).mockResolvedValue({following:false} as Awaited<ReturnType<typeof getFollowState>>);
  vi.mocked(setFollowState).mockResolvedValue({following:true} as Awaited<ReturnType<typeof setFollowState>>);
  const room={...createPlaceDemoState(PLACE_DEMO_PROFILES.viewerA.id),source:"live" as const};
  const leave=vi.fn();render(<RoomViewerHost room={room} onLeaveRoom={leave}/>);
  await screen.findByText(/1,2.*abonnés/);
  await waitFor(()=>expect(screen.getByRole("button",{name:"Suivre"})).toBeEnabled());
  fireEvent.click(screen.getByRole("button",{name:"Suivre"}));
  await waitFor(()=>expect(setFollowState).toHaveBeenCalledWith(room.host.id,true));
  expect(await screen.findByRole("button",{name:"Suivi"})).toHaveAttribute("aria-pressed","true");
  fireEvent.click(screen.getByRole("button",{name:"Quitter la room"}));expect(leave).toHaveBeenCalledOnce();
 });
 it("does not claim a follow succeeded when the service fails",async()=>{
  vi.mocked(getPublicPreProfile).mockResolvedValue(null);
  vi.mocked(getFollowState).mockResolvedValue({following:false} as Awaited<ReturnType<typeof getFollowState>>);
  vi.mocked(setFollowState).mockRejectedValue(new Error("offline"));
  render(<RoomViewerHost room={{...createPlaceDemoState(PLACE_DEMO_PROFILES.viewerA.id),source:"live"}}/>);
  await waitFor(()=>expect(screen.getByRole("button",{name:"Suivre"})).toBeEnabled());
  fireEvent.click(screen.getByRole("button",{name:"Suivre"}));
  expect(await screen.findByText(/Le suivi n’a pas pu être enregistré/)).toBeVisible();
  expect(screen.getByRole("button",{name:"Suivre"})).toHaveAttribute("aria-pressed","false");
 });
});
