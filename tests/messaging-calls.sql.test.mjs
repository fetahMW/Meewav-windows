import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002',C='10000000-0000-4000-8000-000000000003';
const MODERN='20000000-0000-4000-8000-000000000001',LEGACY='20000000-0000-4000-8000-000000000002',GROUP='20000000-0000-4000-8000-000000000003';
const migration=await readFile(new URL('../supabase/migrations/20260926130000_messaging_calls_cross_client.sql',import.meta.url),'utf8');
test('direct call SQL on both conversation models (real PostgreSQL; stubbed auth and broadcast)',async t=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;create schema realtime;
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      create function realtime.topic() returns text language sql as $$select ''::text$$;
      create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$select$$;
      create table realtime.messages(extension text);alter table realtime.messages enable row level security;
      create table public.profiles(id uuid primary key,username text);
      create table public.user_blocks(blocker_profile_id uuid,blocked_profile_id uuid);
      create function public.messaging_profiles_blocked_v1(a uuid,b uuid) returns boolean language sql stable as
        $$select exists(select 1 from user_blocks where (blocker_profile_id=a and blocked_profile_id=b) or (blocker_profile_id=b and blocked_profile_id=a))$$;
      create table public.messaging_conversations(id uuid primary key,kind text,deleted_at timestamptz);
      create table public.messaging_direct_pairs(conversation_id uuid primary key references public.messaging_conversations(id) on delete cascade,profile_low_id uuid,profile_high_id uuid);
      create table public.messaging_conversation_members(conversation_id uuid references public.messaging_conversations(id) on delete cascade,profile_id uuid,membership_status text default 'active',left_at timestamptz,primary key(conversation_id,profile_id));
      create table public.messaging_direct_conversations_v1(id uuid primary key,participant_low_id uuid,participant_high_id uuid);
      create table public.messaging_conversation_participants_v1(conversation_id uuid,user_id uuid);
      -- Existing Android table: its NOT NULL and FK are deliberately tested.
      create table public.messaging_video_calls_v1(id uuid primary key default gen_random_uuid(),conversation_id uuid not null references public.messaging_direct_conversations_v1(id) on delete cascade,
        caller_id uuid references profiles(id),callee_id uuid references profiles(id),status text default 'ringing',created_at timestamptz default now(),answered_at timestamptz,ended_at timestamptz,
        caller_seen_at timestamptz default now(),callee_seen_at timestamptz default now(),media_kind text not null default 'video');
      insert into profiles values('${A}','Alice'),('${B}','Bob'),('${C}','Carol');
      insert into messaging_conversations values('${MODERN}','direct',null),('${LEGACY}','direct',null),('${GROUP}','group',null);
      insert into messaging_direct_pairs values('${MODERN}','${A}','${B}');
      insert into messaging_direct_conversations_v1 values('${LEGACY}','${A}','${B}');
      insert into messaging_conversation_participants_v1 values('${LEGACY}','${A}'),('${LEGACY}','${B}');
      insert into messaging_conversation_members(conversation_id,profile_id) values('${MODERN}','${A}'),('${MODERN}','${B}'),('${LEGACY}','${A}'),('${LEGACY}','${B}');`);
    await db.exec(migration);
    const as=async id=>{await db.query("select set_config('test.uid',$1,false)",[id]);};
    const action=async(name,id=null,conversation=null)=>(await db.query('select messaging_video_call_v1($1,$2::uuid,$3::uuid) as result',[name,conversation,id])).rows[0].result;
    const reset=async()=>{await db.exec("delete from messaging_video_calls_v1;delete from user_blocks;update messaging_conversation_members set membership_status='active',left_at=null;");await as(A);};
    await t.test('modern caller and legacy Android callee share one call ID, accept then media',async()=>{
      await reset(); const outgoing=await action('start_audio',null,MODERN);
      assert.equal(outgoing.kind,'audio');assert.equal(outgoing.conversationId,MODERN);assert.equal(outgoing.incoming,false);
      const row=(await db.query('select * from messaging_video_calls_v1')).rows[0];
      assert.equal(row.conversation_id,null);assert.equal(row.canonical_conversation_id,MODERN);
      await assert.rejects(action('accept',outgoing.id),/recipient_only/);
      assert.equal((await action('media',outgoing.id)).status,'ringing');
      await as(B);const incoming=await action('sync');assert.equal(incoming.id,outgoing.id);assert.equal(incoming.incoming,true);
      assert.equal((await action('accept',incoming.id)).status,'accepted');
      assert.equal((await action('media',incoming.id)).peerId,A);
      await db.query("update messaging_video_calls_v1 set callee_seen_at=now()-interval '5 seconds' where id=$1",[incoming.id]);
      const seen=(await db.query('select callee_seen_at::text as seen from messaging_video_calls_v1 where id=$1',[incoming.id])).rows[0].seen;
      await action('peek',incoming.id);
      assert.equal((await db.query('select callee_seen_at::text as seen from messaging_video_calls_v1 where id=$1',[incoming.id])).rows[0].seen,seen);
      await as(C);assert.equal(await action('sync',incoming.id),null);
      await as(A);assert.equal((await action('end',incoming.id)).status,'ended');
    });
    await t.test('legacy conversation keeps its FK and same response contract',async()=>{
      await reset();const call=await action('start',null,LEGACY);assert.equal(call.kind,'video');assert.equal(call.conversationId,LEGACY);
      const row=(await db.query('select * from messaging_video_calls_v1')).rows[0];assert.equal(row.conversation_id,LEGACY);assert.equal(row.canonical_conversation_id,null);
      await as(B);await action('accept',call.id);assert.equal((await action('media',call.id)).status,'accepted');
    });
    await t.test('group, invited, departed and either-direction blocks cannot create calls',async()=>{
      await reset();await assert.rejects(action('start',null,GROUP),/call_not_allowed/);
      await db.query("update messaging_conversation_members set membership_status='invited' where profile_id=$1",[B]);
      for(const id of[MODERN,LEGACY])await assert.rejects(action('start',null,id),/call_not_allowed/);
      await db.exec("update messaging_conversation_members set membership_status='active',left_at=now()");await assert.rejects(action('start',null,MODERN),/call_not_allowed/);
      await reset();await db.query('insert into user_blocks values($1,$2)',[B,A]);
      for(const id of[MODERN,LEGACY])await assert.rejects(action('start_audio',null,id),/call_not_allowed/);
    });
    await t.test('revoked membership stops an accepted call and refuses media renewal',async()=>{
      await reset();const call=await action('start',null,MODERN);await as(B);await action('accept',call.id);
      await db.query('update messaging_conversation_members set left_at=now() where profile_id=$1',[A]);
      assert.equal((await action('media',call.id)).status,'ended');
      assert.equal((await db.query('select status from messaging_video_calls_v1 where id=$1',[call.id])).rows[0].status,'ended');
      assert.equal((await action('sync',call.id)).status,'ended');
    });
    await t.test('crossed calls are busy; unanswered and lost-heartbeat calls expire',async()=>{
      await reset();const call=await action('start',null,MODERN);await as(B);
      await assert.rejects(action('start',null,LEGACY),/call_busy/);
      await db.exec("update messaging_video_calls_v1 set created_at=now()-interval '46 seconds'");assert.equal((await action('sync',call.id)).status,'missed');
      await reset();const next=await action('start',null,MODERN);await as(B);await action('accept',next.id);
      await db.exec("update messaging_video_calls_v1 set caller_seen_at=now()-interval '36 seconds'");assert.equal((await action('sync',next.id)).status,'missed');
    });
    await t.test('exactly one conversation FK and RPC-only access',async()=>{
      await reset();
      await assert.rejects(db.query('insert into messaging_video_calls_v1(caller_id,callee_id) values($1,$2)',[A,B]),/messaging_calls_one_conversation/);
      await assert.rejects(db.query('insert into messaging_video_calls_v1(conversation_id,canonical_conversation_id,caller_id,callee_id) values($1,$2,$3,$4)',[LEGACY,MODERN,A,B]),/messaging_calls_one_conversation/);
      await db.exec('set role authenticated');await assert.rejects(db.query('select * from messaging_video_calls_v1'),/permission denied/);await db.exec('reset role');
      await action('start',null,MODERN);await db.query('delete from messaging_conversations where id=$1',[MODERN]);
      assert.equal((await db.query('select count(*)::int as n from messaging_video_calls_v1')).rows[0].n,0);
    });
  }finally{await db.close();}
});
