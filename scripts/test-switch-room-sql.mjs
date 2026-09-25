import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href);
const db=new PGlite();
const host='51000000-0000-4000-8000-000000000001',viewer='51000000-0000-4000-8000-000000000002',late='51000000-0000-4000-8000-000000000003',newcomer='51000000-0000-4000-8000-000000000004',room='61000000-0000-4000-8000-000000000001',request='71000000-0000-4000-8000-000000000001';
const rpc=async(name,args=[])=>{const r=await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args);return r.rows[0].result};
const as=async(id)=>db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`);
try {
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;
create table profiles(id uuid primary key,display_name text,username text);
create table rooms_v2(id uuid primary key,host_id uuid,status text,type text,visibility text default 'public',created_at timestamptz default now(),updated_at timestamptz default now(),livekit_room_name text default 'same-media',participants_count int default 3);
create table room_participants_v2(room_id uuid,user_id uuid,left_at timestamptz,role text default 'viewer');create table room_bans_v2(room_id uuid,user_id uuid);
create table room_messages_v2(id uuid default gen_random_uuid(),room_id uuid,user_id uuid,content text,is_system boolean);
create table room_specialized_state_v1(room_id uuid primary key,room_type text,revision bigint,state jsonb,updated_by uuid);
create table room_live_call_invitations_v1(room_id uuid,status text);
grant select on rooms_v2,room_bans_v2 to anon,authenticated;
insert into profiles values('${host}','Malo Beat','malo'),('${viewer}','Viewer','viewer'),('${late}','Late','late'),('${newcomer}','New','new');
insert into rooms_v2(id,host_id,status,type) values('${room}','${host}','live','place');insert into room_participants_v2(room_id,user_id) values('${room}','${viewer}'),('${room}','${late}');
create function rooms_cast_scene_evaluation_v1(p_room_id uuid,p_performance_id text,p_rating int,p_reactions text[]) returns jsonb language sql as $$select '{"ok":true}'::jsonb$$;
`);
await db.exec(await readFile('supabase/migrations/20260905150000_rooms_place_conversation_tools_v1.sql','utf8'));
await db.exec(`create function auth.role() returns text language sql as $$select current_user::text$$;create table wave_sessions_v3(id uuid,room_id uuid,production_reference_id uuid,active_rules_revision_id uuid,lifecycle_state text);create table wave_production_references_v5(id uuid,studio_asset_id uuid,light_asset_id uuid);create table wave_audio_assets_v3(id uuid,status text);`);
await db.exec(await readFile('supabase/migrations/20260907190000_rooms_switch_experience_v1.sql','utf8'));
await assert.rejects(()=>db.exec("update rooms_v2 set type='scene'"),/switch_required/);
await as(host);const initial=await rpc('rooms_get_experience_v1',[room]);assert.equal(initial.version,0);
await as(viewer);await rpc('rooms_get_experience_v1',[room]);await assert.rejects(()=>rpc('rooms_switch_experience_v1',[room,0,request,'scene',{}]),/switch_forbidden/);
await as(host);await assert.rejects(()=>rpc('rooms_switch_experience_v1',[room,0,request,'place',{}]),/switch_current_room/);await assert.rejects(()=>rpc('rooms_switch_experience_v1',[room,0,request,'wave',{}]),/switch_wave_preparation_required/);await assert.rejects(()=>rpc('rooms_switch_experience_v1',[room,0,request,'scene',{}]),/switch_scene_config_invalid/);
await db.exec(`reset role;insert into room_live_call_invitations_v1 values('${room}','accepted');`);await as(host);await assert.rejects(()=>rpc('rooms_switch_experience_v1',[room,0,request,'scene',{program:'Mon morceau',duration:5,evaluation:true}]),/switch_private_media/);await db.exec('reset role;delete from room_live_call_invitations_v1');await as(host);
await rpc('rooms_apply_place_tools_v1',[room,0,{type:'floor.join',personId:viewer}]);await assert.rejects(()=>rpc('rooms_switch_experience_v1',[room,0,request,'scene',{program:'Mon morceau',duration:5,evaluation:true}]),/switch_busy/);await rpc('rooms_apply_place_tools_v1',[room,1,{type:'floor.leave',personId:viewer}]);
const config={program:'Mon morceau\nFinal',duration:5,evaluation:true};const result=await rpc('rooms_switch_experience_v1',[room,0,request,'scene',config]);assert.equal(result.version,1);assert.equal(result.current,'scene');assert.equal((await rpc('rooms_switch_experience_v1',[room,0,request,'scene',config])).version,1);
await assert.rejects(()=>rpc('rooms_switch_experience_v1',[room,0,'71000000-0000-4000-8000-000000000002','place',{}]),/switch_conflict/);
await as(viewer);assert.equal((await rpc('rooms_get_experience_v1',[room])).acceptedVersion,0);await assert.rejects(()=>rpc('rooms_apply_place_tools_v1',[room,2,{type:'floor.join',personId:viewer}]),/switch_stale/);await assert.rejects(()=>rpc('rooms_cast_scene_evaluation_v1',[room,'id',5,[]]),/switch_stale/);await rpc('rooms_accept_experience_v1',[room,1,request]);assert.equal((await rpc('rooms_cast_scene_evaluation_v1',[room,'id',5,[]])).ok,true);
await as(late);assert.equal((await rpc('rooms_get_experience_v1',[room])).acceptedVersion,0); // missed every event, still pending
await db.exec(`reset role;insert into room_participants_v2(room_id,user_id) values('${room}','${newcomer}');`);await as(newcomer);assert.equal((await rpc('rooms_get_experience_v1',[room])).acceptedVersion,1);
await as(host);await assert.rejects(()=>rpc('rooms_switch_experience_v1',[room,1,'71000000-0000-4000-8000-000000000002','place',{}]),/switch_rate_limit/);
await db.exec("reset role;update room_experience_v1 set changed_at=now()-interval '10 seconds';");await as(host);await rpc('rooms_switch_experience_v1',[room,1,'71000000-0000-4000-8000-000000000002','place',{}]);await as(late);await assert.rejects(()=>rpc('rooms_accept_experience_v1',[room,1,request]),/switch_stale/);
await db.exec('reset role');const rows=(await db.query('select * from rooms_v2')).rows;assert.equal(rows.length,1);assert.equal(rows[0].livekit_room_name,'same-media');assert.equal(rows[0].participants_count,3);assert.equal((await db.query('select count(*)::int n from room_messages_v2')).rows[0].n,2);
// Every directed pair uses the same live; preserve specialized content on return.
const configs={place:{},scene:{program:'Retained programme',duration:5,evaluation:true},classe:{launch:{roomType:'classe',values:{seats:24,handsOpen:true,questionsOpen:true}}},loge:{launch:{roomType:'loge',values:{previewTitle:'Écoute',previewDescription:'Présentation',questionsOpen:true,liveOnly:true}}},wave:{},cage:{cage:{version:1,title:'Tournoi conservé',discipline:'Rap',format:'tournament',participantCount:16,rosterMode:'manual',rosterProfileIds:[],rules:{performanceMode:'successive',rounds:1,passageDurationSeconds:90,votingDurationSeconds:60,votingMode:'public',tieBreak:'sudden-death',allowByes:false,allowFormatReduction:false,allowReplacement:true,disconnectGraceSeconds:60,noShowGraceSeconds:90}}}};
await db.exec(`insert into wave_sessions_v3 values(gen_random_uuid(),'${room}',gen_random_uuid(),gen_random_uuid(),'PAUSED')`);
await db.exec(`insert into wave_audio_assets_v3 select production_reference_id,'READY' from wave_sessions_v3;insert into wave_production_references_v5 select production_reference_id,production_reference_id,production_reference_id from wave_sessions_v3;`);
let count=2;
async function go(target){await db.exec("reset role;update room_experience_v1 set changed_at=now()-interval '10 seconds'");await as(host);const state=await rpc('rooms_get_experience_v1',[room]);if(state.current===target)return;const change=crypto.randomUUID();const next=await rpc('rooms_switch_experience_v1',[room,state.version,change,target,configs[target]]);assert.equal(next.current,target);assert.equal(next.version,state.version+1);count++;await as(viewer);assert.ok((await rpc('rooms_get_experience_v1',[room])).acceptedVersion<next.version);await rpc('rooms_accept_experience_v1',[room,next.version,change]);}
for(const origin of Object.keys(configs)){await go(origin);for(const target of Object.keys(configs)){if(target===origin)continue;await go(target);await go(origin);}}
await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from rooms_v2')).rows[0].n,1);assert.equal((await db.query('select count(*)::int n from room_messages_v2')).rows[0].n,count);
assert.equal((await db.query("select state#>>'{scene,program,0,title}' title from room_experience_tools_v1 where room_type='scene'")).rows[0].title,'Mon morceau');
// Exercise the Wave staging transaction with processor output fixtures. The external worker is not simulated as a deployment.
await db.exec(`alter table wave_sessions_v3 add column current_beat_revision_id uuid default gen_random_uuid();
create table wave_asset_uploads_v4(asset_id uuid,session_id uuid,actor_id uuid,purpose text,state text,playback_asset_id uuid,preview_asset_id uuid,analysis_id uuid);
create table wave_loop_analysis_v3(id uuid,loop_version_id uuid,compatibility text);
create table wave_beat_tracks_v3(beat_revision_id uuid,loop_version_id uuid,position int,is_host_base boolean);
create table wave_beat_revisions_v3(id uuid,render_asset_id uuid,render_status text);
create function public.rooms_initialize_wave_production_v3(p_room_id uuid,p_rules jsonb,p_idempotency_key text) returns jsonb language sql as $$select '{}'::jsonb$$;`);
await db.exec(await readFile('supabase/migrations/20260907191000_rooms_switch_wave_preparation_v1.sql','utf8'));
await as(host);const active=await rpc('rooms_get_experience_v1',[room]);const waveConfig={launch:{roomType:'wave',values:{bpm:92,key:'Am'},baseLoop:{bars:8}}};
await as(viewer);await assert.rejects(()=>rpc('rooms_prepare_wave_switch_v1',[room,active.version,waveConfig]),/switch_forbidden/);
await as(host);const staged=await rpc('rooms_prepare_wave_switch_v1',[room,active.version,waveConfig]);assert.ok(staged.sessionId);assert.equal((await rpc('rooms_get_experience_v1',[room])).version,active.version);
await assert.rejects(()=>rpc('rooms_complete_wave_switch_base_v1',[room,active.version,crypto.randomUUID()]),/switch_wave_audio_processing/);
await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from room_messages_v2')).rows[0].n,count);
console.log('PASS: 30 directed transitions, preserved tools, independent invitations, permissions, stale commands; Wave preparation does not notify or switch before processed audio.');
} catch(error){console.error(error.message,error.where??"");process.exitCode=1;} finally {await db.close()}
