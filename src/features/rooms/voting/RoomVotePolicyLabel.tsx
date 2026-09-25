import { useRoomVotingPolicy } from "./useRoomVotingPolicy";
import { canCastRoomVote, VOTE_MODE_LABELS } from "./roomVoting";
import "./room-voting.css";
export default function RoomVotePolicyLabel({roomId,source,accountId}: {roomId:string;source:"demo"|"live";accountId?:string}) {
  const {policy}=useRoomVotingPolicy(roomId,source);
  if(policy.mode==="public")return null;
  return <div className="room-vote-policy" role="status"><strong>{VOTE_MODE_LABELS[policy.mode]}</strong><span>{policy.mode==="mixed"?"50 % public · 50 % jury":`${policy.jurorIds.length} juré${policy.jurorIds.length>1?"s":""}`}</span>{accountId&&policy.jurorIds.includes(accountId)?<small>Vous votez comme juré</small>:accountId&&!canCastRoomVote(policy,accountId)?<small>Vote réservé au jury</small>:null}</div>;
}
