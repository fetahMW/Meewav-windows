import { supabase } from "../../../lib/supabaseClient";
import { ROOMS_HOME_ROOM_TYPES, type RoomsHomeRoom } from "./roomsHome.types";

/** Uses the same rooms_v2/public_profiles contracts as the live Room viewer. */
export async function loadLiveRoomsCatalog(): Promise<RoomsHomeRoom[]> {
  const { data, error } = await supabase.from("rooms_v2")
    .select("id,host_id,type,title,cover_url,participants_count,created_at,video_format")
    .eq("status", "live").order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  const rooms = data ?? [];
  if (!rooms.length) return [];
  const { data: profiles, error: profileError } = await supabase.from("public_profiles")
    .select("id,username,display_name,avatar_url,profile_image_url,primary_role_key,city")
    .in("id", [...new Set(rooms.map((room) => room.host_id))]);
  if (profileError) throw profileError;
  return rooms.flatMap((room) => {
    if (!ROOMS_HOME_ROOM_TYPES.includes(room.type)) return [];
    const host = profiles?.find((profile) => profile.id === room.host_id);
    return [{
      id: room.id, slug: room.id, title: room.title, roomType: room.type,
      hostId: room.host_id, hostName: host?.display_name || host?.username || "Artiste",
      hostAvatar: host?.profile_image_url || host?.avatar_url || "", hostRole: host?.primary_role_key || "",
      thumbnail: room.cover_url || "", videoSource: "", musicStyle: "",
      mediaFormat: (room.video_format === "vertical" || room.video_format === "portrait") ? "vertical" : "horizontal",
      viewerCount: room.participants_count ?? 0, buzzScore: 0, recommendationScore: 0, engagementScore: 0,
      language: "", country: "", city: host?.city || undefined, tags: [], startedAt: room.created_at,
      isFollowedHost: false, accessType: "public", isJoinable: true,
    } satisfies RoomsHomeRoom];
  });
}
