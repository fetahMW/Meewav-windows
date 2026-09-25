export type AvatarRoleKey = string;

export const MIN_VISIBLE_AVATAR_CATEGORIES = 1;
export const MAX_VISIBLE_AVATAR_CATEGORIES = 30;
export const AVATAR_ZONE_NO_FILTER_PROFILE_THRESHOLD = 500;
export const AVATAR_ZONE_TEN_STYLE_PROFILE_THRESHOLD = 1_500;

export type AvatarVisibilityPreset = {
  professionKey: AvatarRoleKey;
  enabledRoleKeys: AvatarRoleKey[];
};

export type ToggleResult =
  | {
      status: "updated";
      nextKeys: AvatarRoleKey[];
    }
  | {
      status: "limit_reached";
      nextKeys: AvatarRoleKey[];
    };

export const BEATMAKER_PRESET: AvatarVisibilityPreset = {
  professionKey: "avatar_25",
  enabledRoleKeys: [
    "avatar_25",
    "avatar_14",
    "avatar_23",
    "avatar_24",
    "avatar_7",
    "avatar_16",
    "avatar_15",
  ],
};

export function getMaxVisibleCategories(totalProfilesInActiveZone: number): number {
  const totalProfiles = Math.max(0, Math.round(Number(totalProfilesInActiveZone) || 0));
  if (totalProfiles < AVATAR_ZONE_NO_FILTER_PROFILE_THRESHOLD) return MAX_VISIBLE_AVATAR_CATEGORIES;
  if (totalProfiles < AVATAR_ZONE_TEN_STYLE_PROFILE_THRESHOLD) return 10;
  return 5;
}

export function getMandatoryAvatarRoleKeys(
  preferredRoleKeys: readonly AvatarRoleKey[],
  fallbackRoleKeys: readonly AvatarRoleKey[],
  requiredStyleCount: number,
) {
  const requiredCount = Math.min(
    MAX_VISIBLE_AVATAR_CATEGORIES,
    Math.max(0, Math.round(requiredStyleCount)),
  );
  if (requiredCount === 0) return [];

  return [...new Set([...preferredRoleKeys, ...fallbackRoleKeys])].slice(0, requiredCount);
}

export function getAvatarVisibilityPreset(professionKey: string | null | undefined) {
  return professionKey === BEATMAKER_PRESET.professionKey ? BEATMAKER_PRESET : null;
}

export function isValidAvatarCategorySelection(
  keys: readonly AvatarRoleKey[],
  maximum = MAX_VISIBLE_AVATAR_CATEGORIES,
) {
  const uniqueKeys = new Set(keys);
  return uniqueKeys.size === keys.length
    && keys.length >= MIN_VISIBLE_AVATAR_CATEGORIES
    && keys.length <= Math.min(MAX_VISIBLE_AVATAR_CATEGORIES, Math.max(MIN_VISIBLE_AVATAR_CATEGORIES, maximum));
}

export function toggleAvatarRole(
  currentKeys: readonly AvatarRoleKey[],
  roleKey: AvatarRoleKey,
  maximum = MAX_VISIBLE_AVATAR_CATEGORIES,
): ToggleResult {
  const currentSelection = [...new Set(currentKeys)];

  if (currentSelection.includes(roleKey)) {
    return {
      status: "updated",
      nextKeys: currentSelection.filter((key) => key !== roleKey),
    };
  }

  if (currentSelection.length >= maximum) {
    return {
      status: "limit_reached",
      nextKeys: currentSelection,
    };
  }

  return {
    status: "updated",
    nextKeys: [...currentSelection, roleKey],
  };
}

export const toggleAvatarCategory = toggleAvatarRole;
