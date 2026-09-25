export type ParisLandmarkAvatarSafetyZoneId =
  | "eiffel-tower"
  | "montparnasse-tower"
  | "notre-dame-paris";

export type ParisLandmarkAvatarSafetyZone = Readonly<{
  id: ParisLandmarkAvatarSafetyZoneId;
  label: string;
  center: readonly [number, number];
  radiusMeters: number;
}>;

export type ParisLandmarkSafeAvatarPosition = {
  lng: number;
  lat: number;
  moved: boolean;
  zoneId: ParisLandmarkAvatarSafetyZoneId | null;
};

export const PARIS_LANDMARK_AVATAR_SAFETY_ZONES: readonly ParisLandmarkAvatarSafetyZone[];

export function getParisLandmarkAvatarDistanceMeters(
  lng: number,
  lat: number,
  zone: ParisLandmarkAvatarSafetyZone,
): number;

export function getParisLandmarkSafeAvatarPosition(
  lng: number,
  lat: number,
  stableId: unknown,
): ParisLandmarkSafeAvatarPosition;

export function applyParisLandmarkAvatarSafetyToRecord<T>(
  avatar: T,
  stableId?: unknown,
): T;

export function applyParisLandmarkAvatarSafetyToFeatureCollection<T>(
  featureCollection: T,
): T;

export function isParisLandmarkAvatarPositionSafe(lng: number, lat: number): boolean;
