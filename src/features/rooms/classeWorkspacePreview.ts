export const CLASSE_WORKSPACE_PREVIEW_PATH = "/rooms/classe";

export function isClasseWorkspacePreviewEnabled(isDevelopment: boolean, flag: string | undefined) {
  return isDevelopment && flag === "true";
}

export function isClasseWorkspacePreviewPath(pathname: string) {
  return pathname === CLASSE_WORKSPACE_PREVIEW_PATH;
}

export function getClasseWorkspacePreviewRedirect(pathname: string, enabled: boolean) {
  if (!enabled || isClasseWorkspacePreviewPath(pathname)) return null;
  return CLASSE_WORKSPACE_PREVIEW_PATH;
}
