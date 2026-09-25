import { describe, expect, it } from "vitest";
import sql from "../../../../supabase/migrations/20260820150000_loge_preview_private_media_v1.sql?raw";

describe("Loge private preview media SQL contract", () => {
  it("creates a bounded private audio bucket with control-only object policies", () => {
    expect(sql).toContain("'room-loge-previews',\n  'room-loge-previews',\n  false");
    expect(sql).toContain("26214400");
    expect(sql).toContain("'audio/wav'");
    expect(sql).toContain("'audio/mpeg'");
    expect(sql).toContain("rooms_specialized_loge_preview_can_upload_v1(name)");
    expect(sql).toContain("rooms_specialized_loge_preview_can_manage_v1(p_name)");
    expect(sql).toContain("rooms_specialized_loge_preview_can_delete_v1(name)");
    expect(sql).toContain("on storage.objects for insert to authenticated");
    expect(sql).toContain("on storage.objects for delete to authenticated");
    expect(sql).not.toContain("on storage.objects for select to authenticated");
    expect(sql).not.toMatch(/room_loge_preview[^;]+\bto anon\b/is);
    expect(sql).not.toMatch(/room-loge-previews[^;]+public\s*=\s*true/is);
  });

  it("accepts only opaque, Room-bound media paths", () => {
    const validator = sql.slice(
      sql.indexOf("create or replace function public.rooms_specialized_loge_preview_media_path_valid_v1"),
      sql.indexOf("create or replace function public.rooms_specialized_loge_preview_can_upload_v1"),
    );
    expect(validator).toContain("split_part(v_media_path, '/', 1) = p_room_id::text");
    expect(validator).toContain("(wav|mp3|aac|flac|m4a)");
    expect(validator).toContain("char_length(btrim(coalesce(v_preview->>'mediaName', ''))) between 1 and 255");
    expect(validator).toContain("validate constraint room_specialized_loge_preview_media_path_valid_v1");
  });

  it("keeps URL authorization service-only and resolves the exact state object", () => {
    const authority = sql.slice(
      sql.indexOf("create or replace function public.rooms_authorize_loge_preview_media_v1"),
      sql.indexOf("create or replace function public.rooms_specialized_project_state_v3"),
    );
    expect(authority).toContain("rooms_specialized_require_service_role_v1");
    expect(authority).toContain("v_media_path := v_preview->>'mediaPath'");
    expect(authority).toContain("object.bucket_id = 'room-loge-previews'");
    expect(authority).toContain("object.name = v_media_path");
    expect(authority).toContain("rooms_specialized_loge_eligible_v1");
    expect(authority).toContain("room_bans_v2");
    expect(authority).toContain("v_room_status = 'live'");
    expect(authority).toContain("v_room_status in ('live', 'ended')");
    expect(sql).toContain(
      "revoke all on function public.rooms_authorize_loge_preview_media_v1(uuid, uuid)\n  from public, anon, authenticated",
    );
    expect(sql).toContain(
      "grant execute on function public.rooms_authorize_loge_preview_media_v1(uuid, uuid)\n  to service_role",
    );
  });

  it("never projects a persistent media path to non-control callers", () => {
    const projection = sql.slice(
      sql.indexOf("create or replace function public.rooms_specialized_project_state_v3"),
      sql.indexOf("create or replace function public.rooms_get_specialized_state_v1"),
    );
    expect(projection).toContain("if p_control");
    expect(projection).toContain("'{loge,preview,mediaPath}', 'null'::jsonb");
    expect(projection).toContain("if not v_available then");
    expect(projection).toContain("'{loge,preview,durationSeconds}', 'null'::jsonb");
    expect(projection).toContain("'{loge,preview,channels}', 'null'::jsonb");
    expect(projection).toContain("'{loge,preview,sampleRate}', 'null'::jsonb");
    expect(projection).toContain("'{loge,preview,waveformPeaks}', '[]'::jsonb");
    expect(projection).toContain("p_room_status = 'live'");
    expect(projection).toContain("p_room_status in ('live', 'ended')");
    expect(sql).toContain("'mediaPath', null");
    expect(sql).toContain("rooms_specialized_project_state_v3(");
    expect(sql).not.toContain("signedUrl");
  });
});
