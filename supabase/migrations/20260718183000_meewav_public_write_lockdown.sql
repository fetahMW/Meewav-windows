begin;

-- P0 expand-step: browser roles never need to mutate Globe source tables or
-- the PostGIS spatial reference catalog. Keep legacy SELECT temporarily so the
-- following release can prove that Web/iOS use MVT and safe projections before
-- RLS/read lockdown is applied.
do $$
begin
  if to_regclass('public.mock_artists') is not null then
    execute 'revoke insert, update, delete, truncate, references, trigger
      on table public.mock_artists from public, anon, authenticated';
    execute 'comment on table public.mock_artists is
      ''Legacy Globe source. Browser writes revoked; public reads are temporary until MVT cutover is verified.''';
  end if;

  if to_regclass('public.musicians') is not null then
    execute 'revoke insert, update, delete, truncate, references, trigger
      on table public.musicians from public, anon, authenticated';
    execute 'comment on table public.musicians is
      ''Legacy Globe source. Browser writes revoked; public reads are temporary until MVT cutover is verified.''';
  end if;

  if to_regclass('public.spatial_ref_sys') is not null then
    execute 'revoke insert, update, delete, truncate, references, trigger
      on table public.spatial_ref_sys from public, anon, authenticated';
  end if;
end;
$$;

commit;
