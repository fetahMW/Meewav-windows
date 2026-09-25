alter table public.profiles
  add column if not exists public_profile_preferences jsonb not null default '{
    "show_bio": true,
    "show_role": true,
    "show_grade": true,
    "show_collab": true,
    "show_viewer_menu": true,
    "featured_audio": null,
    "selected_shorts": []
  }'::jsonb;
create table if not exists public.profile_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  category text not null,
  amount numeric(12, 2) not null default 0,
  currency text not null default 'EUR',
  occurred_at timestamptz not null default now(),
  image_url text,
  is_token_trade boolean not null default false,
  token_label text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_profile_transactions_user_date
  on public.profile_transactions(user_id, occurred_at desc);
create table if not exists public.profile_contracts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  contract_type text not null,
  status text not null default 'draft',
  amount_label text,
  parties text,
  source text,
  details text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_profile_contracts_user_type_status
  on public.profile_contracts(user_id, contract_type, status);
create trigger profile_contracts_updated_at
  before update on public.profile_contracts
  for each row execute function public.update_updated_at();
create table if not exists public.profile_hardware_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  device_type text not null,
  status text not null default 'ready',
  latency_label text,
  accent_hex text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_profile_hardware_devices_user_type
  on public.profile_hardware_devices(user_id, device_type);
create trigger profile_hardware_devices_updated_at
  before update on public.profile_hardware_devices
  for each row execute function public.update_updated_at();
create table if not exists public.profile_organization_invitations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipient_name text not null,
  handle text not null,
  space_name text not null,
  role text not null,
  status text not null default 'pending',
  permissions jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_profile_organization_invitations_user_status
  on public.profile_organization_invitations(user_id, status, created_at desc);
create trigger profile_organization_invitations_updated_at
  before update on public.profile_organization_invitations
  for each row execute function public.update_updated_at();
create table if not exists public.profile_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null,
  description text not null default '',
  status text not null default '',
  visibility text not null default 'private',
  symbol text not null default 'seal.fill',
  accent_hex text not null default '#8EA2FF',
  progress numeric(4, 3) not null default 0 check (progress >= 0 and progress <= 1),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_profile_badges_user_category
  on public.profile_badges(user_id, category);
create trigger profile_badges_updated_at
  before update on public.profile_badges
  for each row execute function public.update_updated_at();
alter table public.profile_transactions enable row level security;
alter table public.profile_contracts enable row level security;
alter table public.profile_hardware_devices enable row level security;
alter table public.profile_organization_invitations enable row level security;
alter table public.profile_badges enable row level security;
create policy "Lire ses transactions profil"
on public.profile_transactions
for select
using (auth.uid() = user_id);
create policy "Créer ses transactions profil"
on public.profile_transactions
for insert
with check (auth.uid() = user_id);
create policy "Modifier ses transactions profil"
on public.profile_transactions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
create policy "Supprimer ses transactions profil"
on public.profile_transactions
for delete
using (auth.uid() = user_id);
create policy "Lire ses contrats profil"
on public.profile_contracts
for select
using (auth.uid() = user_id);
create policy "Créer ses contrats profil"
on public.profile_contracts
for insert
with check (auth.uid() = user_id);
create policy "Modifier ses contrats profil"
on public.profile_contracts
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
create policy "Supprimer ses contrats profil"
on public.profile_contracts
for delete
using (auth.uid() = user_id);
create policy "Lire son matériel profil"
on public.profile_hardware_devices
for select
using (auth.uid() = user_id);
create policy "Créer son matériel profil"
on public.profile_hardware_devices
for insert
with check (auth.uid() = user_id);
create policy "Modifier son matériel profil"
on public.profile_hardware_devices
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
create policy "Supprimer son matériel profil"
on public.profile_hardware_devices
for delete
using (auth.uid() = user_id);
create policy "Lire ses invitations profil"
on public.profile_organization_invitations
for select
using (auth.uid() = user_id);
create policy "Créer ses invitations profil"
on public.profile_organization_invitations
for insert
with check (auth.uid() = user_id);
create policy "Modifier ses invitations profil"
on public.profile_organization_invitations
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
create policy "Supprimer ses invitations profil"
on public.profile_organization_invitations
for delete
using (auth.uid() = user_id);
create policy "Lire ses badges profil ou badges publics"
on public.profile_badges
for select
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.profiles
    where profiles.id = profile_badges.user_id
      and profiles.show_on_public_profile is true
      and profiles.is_ghost_mode is false
  )
);
create policy "Créer ses badges profil"
on public.profile_badges
for insert
with check (auth.uid() = user_id);
create policy "Modifier ses badges profil"
on public.profile_badges
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
create policy "Supprimer ses badges profil"
on public.profile_badges
for delete
using (auth.uid() = user_id);
grant select, insert, update, delete on public.profile_transactions to authenticated;
grant select, insert, update, delete on public.profile_contracts to authenticated;
grant select, insert, update, delete on public.profile_hardware_devices to authenticated;
grant select, insert, update, delete on public.profile_organization_invitations to authenticated;
grant select, insert, update, delete on public.profile_badges to authenticated;
grant select on public.profile_badges to anon;
