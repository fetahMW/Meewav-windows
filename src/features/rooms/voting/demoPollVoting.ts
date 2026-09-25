import type { PlacePoll } from "../place/place.types";
import { canCastRoomVote, tallyRoomVote, type RoomVotingPolicy } from "./roomVoting";
const key=(roomId:string,pollId:string)=>`meewav:poll-ballots:v1:${roomId}:${pollId}`;
export function readDemoPollBallots(roomId:string,poll:PlacePoll):Record<string,number> {
  try {const saved=localStorage.getItem(key(roomId,poll.id));if(saved)return JSON.parse(saved);}catch { /* A fresh demo starts with its displayed public counts. */ }
  const ballots:Record<string,number>={};poll.options.forEach((option,index)=>{for(let i=0;i<option.votes;i++)ballots[`demo-public-${index}-${i}`]=index;});localStorage.setItem(key(roomId,poll.id),JSON.stringify(ballots));return ballots;
}
export function projectDemoPoll(roomId:string,poll:PlacePoll,policy:RoomVotingPolicy,accountId:string):PlacePoll {
  const ballots=readDemoPollBallots(roomId,poll), choices=poll.options.map((_,index)=>index),tally=tallyRoomVote(policy,ballots,choices);
  return {...poll,currentUserVoteIndex:ballots[accountId]??null,options:poll.options.map((option,index)=>({...option,votes:policy.mode==="jury"?tally.juryCounts[index]:tally.publicCounts[index]+tally.juryCounts[index],weightedPercent:policy.mode==="public"?undefined:tally.percentages[index]}))};
}
export async function castDemoPollVote(roomId:string,poll:PlacePoll,policy:RoomVotingPolicy,accountId:string,index:number) {
  if(!canCastRoomVote(policy,accountId))throw new Error("Ce vote est réservé au jury.");
  if(!Number.isInteger(index)||!poll.options[index]||!poll.isActive||(poll.endsAt&&Date.parse(poll.endsAt)<=Date.now()))throw new Error("Ce vote est fermé.");
  const apply=()=>{const ballots=readDemoPollBallots(roomId,poll);if(ballots[accountId]!==undefined)throw new Error("Ton vote est déjà enregistré.");ballots[accountId]=index;localStorage.setItem(key(roomId,poll.id),JSON.stringify(ballots));window.dispatchEvent(new Event("meewav-poll-vote"));};
  if(navigator.locks)await navigator.locks.request(key(roomId,poll.id),apply);else apply();
}
