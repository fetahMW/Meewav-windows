import { createClient } from "npm:@supabase/supabase-js@2";
import { allowedOrigins, jsonResponse, readJsonObject, requiredEnvironment, ROOM_ID_PATTERN } from "../_shared/audioPairing.ts";
import { generateBytePlusToken } from "../_shared/byteplusToken.ts";
import { BytePlusAdmin } from "../_shared/byteplusAdmin.ts";

// Policy refresh also renews this short grant. No role or identity is accepted
// from the caller; legacy channelName is only a room lookup key.
const TTL_SECONDS = 120;
Deno.serve(async (request) => {
  const origin = request.headers.get("origin") ?? "";
  const headers: Record<string,string> = origin && allowedOrigins().has(origin) ? {
    "access-control-allow-origin": origin, "vary":"Origin",
    "access-control-allow-headers":"authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods":"POST, OPTIONS",
  } : {};
  if (origin && !headers["access-control-allow-origin"]) return jsonResponse(403,{error:"origin_refused"});
  if (request.method === "OPTIONS") return new Response(null,{status:204,headers});
  if (request.method !== "POST") return jsonResponse(405,{error:"method_not_allowed"},headers);
  try {
    const authorization = request.headers.get("authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) return jsonResponse(401,{error:"authentication_required"},headers);
    let body: Record<string,unknown>;
    try { body=readJsonObject(await request.text()); } catch { return jsonResponse(400,{error:"invalid_request"},headers); }
    const url=requiredEnvironment("SUPABASE_URL");
    const auth=createClient(url,requiredEnvironment("SUPABASE_ANON_KEY"),{
      global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false},
    });
    const {data:user,error:authError}=await auth.auth.getUser();
    if (authError || !user.user) return jsonResponse(401,{error:"authentication_required"},headers);
    const service=createClient(url,requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
    let roomId=typeof body.roomId === "string" ? body.roomId : "";
    if (!roomId) {
      const channel=body.channelName ?? body.roomName;
      if (typeof channel !== "string" || !/^[A-Za-z0-9_@.-]{1,128}$/.test(channel)) return jsonResponse(400,{error:"invalid_room"},headers);
      const {data,error}=await service.from("rooms_v2").select("id").eq("livekit_room_name",channel).maybeSingle();
      if (error) throw error;
      if (!data) return jsonResponse(404,{error:"room_unavailable"},headers);
      roomId=data.id;
    }
    if (!ROOM_ID_PATTERN.test(roomId)) return jsonResponse(400,{error:"invalid_room"},headers);
    const {data:policy,error}=await service.rpc("rooms_byteplus_media_policy_v1",{p_room_id:roomId,p_user_id:user.user.id});
    if (error) {
      if (error.code === "42501") return jsonResponse(403,{error:"room_access_revoked"},headers);
      if (error.code === "P0002") return jsonResponse(404,{error:"room_unavailable"},headers);
      throw error;
    }
    if (!policy || policy.identity !== user.user.id || policy.roomId !== roomId || typeof policy.canPublish !== "boolean" || !Array.isArray(policy.members)) throw new Error("invalid_media_policy");
    const appId=requiredEnvironment("BYTEPLUS_RTC_APP_ID");
    let expiresAt=Math.floor(Date.now()/1000)+TTL_SECONDS;
    let token: string | undefined;
    if(policy.canPublish&&policy.publicationGeneration){
      const {data:cached,error:cacheError}=await service.from("room_byteplus_tokens_v1").select("token,expires_at")
        .eq("room_id",roomId).eq("user_id",user.user.id).eq("generation",policy.publicationGeneration)
        .gt("expires_at",new Date(Date.now()+30_000).toISOString()).order("expires_at",{ascending:false}).limit(1).maybeSingle();
      if(cacheError)throw cacheError;
      if(cached){token=cached.token;expiresAt=Math.floor(Date.parse(cached.expires_at)/1000);}
    }
    const reused=Boolean(token);
    token??=await generateBytePlusToken({appId,appKey:requiredEnvironment("BYTEPLUS_RTC_APP_KEY"),
      roomId:policy.roomName,userId:user.user.id,canPublish:policy.canPublish,expiresAt});
    if (policy.canPublish&&!reused) {
      const {error:recordError}=await service.rpc("rooms_record_byteplus_token_v1",{p_room_id:roomId,p_user_id:user.user.id,p_token:token,p_expires_at:new Date(expiresAt*1000).toISOString()});
      if(recordError?.code==="42501") return jsonResponse(403,{error:"publication_revoked"},headers);
      if(recordError)throw recordError;
    }
    const {data:ban,error:banError}=await service.from("room_byteplus_bans_v1").select("created_at").eq("room_id",roomId).eq("user_id",user.user.id).maybeSingle();
    if(banError)throw banError;
    if(ban){
      await new BytePlusAdmin().clearBan(policy.roomName,user.user.id);
      const {error:clearError}=await service.from("room_byteplus_bans_v1").delete().eq("room_id",roomId).eq("user_id",user.user.id).eq("created_at",ban.created_at);
      if(clearError)throw clearError;
    }
    return jsonResponse(200,{...policy,appId,token,channelName:policy.roomName,participantIdentity:user.user.id,expiresAt:new Date(expiresAt*1000).toISOString()},headers);
  } catch (error) {
    console.error("byteplus-token",error instanceof Error ? error.message : "token_unavailable");
    return jsonResponse(500,{error:"byteplus_token_unavailable"},headers);
  }
});
