import type { MarketProduct } from "./marketDemoData";

type EditorialSeed = {
  id: string;
  pillarId: MarketProduct["pillarId"];
  category: MarketProduct["category"];
  brand: string;
  model: string;
  title: string;
  description: string;
  image: string;
  price: number;
  compareAt?: number;
  sellerId: string;
  locationId: string;
  badge: string;
};

const editorialImage = (filename: string) =>
  `/images/market/expansion/editorial/${filename}`;

const editorialSeeds: EditorialSeed[] = [
  // Neuf — une mini-sélection éditoriale supplémentaire, photographiée pour le Market.
  { id: "editorial-new-beatgrid-16", pillarId: "new", category: "Contrôleurs MIDI", brand: "BeatGrid", model: "16 Graphite", title: "BeatGrid 16 Graphite", description: "Station rythmique autonome, pads haute vélocité et séquenceur polymétrique pour le live.", image: "drum-machine-graphite.webp", price: 749, compareAt: 829, sellerId: "session-club", locationId: "paris-11", badge: "Nouvelle série" },
  { id: "editorial-new-fieldtrack-x8", pillarId: "new", category: "Enregistreurs", brand: "FieldTrack", model: "X8 Pro Kit", title: "FieldTrack X8 Pro Kit", description: "Enregistreur 32 bits flottants, sac terrain, casque fermé et faisceau XLR complet.", image: "field-recorder-pro-kit.webp", price: 689, compareAt: 759, sellerId: "broadcast-lab", locationId: "lyon-2", badge: "Kit complet" },
  { id: "editorial-new-aurora-c67", pillarId: "new", category: "Microphones", brand: "Aurora", model: "C67 Valve Chain", title: "Aurora C67 + préampli lampe", description: "Chaîne vocale premium appairée en atelier, suspension, alimentation et flight case inclus.", image: "condenser-tube-preamp.webp", price: 1790, compareAt: 1990, sellerId: "studio-supply", locationId: "bordeaux-chartrons", badge: "Appairé en atelier" },
  { id: "editorial-new-obsidian-seven", pillarId: "new", category: "Guitares", brand: "Obsidian", model: "Seven Custom", title: "Obsidian Seven Custom", description: "Sept cordes moderne, diapason multiscale et micros actifs, livrée réglée avec étui rigide.", image: "seven-string-pedalboard.webp", price: 1649, compareAt: 1799, sellerId: "guitar-house", locationId: "lille-wazemmes", badge: "Réglage offert" },
  { id: "editorial-new-atlas-9u", pillarId: "new", category: "Synthétiseurs", brand: "Atlas Modular", model: "Performance 9U", title: "Atlas Modular Performance 9U", description: "Case Eurorack de scène, alimentation silencieuse et couvercle patché pour les tournées.", image: "eurorack-performance-case.webp", price: 1199, compareAt: 1329, sellerId: "modular-corner", locationId: "strasbourg-krutenau", badge: "Prêt à patcher" },

  // Occasion — de vraies annonces communautaires, avec état et histoire propres.
  { id: "editorial-used-beatgrid-tour", pillarId: "used", category: "Contrôleurs MIDI", brand: "BeatGrid", model: "16 Tour Edition", title: "BeatGrid 16 · Tour Edition", description: "Utilisée sur huit dates, pads impeccables, alimentation et Decksaver fournis.", image: "drum-machine-graphite.webp", price: 515, compareAt: 749, sellerId: "camille-mix", locationId: "nantes-centre", badge: "Testée 24 h" },
  { id: "editorial-used-fieldtrack-documentary", pillarId: "used", category: "Enregistreurs", brand: "FieldTrack", model: "X8 Documentary", title: "FieldTrack X8 · Kit documentaire", description: "Kit de tournage complet ayant servi sur un court métrage, connectiques contrôlées et sac propre.", image: "field-recorder-pro-kit.webp", price: 475, compareAt: 689, sellerId: "room-collective", locationId: "marseille-cours-julien", badge: "Batteries incluses" },
  { id: "editorial-used-aurora-valve", pillarId: "used", category: "Microphones", brand: "Aurora", model: "C67 Valve", title: "Aurora C67 Valve Chain", description: "Chaîne vocale de studio non-fumeur, lampe remplacée et capsule vérifiée ce mois-ci.", image: "condenser-tube-preamp.webp", price: 1240, compareAt: 1790, sellerId: "waveform-studio", locationId: "nice-port", badge: "Révision fournie" },
  { id: "editorial-used-obsidian-rig", pillarId: "used", category: "Guitares", brand: "Obsidian", model: "Seven Live Rig", title: "Obsidian Seven + pedalboard", description: "Rig metal moderne complet, guitare fraîchement réglée et pedalboard câblé prêt à jouer.", image: "seven-string-pedalboard.webp", price: 1380, compareAt: 2040, sellerId: "elise-tones", locationId: "montpellier-beaux-arts", badge: "Rig complet" },
  { id: "editorial-used-atlas-touring", pillarId: "used", category: "Synthétiseurs", brand: "Atlas Modular", model: "Touring 9U", title: "Atlas 9U · Case de tournée", description: "Case robuste avec alimentation révisée, quelques marques extérieures et rails parfaitement droits.", image: "eurorack-performance-case.webp", price: 790, compareAt: 1199, sellerId: "noemie-sound", locationId: "rennes-centre", badge: "Alimentation révisée" },

  // Location — cinq rigs immédiatement réservables.
  { id: "editorial-rental-beatgrid", pillarId: "rental", category: "Contrôleurs MIDI", brand: "BeatGrid", model: "16 Live Pack", title: "BeatGrid 16 · Pack beatmaking", description: "Groovebox, housse, alimentation et câblage pour une session ou un live compact.", image: "drum-machine-graphite.webp", price: 29, sellerId: "session-club", locationId: "paris-11", badge: "Disponible demain" },
  { id: "editorial-rental-fieldtrack", pillarId: "rental", category: "Enregistreurs", brand: "FieldTrack", model: "Cinema X8", title: "FieldTrack X8 · Pack tournage", description: "Pack son cinéma avec sac, casque, perche courte, batteries et câbles XLR repérés.", image: "field-recorder-pro-kit.webp", price: 42, sellerId: "broadcast-lab", locationId: "lyon-2", badge: "Réservation instantanée" },
  { id: "editorial-rental-vocal-chain", pillarId: "rental", category: "Microphones", brand: "Aurora", model: "C67 Vocal Pack", title: "Chaîne vocale Aurora C67", description: "Micro à lampe et préampli appairé pour une prise voix haut de gamme en studio.", image: "condenser-tube-preamp.webp", price: 58, sellerId: "waveform-studio", locationId: "bordeaux-chartrons", badge: "Assurance incluse" },
  { id: "editorial-rental-seven-rig", pillarId: "rental", category: "Guitares", brand: "Obsidian", model: "Seven Stage Rig", title: "Obsidian Seven · Rig live", description: "Sept cordes, pedalboard et case pour répétition, scène ou captation live.", image: "seven-string-pedalboard.webp", price: 39, sellerId: "guitar-house", locationId: "lille-wazemmes", badge: "Case incluse" },
  { id: "editorial-rental-eurorack", pillarId: "rental", category: "Synthétiseurs", brand: "Atlas Modular", model: "Performance System", title: "Eurorack Atlas · Performance System", description: "Système modulaire complet, patchbook de départ et prise en main de vingt minutes.", image: "eurorack-performance-case.webp", price: 64, sellerId: "modular-corner", locationId: "strasbourg-krutenau", badge: "Patchbook inclus" },

  // Services — l'expertise humaine est le produit.
  { id: "editorial-service-mastering", pillarId: "services", category: "Mix & mastering", brand: "Meewav Masters", model: "Analog Signature", title: "Mastering analogique premium", description: "Mastering stéréo avec écoute critique, chaîne analogique et deux séries de retours incluses.", image: "mastering-engineer-session.webp", price: 129, sellerId: "camille-mix", locationId: "paris-11", badge: "Livraison 72 h" },
  { id: "editorial-service-vocal-coaching", pillarId: "services", category: "Cours & coaching", brand: "Vocal Lab", model: "Intensive Session", title: "Coaching vocal intensif", description: "Séance personnalisée respiration, placement, interprétation et préparation d'une prise studio.", image: "vocal-coaching-session.webp", price: 75, sellerId: "elise-tones", locationId: "lyon-2", badge: "Créneau cette semaine" },
  { id: "editorial-service-vocal-recording", pillarId: "services", category: "Rooms & studios", brand: "Waveform Studio", model: "Vocal Session", title: "Session voix avec chaîne à lampe", description: "Deux heures de cabine, ingénieur son, comping et export des prises haute résolution.", image: "condenser-tube-preamp.webp", price: 180, sellerId: "waveform-studio", locationId: "bordeaux-chartrons", badge: "Ingénieur inclus" },
  { id: "editorial-service-modular-design", pillarId: "services", category: "Cours & coaching", brand: "Modular Corner", model: "Sound Design Lab", title: "Atelier sound design modulaire", description: "Créez un patch complet, automatisez-le et repartez avec les stems et la fiche de patch.", image: "eurorack-performance-case.webp", price: 95, sellerId: "modular-corner", locationId: "strasbourg-krutenau", badge: "Tous niveaux" },
  { id: "editorial-service-guitar-tone", pillarId: "services", category: "Cours & coaching", brand: "Guitar House", model: "Tone Clinic", title: "Guitar Tone Clinic", description: "Réglage du rig, gain staging et construction de trois sons prêts pour scène et studio.", image: "seven-string-pedalboard.webp", price: 89, sellerId: "guitar-house", locationId: "lille-wazemmes", badge: "Rig personnalisé" },

  // Achats groupés — visuels produits et progression communautaire.
  { id: "editorial-collective-beatgrid", pillarId: "collective", category: "Contrôleurs MIDI", brand: "BeatGrid", model: "Creator Pack", title: "BeatGrid 16 · Pack créateurs", description: "Groovebox, Decksaver et banque de drums Meewav au palier collectif.", image: "drum-machine-graphite.webp", price: 619, compareAt: 749, sellerId: "session-club", locationId: "paris-11", badge: "42 membres" },
  { id: "editorial-collective-fieldtrack", pillarId: "collective", category: "Enregistreurs", brand: "FieldTrack", model: "Collective Film Kit", title: "FieldTrack X8 · Kit collectif", description: "Commande film et documentaire avec sac terrain et batteries supplémentaires débloquées.", image: "field-recorder-pro-kit.webp", price: 559, compareAt: 689, sellerId: "broadcast-lab", locationId: "lyon-2", badge: "78 % atteint" },
  { id: "editorial-collective-aurora", pillarId: "collective", category: "Microphones", brand: "Aurora", model: "C67 Community Chain", title: "Aurora C67 · Chaîne communautaire", description: "Micro, préampli et suspension appairés, avec contrôle gratuit après six mois.", image: "condenser-tube-preamp.webp", price: 1490, compareAt: 1790, sellerId: "studio-supply", locationId: "bordeaux-chartrons", badge: "Plus que 8 places" },
  { id: "editorial-collective-obsidian", pillarId: "collective", category: "Guitares", brand: "Obsidian", model: "Seven Collective", title: "Obsidian Seven · Pack scène", description: "Sept cordes, étui rigide et pedalboard compact au tarif débloqué par la communauté.", image: "seven-string-pedalboard.webp", price: 1379, compareAt: 1649, sellerId: "guitar-house", locationId: "lille-wazemmes", badge: "65 % atteint" },
  { id: "editorial-collective-atlas", pillarId: "collective", category: "Synthétiseurs", brand: "Atlas Modular", model: "9U Community Case", title: "Atlas Modular 9U · Série collective", description: "Case alimentée, couvercle et câbles patch premium inclus au prochain palier.", image: "eurorack-performance-case.webp", price: 999, compareAt: 1199, sellerId: "modular-corner", locationId: "strasbourg-krutenau", badge: "Câbles débloqués" },
];

