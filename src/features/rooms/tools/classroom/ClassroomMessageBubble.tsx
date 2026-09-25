import { useEffect, useMemo, useState } from "react";
import { MessageCircleMore, Send, X } from "lucide-react";
import { createMessagingRepository, createMessagingClientMessageId } from "../../../messaging/messaging.service";
import { useMessagingRealtime } from "../../../messaging/useMessagingRealtime";
import { readClassroomDemoMessages, subscribeClassroomDemoMessages, appendClassroomDemoMessage } from "./classroomDemoMessages";

type BubbleMessage = {id:string; body:string; own:boolean; conversationId?:string};
export default function ClassroomMessageBubble({roomId, accountId, peerId, peerName, source}:{roomId:string;accountId:string;peerId:string;peerName:string;source:"demo"|"live"}) {
  const repository = useMemo(() => createMessagingRepository(), []);
  const [messages,setMessages] = useState<BubbleMessage[]>([]);
  const [body,setBody] = useState("");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [dismissed,setDismissed] = useState<string | null>(null);
  const [version,setVersion] = useState(0);
  useMessagingRealtime({enabled:source === "live",profileId:source === "live" ? accountId : null,onChange:change => {if(change.domain === "conversation") setVersion(v => v+1);}});
  useEffect(() => {
    let active = true;
    const load = async () => {
      if(source === "demo") {
        const rows=readClassroomDemoMessages(roomId).filter(m => (m.senderId===peerId&&m.recipientId===accountId)||(m.senderId===accountId&&m.recipientId===peerId));
        if(active)setMessages(rows.map(m=>({...m,own:m.senderId===accountId})));
        return;
      }
      try {
        const conversations=await repository.listConversations({kinds:["direct"],limit:100});
        const conversation=conversations.find(c=>c.counterpart_profile_id===peerId);
        if(!conversation)return;
        const rows=await repository.listMessages({conversationId:conversation.conversation_id,limit:50});
        const scoped=rows.filter(m=>!m.deleted_at&&m.body&&typeof m.payload==="object"&&m.payload!==null&&!Array.isArray(m.payload)&&m.payload.context==="room_classe"&&m.payload.room_id===roomId);
        if(active)setMessages(scoped.sort((a,b)=>a.sequence-b.sequence).map(m=>({id:m.id,body:m.body!,own:m.sender_profile_id===accountId,conversationId:m.conversation_id})));
      } catch { /* Realtime and the recovery poll retry without replacing the draft. */ }
    };
    void load();
    const unsubscribe=source==="demo"?subscribeClassroomDemoMessages(()=>void load()):()=>{};
    const interval=source==="live"?window.setInterval(()=>void load(),15000):undefined;
    return ()=>{active=false;unsubscribe();window.clearInterval(interval);};
  },[roomId,accountId,peerId,source,repository,version]);
  const received=messages.filter(m=>!m.own);
  const incoming=received[received.length-1];
  if(!incoming)return null;
  if(dismissed===incoming.id)return <button className="classe-private-reopen" type="button" aria-label="Ouvrir le message privé" onClick={()=>setDismissed(null)}><MessageCircleMore /></button>;
  return <aside className="classe-private-bubble" aria-label={`Message privé de ${peerName}`}><header><MessageCircleMore /><strong>{peerName} · Privé</strong><button type="button" aria-label="Réduire le message privé" onClick={()=>setDismissed(incoming.id)}><X /></button></header><div className="classe-private-bubble__messages" role="log">{messages.slice(-4).map(m=><p key={m.id} className={m.own?"is-own":""}>{m.body}</p>)}</div><form onSubmit={event=>{event.preventDefault();if(!body.trim()||busy)return;setBusy(true);setError("");const text=body.trim();const send=async()=>{if(source==="demo")appendClassroomDemoMessage(roomId,accountId,peerId,text);else {const result=await repository.sendTextMessage({conversationId:incoming.conversationId!,clientMessageId:createMessagingClientMessageId(),body:text,replyToMessageId:incoming.id,payload:{context:"room_classe",room_id:roomId}});if(!result.ok)throw new Error();}setBody("");setVersion(v=>v+1);};void send().catch(()=>setError("Réponse non envoyée. Réessayez.")).finally(()=>setBusy(false));}}><input aria-label="Répondre en privé" placeholder="Répondre ici…" maxLength={280} value={body} onChange={e=>setBody(e.target.value)} /><button type="submit" aria-label="Envoyer la réponse privée" disabled={busy||!body.trim()}><Send /></button></form>{error?<p role="alert">{error}</p>:null}</aside>;
}
