type ScenePublishingMetadata = Readonly<Record<string, unknown>>;

const NON_PUBLISHING_ROLE_KEYS = new Set([
  "viewer",
  "member",
  "audience",
  "fan",
  "utilisateur",
  "utilisatrice",
  "utilisateur utilisatrice",
]);

function normalizedText(value: unknown) {
  return typeof value === "string"
    ? value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("fr-FR")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
    : "";
}

/**
 * Frontend visibility policy for the publishing entry point.
 * The backend must still authorize the upload and publication operation.
 */
export function canDisplayScenePublishing({
  userMetadata,
  localArtistPreview = false,
}: {
  userMetadata?: ScenePublishingMetadata | null;
  localArtistPreview?: boolean;
}) {
  if (!userMetadata) return localArtistPreview;

  const role = normalizedText(
    userMetadata.primary_role_key
      ?? userMetadata.artist_type
      ?? userMetadata.role_key,
  );

  if (role) return !NON_PUBLISHING_ROLE_KEYS.has(role);
  if (userMetadata.is_artist === true) return true;

  const accountType = normalizedText(userMetadata.account_type);
  return accountType === "artist" || accountType === "artiste" || accountType === "creator";
}
