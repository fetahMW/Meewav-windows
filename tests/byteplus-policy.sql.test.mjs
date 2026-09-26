import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Real PostgreSQL execution of the new migrations. Existing application RPCs
// are minimal fixture implementations, not a replacement for Supabase E2E.
const fixture = `
create schema auth;
create role anon; create role authenticated; create role service_role bypassrls;
grant usage on schema public,auth to anon,authenticated,service_role;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
create table rooms_v2(id uuid primary key,host_id uuid,type text,title text,description text,status text,livekit_room_name text,video_format text,queue_open boolean,updated_at timestamptz);
alter table rooms_v2 enable row level security;
create policy existing_room_read on rooms_v2 for select to anon,authenticated using(true);
grant select on rooms_v2 to anon,authenticated;
create table room_participants_v2(room_id uuid,user_id uuid,role text,left_at timestamptz,primary key(room_id,user_id));
create table room_bans_v2(room_id uuid,user_id uuid,primary key(room_id,user_id));
create table room_invitations_v2(room_id uuid,guest_id uuid,status text,ended_at timestamptz);
create table room_specialized_state_v1(room_id uuid primary key,room_type text);
create table room_livekit_publication_grants_v1(room_id uuid,user_id uuid,is_authorized boolean,generation uuid,primary key(room_id,user_id));
create table fixture_revocations(room_id uuid,user_id uuid,generation uuid);
create function rooms_set_livekit_publication_authorization_v1(r uuid,u uuid,authorized boolean,reason text) returns void language plpgsql as $$
declare old room_livekit_publication_grants_v1%rowtype; begin
 select * into old from room_livekit_publication_grants_v1 where room_id=r and user_id=u;
 if old.is_authorized and not authorized then insert into fixture_revocations values(r,u,old.generation);end if;
 insert into room_livekit_publication_grants_v1 values(r,u,authorized,case when authorized and not coalesce(old.is_authorized,false) then gen_random_uuid() else coalesce(old.generation,gen_random_uuid()) end)
 on conflict(room_id,user_id) do update set is_authorized=excluded.is_authorized,generation=excluded.generation;
end $$;
create function rooms_livekit_room_changed_v1() returns trigger language plpgsql as $$ begin if new.type <> 'place' then return new; end if;return new;end $$;
create function rooms_end_place_v3(r uuid) returns rooms_v2 language plpgsql as $$
declare result rooms_v2;begin
 if not exists(select 1 from rooms_v2 where id=r and host_id=auth.uid()) then raise exception 'not_host' using errcode='42501';end if;
 update rooms_v2 set status='ended' where id=r returning * into result;return result;end $$;
create table room_classe_settings_v1(room_id uuid primary key,access_generation bigint default 0);
create table room_classe_floor_requests_v1(id uuid primary key,room_id uuid,user_id uuid,status text,granted_at timestamptz,ended_at timestamptz,ended_by uuid,end_reason text,revision int default 0);
create table room_classe_participations_v1(room_id uuid,user_id uuid,status text);
create function rooms_classe_assert_live_v1(r uuid,control boolean) returns void language plpgsql as $$begin
 if not exists(select 1 from rooms_v2 where id=r and status='live' and (not control or host_id=auth.uid())) then raise exception 'classe_forbidden' using errcode='42501';end if;end $$;
create function rooms_classe_emit_v1(r uuid,event text,audience text,target uuid,payload jsonb,subject uuid,at_time timestamptz) returns void language sql as $$ select $$;
create table room_experience_v1(room_id uuid primary key,version int,changed_at timestamptz);
create table wave_sessions_v3(id uuid primary key default gen_random_uuid(),room_id uuid unique,asset_ready boolean default false,launched boolean default false);
create function rooms_get_experience_v1(r uuid) returns void language sql as $$insert into room_experience_v1 values(r,0,now()) on conflict do nothing$$;
create function rooms_switch_experience_before_roster_v1(r uuid,v int,request uuid,kind text,cfg jsonb) returns void language plpgsql as $$begin
 insert into room_specialized_state_v1 values(r,kind) on conflict(room_id) do update set room_type=excluded.room_type;
 update room_experience_v1 set version=version+1 where room_id=r;end $$;
create function rooms_switch_experience_v1(r uuid,v int,request uuid,kind text,cfg jsonb) returns void language plpgsql as $$begin
 if kind='wave' and not exists(select 1 from wave_sessions_v3 where room_id=r and asset_ready) then raise exception 'wave_assets_not_ready';end if;
 perform rooms_switch_experience_before_roster_v1(r,v,request,kind,cfg);end $$;
create function rooms_launch_wave_production_v5(session uuid,idempotency text,request text) returns void language sql as $$update wave_sessions_v3 set launched=true where id=session$$;
`;

