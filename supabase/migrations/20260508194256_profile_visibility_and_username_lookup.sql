alter table public.profiles
  alter column is_ghost_mode set default true,
  alter column show_on_public_profile set default false;
create or replace function public.resolve_profile_email_for_username(p_username text)
returns table(email text)
language sql
security definer
set search_path = public
as $$
  select profiles.email
  from public.profiles
  where lower(profiles.username) = lower(trim(p_username))
  limit 1
$$;
revoke all on function public.resolve_profile_email_for_username(text) from public;
grant execute on function public.resolve_profile_email_for_username(text) to anon, authenticated;
drop policy if exists "Tout le monde peut voir les profils" on public.profiles;
create policy "Voir les profils publics ou son propre profil"
on public.profiles
for select
using (
  auth.uid() = id
  or (
    show_on_public_profile is true
    and is_ghost_mode is false
  )
);
