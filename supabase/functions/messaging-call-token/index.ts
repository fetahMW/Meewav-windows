import { createClient } from 'npm:@supabase/supabase-js@2';
import { generateBytePlusToken } from '../_shared/byteplusToken.ts';

const headers = {
  // Auth uses an explicit bearer token, never ambient browser cookies. Every
  // request still checks the user and accepted conversation before issuing RTC.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json', 'Cache-Control': 'no-store',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status,headers});
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null,{status:204,headers});
  if (request.method !== 'POST') return json({error:'method_not_allowed'},405);
  const authorization = request.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) return json({error:'authentication_required'},401);
  try {
    let body;
    try { body = await request.json(); } catch { return json({error:'invalid_call'},400); }
    const callId = body?.callId;
    if (typeof callId !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(callId)) return json({error:'invalid_call'},400);
    const client = createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{
      global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false},
    });
    const {data:auth,error:authError} = await client.auth.getUser();
    if (authError || !auth.user) return json({error:'authentication_required'},401);
    // The user-scoped RPC checks accepted state and both memberships.
    const {data:call,error} = await client.rpc('messaging_video_call_v1',{p_action:'media',p_call_id:callId});
    if (error || !call || call.status !== 'accepted' || !['audio','video'].includes(call.kind)) return json({error:'call_not_allowed'},403);
    const appId = Deno.env.get('BYTEPLUS_RTC_APP_ID');
    const appKey = Deno.env.get('BYTEPLUS_RTC_APP_KEY');
    if (!appId || !appKey) return json({error:'media_not_configured'},503);
    const expiresAt = Math.floor(Date.now()/1000)+60;
    const token = await generateBytePlusToken({appId,appKey,roomId:call.roomId,userId:auth.user.id,
      canPublish:true,audioOnly:call.kind === 'audio',expiresAt});
    return json({appId,token,identity:auth.user.id,roomId:call.roomId,peerId:call.peerId,kind:call.kind,expiresAt});
  } catch { return json({error:'call_token_unavailable'},503); }
});
