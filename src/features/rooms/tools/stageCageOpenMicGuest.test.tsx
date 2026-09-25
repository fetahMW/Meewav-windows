import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DemoRoomToolsRepository } from "./roomTools.service";
import { stageCageOpenMicGuest } from "./stageCageOpenMicGuest";
import { cageEntrants } from "./cageTools.domain";
import { createPlaceDemoState } from "../place/place.fixtures";
import { projectCageDemoGuests } from "./cageGuestProjection";
import { CageStageProgramView } from "../place/CageStageProgram";
import type { CageCompetitionAction, CageCompetitionPayload } from "./cageCompetition.types";

afterEach(()=>{cleanup();vi.restoreAllMocks();});
async function setup() {
  const repo=new DemoRoomToolsRepository(), roomId=`openmic-guest-${crypto.randomUUID()}`;
  let state=await repo.projectionForRole("cage",roomId,"host","host");
  const ids=state.cage!.runtime!.participants.slice(0,4).map(person=>person.id);
  for(const id of ids) {
    await repo.execute("cage",roomId,"host",{type:"cage.demo.guest.move",participantId:id,destination:"accepted"},"host");
    state=await repo.execute("cage",roomId,"host",{type:"cage.demo.guest.move",participantId:id,destination:"ready"},"host");
  }
  const send=async(action:CageCompetitionAction,payload:CageCompetitionPayload={})=>{
    state=await repo.projectionForRole("cage",roomId,"host","host");
    return state=await repo.execute("cage",roomId,"host",{type:"cage.competition.command",action,payload,idempotencyKey:crypto.randomUUID(),expectedRevision:state.revision,expectedEntryId:payload.entryId},"host");
  };
  state=await send("competition.configure",{format:"open-mic",participantCount:4});
  return {repo,state,ids,send,roomId};
}

it("adds, prepares and promotes an unscheduled backstage artist, with the matching video and portrait", async()=>{
  const {repo,state,ids}=await setup();
  const next=await stageCageOpenMicGuest(repo,state,"host",ids[2],"demo");
  const runtime=next.cage!.runtime!, entry=runtime.openMicEntries!.find(item=>item.id===runtime.activeEntryId)!;
  expect(entry).toMatchObject({participantId:ids[2],status:"ON_STAGE"});
  expect(next.cage!.matches).toEqual([]);
  const person=cageEntrants(next.cage!).find(item=>item.id===ids[2])!;
  expect(person.avatarUrl).toBe(runtime.participants.find(item=>item.id===ids[2])!.person.avatarUrl);
  const room=projectCageDemoGuests({...createPlaceDemoState(),id:next.roomId},runtime);
  vi.spyOn(HTMLMediaElement.prototype,"play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype,"pause").mockImplementation(()=>{});
  const {container}=render(<CageStageProgramView cage={next.cage!} room={room} onStage={room.participants.filter(item=>item.status==="onstage")} liveKitVideoTracks={[]} useRtcVideo={false} programMuted onOpenProfile={()=>{}}/>);
  expect(screen.getByLabelText(`Réalisation vidéo spéciale Cage : passage de ${person.name}`)).toBeDefined();
  expect(container.querySelector("video")).not.toBeNull();
});

it("allows the host to choose a different ready artist than the preloaded next passage", async()=>{
  const {repo,ids,send}=await setup();
  await send("openmic.schedule",{participantIds:ids});
  let state=await send("openmic.prepare",{entryId:`openmic-${ids[0]}`});
  state=await stageCageOpenMicGuest(repo,state,"host",ids[2],"demo");
  expect(state.cage!.runtime!.activeEntryId).toBe(`openmic-${ids[2]}`);
  expect(state.cage!.runtime!.participants.filter(item=>item.guestStatus==="on_stage").map(item=>item.id)).toEqual([ids[2]]);
  await expect(stageCageOpenMicGuest(repo,state,"host",ids[3],"demo")).rejects.toThrow("passage en cours");
});

it("repairs a persisted old demo guest placed on stage without a programme entry", async()=>{
  const {repo,state,ids,roomId}=await setup();
  const orphan=await repo.execute("cage",roomId,"host",{type:"cage.demo.guest.move",participantId:ids[0],destination:"onstage"},"host");
  expect(orphan.cage!.runtime!.activeEntryId).toBeNull();
  const repaired=await stageCageOpenMicGuest(repo,orphan,"host",ids[0],"demo");
  expect(repaired.cage!.runtime!.activeEntryId).toBe(`openmic-${ids[0]}`);
});

it("does not bypass readiness or publish unfinished results",async()=>{
  const {repo,state,send}=await setup();
  const unprepared=state.cage!.runtime!.participants.find(item=>!item.registered)!;
  await expect(stageCageOpenMicGuest(repo,state,"host",unprepared.id,"demo")).rejects.toThrow("Green House");
  await expect(send("broadcast.results",{enabled:true})).rejects.toThrow("results_not_ready");
});
