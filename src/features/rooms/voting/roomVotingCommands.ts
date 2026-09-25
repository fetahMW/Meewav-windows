import type { RoomToolsCommand, RoomToolsState } from "../tools/roomTools.types";
import { canCastRoomVote, tallyRoomVote, type RoomVotingPolicy } from "./roomVoting";
export function isRoomVotingCommand(command:RoomToolsCommand) {
  return ["wave.vote.cast","cage.vote.cast","scene.evaluation.cast"].includes(command.type)
    || (command.type==="cage.competition.command" && ["vote.cast","openmic.feedback.cast"].includes(command.action));
}
export function applyRoomVotingPolicy(state:RoomToolsState,policy:RoomVotingPolicy) {
  state.votingPolicy=policy;
  if(state.scene?.evaluation)for(const evaluation of Object.values(state.scene.evaluation.byPerformance)){
    evaluation.publicMinimumResponses ??= evaluation.minimumResponses;
    evaluation.minimumResponses = policy.mode === "jury" ? Math.max(1, Math.min(evaluation.publicMinimumResponses, policy.jurorIds.length)) : evaluation.publicMinimumResponses;
    evaluation.weightedAverage=policy.mode==="public"?undefined:roomRatingAverage(policy,evaluation.responses);
    const responses = Object.entries(evaluation.responses).filter(([id]) => policy.mode !== "jury" || policy.jurorIds.includes(id)).map(([, response]) => response);
    evaluation.responseCount = responses.length;
    evaluation.ratingTotal = responses.reduce((total, response) => total + response.rating, 0);
    evaluation.ratingCounts = {1:0,2:0,3:0,4:0,5:0};
    evaluation.reactionCounts = {energy:0,presence:0,originality:0,mastery:0};
    for (const response of responses) {
      evaluation.ratingCounts[response.rating]++;
      for (const reaction of response.reactions) evaluation.reactionCounts[reaction]++;
    }
  }
  if(state.wave)state.wave.votingPolicy=policy;
  if(state.cage?.runtime)state.cage.runtime.votingPolicy=policy;
}
export function requireRoomVoter(state:RoomToolsState,command:RoomToolsCommand,actorId:string) {
  if(isRoomVotingCommand(command)&&!canCastRoomVote(state.votingPolicy,actorId))throw new Error("Ce vote est réservé au jury.");
}
export function roomRatingAverage(policy:RoomVotingPolicy|undefined, responses:Record<string,{rating:number}>) {
  const tally=tallyRoomVote(policy,Object.fromEntries(Object.entries(responses).map(([id,response])=>[id,response.rating])),[1,2,3,4,5]);
  return tally.ready ? tally.percentages.reduce((sum,percent,index)=>sum+(index+1)*percent/100,0) : null;
}
