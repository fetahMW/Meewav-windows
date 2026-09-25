// Piano-black lacquer, independent of the French regional palette.
export const FOREIGN_LAND_COLOR = "#08090B";

// Saved before the navbar-to-globe trial. User's "inverse" means: restore
// these on the large globe, then apply them to the navbar globe as well.
export const PRE_TRIAL_GLOBE_PALETTE = Object.freeze({ ocean: "#246BC4", land: "#6343B5" });

export const ACTIVE_GLOBE_PALETTE = Object.freeze({ ...PRE_TRIAL_GLOBE_PALETTE, ocean: "#707070" });

// Share the current globe pigments with the miniature; keep its own lighting.
export const NAVBAR_GLOBE_PALETTE = Object.freeze({
  ocean: ACTIVE_GLOBE_PALETTE.ocean,
  land: FOREIGN_LAND_COLOR,
});
