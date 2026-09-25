export type MusicCreditRole =
  | "primaryArtist"
  | "featuredArtist"
  | "composer"
  | "lyricist"
  | "producer"
  | "performer"
  | "instrumentalist"
  | "mixEngineer"
  | "masteringEngineer"
  | "director"
  | "label"
  | "publisher"
  | "rightsHolder";

/**
 * Public attribution attached to one media asset.
 *
 * A credit is an attribution record, not a distribution authorisation. Rights
 * remain represented by MediaRightsGrant, even when the credited person is a
 * rights holder.
 */
export type MusicCredit = {
  id: string;
  assetId: string;
  displayName: string;
  role: MusicCreditRole;
  profileId?: string | null;
  instrument?: string | null;
  order: number;
};

export type MusicCreditsIssueCode =
  | "missing-credits"
  | "missing-primary-artist"
  | "invalid-credit-id"
  | "invalid-display-name"
  | "invalid-order"
  | "asset-mismatch"
  | "duplicate-credit-id"
  | "duplicate-credit";

export type MusicCreditsIssue = {
  code: MusicCreditsIssueCode;
  creditId?: string;
};

export type MusicCreditsDecision = {
  valid: boolean;
  assetId: string;
  orderedCredits: readonly MusicCredit[];
  issues: readonly MusicCreditsIssue[];
};
