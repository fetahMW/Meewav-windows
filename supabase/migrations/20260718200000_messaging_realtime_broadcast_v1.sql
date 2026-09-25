begin;

-- ---------------------------------------------------------------------------
-- Meewav Messaging private Realtime invalidation v1
--
-- Broadcasts contain identifiers only. Clients always reload the authoritative
-- RPC projection, so message bodies, attachment paths and private profile data
-- never transit through Realtime payloads.
-- ---------------------------------------------------------------------------

alter table realtime.messages enable row level security;

drop policy if exists "messaging_user_private_broadcasts_v1"
  on realtime.messages;
create policy "messaging_user_private_broadcasts_v1"
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and realtime.topic() = (
    'messaging:user:' || (select auth.uid())::text
  )
);

create or replace function public.messaging_emit_private_change_v1(
  p_profile_id uuid,
  p_domain text,
  p_entity_id uuid,
  p_operation text,
  p_source_table text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, realtime
as $$
begin
  if p_profile_id is null or p_entity_id is null then
    return;
  end if;

  perform realtime.send(
    jsonb_build_object(
      'version', 1,
      'domain', p_domain,
      'entity_id', p_entity_id,
      'operation', lower(p_operation),
      'source_table', p_source_table,
      'occurred_at', clock_timestamp()
    ),
    'messaging_change',
    'messaging:user:' || p_profile_id::text,
    true
  );
end;
$$;

revoke all on function public.messaging_emit_private_change_v1(
  uuid, text, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.messaging_emit_private_change_v1(
  uuid, text, uuid, text, text
) to service_role;

create or replace function public.messaging_broadcast_conversation_change_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, realtime
as $$
declare
  v_conversation_id uuid;
  v_profile_id uuid;
  v_affected_profile_id uuid;
  v_previous_profile_id uuid;
  v_topology_changed boolean := true;
begin
  if tg_table_name = 'messaging_conversations' then
    v_conversation_id := case when tg_op = 'DELETE' then old.id else new.id end;
  elsif tg_table_name = 'messaging_message_reactions' then
    select message.conversation_id
      into v_conversation_id
    from public.messaging_messages message
    where message.id = case when tg_op = 'DELETE' then old.message_id else new.message_id end;
  else
    v_conversation_id := case
      when tg_op = 'DELETE' then old.conversation_id
      else new.conversation_id
    end;
  end if;

  if tg_table_name = 'messaging_conversation_members' then
    if tg_op = 'DELETE' then
      v_affected_profile_id := old.profile_id;
    else
      v_affected_profile_id := new.profile_id;
    end if;

    if tg_op = 'UPDATE' then
      v_topology_changed := old.profile_id is distinct from new.profile_id
        or old.membership_status is distinct from new.membership_status
        or old.left_at is distinct from new.left_at
        or old.role is distinct from new.role;

      if old.profile_id is distinct from new.profile_id then
        v_previous_profile_id := old.profile_id;
      end if;
    end if;

    -- Read cursors and personal inbox preferences are private to one member.
    -- Broadcasting those writes to every participant creates avoidable fan-out
    -- and can form a reload -> mark-read -> broadcast feedback loop.
    if not v_topology_changed then
      perform public.messaging_emit_private_change_v1(
        v_affected_profile_id, 'conversation', v_conversation_id, tg_op, tg_table_name
      );
      return new;
    end if;
  end if;

  for v_profile_id in
    -- UNION, rather than a loop followed by extra sends, guarantees at most
    -- one invalidation per recipient for this trigger execution. The affected
    -- member is included even after leaving/deletion so their inbox can remove
    -- the conversation; a changed profile key invalidates both identities.
    select recipient.profile_id
    from (
      select member.profile_id
      from public.messaging_conversation_members member
      where member.conversation_id = v_conversation_id
        and member.membership_status = 'active'
        and member.left_at is null

      union

      select v_affected_profile_id
      where tg_table_name = 'messaging_conversation_members'

      union

      select v_previous_profile_id
      where tg_table_name = 'messaging_conversation_members'
    ) recipient
    where recipient.profile_id is not null
  loop
    perform public.messaging_emit_private_change_v1(
      v_profile_id, 'conversation', v_conversation_id, tg_op, tg_table_name
    );
  end loop;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.messaging_broadcast_collaboration_change_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, realtime
as $$
declare
  v_request public.collaboration_requests%rowtype;
begin
  if tg_table_name = 'collaboration_requests' then
    perform public.messaging_emit_private_change_v1(
      case when tg_op = 'DELETE' then old.sender_profile_id else new.sender_profile_id end,
      'collaboration',
      case when tg_op = 'DELETE' then old.id else new.id end,
      tg_op,
      tg_table_name
    );
    perform public.messaging_emit_private_change_v1(
      case when tg_op = 'DELETE' then old.recipient_profile_id else new.recipient_profile_id end,
      'collaboration',
      case when tg_op = 'DELETE' then old.id else new.id end,
      tg_op,
      tg_table_name
    );

    if tg_op = 'DELETE' then return old; end if;
    return new;
  elsif tg_table_name = 'collaboration_request_participant_state' then
    select * into v_request
    from public.collaboration_requests request
    where request.id = case when tg_op = 'DELETE' then old.request_id else new.request_id end;
  elsif tg_table_name = 'collaboration_request_transitions' then
    select * into v_request
    from public.collaboration_requests request
    where request.id = case when tg_op = 'DELETE' then old.request_id else new.request_id end;
  else
    select * into v_request
    from public.collaboration_requests request
    where request.id = case when tg_op = 'DELETE' then old.request_id else new.request_id end;
  end if;

  if v_request.id is not null then
    perform public.messaging_emit_private_change_v1(
      v_request.sender_profile_id, 'collaboration', v_request.id, tg_op, tg_table_name
    );
    perform public.messaging_emit_private_change_v1(
      v_request.recipient_profile_id, 'collaboration', v_request.id, tg_op, tg_table_name
    );
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.messaging_broadcast_project_change_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, realtime
as $$
declare
  v_project_id uuid;
  v_profile_id uuid;
begin
  if tg_table_name = 'creative_projects' then
    v_project_id := case when tg_op = 'DELETE' then old.id else new.id end;
  else
    v_project_id := case when tg_op = 'DELETE' then old.project_id else new.project_id end;
  end if;

  for v_profile_id in
    select distinct member.profile_id
    from public.creative_project_members member
    where member.project_id = v_project_id
      and member.left_at is null
  loop
    perform public.messaging_emit_private_change_v1(
      v_profile_id, 'project', v_project_id, tg_op, tg_table_name
    );
  end loop;

  if tg_table_name = 'creative_project_invitations' then
    perform public.messaging_emit_private_change_v1(
      case when tg_op = 'DELETE' then old.invited_profile_id else new.invited_profile_id end,
      'project', v_project_id, tg_op, tg_table_name
    );
    perform public.messaging_emit_private_change_v1(
      case when tg_op = 'DELETE' then old.inviter_profile_id else new.inviter_profile_id end,
      'project', v_project_id, tg_op, tg_table_name
    );
  elsif tg_table_name = 'creative_project_members' then
    perform public.messaging_emit_private_change_v1(
      case when tg_op = 'DELETE' then old.profile_id else new.profile_id end,
      'project', v_project_id, tg_op, tg_table_name
    );
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.messaging_broadcast_artist_group_change_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, realtime
as $$
declare
  v_group_id uuid;
  v_profile_id uuid;
begin
  if tg_table_name = 'artist_groups' then
    v_group_id := case when tg_op = 'DELETE' then old.id else new.id end;
  else
    v_group_id := case when tg_op = 'DELETE' then old.group_id else new.group_id end;
  end if;

  for v_profile_id in
    select distinct member.profile_id
    from public.artist_group_members member
    where member.group_id = v_group_id
      and member.membership_status = 'active'
  loop
    perform public.messaging_emit_private_change_v1(
      v_profile_id, 'group', v_group_id, tg_op, tg_table_name
    );
  end loop;

  if tg_table_name = 'artist_group_invitations' then
    perform public.messaging_emit_private_change_v1(
      case when tg_op = 'DELETE' then old.invitee_profile_id else new.invitee_profile_id end,
      'group', v_group_id, tg_op, tg_table_name
    );
    perform public.messaging_emit_private_change_v1(
      case when tg_op = 'DELETE' then old.invited_by_profile_id else new.invited_by_profile_id end,
      'group', v_group_id, tg_op, tg_table_name
    );
  elsif tg_table_name = 'artist_group_members' then
    perform public.messaging_emit_private_change_v1(
      case when tg_op = 'DELETE' then old.profile_id else new.profile_id end,
      'group', v_group_id, tg_op, tg_table_name
    );
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.messaging_broadcast_conversation_change_v1()
  from public, anon, authenticated;
revoke all on function public.messaging_broadcast_collaboration_change_v1()
  from public, anon, authenticated;
revoke all on function public.messaging_broadcast_project_change_v1()
  from public, anon, authenticated;
revoke all on function public.messaging_broadcast_artist_group_change_v1()
  from public, anon, authenticated;

drop trigger if exists messaging_realtime_conversations_v1 on public.messaging_conversations;
create trigger messaging_realtime_conversations_v1
after insert or update or delete on public.messaging_conversations
for each row execute function public.messaging_broadcast_conversation_change_v1();

drop trigger if exists messaging_realtime_members_v1 on public.messaging_conversation_members;
create trigger messaging_realtime_members_v1
after insert or update or delete on public.messaging_conversation_members
for each row execute function public.messaging_broadcast_conversation_change_v1();

drop trigger if exists messaging_realtime_messages_v1 on public.messaging_messages;
create trigger messaging_realtime_messages_v1
after insert or update or delete on public.messaging_messages
for each row execute function public.messaging_broadcast_conversation_change_v1();

drop trigger if exists messaging_realtime_reactions_v1 on public.messaging_message_reactions;
create trigger messaging_realtime_reactions_v1
after insert or update or delete on public.messaging_message_reactions
for each row execute function public.messaging_broadcast_conversation_change_v1();

drop trigger if exists messaging_realtime_collaborations_v1 on public.collaboration_requests;
create trigger messaging_realtime_collaborations_v1
after insert or update or delete on public.collaboration_requests
for each row execute function public.messaging_broadcast_collaboration_change_v1();

drop trigger if exists messaging_realtime_collab_participants_v1
  on public.collaboration_request_participant_state;
create trigger messaging_realtime_collab_participants_v1
after insert or update or delete on public.collaboration_request_participant_state
for each row execute function public.messaging_broadcast_collaboration_change_v1();

drop trigger if exists messaging_realtime_collab_transitions_v1
  on public.collaboration_request_transitions;
create trigger messaging_realtime_collab_transitions_v1
after insert or update or delete on public.collaboration_request_transitions
for each row execute function public.messaging_broadcast_collaboration_change_v1();

drop trigger if exists messaging_realtime_collab_attachments_v1
  on public.collaboration_request_attachments;
create trigger messaging_realtime_collab_attachments_v1
after insert or update or delete on public.collaboration_request_attachments
for each row execute function public.messaging_broadcast_collaboration_change_v1();

drop trigger if exists messaging_realtime_projects_v1 on public.creative_projects;
create trigger messaging_realtime_projects_v1
after insert or update or delete on public.creative_projects
for each row execute function public.messaging_broadcast_project_change_v1();

drop trigger if exists messaging_realtime_project_members_v1 on public.creative_project_members;
create trigger messaging_realtime_project_members_v1
after insert or update or delete on public.creative_project_members
for each row execute function public.messaging_broadcast_project_change_v1();

drop trigger if exists messaging_realtime_project_invitations_v1 on public.creative_project_invitations;
create trigger messaging_realtime_project_invitations_v1
after insert or update or delete on public.creative_project_invitations
for each row execute function public.messaging_broadcast_project_change_v1();

drop trigger if exists messaging_realtime_project_tasks_v1 on public.creative_project_tasks;
create trigger messaging_realtime_project_tasks_v1
after insert or update or delete on public.creative_project_tasks
for each row execute function public.messaging_broadcast_project_change_v1();

drop trigger if exists messaging_realtime_project_activity_v1 on public.creative_project_activity;
create trigger messaging_realtime_project_activity_v1
after insert on public.creative_project_activity
for each row execute function public.messaging_broadcast_project_change_v1();

drop trigger if exists messaging_realtime_groups_v1 on public.artist_groups;
create trigger messaging_realtime_groups_v1
after insert or update or delete on public.artist_groups
for each row execute function public.messaging_broadcast_artist_group_change_v1();

drop trigger if exists messaging_realtime_group_members_v1 on public.artist_group_members;
create trigger messaging_realtime_group_members_v1
after insert or update or delete on public.artist_group_members
for each row execute function public.messaging_broadcast_artist_group_change_v1();

drop trigger if exists messaging_realtime_group_invitations_v1 on public.artist_group_invitations;
create trigger messaging_realtime_group_invitations_v1
after insert or update or delete on public.artist_group_invitations
for each row execute function public.messaging_broadcast_artist_group_change_v1();

drop trigger if exists messaging_realtime_group_activity_v1 on public.artist_group_activity;
create trigger messaging_realtime_group_activity_v1
after insert on public.artist_group_activity
for each row execute function public.messaging_broadcast_artist_group_change_v1();

comment on function public.messaging_emit_private_change_v1(uuid, text, uuid, text, text)
is 'Emits metadata-only private Broadcast invalidations to one authenticated profile topic.';

commit;
