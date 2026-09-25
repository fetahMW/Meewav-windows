export const ROOMS_HOME_WORKSPACE_PREVIEW_PATH = "/rooms/home";

const ROOMS_WORKSPACE_PREVIEW_PATHS = new Set([
  ROOMS_HOME_WORKSPACE_PREVIEW_PATH,
  "/rooms/loge",
  "/rooms/place",
  "/rooms/wave",
  "/rooms/cage",
  "/rooms/classe",
  "/rooms/scene",
]);

export function isRoomsHomeWorkspacePreviewEnabled(
  isDevelopment: boolean,
  flag: string | undefined,
) {
  return isDevelopment && flag === "true";
}

export function isRoomsHomeWorkspacePreviewPath(pathname: string) {
  if (ROOMS_WORKSPACE_PREVIEW_PATHS.has(pathname)) return true;

  const pathnameWithoutQuery = pathname.split(/[?#]/, 1)[0];
  return /^\/rooms\/collections\/[^/]+\/?$/i.test(pathnameWithoutQuery);
}

// Local workspace navigation is not a production authentication exemption.
export function isPillarWorkspacePreviewPath(pathname: string) {
  const path = pathname.split(/[?#]/, 1)[0];
  return ["/globe", "/messages", "/messagerie", "/scene", "/shorts", "/market", "/marketplace", "/tremplin", "/profile", "/profil"]
    .some(root => path === root || path.startsWith(`${root}/`));
}

export function getRoomsHomeWorkspacePreviewRedirect(pathname: string, enabled: boolean) {
  if (!enabled || isRoomsHomeWorkspacePreviewPath(pathname) || !pathname.startsWith("/rooms")) return null;
  return ROOMS_HOME_WORKSPACE_PREVIEW_PATH;
}
