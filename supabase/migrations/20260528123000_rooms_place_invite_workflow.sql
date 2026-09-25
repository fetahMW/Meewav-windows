alter table public.rooms_v2
  alter column queue_open set default false;
alter table public.room_invitations_v2
  drop constraint if exists room_invitations_v2_status_check;
alter table public.room_invitations_v2
  add constraint room_invitations_v2_status_check
  check (
    status in (
      'pending',
      'accepted',
      'ready',
      'backstage',
      'onstage',
      'cancelled',
      'declined',
      'ended',
      'kicked'
    )
  ) not valid;
alter table public.room_invitations_v2
  validate constraint room_invitations_v2_status_check;
create or replace function public.rooms_v2_assert_host(p_room_id uuid)
returns public.rooms_v2
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms_v2%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Non authentifie';
  end if;

  select *
    into v_room
  from public.rooms_v2
  where id = p_room_id
  for update;

  if not found then
    raise exception 'Room introuvable';
  end if;

  if v_room.host_id <> auth.uid() then
    raise exception 'Action reservee au host';
  end if;

  if v_room.status = 'ended' then
    raise exception 'Room terminee';
  end if;

  return v_room;
end;
$$;
create or replace function public.rooms_v2_upsert_participant(
  p_room_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.room_participants_v2 (room_id, user_id, role, left_at)
  values (p_room_id, p_user_id, p_role, null)
  on conflict (room_id, user_id)
  do update set
    role = excluded.role,
    left_at = null;
$$;
create or replace function public.rooms_v2_clear_guest_runtime(
  p_room_id uuid,
  p_guest_id uuid,
  p_mark_left boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.room_mixer_state_v2
  where room_id = p_room_id
    and guest_id = p_guest_id;

  update public.room_participants_v2
  set
    role = 'viewer',
    left_at = case when p_mark_left then now() else left_at end
  where room_id = p_room_id
    and user_id = p_guest_id;
end;
$$;
create or replace function public.rooms_join_queue_v2(
  p_room_id uuid,
  p_preview_url text default null
)
returns public.room_queue_v2
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms_v2%rowtype;
  v_entry public.room_queue_v2%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Non authentifie';
  end if;

  select *
    into v_room
  from public.rooms_v2
  where id = p_room_id;

  if not found then
    raise exception 'Room introuvable';
  end if;

  if v_room.status = 'ended' then
    raise exception 'Room terminee';
  end if;

  if v_room.queue_open is not true then
    raise exception 'File fermee';
  end if;

  if exists (
    select 1
    from public.room_bans_v2 b
    where b.room_id = p_room_id
      and b.user_id = auth.uid()
  ) then
    raise exception 'Acces file refuse';
  end if;

  if exists (
    select 1
    from public.room_invitations_v2 i
    where i.room_id = p_room_id
      and i.guest_id = auth.uid()
      and i.status in ('declined', 'kicked')
  ) then
    raise exception 'Invitation terminee pour cette room';
  end if;

  insert into public.room_queue_v2 (room_id, user_id, preview_url, removed_at)
  values (p_room_id, auth.uid(), p_preview_url, null)
  on conflict (room_id, user_id)
  do update set
    preview_url = excluded.preview_url,
    removed_at = null,
    joined_queue_at = now()
  returning *
    into v_entry;

  perform public.rooms_v2_upsert_participant(p_room_id, auth.uid(), 'viewer');
  return v_entry;
end;
$$;
create or replace function public.rooms_leave_queue_v2(p_queue_entry_id uuid)
returns public.room_queue_v2
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.room_queue_v2%rowtype;
  v_room public.rooms_v2%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Non authentifie';
  end if;

  select *
    into v_entry
  from public.room_queue_v2
  where id = p_queue_entry_id
    and removed_at is null
  for update;

  if not found then
    raise exception 'Entree de file introuvable';
  end if;

  select *
    into v_room
  from public.rooms_v2
  where id = v_entry.room_id;

  if v_entry.user_id <> auth.uid() and v_room.host_id <> auth.uid() then
    raise exception 'Action file refusee';
  end if;

  update public.room_queue_v2
  set removed_at = now()
  where id = p_queue_entry_id
  returning *
    into v_entry;

  return v_entry;
end;
$$;
create or replace function public.rooms_invite_from_queue_v2(p_queue_entry_id uuid)
returns public.room_invitations_v2
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.room_queue_v2%rowtype;
  v_room public.rooms_v2%rowtype;
  v_invitation public.room_invitations_v2%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Non authentifie';
  end if;

  select *
    into v_entry
  from public.room_queue_v2
  where id = p_queue_entry_id
    and removed_at is null
  for update;

  if not found then
    raise exception 'Entree de file introuvable';
  end if;

  v_room := public.rooms_v2_assert_host(v_entry.room_id);

  if exists (
    select 1
    from public.room_bans_v2 b
    where b.room_id = v_entry.room_id
      and b.user_id = v_entry.user_id
  ) then
    raise exception 'Invite banni';
  end if;

  if exists (
    select 1
    from public.room_invitations_v2 i
    where i.room_id = v_entry.room_id
      and i.guest_id = v_entry.user_id
      and i.status in ('declined', 'kicked')
  ) then
    raise exception 'Invitation deja terminee pour cette room';
  end if;

  insert into public.room_invitations_v2 (
    room_id,
    host_id,
    guest_id,
    status,
    accepted_at,
    ready_at,
    backstage_at,
    onstage_at,
    ended_at
  )
  values (
    v_entry.room_id,
    v_room.host_id,
    v_entry.user_id,
    'pending',
    null,
    null,
    null,
    null,
    null
  )
  on conflict (room_id, guest_id)
  do update set
    host_id = excluded.host_id,
    status = 'pending',
    accepted_at = null,
    ready_at = null,
    backstage_at = null,
    onstage_at = null,
    ended_at = null
  where public.room_invitations_v2.status not in ('declined', 'kicked')
  returning *
    into v_invitation;

  if v_invitation.id is null then
    raise exception 'Invitation deja terminee pour cette room';
  end if;

  perform public.rooms_v2_upsert_participant(v_entry.room_id, v_entry.user_id, 'viewer');
  return v_invitation;
end;
$$;
create or replace function public.rooms_accept_invitation_v2(p_invitation_id uuid)
returns public.room_invitations_v2
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.room_invitations_v2%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Non authentifie';
  end if;

  select *
    into v_invitation
  from public.room_invitations_v2
  where id = p_invitation_id
    and ended_at is null
  for update;

  if not found then
    raise exception 'Invitation introuvable';
  end if;

  if v_invitation.guest_id <> auth.uid() then
    raise exception 'Invitation reservee au guest';
  end if;

  if v_invitation.status <> 'pending' then
    raise exception 'Invitation non acceptables dans cet etat';
  end if;

  update public.room_invitations_v2
  set
    status = 'accepted',
    accepted_at = coalesce(accepted_at, now())
  where id = p_invitation_id
  returning *
    into v_invitation;

  update public.room_queue_v2
  set removed_at = now()
  where room_id = v_invitation.room_id
    and user_id = v_invitation.guest_id
    and removed_at is null;

  perform public.rooms_v2_upsert_participant(v_invitation.room_id, v_invitation.guest_id, 'viewer');
  return v_invitation;
end;
$$;
create or replace function public.rooms_decline_invitation_v2(p_invitation_id uuid)
returns public.room_invitations_v2
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.room_invitations_v2%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Non authentifie';
  end if;

  select *
    into v_invitation
  from public.room_invitations_v2
  where id = p_invitation_id
    and ended_at is null
  for update;

  if not found then
    raise exception 'Invitation introuvable';
  end if;

  if v_invitation.guest_id <> auth.uid() then
    raise exception 'Invitation reservee au guest';
  end if;

  if v_invitation.status not in ('pending', 'accepted') then
    raise exception 'Invitation non refusable dans cet etat';
  end if;

  update public.room_invitations_v2
  set
    status = 'declined',
    ended_at = now()
  where id = p_invitation_id
  returning *
    into v_invitation;

  update public.room_queue_v2
  set removed_at = now()
  where room_id = v_invitation.room_id
    and user_id = v_invitation.guest_id
    and removed_at is null;

  perform public.rooms_v2_clear_guest_runtime(v_invitation.room_id, v_invitation.guest_id, false);
  return v_invitation;
end;
$$;
create or replace function public.rooms_mark_invitation_ready_v2(p_invitation_id uuid)
returns public.room_invitations_v2
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.room_invitations_v2%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Non authentifie';
  end if;

  select *
    into v_invitation
  from public.room_invitations_v2
  where id = p_invitation_id
    and ended_at is null
  for update;

  if not found then
    raise exception 'Invitation introuvable';
  end if;

  if v_invitation.guest_id <> auth.uid() then
    raise exception 'Invitation reservee au guest';
  end if;

  if v_invitation.status <> 'accepted' then
    raise exception 'Green house requise avant etat pret';
  end if;

  update public.room_invitations_v2
  set
    status = 'ready',
    ready_at = coalesce(ready_at, now())
  where id = p_invitation_id
  returning *
    into v_invitation;

  perform public.rooms_v2_upsert_participant(v_invitation.room_id, v_invitation.guest_id, 'guest');
  return v_invitation;
end;
$$;
create or replace function public.rooms_move_invitation_to_backstage_v2(p_invitation_id uuid)
returns public.room_invitations_v2
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.room_invitations_v2%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Non authentifie';
  end if;

  select *
    into v_invitation
  from public.room_invitations_v2
  where id = p_invitation_id
    and ended_at is null
  for update;

  if not found then
    raise exception 'Invitation introuvable';
  end if;

  perform public.rooms_v2_assert_host(v_invitation.room_id);

  if v_invitation.status not in ('ready', 'onstage') then
    raise exception 'Invite non pret pour les coulisses';
  end if;

  update public.room_invitations_v2
  set
    status = 'backstage',
    backstage_at = coalesce(backstage_at, now())
  where id = p_invitation_id
  returning *
    into v_invitation;

  perform public.rooms_v2_upsert_participant(v_invitation.room_id, v_invitation.guest_id, 'guest');
  return v_invitation;
end;
$$;
create or replace function public.rooms_move_invitation_to_stage_v2(p_invitation_id uuid)
returns public.room_invitations_v2
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.room_invitations_v2%rowtype;
  v_onstage_count integer;
begin
  if auth.uid() is null then
    raise exception 'Non authentifie';
  end if;

  select *
    into v_invitation
  from public.room_invitations_v2
  where id = p_invitation_id
    and ended_at is null
  for update;

  if not found then
    raise exception 'Invitation introuvable';
  end if;

  perform public.rooms_v2_assert_host(v_invitation.room_id);

  if v_invitation.status <> 'backstage' then
    raise exception 'Seules les coulisses peuvent monter sur scene';
  end if;

  select count(*)
    into v_onstage_count
  from public.room_invitations_v2
  where room_id = v_invitation.room_id
    and status = 'onstage'
    and ended_at is null
    and id <> p_invitation_id;

  if v_onstage_count >= 3 then
    raise exception 'Scene limitee a trois invites';
  end if;

  update public.room_invitations_v2
  set
    status = 'onstage',
    onstage_at = coalesce(onstage_at, now())
  where id = p_invitation_id
  returning *
    into v_invitation;

  perform public.rooms_v2_upsert_participant(v_invitation.room_id, v_invitation.guest_id, 'guest');
  return v_invitation;
end;
$$;
create or replace function public.rooms_move_invitation_to_invitations_v2(
  p_invitation_id uuid,
  p_requires_setup boolean default false
)
returns public.room_invitations_v2
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.room_invitations_v2%rowtype;
  v_next_status text;
begin
  if auth.uid() is null then
    raise exception 'Non authentifie';
  end if;

  select *
    into v_invitation
  from public.room_invitations_v2
  where id = p_invitation_id
    and ended_at is null
  for update;

  if not found then
    raise exception 'Invitation introuvable';
  end if;

  perform public.rooms_v2_assert_host(v_invitation.room_id);

  if v_invitation.status not in ('ready', 'backstage', 'onstage') then
    raise exception 'Invite non redescendable';
  end if;

  v_next_status := case when p_requires_setup then 'accepted' else 'ready' end;

  update public.room_invitations_v2
  set status = v_next_status
  where id = p_invitation_id
  returning *
    into v_invitation;

  if p_requires_setup then
    perform public.rooms_v2_clear_guest_runtime(v_invitation.room_id, v_invitation.guest_id, false);
  else
    perform public.rooms_v2_upsert_participant(v_invitation.room_id, v_invitation.guest_id, 'guest');
  end if;

  return v_invitation;
end;
$$;
create or replace function public.rooms_cancel_invitation_v2(p_invitation_id uuid)
returns public.room_invitations_v2
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.room_invitations_v2%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Non authentifie';
  end if;

  select *
    into v_invitation
  from public.room_invitations_v2
  where id = p_invitation_id
    and ended_at is null
  for update;

  if not found then
    raise exception 'Invitation introuvable';
  end if;

  perform public.rooms_v2_assert_host(v_invitation.room_id);

  if v_invitation.status not in ('pending', 'accepted', 'ready') then
    raise exception 'Invitation non annulable dans cet etat';
  end if;

  update public.room_invitations_v2
  set
    status = 'cancelled',
    ended_at = now()
  where id = p_invitation_id
  returning *
    into v_invitation;

  perform public.rooms_v2_clear_guest_runtime(v_invitation.room_id, v_invitation.guest_id, false);
  return v_invitation;
end;
$$;
create or replace function public.rooms_kick_invitation_v2(
  p_invitation_id uuid,
  p_reason text default 'host_kick'
)
returns public.room_invitations_v2
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.room_invitations_v2%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Non authentifie';
  end if;

  select *
    into v_invitation
  from public.room_invitations_v2
  where id = p_invitation_id
    and ended_at is null
  for update;

  if not found then
    raise exception 'Invitation introuvable';
  end if;

  perform public.rooms_v2_assert_host(v_invitation.room_id);

  update public.room_invitations_v2
  set
    status = 'kicked',
    ended_at = now()
  where id = p_invitation_id
  returning *
    into v_invitation;

  insert into public.room_bans_v2 (room_id, user_id, banned_by, reason)
  values (v_invitation.room_id, v_invitation.guest_id, auth.uid(), p_reason)
  on conflict (room_id, user_id)
  do update set
    banned_by = excluded.banned_by,
    reason = excluded.reason,
    created_at = now();

  update public.room_queue_v2
  set removed_at = now()
  where room_id = v_invitation.room_id
    and user_id = v_invitation.guest_id
    and removed_at is null;

  perform public.rooms_v2_clear_guest_runtime(v_invitation.room_id, v_invitation.guest_id, true);
  return v_invitation;
end;
$$;
drop policy if exists "Host invite" on public.room_invitations_v2;
create policy "Host invite" on public.room_invitations_v2
for insert
with check (
  auth.uid() = host_id
  and exists (
    select 1
    from public.rooms_v2 r
    where r.id = room_invitations_v2.room_id
      and r.host_id = auth.uid()
      and r.status <> 'ended'
  )
);
drop policy if exists "Update invitation" on public.room_invitations_v2;
create policy "Update invitation via RPC" on public.room_invitations_v2
for update
using (false)
with check (false);
drop policy if exists "Rejoindre la file" on public.room_queue_v2;
create policy "Rejoindre la file" on public.room_queue_v2
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.rooms_v2 r
    where r.id = room_queue_v2.room_id
      and r.queue_open = true
      and r.status <> 'ended'
  )
  and not exists (
    select 1
    from public.room_bans_v2 b
    where b.room_id = room_queue_v2.room_id
      and b.user_id = auth.uid()
  )
  and not exists (
    select 1
    from public.room_invitations_v2 i
    where i.room_id = room_queue_v2.room_id
      and i.guest_id = auth.uid()
      and i.status in ('declined', 'kicked')
  )
);
drop policy if exists "Update file" on public.room_queue_v2;
create policy "Update file" on public.room_queue_v2
for update
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.rooms_v2 r
    where r.id = room_queue_v2.room_id
      and r.host_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.rooms_v2 r
    where r.id = room_queue_v2.room_id
      and r.host_id = auth.uid()
  )
  or (
    auth.uid() = user_id
    and not exists (
      select 1
      from public.room_bans_v2 b
      where b.room_id = room_queue_v2.room_id
        and b.user_id = auth.uid()
    )
    and not exists (
      select 1
      from public.room_invitations_v2 i
      where i.room_id = room_queue_v2.room_id
        and i.guest_id = auth.uid()
        and i.status in ('declined', 'kicked')
    )
  )
);
grant execute on function public.rooms_v2_assert_host(uuid) to authenticated;
grant execute on function public.rooms_v2_upsert_participant(uuid, uuid, text) to authenticated;
grant execute on function public.rooms_v2_clear_guest_runtime(uuid, uuid, boolean) to authenticated;
grant execute on function public.rooms_join_queue_v2(uuid, text) to authenticated;
grant execute on function public.rooms_leave_queue_v2(uuid) to authenticated;
grant execute on function public.rooms_invite_from_queue_v2(uuid) to authenticated;
grant execute on function public.rooms_accept_invitation_v2(uuid) to authenticated;
grant execute on function public.rooms_decline_invitation_v2(uuid) to authenticated;
grant execute on function public.rooms_mark_invitation_ready_v2(uuid) to authenticated;
grant execute on function public.rooms_move_invitation_to_backstage_v2(uuid) to authenticated;
grant execute on function public.rooms_move_invitation_to_stage_v2(uuid) to authenticated;
grant execute on function public.rooms_move_invitation_to_invitations_v2(uuid, boolean) to authenticated;
grant execute on function public.rooms_cancel_invitation_v2(uuid) to authenticated;
grant execute on function public.rooms_kick_invitation_v2(uuid, text) to authenticated;
