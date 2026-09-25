import type {
  MarketCategory,
  MarketCondition,
  MarketProduct,
} from "./marketDemoData";

type Wave2Pillar = "new" | "used";

type Wave2Seed = {
  id: string;
  pillarId: Wave2Pillar;
  category: MarketCategory;
  brand: string;
  model: string;
  title: string;
  description: string;
  image: string;
  price: number;
  compareAt: number;
  sellerId: string;
  locationId: string;
  condition?: MarketCondition;
  conditionLabel?: string;
};

const wave2Image = (filename: string) =>
  `/images/market/expansion/wave2-new-used/${filename}`;

const newSeeds = [
  { id: "wave2-new-nebula-keys-61", pillarId: "new", category: "Synthétiseurs", brand: "Nebula", model: "Keys 61", title: "Nebula Keys 61", description: "Workstation 61 notes, moteur hybride et pads expressifs pour composer sans interrompre le flow.", image: "new-keyboard-synth.webp", price: 1499, compareAt: 1649, sellerId: "synth-district", locationId: "paris-11" },
  { id: "wave2-new-atlas-stage-73", pillarId: "new", category: "Synthétiseurs", brand: "Atlas", model: "Stage 73", title: "Atlas Stage 73", description: "Clavier de scène à toucher semi-lesté, banques acoustiques premium et contrôles directs.", image: "new-keyboard-synth.webp", price: 1899, compareAt: 2099, sellerId: "session-club", locationId: "lyon-2" },
  { id: "wave2-new-orbit-composer-49", pillarId: "new", category: "Contrôleurs MIDI", brand: "Orbit", model: "Composer 49", title: "Orbit Composer 49", description: "Contrôleur nouvelle génération avec aftertouch polyphonique, huit encodeurs et seize pads.", image: "new-keyboard-synth.webp", price: 529, compareAt: 599, sellerId: "studio-supply", locationId: "nantes-centre" },
  { id: "wave2-new-pulsekey-pro-88", pillarId: "new", category: "Contrôleurs MIDI", brand: "PulseKey", model: "Pro 88", title: "PulseKey Pro 88", description: "Clavier maître 88 notes pensé pour les grands templates de production et le jeu expressif.", image: "new-keyboard-synth.webp", price: 849, compareAt: 929, sellerId: "atlas-audio", locationId: "montpellier-beaux-arts" },

  { id: "wave2-new-axis-monitor-7", pillarId: "new", category: "Monitoring", brand: "Axis", model: "Monitor 7 Pair", title: "Paire Axis Monitor 7", description: "Moniteurs actifs précis, grave contrôlé et image stéréo large pour mixage en studio moderne.", image: "new-monitor-pair.webp", price: 799, compareAt: 899, sellerId: "waveform-studio", locationId: "bordeaux-chartrons" },
  { id: "wave2-new-prism-reference-8", pillarId: "new", category: "Monitoring", brand: "Prism", model: "Reference 8", title: "Paire Prism Reference 8", description: "Système deux voies haute réserve avec calibration de pièce et amplification silencieuse.", image: "new-monitor-pair.webp", price: 1299, compareAt: 1459, sellerId: "studio-supply", locationId: "lille-wazemmes" },
  { id: "wave2-new-halo-nearfield-5", pillarId: "new", category: "Monitoring", brand: "Halo", model: "Nearfield 5", title: "Halo Nearfield 5 · la paire", description: "Format compact pour home studio, médiums lisibles et évent frontal pour placement proche du mur.", image: "new-monitor-pair.webp", price: 449, compareAt: 499, sellerId: "atlas-audio", locationId: "rennes-centre" },
  { id: "wave2-new-meridian-twin-6", pillarId: "new", category: "Monitoring", brand: "Meridian", model: "Twin 6", title: "Meridian Twin 6", description: "Paire appairée en atelier avec réponse étendue et réglages acoustiques accessibles en façade.", image: "new-monitor-pair.webp", price: 999, compareAt: 1119, sellerId: "broadcast-lab", locationId: "nice-port" },

  { id: "wave2-new-aether-c12", pillarId: "new", category: "Microphones", brand: "Aether", model: "C12 Studio", title: "Aether C12 Studio", description: "Condensateur large membrane, suspension premium et filtre de réflexion pour prises vocales détaillées.", image: "new-condenser-microphone.webp", price: 679, compareAt: 749, sellerId: "broadcast-lab", locationId: "paris-11" },
  { id: "wave2-new-halo-v67", pillarId: "new", category: "Microphones", brand: "Halo", model: "V67", title: "Halo V67 Vocal Set", description: "Micro voix à directivité cardioïde livré avec suspension, bonnette et flight case compact.", image: "new-condenser-microphone.webp", price: 459, compareAt: 519, sellerId: "studio-supply", locationId: "marseille-cours-julien" },
  { id: "wave2-new-velvet-47", pillarId: "new", category: "Microphones", brand: "Velvet", model: "47 Signature", title: "Velvet 47 Signature", description: "Capsule au haut médium soyeux, faible bruit propre et excellente tenue sur voix puissantes.", image: "new-condenser-microphone.webp", price: 899, compareAt: 999, sellerId: "waveform-studio", locationId: "strasbourg-krutenau" },
  { id: "wave2-new-moonlight-fet", pillarId: "new", category: "Microphones", brand: "Moonlight", model: "FET One", title: "Moonlight FET One", description: "Micro studio polyvalent pour voix, guitare acoustique et room, contrôlé avant expédition.", image: "new-condenser-microphone.webp", price: 549, compareAt: 619, sellerId: "room-collective", locationId: "nantes-centre" },

  { id: "wave2-new-canvas-mix-16", pillarId: "new", category: "Interfaces audio", brand: "Canvas", model: "Mix 16", title: "Canvas Mix 16", description: "Console compacte seize voies, faders longue course et routage USB multicanal pour studio hybride.", image: "new-analog-mixer.webp", price: 1199, compareAt: 1329, sellerId: "studio-supply", locationId: "lyon-2" },
  { id: "wave2-new-slate-desk-24", pillarId: "new", category: "Interfaces audio", brand: "Slate", model: "Desk 24", title: "Slate Desk 24", description: "Surface analogique premium avec sous-groupes, départs flexibles et monitoring intégré.", image: "new-analog-mixer.webp", price: 2199, compareAt: 2399, sellerId: "waveform-studio", locationId: "paris-11" },
  { id: "wave2-new-ember-console-12", pillarId: "new", category: "Interfaces audio", brand: "Ember", model: "Console 12", title: "Ember Console 12", description: "Douze préamplis propres, égalisation musicale et interface intégrée pour enregistrer un groupe.", image: "new-analog-mixer.webp", price: 949, compareAt: 1049, sellerId: "broadcast-lab", locationId: "bordeaux-chartrons" },
  { id: "wave2-new-nova-rack-mix-18", pillarId: "new", category: "Interfaces audio", brand: "Nova", model: "Rack Mix 18", title: "Nova Rack Mix 18", description: "Mixeur de studio à rappel de scènes, dix-huit entrées et contrôle sans latence pour les artistes.", image: "new-analog-mixer.webp", price: 1549, compareAt: 1699, sellerId: "session-club", locationId: "lille-wazemmes" },

  { id: "wave2-new-orbit-deck-pro", pillarId: "new", category: "DJ & vinyle", brand: "Orbit", model: "Deck Pro", title: "Orbit Deck Pro", description: "Contrôleur DJ quatre voies, grands jogs haute définition et pads sensibles pour performances ouvertes.", image: "new-dj-controller.webp", price: 1099, compareAt: 1199, sellerId: "vinyl-circuit", locationId: "marseille-cours-julien" },
  { id: "wave2-new-pulse-duo-x", pillarId: "new", category: "DJ & vinyle", brand: "Pulse", model: "Duo X", title: "Pulse Duo X", description: "Système deux decks transportable, sorties professionnelles et mixeur autonome au centre.", image: "new-dj-controller.webp", price: 849, compareAt: 929, sellerId: "vinyl-circuit", locationId: "nice-port" },
  { id: "wave2-new-vector-club-4", pillarId: "new", category: "DJ & vinyle", brand: "Vector", model: "Club 4", title: "Vector Club 4", description: "Contrôleur club quatre canaux avec section effets dédiée et connectique cabine complète.", image: "new-dj-controller.webp", price: 1299, compareAt: 1449, sellerId: "session-club", locationId: "paris-11" },
  { id: "wave2-new-fusion-stage-controller", pillarId: "new", category: "DJ & vinyle", brand: "Fusion", model: "Stage Controller", title: "Fusion Stage Controller", description: "Plateforme DJ robuste pour scène, performance pads lumineux et sorties symétriques.", image: "new-dj-controller.webp", price: 999, compareAt: 1099, sellerId: "vinyl-circuit", locationId: "montpellier-beaux-arts" },
] as const satisfies readonly Wave2Seed[];

