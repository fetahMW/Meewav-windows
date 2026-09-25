-- MeeWav emoticon tokens use the same membership-protected reaction path.
begin;
create or replace function public.messaging_supported_reaction_v1(value text)
returns boolean language sql immutable set search_path = public, pg_temp
as $reaction$
  select coalesce(value in ('❤️', '🔥', '👏', '🎧', '⭐', '👍', '✅', '✨', '🎹')
    or (length(value) <= 100 and value ~ '^\[\[mw:[a-z0-9]+(-[a-z0-9]+)*\]\]$'), false);
$reaction$;
alter table public.messaging_message_reactions
  drop constraint if exists messaging_message_reactions_emoji_check;
alter table public.messaging_message_reactions
  add constraint messaging_message_reactions_emoji_check
  check (public.messaging_supported_reaction_v1(emoji));

create or replace function public.set_message_reaction_v1(
  p_message_id uuid,
  p_emoji text,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_conversation_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_message_id is null or p_active is null then
    raise exception using errcode = '22023', message = 'invalid_reaction_payload';
  end if;
  if p_emoji is null
     or not public.messaging_supported_reaction_v1(p_emoji) then
    raise exception using errcode = '22023', message = 'unsupported_reaction';
  end if;
  select message.conversation_id into v_conversation_id
  from public.messaging_messages message
  where message.id = p_message_id
    and message.deleted_at is null
    and message.moderation_status = 'visible';
  if v_conversation_id is null then
    raise exception using errcode = 'P0002', message = 'message_not_found';
  end if;
  if not public.messaging_is_member_v1(v_conversation_id) then
    raise exception using errcode = '42501', message = 'not_a_conversation_member';
  end if;

  if p_active then
    insert into public.messaging_message_reactions(message_id, profile_id, emoji)
    values (p_message_id, v_user_id, p_emoji)
    on conflict (message_id, profile_id, emoji) do nothing;
  else
    delete from public.messaging_message_reactions
    where message_id = p_message_id
      and profile_id = v_user_id
      and emoji = p_emoji;
  end if;

  return jsonb_build_object(
    'ok', true, 'message_id', p_message_id,
    'emoji', p_emoji, 'active', p_active
  );
end;
$$;
commit;
