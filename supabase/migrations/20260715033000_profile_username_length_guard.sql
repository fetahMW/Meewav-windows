-- Keep new profile aliases compact enough for Meewav's map and profile UI.
--
-- Existing aliases are deliberately left untouched. The trigger accepts an
-- unchanged legacy value longer than the current limit, so unrelated profile
-- updates cannot lock an existing account out.

create or replace function public.enforce_profile_username_length()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.username is null
    or char_length(btrim(new.username)) <= 20
  then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and new.username is not distinct from old.username
  then
    return new;
  end if;

  raise exception 'Username must contain at most 20 characters'
    using errcode = '22001';
end;
$$;

drop trigger if exists enforce_profile_username_length_trigger on public.profiles;
create trigger enforce_profile_username_length_trigger
before insert or update of username on public.profiles
for each row
execute function public.enforce_profile_username_length();

create or replace function public.is_profile_username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select btrim(coalesce(p_username, '')) <> ''
    and char_length(btrim(p_username)) <= 20
    and not exists (
      select 1
      from public.profiles
      where lower(btrim(username)) = lower(btrim(p_username))
    );
$$;

revoke all on function public.is_profile_username_available(text) from public;
grant execute on function public.is_profile_username_available(text) to anon, authenticated, service_role;

comment on function public.enforce_profile_username_length() is
  'Rejects new or changed profile usernames longer than 20 characters while preserving unchanged legacy values.';
