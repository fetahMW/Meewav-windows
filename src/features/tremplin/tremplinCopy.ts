/**
 * Public wording that requires product/conformity review lives here so it can
 * change without rewriting the presentation components.
 */
export const TREMPLIN_COPY = {
  tokenName: "Jeton de talent",
  tokenNamePlural: "Jetons de talent",
  tokenDefinition: "Un jeton de talent est un jeton numérique associé à un artiste vérifié par MeeWav. Son achat est payant et facultatif. Sa valeur peut varier et sa revente peut ne pas être immédiate.",
  tokenProjectDefinition: "Une partie du montant est destinée à l’artiste. Les frais, la répartition et les risques sont affichés avant la confirmation.",
  freeAccess: "Aucun achat n’est nécessaire pour écouter, regarder ou suivre un artiste.",
  variableValueRisk: "Tu peux perdre tout ou partie du montant utilisé. La revente peut ne pas être immédiate. Aucun gain n’est garanti.",
  tokenRights: "Le jeton ne donne aucun droit sur l’artiste, son image, ses chansons, ses œuvres ou ses droits d’auteur.",
  demoMode: "Mode démonstration — aucune transaction réelle n’est effectuée.",
  serverRecalculation: "Les valeurs seront recalculées par le serveur avant toute opération réelle.",
  profileVerified: "Profil vérifié par MeeWav",
  followFree: "Suivre gratuitement",
  supportAvailable: "Jeton de talent actif",
  forcePromise: "Donner de la force à son projet",
} as const;

export const TREMPLIN_TRANSACTION_COPY = {
  steps: ["Montant", "Récapitulatif", "Règles et risques", "Confirmation"],
  estimate: "Estimation temporaire",
  mechanism: "Mécanisme de calcul de la valeur",
  artistShare: "Part destinée à l’artiste",
  ownershipShare: "Part du nombre total de jetons",
  resale: "Revendre mes jetons",
  buyMore: "Acheter d’autres jetons",
} as const;
