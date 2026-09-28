begin;

-- Public, coarse coordinates only. The private address/location table is
-- never exposed to the Globe; visibility and grade preferences remain those
-- of the canonical iOS profile projection.
create or replace view public.globe_public_markers_v1
with (security_invoker = true, security_barrier = true)
as
select
  marker.profile_id,
  coalesce(profile.display_name, profile.username) as display_name,
  profile.primary_role_key,
  profile.grade,
  profile.avatar_url,
  coalesce(marker.avatar_icon_id, profile.avatar_style_key) as avatar_icon_id,
  marker.city,
  marker.country_code,
  marker.commune_code,
  marker.zone_id,
  marker.zone_name,
  marker.scene_name,
  marker.latitude,
  marker.longitude
from public.profile_public_markers marker
join public.public_profiles profile on profile.id = marker.profile_id
where marker.is_visible is true
  and marker.latitude is not null
  and marker.longitude is not null;

grant select on public.globe_public_markers_v1 to authenticated;

commit;