const usedSeeds = [
  { id: "wave2-used-aster-polysix", pillarId: "used", category: "Synthétiseurs", brand: "Aster", model: "PolySix", title: "Aster PolySix", description: "Synthé analogique de studio, potentiomètres nettoyés, clavier régulier et alimentation vérifiée.", image: "used-analog-synth.webp", price: 1080, compareAt: 1599, sellerId: "noemie-sound", locationId: "paris-11", condition: "excellent", conditionLabel: "Excellent · Révisé en atelier" },
  { id: "wave2-used-mosaic-analog-8", pillarId: "used", category: "Synthétiseurs", brand: "Mosaic", model: "Analog 8", title: "Mosaic Analog 8", description: "Huit voix chaleureuses, panneaux bois légèrement patinés et mémoire interne entièrement testée.", image: "used-analog-synth.webp", price: 1390, compareAt: 2099, sellerId: "modular-corner", locationId: "strasbourg-krutenau", condition: "very-good", conditionLabel: "Très bon · Patine légère" },
  { id: "wave2-used-timberwave-49", pillarId: "used", category: "Synthétiseurs", brand: "Timberwave", model: "49", title: "Timberwave 49", description: "Première main de home studio, sorties silencieuses et housse matelassée incluse.", image: "used-analog-synth.webp", price: 760, compareAt: 1199, sellerId: "elise-tones", locationId: "rennes-centre", condition: "excellent", conditionLabel: "Excellent · Première main" },
  { id: "wave2-used-aurora-poly-12", pillarId: "used", category: "Synthétiseurs", brand: "Aurora", model: "Poly 12", title: "Aurora Poly 12", description: "Instrument conservé en studio non-fumeur, calibration récente et toutes les voix stables.", image: "used-analog-synth.webp", price: 1740, compareAt: 2599, sellerId: "camille-mix", locationId: "lyon-2", condition: "mint", conditionLabel: "Comme neuf · Calibré" },

  { id: "wave2-used-sonic-closed-x", pillarId: "used", category: "Casques", brand: "Sonic", model: "Closed X", title: "Sonic Closed X", description: "Casque fermé avec coussinets remplacés, deux câbles et étui rigide en excellent état.", image: "used-studio-headphones.webp", price: 189, compareAt: 329, sellerId: "camille-mix", locationId: "bordeaux-chartrons", condition: "excellent", conditionLabel: "Excellent · Coussinets neufs" },
  { id: "wave2-used-atlas-monitor-hp", pillarId: "used", category: "Casques", brand: "Atlas", model: "Monitor HP", title: "Atlas Monitor HP", description: "Utilisé uniquement pour des retours cabine, arceau impeccable et câble spiralé inclus.", image: "used-studio-headphones.webp", price: 145, compareAt: 249, sellerId: "waveform-studio", locationId: "nice-port", condition: "very-good", conditionLabel: "Très bon · Contrôlé" },
  { id: "wave2-used-meridian-pro-80", pillarId: "used", category: "Casques", brand: "Meridian", model: "Pro 80", title: "Meridian Pro 80", description: "Écoute de production précise, charnières fermes et mousse supérieure sans déformation.", image: "used-studio-headphones.webp", price: 219, compareAt: 379, sellerId: "noemie-sound", locationId: "nantes-centre", condition: "excellent", conditionLabel: "Excellent · Très peu servi" },
  { id: "wave2-used-orbit-travel-monitor", pillarId: "used", category: "Casques", brand: "Orbit", model: "Travel Monitor", title: "Orbit Travel Monitor", description: "Casque de monitoring nomade avec étui, adaptateur et câble de remplacement jamais utilisé.", image: "used-studio-headphones.webp", price: 129, compareAt: 219, sellerId: "room-collective", locationId: "marseille-cours-julien", condition: "excellent", conditionLabel: "Excellent · Kit complet" },

  { id: "wave2-used-velvet-bass-4", pillarId: "used", category: "Guitares", brand: "Velvet", model: "Bass 4", title: "Velvet Bass 4", description: "Basse quatre cordes réglée cette semaine, frettes saines et housse rembourrée comprise.", image: "used-bass-guitar.webp", price: 690, compareAt: 1099, sellerId: "guitar-house", locationId: "lille-wazemmes", condition: "excellent", conditionLabel: "Excellent · Réglage récent" },
  { id: "wave2-used-crimson-groove", pillarId: "used", category: "Guitares", brand: "Crimson", model: "Groove", title: "Crimson Groove Bass", description: "Légères marques de médiator, électronique silencieuse et manche droit sur toute la longueur.", image: "used-bass-guitar.webp", price: 520, compareAt: 849, sellerId: "elise-tones", locationId: "montpellier-beaux-arts", condition: "very-good", conditionLabel: "Très bon · Marques légères" },
  { id: "wave2-used-rivera-session-bass", pillarId: "used", category: "Guitares", brand: "Rivera", model: "Session Bass", title: "Rivera Session Bass", description: "Instrument de session fiable, potentiomètres contrôlés et jeu de cordes neuf installé.", image: "used-bass-guitar.webp", price: 840, compareAt: 1299, sellerId: "session-club", locationId: "paris-11", condition: "excellent", conditionLabel: "Excellent · Cordes neuves" },
  { id: "wave2-used-winewood-standard", pillarId: "used", category: "Guitares", brand: "Winewood", model: "Standard 4", title: "Winewood Standard 4", description: "Basse confortable et équilibrée, livrée avec sangle, câble et gig bag visibles sur les photos.", image: "used-bass-guitar.webp", price: 610, compareAt: 949, sellerId: "noemie-sound", locationId: "rennes-centre", condition: "excellent", conditionLabel: "Excellent · Accessoires inclus" },

  { id: "wave2-used-fieldmix-8", pillarId: "used", category: "Enregistreurs", brand: "FieldMix", model: "8", title: "FieldMix 8 · Kit terrain", description: "Enregistreur huit entrées, sac technique et faisceau XLR, contrôlés sur banc avant annonce.", image: "used-field-mixer.webp", price: 890, compareAt: 1399, sellerId: "broadcast-lab", locationId: "paris-11", condition: "excellent", conditionLabel: "Excellent · Banc de test validé" },
  { id: "wave2-used-cinema-recorder-6", pillarId: "used", category: "Enregistreurs", brand: "Cinema", model: "Recorder 6", title: "Cinema Recorder 6", description: "Kit documentaire compact avec batteries, adaptateurs et sac de portage en très bon état.", image: "used-field-mixer.webp", price: 720, compareAt: 1099, sellerId: "room-collective", locationId: "lyon-2", condition: "very-good", conditionLabel: "Très bon · Kit documentaire" },
  { id: "wave2-used-roamtrack-pro", pillarId: "used", category: "Enregistreurs", brand: "RoamTrack", model: "Pro", title: "RoamTrack Pro", description: "A servi sur deux courts métrages, entrées propres et médias de stockage inclus.", image: "used-field-mixer.webp", price: 640, compareAt: 999, sellerId: "broadcast-lab", locationId: "nantes-centre", condition: "excellent", conditionLabel: "Excellent · Deux tournages" },
  { id: "wave2-used-location-mix-12", pillarId: "used", category: "Enregistreurs", brand: "Location", model: "Mix 12", title: "Location Mix 12", description: "Ensemble complet pour son direct, câblage repéré et alimentation redondante testée.", image: "used-field-mixer.webp", price: 1180, compareAt: 1790, sellerId: "waveform-studio", locationId: "bordeaux-chartrons", condition: "excellent", conditionLabel: "Excellent · Prêt au tournage" },

  { id: "wave2-used-valvehouse-50", pillarId: "used", category: "Guitares", brand: "ValveHouse", model: "50 Stack", title: "ValveHouse 50 · Stack 2x12", description: "Tête à lampes et baffle 2x12 révisés, coins légèrement marqués et lampes encore fraîches.", image: "used-tube-amplifier.webp", price: 1190, compareAt: 1799, sellerId: "guitar-house", locationId: "lille-wazemmes", condition: "very-good", conditionLabel: "Très bon · Révisé" },
  { id: "wave2-used-ember-drive-30", pillarId: "used", category: "Guitares", brand: "Ember", model: "Drive 30", title: "Ember Drive 30", description: "Combo de studio transformé en tête et cabinet assorti, silencieux et prêt pour la prise micro.", image: "used-tube-amplifier.webp", price: 840, compareAt: 1299, sellerId: "elise-tones", locationId: "montpellier-beaux-arts", condition: "excellent", conditionLabel: "Excellent · Studio uniquement" },
  { id: "wave2-used-midnight-amp-40", pillarId: "used", category: "Guitares", brand: "Midnight", model: "Amp 40", title: "Midnight Amp 40", description: "Stack compact au grain dense, footswitch fourni et contrôle complet réalisé en atelier indépendant.", image: "used-tube-amplifier.webp", price: 970, compareAt: 1499, sellerId: "guitar-house", locationId: "paris-11", condition: "excellent", conditionLabel: "Excellent · Footswitch inclus" },
  { id: "wave2-used-northstar-tube-60", pillarId: "used", category: "Guitares", brand: "Northstar", model: "Tube 60", title: "Northstar Tube 60", description: "Amplificateur de répétition puissant, tolex propre et connectique arrière sans faux contact.", image: "used-tube-amplifier.webp", price: 760, compareAt: 1199, sellerId: "session-club", locationId: "strasbourg-krutenau", condition: "very-good", conditionLabel: "Très bon · Atelier contrôlé" },
] as const satisfies readonly Wave2Seed[];