test('BytePlus SQL policies, generation tracking and atomic desktop launch', async t => {
  const db = await PGlite.create();
  const host = '11111111-1111-4111-8111-111111111111';
  const viewer = '22222222-2222-4222-8222-222222222222';
  const stranger = '33333333-3333-4333-8333-333333333333';
  const claim = async (role, user=host) => {
    await db.query("select set_config('request.jwt.claim.role',$1,false),set_config('request.jwt.claim.sub',$2,false)", [role,user]);
  };
  const create = async (kind='place', request=crypto.randomUUID(), extra={}) => {
    const config = {roomType:kind,title:'SQL test',access:'public',...extra};
    const result = await db.query('select rooms_create_desktop_v1($1::jsonb,$2::uuid) result', [JSON.stringify(config),request]);
    return {id:request,config,...result.rows[0].result};
  };
  const policy = async (room,user=viewer) => (await db.query('select rooms_byteplus_media_policy_v1($1::uuid,$2::uuid) result',[room,user])).rows[0].result;
  try {
    await db.exec(fixture);
    await db.query('insert into auth.users values($1),($2),($3)',[host,viewer,stranger]);
    for (const file of ['20260926120000_rooms_byteplus_media_policy.sql','20260926121000_rooms_byteplus_token_revocation.sql',
      '20260926121500_rooms_byteplus_revocation_triggers.sql','20260926122000_rooms_atomic_desktop_launch.sql','20260926123000_classe_host_floor_moderation.sql']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url),'utf8'));
    }
    await t.test('room creation is idempotent and rejects missing type or conflicting retries', async () => {
      await claim('authenticated');
      const room = await create('scene');
      const retry = await create('scene',room.id);
      assert.equal(retry.id,room.id); assert.equal(retry.ready,true);
      assert.equal((await db.query('select count(*)::int n from room_participants_v2 where room_id=$1',[room.id])).rows[0].n,1);
      await assert.rejects(create('loge',room.id),/launch_request_conflict/);
      await assert.rejects(create(undefined,crypto.randomUUID(),{roomType:null}),/launch_configuration_invalid/);
      await claim('authenticated',stranger);
      await assert.rejects(create('scene',room.id),/launch_request_conflict/);
    });
    await t.test('viewers cannot forge publisher status, banned and departed members cannot join', async () => {
      await claim('authenticated'); const room=await create();
      await db.query("insert into room_participants_v2 values($1,$2,'viewer',null)",[room.id,viewer]);
      await claim('service_role');
      assert.equal((await policy(room.id,host)).canPublish,true);
      assert.equal((await policy(room.id)).canPublish,false);
      await assert.rejects(policy(room.id,stranger),/room_access_revoked/);
      await db.query('insert into room_bans_v2 values($1,$2)',[room.id,viewer]);
      await assert.rejects(policy(room.id),/room_access_revoked/);
      await db.query('delete from room_bans_v2 where room_id=$1',[room.id]);
      await db.query('update room_participants_v2 set left_at=now() where room_id=$1 and user_id=$2',[room.id,viewer]);
      await assert.rejects(policy(room.id),/room_access_revoked/);
    });
    await t.test('all general room types require an actual active onstage invitation', async () => {
      for(const kind of ['place','loge','scene','wave','cage']) {
        await claim('authenticated'); const room=await create('place');
        if(kind!=='place') await db.query('insert into room_specialized_state_v1 values($1,$2)',[room.id,kind]);
        await db.query("insert into room_participants_v2 values($1,$2,'guest',null)",[room.id,viewer]);
        await claim('service_role'); assert.equal((await policy(room.id)).canPublish,false);
        await db.query("insert into room_invitations_v2 values($1,$2,'onstage',null)",[room.id,viewer]);
        assert.equal((await policy(room.id)).canPublish,true);
        await db.query('update room_invitations_v2 set ended_at=now() where room_id=$1',[room.id]);
        assert.equal((await policy(room.id)).canPublish,false);
      }
    });
    await t.test('Classe grants and revokes the same floor and stage authority as Android', async () => {
      await claim('authenticated'); const room=await create('classe');
      await db.query("insert into room_participants_v2 values($1,$2,'viewer',null)",[room.id,viewer]);
      await db.query('insert into room_classe_settings_v1(room_id) values($1)',[room.id]);
      await claim('service_role'); assert.equal((await policy(room.id)).canPublish,false);
      const request=crypto.randomUUID();
      await db.query("insert into room_classe_floor_requests_v1(id,room_id,user_id,status,granted_at) values($1,$2,$3,'granted',now())",[request,room.id,viewer]);
      assert.equal((await policy(room.id)).canPublish,true);
      await db.query("select rooms_record_byteplus_token_v1($1,$2,'001test-token-generation-one',now()+interval '120 seconds')",[room.id,viewer]);
      const old=(await db.query('select generation from room_byteplus_tokens_v1 where room_id=$1',[room.id])).rows[0].generation;
      await db.query("update room_classe_floor_requests_v1 set status='ended' where id=$1",[request]);
      assert.equal((await policy(room.id)).canPublish,false);
      assert.equal((await db.query('select generation from fixture_revocations where room_id=$1',[room.id])).rows[0].generation,old);
      await assert.rejects(db.query("select rooms_record_byteplus_token_v1($1,$2,'revoked-token',now()+interval '120 seconds')",[room.id,viewer]),/Publication revoked/);
      await db.query("insert into room_classe_participations_v1 values($1,$2,'onstage')",[room.id,viewer]);
      const current=await policy(room.id); assert.equal(current.canPublish,true);assert.notEqual(current.publicationGeneration,old);
      await db.query("update room_classe_participations_v1 set status='backstage' where room_id=$1",[room.id]);
      assert.equal((await policy(room.id)).canPublish,false);
    });
    await t.test('Wave preparation stays invisible and failed completion rolls back every transition', async () => {
      await claim('authenticated');const room=await create('wave');assert.equal(room.ready,false);
      await db.exec('set role authenticated');await claim('authenticated',viewer);
      assert.equal((await db.query('select count(*)::int n from rooms_v2 where id=$1',[room.id])).rows[0].n,0);
      await claim('authenticated',host);
      assert.equal((await db.query('select count(*)::int n from rooms_v2 where id=$1',[room.id])).rows[0].n,1);
      await db.exec('reset role');await claim('service_role');
      await assert.rejects(policy(room.id,host),/room_unavailable/);
      await claim('authenticated');
      await assert.rejects(db.query('select rooms_complete_desktop_wave_v1($1,$1)',[room.id]),/wave_assets_not_ready/);
      assert.equal((await db.query('select version from room_experience_v1 where room_id=$1',[room.id])).rows[0].version,0);
      await db.query('insert into wave_sessions_v3(room_id,asset_ready) values($1,true)',[room.id]);
      await db.query('select rooms_complete_desktop_wave_v1($1,$1)',[room.id]);
      await db.query('select rooms_complete_desktop_wave_v1($1,$1)',[room.id]);
      assert.equal((await db.query('select version from room_experience_v1 where room_id=$1',[room.id])).rows[0].version,1);
      assert.equal((await db.query('select launch_status from rooms_v2 where id=$1',[room.id])).rows[0].launch_status,'ready');
      assert.equal((await db.query('select launched from wave_sessions_v3 where room_id=$1',[room.id])).rows[0].launched,true);
    });
    await t.test('only the host dismisses canonical requests; clients cannot read bearer tokens', async () => {
      await claim('authenticated');const room=await create('classe');
      await db.query('insert into room_classe_settings_v1(room_id) values($1)',[room.id]);
      await db.query("insert into room_classe_floor_requests_v1(id,room_id,user_id,status) values(gen_random_uuid(),$1,$2,'requested')",[room.id,viewer]);
      await db.exec('set role authenticated');await claim('authenticated',viewer);
      await assert.rejects(db.query('select rooms_classe_dismiss_floor_requests_v1($1,null)',[room.id]),/classe_forbidden/);
      await assert.rejects(db.query('select * from room_byteplus_tokens_v1'),/permission denied/);
      await assert.rejects(policy(room.id,host),/permission denied/);
      await claim('authenticated',host);await db.query('select rooms_classe_dismiss_floor_requests_v1($1,null)',[room.id]);
      await db.exec('reset role');
      assert.equal((await db.query('select status from room_classe_floor_requests_v1 where room_id=$1',[room.id])).rows[0].status,'ended');
    });
    await t.test('the shared catalogue hides drafts/bans and resolves canonical or legacy room types', async () => {
      await claim('authenticated');
      const legacy=await create('classe'), draft=await create('wave'), banned=await create('scene');
      await db.exec('alter table rooms_v2 add column cover_url text,add column participants_count integer default 0,add column created_at timestamptz default now(); alter table room_experience_v1 add column current_type text;');
      await db.query('insert into room_bans_v2 values($1,$2)',[banned.id,viewer]);
      await db.exec(await readFile(new URL('../supabase/migrations/20260926131000_rooms_live_catalog.sql',import.meta.url),'utf8'));
      await db.exec('set role authenticated');await claim('authenticated',viewer);
      let catalog=(await db.query('select * from rooms_live_catalog_v1()')).rows;
      assert.equal(catalog.find(room=>room.id===legacy.id).type,'classe');
      assert.equal(catalog.some(room=>room.id===draft.id||room.id===banned.id),false);
      await db.exec('reset role');await db.query("update room_experience_v1 set current_type='place',version=0 where room_id=$1",[legacy.id]);
      catalog=(await db.query('select * from rooms_live_catalog_v1()')).rows;
      assert.equal(catalog.find(room=>room.id===legacy.id).type,'classe');
      await db.query("update room_experience_v1 set current_type='loge',version=1 where room_id=$1",[legacy.id]);
      catalog=(await db.query('select * from rooms_live_catalog_v1()')).rows;
      assert.equal(catalog.find(room=>room.id===legacy.id).type,'loge');
      await db.exec('set role anon');await assert.rejects(db.query('select * from rooms_live_catalog_v1()'),/permission denied/);await db.exec('reset role');
    });
  } finally { await db.close(); }
});
