import type { User } from "@supabase/supabase-js";
import type { AuthStatus } from "../auth/AuthContext";
import { LOCAL_PREVIEW_FETAH_HOST } from "../auth/localAuthPreview";
import type { TremplinUserState } from "./tremplinProductModel";

type TremplinAuthUser = Pick<User, "id" | "email" | "user_metadata">;

export type TremplinViewer = {
  storageScope: string;
  displayName: string;
  avatarUrl: string;
  userState: TremplinUserState;
  authenticated: boolean;
};

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
function safeAvatarUrl(value: unknown) {
  const url = asText(value);
  if (url.startsWith("/") || /^https:\/\//i.test(url)) return url;
  return "";
}

function getMetadataUserState(metadata: Record<string, unknown>): TremplinUserState {
  const tokenStatus = asText(metadata.tremplin_token_status ?? metadata.token_status).toLowerCase();
  const applicationStatus = asText(metadata.tremplin_application_status ?? metadata.token_application_status).toLowerCase();
  const gradeCandidate = Number(metadata.tremplin_grade ?? metadata.grade ?? 0);
  const artistRole = asText(metadata.primary_role_key ?? metadata.artist_type);
  const isArtist = metadata.is_artist === true
    || asText(metadata.account_type).toLowerCase() === "artist"
    || artistRole.length > 0;

  if (["active", "enabled", "live"].includes(tokenStatus)) return "token-active";
  if (["pending", "review", "verification", "submitted"].includes(applicationStatus)
    || ["review", "verification"].includes(tokenStatus)) return "application-pending";
  if (isArtist && Number.isFinite(gradeCandidate) && gradeCandidate >= 2) return "talent-eligible";
  if (isArtist) return "talent-level-1";
  return "member";
}

export function resolveTremplinViewer({
  user,
  authStatus,
  localPreviewEnabled,
}: {
  user: TremplinAuthUser | null;
  authStatus: AuthStatus;
  localPreviewEnabled: boolean;
}): TremplinViewer {
  if (user && authStatus === "authenticated") {
    const metadata = user.user_metadata ?? {};
    const displayName = asText(metadata.display_name)
      || asText(metadata.full_name)
      || asText(metadata.username)
      || user.email?.split("@")[0]
      || "Mon compte";
    const avatarUrl = safeAvatarUrl(metadata.profile_image_url)
      || safeAvatarUrl(metadata.avatar_url)
      || safeAvatarUrl(metadata.picture)
      || "/avatars/utilisateur.png";
    return {
      storageScope: `user:${user.id}`,
      displayName,
      avatarUrl,
      userState: getMetadataUserState(metadata),
      authenticated: true,
    };
  }

  if (localPreviewEnabled) {
    return {
      storageScope: `preview:${LOCAL_PREVIEW_FETAH_HOST.profileId}`,
      displayName: LOCAL_PREVIEW_FETAH_HOST.displayName,
      avatarUrl: LOCAL_PREVIEW_FETAH_HOST.portraitUrl,
      userState: "talent-level-1",
      authenticated: false,
    };
  }

  return {
    storageScope: "guest",
    displayName: "Mes artistes",
    avatarUrl: "/avatars/utilisateur.png",
    userState: "visitor",
    authenticated: false,
  };
}