function createWave2Product(seed: Wave2Seed, index: number): MarketProduct {
  const isNew = seed.pillarId === "new";

  return {
    id: seed.id,
    slug: seed.id,
    pillarId: seed.pillarId,
    category: seed.category,
    brand: seed.brand,
    model: seed.model,
    title: seed.title,
    description: seed.description,
    imageUrl: wave2Image(seed.image),
    imageAlt: `${seed.title} — ${isNew ? "produit neuf" : "annonce d'occasion"}`,
    condition: seed.condition ?? (isNew ? "new" : "excellent"),
    conditionLabel:
      seed.conditionLabel ??
      (isNew ? "Neuf · Garantie 2 ans" : "Excellent · Contrôlé"),
    price: {
      amount: seed.price,
      currency: "EUR",
      unit: "item",
      compareAtAmount: seed.compareAt,
    },
    sellerId: seed.sellerId,
    locationId: seed.locationId,
    rating: {
      score: index % 7 === 0 ? 5 : 4.8 + (index % 2) * 0.1,
      count: (isNew ? 96 : 24) + index * 5,
    },
    favorite: false,
    cart: {
      eligible: true,
      quantity: 0,
      maxQuantity: isNew ? 10 : 1,
    },
    rental: null,
    service: null,
    collective: null,
    featured: false,
  };
}

export const marketWave2NewProducts: MarketProduct[] = newSeeds.map(
  createWave2Product,
);

export const marketWave2UsedProducts: MarketProduct[] = usedSeeds.map(
  createWave2Product,
);

export const marketWave2NewUsedProducts: MarketProduct[] = [
  ...marketWave2NewProducts,
  ...marketWave2UsedProducts,
];

export const MARKET_WAVE2_NEW_USED_COUNTS = {
  new: marketWave2NewProducts.length,
  used: marketWave2UsedProducts.length,
  total: marketWave2NewUsedProducts.length,
} as const;
