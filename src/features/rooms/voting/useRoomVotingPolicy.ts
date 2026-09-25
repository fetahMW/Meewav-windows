import { useEffect, useState } from "react";
import { cachedVotingPolicy, loadVotingPolicy, subscribeVotingPolicy } from "./roomVoting.service";
export function useRoomVotingPolicy(roomId:string,source:"demo"|"live") {
  const [policy,setPolicy]=useState(()=>cachedVotingPolicy(roomId,source)),[error,setError]=useState<string|null>(null);
  useEffect(()=>{let active=true;setPolicy(cachedVotingPolicy(roomId,source));setError(null);
    void loadVotingPolicy(roomId,source).then(next=>{if(active)setPolicy(next);}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:"Jury indisponible.");});
    const off=subscribeVotingPolicy(roomId,source,()=>{if(active)setPolicy(cachedVotingPolicy(roomId,source));});
    return()=>{active=false;off();};},[roomId,source]);
  return {policy,error};
}
