-- Link only endorsers already exposed by the public, non-ghost visibility filter.
-- Keeps existing permissions, owner checks, latest-state ranking and aggregates.
create or replace function public.get_profile_certif_summary_v1(p_profile_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_allowed boolean := false;
  v_unique_endorsers integer := 0;
  v_high_grade_endorsers integer := 0;
  v_verified_endorsers integer := 0;
  v_recent jsonb := '[]'::jsonb;
begin
  if p_profile_id is null then return null; end if;
  select (
    profile.id = auth.uid()
    or (
      coalesce(profile.show_on_public_profile, false)
      and not coalesce(profile.is_ghost_mode, true)
    )
  ) into v_allowed
  from public.profiles profile
  where profile.id = p_profile_id;
  if not coalesce(v_allowed, false) then return null; end if;

  with ranked as (
    select endorsement.*,
      row_number() over (
        partition by endorsement.sender_profile_id_snapshot
        order by endorsement.endorsed_at desc, endorsement.created_at desc, endorsement.id desc
      ) as sender_rank
    from public.profile_certif_endorsements_v1 endorsement
    where endorsement.recipient_profile_id_snapshot = p_profile_id
  ), active_latest as (
    select * from ranked where sender_rank = 1 and state = 'active'
  )
  select count(*)::integer,
    count(*) filter (where sender_grade_level_snapshot >= 4)::integer,
    count(*) filter (where sender_verified_snapshot)::integer
  into v_unique_endorsers, v_high_grade_endorsers, v_verified_endorsers
  from active_latest;

  with ranked as (
    select endorsement.*,
      row_number() over (
        partition by endorsement.sender_profile_id_snapshot
        order by endorsement.endorsed_at desc, endorsement.created_at desc, endorsement.id desc
      ) as sender_rank
    from public.profile_certif_endorsements_v1 endorsement
    where endorsement.recipient_profile_id_snapshot = p_profile_id
  ), visible_recent as (
    select endorsement.*
    from ranked endorsement
    join public.profiles sender on sender.id = endorsement.sender_profile_id_snapshot
    where endorsement.sender_rank = 1
      and endorsement.state = 'active'
      and coalesce(sender.show_on_public_profile, false)
      and not coalesce(sender.is_ghost_mode, true)
    order by endorsement.endorsed_at desc, endorsement.id desc
    limit 12
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'profile_id', sender_profile_id_snapshot,
    'display_name', sender_display_name_snapshot,
    'avatar_url', sender_avatar_url_snapshot,
    'grade_level_at_endorsement', sender_grade_level_snapshot,
    'followers_at_endorsement', sender_followers_count_snapshot,
    'was_verified_at_endorsement', sender_verified_snapshot,
    'endorsed_at', endorsed_at,
    'snapshot_quality', snapshot_quality
  ) order by endorsed_at desc), '[]'::jsonb)
  into v_recent
  from visible_recent;

  return jsonb_build_object(
    'profile_id', p_profile_id,
    'kind', 'signed_community_endorsements',
    'display_label', 'Validations reçues',
    'official_meewav_verification', false,
    'unique_endorsers', v_unique_endorsers,
    'high_grade_endorsers', v_high_grade_endorsers,
    'verified_endorsers', v_verified_endorsers,
    'signal_context_version', 'profile-signals-v1',
    'recent_public_endorsers', v_recent,
    'disclaimer', 'Éloges signées par des membres ; ne constituent pas une vérification officielle MeeWav.'
  );
end;
$$;