function createEditorialProduct(seed: EditorialSeed, index: number): MarketProduct {
  const isPurchase = seed.pillarId === "new" || seed.pillarId === "used";
  const isRental = seed.pillarId === "rental";
  const isService = seed.pillarId === "services";
  const isCollective = seed.pillarId === "collective";
  const collectiveTarget = 48 + (index % 4) * 8;
  const collectiveJoined = Math.round(collectiveTarget * (0.62 + (index % 4) * 0.06));
  const compareAt = seed.compareAt ?? Math.round(seed.price * 1.18);

  return {
    id: seed.id,
    slug: seed.id,
    pillarId: seed.pillarId,
    category: seed.category,
    brand: seed.brand,
    model: seed.model,
    title: seed.title,
    description: seed.description,
    imageUrl: editorialImage(seed.image),
    imageAlt: `${seed.title}, sélection éditoriale du Market Meewav`,
    condition: seed.pillarId === "new" || isService || isCollective ? "new" : "excellent",
    conditionLabel:
      seed.pillarId === "new"
        ? "Neuf · Garantie 2 ans"
        : seed.pillarId === "used"
          ? "Excellent · Contrôlé"
          : isRental
            ? "Parc premium · Vérifié"
            : isService
              ? "Prestation vérifiée"
              : "Commande collective",
    price: {
      amount: seed.price,
      currency: "EUR",
      unit: isRental ? "day" : "item",
      ...(!isRental && seed.compareAt ? { compareAtAmount: seed.compareAt } : {}),
    },
    sellerId: seed.sellerId,
    locationId: seed.locationId,
    rating: { score: index % 5 === 0 ? 5 : 4.9, count: 38 + index * 7 },
    favorite: false,
    cart: { eligible: isPurchase, quantity: 0, maxQuantity: seed.pillarId === "new" ? 8 : isPurchase ? 1 : 0 },
    rental: isRental
      ? {
          dailyPrice: seed.price,
          weekendPrice: seed.price * 2,
          weeklyPrice: seed.price * 5,
          deposit: Math.max(250, seed.price * 12),
          minimumDays: 1,
          availableFrom: "2026-07-20",
          instantBook: true,
        }
      : null,
    service: isService
      ? {
          kind: seed.category === "Cours & coaching" ? "coaching" : seed.category === "Rooms & studios" ? "room" : "production",
          format: seed.category === "Cours & coaching" ? "Studio ou visio" : "En studio",
          durationLabel: seed.category === "Mix & mastering" ? "Par titre" : "2 h",
          deliveryLabel: seed.category === "Mix & mastering" ? "Sous 72 h" : "Réservation immédiate",
          nextAvailability: "Cette semaine",
        }
      : null,
    collective: isCollective
      ? {
          joined: collectiveJoined,
          target: collectiveTarget,
          progressPercent: Math.round((collectiveJoined / collectiveTarget) * 100),
          daysRemaining: 3 + (index % 8),
          retailUnitPrice: compareAt,
          unlockedUnitPrice: seed.price,
          savingsPercent: Math.round(((compareAt - seed.price) / compareAt) * 100),
        }
      : null,
    featured: false,
    badge: seed.badge,
  };
}

export const marketEditorialExpansionProducts: MarketProduct[] = editorialSeeds.map(
  createEditorialProduct,
);

export const MARKET_EDITORIAL_EXPANSION_COUNTS = {
  new: marketEditorialExpansionProducts.filter((product) => product.pillarId === "new").length,
  used: marketEditorialExpansionProducts.filter((product) => product.pillarId === "used").length,
  rental: marketEditorialExpansionProducts.filter((product) => product.pillarId === "rental").length,
  services: marketEditorialExpansionProducts.filter((product) => product.pillarId === "services").length,
  collective: marketEditorialExpansionProducts.filter((product) => product.pillarId === "collective").length,
  total: marketEditorialExpansionProducts.length,
} as const;
