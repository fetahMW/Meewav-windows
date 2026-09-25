import { getDesktopApplicationMode } from "../../runtime/applicationMode";
import { isLocalAuthPreviewEnabled } from "../auth/localAuthPreview";
import { isRoomsHomeWorkspacePreviewEnabled } from "../rooms/roomsHomeWorkspacePreview";

/** One preview contract for the owner identity and every Profile workspace. */
export function isProfileLocalPreviewEnabled() {
  const mode = getDesktopApplicationMode();
  if (mode) return mode === "demo";
  return isLocalAuthPreviewEnabled()
    || isRoomsHomeWorkspacePreviewEnabled(import.meta.env.DEV, import.meta.env.VITE_ROOMS_HOME_WORKSPACE_PREVIEW);
}
