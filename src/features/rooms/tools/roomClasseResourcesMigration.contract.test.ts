import { describe, expect, it } from "vitest";
import config from "../../../../supabase/config.toml?raw";
import issuer from "../../../../supabase/functions/rooms-classe-resource-url/index.ts?raw";
import migration from "../../../../supabase/migrations/20260904120000_rooms_classe_resources_v1.sql?raw";

describe("Classroom private resources contract", () => {
  it("keeps the resource bucket private and bounded to images and audio", () => {
    expect(migration).toContain("'room-classe-resources'");
    expect(migration).toContain("false,\n  26214400");
    expect(migration).toContain("'image/jpeg'");
    expect(migration).toContain("'audio/mpeg'");
    expect(migration).not.toContain("getPublicUrl");
  });

  it("allows control uploads but no browser SELECT", () => {
    expect(migration).toContain("rooms_classe_resource_can_upload_v1");
    expect(migration).toContain("rooms_specialized_is_control_v1(room.id, auth.uid())");
    expect(migration).toContain("for insert to authenticated");
    expect(migration).not.toMatch(/create policy room_classe_resource[^\n]*read[\s\S]*?for select/iu);
    expect(migration).toContain("Browsers never receive SELECT");
  });

  it("authorizes one exact id for controls or an active entitled seat", () => {
    const authorityStart = migration.indexOf("create or replace function public.rooms_authorize_classe_resource_v1");
    const authorityEnd = migration.indexOf("create or replace function public.rooms_project_classe_resources_v1");
    const authority = migration.slice(authorityStart, authorityEnd);
    expect(authority).toContain("rooms_specialized_require_service_role_v1");
    expect(authority).toContain("rooms_classe_active_seat_v1");
    expect(authority).toContain("room_bans_v2");
    expect(authority).toContain("resource.value->>'id' = p_resource_id::text");
    expect(authority).toContain("storage.objects");
    expect(migration).toContain("to service_role");
  });

  it("hides paths from participants and metadata from public viewers", () => {
    expect(migration).toContain("v_resource - 'mediaPath' - 'mediaUrl'");
    expect(migration).toContain("not p_control and not p_has_active_seat");
    expect(migration).toContain("'{classe,resources}', '[]'::jsonb");
  });

  it("uses a JWT-protected server issuer and never returns the object path", () => {
    expect(config).toContain("[functions.rooms-classe-resource-url]\n");
    expect(config).toContain("verify_jwt = true");
    expect(issuer).toContain('authClient.auth.getUser()');
    expect(issuer).toContain('rooms_authorize_classe_resource_v1');
    expect(issuer).toContain("createSignedUrl(data.media_path, SIGNED_URL_TTL_SECONDS");
    const response = issuer.slice(issuer.indexOf("return jsonResponse(200"));
    expect(response).not.toContain("mediaPath:");
    expect(response).not.toContain("media_path:");
  });
});
