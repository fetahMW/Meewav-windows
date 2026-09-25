import type {
  MarketCategory,
  MarketCondition,
  MarketProduct,
} from "./marketDemoData";

type NewUsedPillarId = "new" | "used";

type ExpansionProductSeed = {
  id: string;
  pillarId: NewUsedPillarId;
  category: MarketCategory;
  brand: string;
  model: string;
  title: string;
  imageUrl: string;
  price: number;
  compareAtAmount?: number;
  sellerId: string;
  locationId: string;
  description?: string;
  condition?: MarketCondition;
  conditionLabel?: string;
  badge?: string;
  favorite?: boolean;
  ratingScore?: number;
  ratingCount?: number;
};

const generatedImage = (filename: string) =>
  `/images/market/expansion/new-used/${filename}`;

function createExpansionProduct(seed: ExpansionProductSeed): MarketProduct {
  const isNew = seed.pillarId === "new";
  const condition = seed.condition ?? (isNew ? "new" : "excellent");

  return {
    id: seed.id,
    slug: seed.id,
    pillarId: seed.pillarId,
    category: seed.category,
    brand: seed.brand,
    model: seed.model,
    title: seed.title,
    description:
      seed.description ??
      (isNew
        ? `${seed.title}, disponible immédiatement avec garantie constructeur et expédition suivie.`
        : `${seed.title}, contrôlé avant mise en ligne avec état détaillé et remise en main propre possible.`),
    imageUrl: seed.imageUrl,
    imageAlt: `${seed.title} — annonce ${isNew ? "neuve" : "d'occasion"}`,
    condition,
    conditionLabel:
      seed.conditionLabel ??
      (isNew ? "Neuf · Garantie 2 ans" : "Excellent · Testé et vérifié"),
    price: {
      amount: seed.price,
      currency: "EUR",
      unit: "item",
      ...(seed.compareAtAmount === undefined
        ? {}
        : { compareAtAmount: seed.compareAtAmount }),
    },
    sellerId: seed.sellerId,
    locationId: seed.locationId,
    rating: {
      score: seed.ratingScore ?? (isNew ? 4.9 : 4.8),
      count: seed.ratingCount ?? (isNew ? 126 : 47),
    },
    favorite: seed.favorite ?? false,
    cart: {
      eligible: true,
      quantity: 0,
      maxQuantity: isNew ? 12 : 1,
    },
    rental: null,
    service: null,
    collective: null,
    featured: false,
    ...(seed.badge === undefined ? {} : { badge: seed.badge }),
  };
}

export const MARKET_EXPANSION_NEW_PRODUCTS: MarketProduct[] = [
  createExpansionProduct({ id: "expansion-new-sequential-take5", pillarId: "new", category: "Synthétiseurs", brand: "Sequential", model: "Take 5", title: "Sequential Take 5", imageUrl: generatedImage("analog-synth-graphite.webp"), price: 1399, compareAtAmount: 1549, sellerId: "synth-district", locationId: "paris-11", badge: "En stock", description: "Synthétiseur polyphonique cinq voix, clavier 44 notes et housse souple offerte." }),
  createExpansionProduct({ id: "expansion-new-novation-summit", pillarId: "new", category: "Synthétiseurs", brand: "Novation", model: "Summit", title: "Novation Summit", imageUrl: "/images/market/moog-subsequent-37.jpg", price: 2149, compareAtAmount: 2299, sellerId: "modular-corner", locationId: "strasbourg-krutenau", badge: "Démo privée", ratingCount: 203 }),
  createExpansionProduct({ id: "expansion-new-roland-junox", pillarId: "new", category: "Synthétiseurs", brand: "Roland", model: "JUNO-X", title: "Roland JUNO-X", imageUrl: "/images/market/nord-stage-4.jpg", price: 1699, compareAtAmount: 1899, sellerId: "atlas-audio", locationId: "lyon-2", badge: "Livraison offerte" }),
  createExpansionProduct({ id: "expansion-new-elektron-digitakt2", pillarId: "new", category: "Synthétiseurs", brand: "Elektron", model: "Digitakt II", title: "Elektron Digitakt II", imageUrl: generatedImage("groovebox-performance.webp"), price: 999, compareAtAmount: 1049, sellerId: "modular-corner", locationId: "rennes-centre", badge: "Nouveau firmware" }),
  createExpansionProduct({ id: "expansion-new-akai-mpc-live2", pillarId: "new", category: "Contrôleurs MIDI", brand: "Akai Professional", model: "MPC Live II", title: "Akai MPC Live II", imageUrl: generatedImage("groovebox-performance.webp"), price: 1099, compareAtAmount: 1199, sellerId: "session-club", locationId: "nantes-centre", description: "Station de production autonome avec batterie intégrée et haut-parleurs embarqués." }),
  createExpansionProduct({ id: "expansion-new-arturia-keylab49mk3", pillarId: "new", category: "Contrôleurs MIDI", brand: "Arturia", model: "KeyLab 49 mk3", title: "Arturia KeyLab 49 mk3", imageUrl: generatedImage("midi-keyboard-49.webp"), price: 449, compareAtAmount: 499, sellerId: "synth-district", locationId: "montpellier-beaux-arts", badge: "Logiciels inclus" }),
  createExpansionProduct({ id: "expansion-new-novation-launchkey49mk4", pillarId: "new", category: "Contrôleurs MIDI", brand: "Novation", model: "Launchkey 49 MK4", title: "Novation Launchkey 49 MK4", imageUrl: "/images/market/m-audio-oxygen-pro-49.jpg", price: 279, compareAtAmount: 319, sellerId: "studio-supply", locationId: "lille-wazemmes" }),
  createExpansionProduct({ id: "expansion-new-rme-babyface-pro-fs", pillarId: "new", category: "Interfaces audio", brand: "RME", model: "Babyface Pro FS", title: "RME Babyface Pro FS", imageUrl: generatedImage("audio-interface-four.webp"), price: 899, compareAtAmount: 949, sellerId: "broadcast-lab", locationId: "paris-11", badge: "Garantie 3 ans", ratingScore: 5 }),
  createExpansionProduct({ id: "expansion-new-focusrite-clarett4pre", pillarId: "new", category: "Interfaces audio", brand: "Focusrite", model: "Clarett+ 4Pre", title: "Focusrite Clarett+ 4Pre", imageUrl: "/images/market/focusrite-scarlett-2i2.jpg", price: 599, compareAtAmount: 679, sellerId: "studio-supply", locationId: "rouen-rive-droite", badge: "Pack plugins" }),
  createExpansionProduct({ id: "expansion-new-ssl12", pillarId: "new", category: "Interfaces audio", brand: "Solid State Logic", model: "SSL 12", title: "Solid State Logic SSL 12", imageUrl: "/images/market/audient-id14.jpg", price: 399, compareAtAmount: 449, sellerId: "waveform-studio", locationId: "bordeaux-chartrons" }),
  createExpansionProduct({ id: "expansion-new-akg-c414-xlii", pillarId: "new", category: "Microphones", brand: "AKG", model: "C414 XLII", title: "AKG C414 XLII", imageUrl: "/images/market/neumann-tlm103.jpg", price: 1049, compareAtAmount: 1149, sellerId: "broadcast-lab", locationId: "angers-doutre", badge: "Suspension incluse" }),
  createExpansionProduct({ id: "expansion-new-sennheiser-mkh416", pillarId: "new", category: "Microphones", brand: "Sennheiser", model: "MKH 416", title: "Sennheiser MKH 416", imageUrl: "/images/market/shure-sm7b.jpg", price: 929, compareAtAmount: 999, sellerId: "broadcast-lab", locationId: "nice-port", description: "Micro canon RF pour tournage, reportage et prise de voix en environnement exigeant." }),
  createExpansionProduct({ id: "expansion-new-lewitt-lct440", pillarId: "new", category: "Microphones", brand: "Lewitt", model: "LCT 440 PURE", title: "Lewitt LCT 440 PURE", imageUrl: "/images/market/rode-nt1a.jpg", price: 269, compareAtAmount: 299, sellerId: "studio-supply", locationId: "dijon-centre", badge: "Pack studio" }),
  createExpansionProduct({ id: "expansion-new-sennheiser-hd650", pillarId: "new", category: "Casques", brand: "Sennheiser", model: "HD 650", title: "Sennheiser HD 650", imageUrl: generatedImage("open-back-headphones.webp"), price: 379, compareAtAmount: 449, sellerId: "atlas-audio", locationId: "rennes-centre", badge: "Référence mixage" }),
  createExpansionProduct({ id: "expansion-new-audeze-mm100", pillarId: "new", category: "Casques", brand: "Audeze", model: "MM-100", title: "Audeze MM-100", imageUrl: "/images/market/audio-technica-m50x.jpg", price: 449, compareAtAmount: 499, sellerId: "waveform-studio", locationId: "clermont-jaude" }),
  createExpansionProduct({ id: "expansion-new-yamaha-hs8-pair", pillarId: "new", category: "Monitoring", brand: "Yamaha", model: "HS8 Pair", title: "Paire Yamaha HS8", imageUrl: generatedImage("studio-monitors-amber.webp"), price: 649, compareAtAmount: 718, sellerId: "studio-supply", locationId: "toulouse-saint-cyprien", badge: "Paire appairée" }),
  createExpansionProduct({ id: "expansion-new-focal-alpha-twin", pillarId: "new", category: "Monitoring", brand: "Focal", model: "Alpha Twin Evo Pair", title: "Paire Focal Alpha Twin Evo", imageUrl: "/images/market/adam-a7x-used.jpg", price: 1098, compareAtAmount: 1198, sellerId: "waveform-studio", locationId: "grenoble-bouchayer", badge: "Calibration offerte" }),
  createExpansionProduct({ id: "expansion-new-fender-player2-jazzmaster", pillarId: "new", category: "Guitares", brand: "Fender", model: "Player II Jazzmaster", title: "Fender Player II Jazzmaster", imageUrl: generatedImage("electric-guitar-ocean.webp"), price: 899, compareAtAmount: 979, sellerId: "guitar-house", locationId: "paris-11", badge: "Réglage offert", favorite: true }),
  createExpansionProduct({ id: "expansion-new-yamaha-revstar-rss20", pillarId: "new", category: "Guitares", brand: "Yamaha", model: "Revstar Standard RSS20", title: "Yamaha Revstar Standard RSS20", imageUrl: "/images/market/prs-se-custom-24-used.jpg", price: 749, compareAtAmount: 829, sellerId: "guitar-house", locationId: "montpellier-beaux-arts" }),
  createExpansionProduct({ id: "expansion-new-ibanez-sr500e", pillarId: "new", category: "Guitares", brand: "Ibanez", model: "SR500E", title: "Basse Ibanez SR500E", imageUrl: generatedImage("bass-walnut-four.webp"), price: 699, compareAtAmount: 769, sellerId: "guitar-house", locationId: "nantes-centre", badge: "Housse incluse" }),
  createExpansionProduct({ id: "expansion-new-fender-player2-precision", pillarId: "new", category: "Guitares", brand: "Fender", model: "Player II Precision Bass", title: "Fender Player II Precision Bass", imageUrl: generatedImage("bass-walnut-four.webp"), price: 899, compareAtAmount: 979, sellerId: "guitar-house", locationId: "lille-wazemmes" }),
  createExpansionProduct({ id: "expansion-new-roland-td27kv2", pillarId: "new", category: "Batteries électroniques", brand: "Roland", model: "TD-27KV2", title: "Roland TD-27KV2", imageUrl: generatedImage("electronic-drum-kit.webp"), price: 3299, compareAtAmount: 3599, sellerId: "rhythm-workshop", locationId: "lyon-2", badge: "Montage offert" }),
  createExpansionProduct({ id: "expansion-new-yamaha-dtx8km", pillarId: "new", category: "Batteries électroniques", brand: "Yamaha", model: "DTX8K-M", title: "Yamaha DTX8K-M", imageUrl: generatedImage("electronic-drum-kit.webp"), price: 2899, compareAtAmount: 3199, sellerId: "rhythm-workshop", locationId: "strasbourg-krutenau", badge: "Peaux mesh" }),
  createExpansionProduct({ id: "expansion-new-pioneer-xdjrx3", pillarId: "new", category: "DJ & vinyle", brand: "Pioneer DJ", model: "XDJ-RX3", title: "Pioneer DJ XDJ-RX3", imageUrl: generatedImage("dj-controller-four.webp"), price: 2099, compareAtAmount: 2199, sellerId: "vinyl-circuit", locationId: "marseille-cours-julien", badge: "Flight case offert" }),
  createExpansionProduct({ id: "expansion-new-alphatheta-ddjgrv6", pillarId: "new", category: "DJ & vinyle", brand: "AlphaTheta", model: "DDJ-GRV6", title: "AlphaTheta DDJ-GRV6", imageUrl: "/images/market/pioneer-ddj-flx10.jpg", price: 829, compareAtAmount: 899, sellerId: "vinyl-circuit", locationId: "nice-port" }),
  createExpansionProduct({ id: "expansion-new-technics-sl1210gr2", pillarId: "new", category: "DJ & vinyle", brand: "Technics", model: "SL-1210GR2", title: "Technics SL-1210GR2", imageUrl: generatedImage("dj-turntable-direct.webp"), price: 1999, compareAtAmount: 2199, sellerId: "vinyl-circuit", locationId: "bordeaux-chartrons", badge: "Cellule offerte" }),
  createExpansionProduct({ id: "expansion-new-zoom-h8", pillarId: "new", category: "Enregistreurs", brand: "Zoom", model: "H8", title: "Zoom H8", imageUrl: generatedImage("field-recorder-pro.webp"), price: 349, compareAtAmount: 399, sellerId: "room-collective", locationId: "rouen-rive-droite", badge: "Capsule XY incluse" }),
  createExpansionProduct({ id: "expansion-new-tascam-portacapture-x8", pillarId: "new", category: "Enregistreurs", brand: "Tascam", model: "Portacapture X8", title: "Tascam Portacapture X8", imageUrl: generatedImage("field-recorder-pro.webp"), price: 449, compareAtAmount: 499, sellerId: "broadcast-lab", locationId: "dijon-centre" }),
  createExpansionProduct({ id: "expansion-new-ableton-push3", pillarId: "new", category: "Contrôleurs MIDI", brand: "Ableton", model: "Push 3 Standalone", title: "Ableton Push 3 Standalone", imageUrl: generatedImage("groovebox-performance.webp"), price: 1899, compareAtAmount: 1999, sellerId: "session-club", locationId: "paris-11", badge: "Autonome", favorite: true }),
  createExpansionProduct({ id: "expansion-new-teenage-op1-field", pillarId: "new", category: "Synthétiseurs", brand: "Teenage Engineering", model: "OP-1 Field", title: "Teenage Engineering OP-1 Field", imageUrl: "/images/market/arturia-minifreak.jpg", price: 1999, compareAtAmount: 2099, sellerId: "modular-corner", locationId: "angers-doutre", badge: "Étui rigide inclus" }),
];

export const MARKET_EXPANSION_USED_PRODUCTS: MarketProduct[] = [
  createExpansionProduct({ id: "expansion-used-sequential-prophet-rev2", pillarId: "used", category: "Synthétiseurs", brand: "Sequential", model: "Prophet Rev2 16 voix", title: "Sequential Prophet Rev2 · 16 voix", imageUrl: generatedImage("analog-synth-graphite.webp"), price: 1640, compareAtAmount: 2399, sellerId: "noemie-sound", locationId: "paris-11", condition: "excellent", conditionLabel: "Excellent · Révisé en atelier", badge: "Facture disponible", favorite: true }),
  createExpansionProduct({ id: "expansion-used-korg-prologue16", pillarId: "used", category: "Synthétiseurs", brand: "Korg", model: "Prologue 16", title: "Korg Prologue 16", imageUrl: "/images/market/korg-minilogue-xd.jpg", price: 1290, compareAtAmount: 1899, sellerId: "noemie-sound", locationId: "rennes-centre", condition: "very-good", conditionLabel: "Très bon · Traces légères", badge: "Housse incluse" }),
  createExpansionProduct({ id: "expansion-used-moog-matriarch", pillarId: "used", category: "Synthétiseurs", brand: "Moog", model: "Matriarch", title: "Moog Matriarch", imageUrl: "/images/market/moog-subsequent-37.jpg", price: 1690, compareAtAmount: 2299, sellerId: "modular-corner", locationId: "strasbourg-krutenau", condition: "mint", conditionLabel: "Comme neuf · Carton d'origine", badge: "Première main" }),
  createExpansionProduct({ id: "expansion-used-elektron-analog-rytm2", pillarId: "used", category: "Synthétiseurs", brand: "Elektron", model: "Analog Rytm MKII", title: "Elektron Analog Rytm MKII", imageUrl: generatedImage("groovebox-performance.webp"), price: 1090, compareAtAmount: 1699, sellerId: "camille-mix", locationId: "lyon-2", condition: "excellent", conditionLabel: "Excellent · Pads testés", badge: "Decksaver inclus" }),
  createExpansionProduct({ id: "expansion-used-akai-mpc-oneplus", pillarId: "used", category: "Contrôleurs MIDI", brand: "Akai Professional", model: "MPC One+", title: "Akai MPC One+", imageUrl: generatedImage("groovebox-performance.webp"), price: 565, compareAtAmount: 749, sellerId: "session-club", locationId: "nantes-centre", condition: "mint", conditionLabel: "Comme neuve · 8 mois", badge: "Sous garantie" }),
  createExpansionProduct({ id: "expansion-used-maschine-plus", pillarId: "used", category: "Contrôleurs MIDI", brand: "Native Instruments", model: "Maschine+", title: "Native Instruments Maschine+", imageUrl: generatedImage("groovebox-performance.webp"), price: 699, compareAtAmount: 1099, sellerId: "camille-mix", locationId: "bordeaux-chartrons", condition: "excellent", conditionLabel: "Excellent · Licence transférable" }),
  createExpansionProduct({ id: "expansion-used-keylab-essential61mk3", pillarId: "used", category: "Contrôleurs MIDI", brand: "Arturia", model: "KeyLab Essential 61 mk3", title: "Arturia KeyLab Essential 61 mk3", imageUrl: generatedImage("midi-keyboard-49.webp"), price: 185, compareAtAmount: 269, sellerId: "elise-tones", locationId: "montpellier-beaux-arts", condition: "excellent", conditionLabel: "Excellent · Studio non-fumeur" }),
  createExpansionProduct({ id: "expansion-used-novation-slmk3-49", pillarId: "used", category: "Contrôleurs MIDI", brand: "Novation", model: "49SL MkIII", title: "Novation 49SL MkIII", imageUrl: "/images/market/m-audio-oxygen-pro-49.jpg", price: 399, compareAtAmount: 649, sellerId: "noemie-sound", locationId: "nice-port", condition: "very-good", conditionLabel: "Très bon · Une marque latérale", badge: "Housse offerte" }),
  createExpansionProduct({ id: "expansion-used-apollo-x4", pillarId: "used", category: "Interfaces audio", brand: "Universal Audio", model: "Apollo x4 Heritage", title: "Universal Audio Apollo x4", imageUrl: "/images/market/apollo-twin-x.jpg", price: 1290, compareAtAmount: 1999, sellerId: "waveform-studio", locationId: "paris-11", condition: "excellent", conditionLabel: "Excellent · Rack studio", badge: "Plugins transférés" }),
  createExpansionProduct({ id: "expansion-used-rme-fireface-ucx2", pillarId: "used", category: "Interfaces audio", brand: "RME", model: "Fireface UCX II", title: "RME Fireface UCX II", imageUrl: generatedImage("audio-interface-four.webp"), price: 1140, compareAtAmount: 1549, sellerId: "broadcast-lab", locationId: "lille-wazemmes", condition: "mint", conditionLabel: "Comme neuve · Garantie restante", badge: "Testée 24 h" }),
  createExpansionProduct({ id: "expansion-used-ssl2plus", pillarId: "used", category: "Interfaces audio", brand: "Solid State Logic", model: "SSL 2+", title: "Solid State Logic SSL 2+", imageUrl: generatedImage("audio-interface-four.webp"), price: 169, compareAtAmount: 249, sellerId: "camille-mix", locationId: "dijon-centre", condition: "excellent", conditionLabel: "Excellent · Câble USB inclus" }),
  createExpansionProduct({ id: "expansion-used-neumann-u87ai", pillarId: "used", category: "Microphones", brand: "Neumann", model: "U 87 Ai", title: "Neumann U 87 Ai", imageUrl: generatedImage("condenser-mic-champagne.webp"), price: 2190, compareAtAmount: 3199, sellerId: "broadcast-lab", locationId: "paris-11", condition: "excellent", conditionLabel: "Excellent · Capsule contrôlée", badge: "Suspension + boîte" }),
  createExpansionProduct({ id: "expansion-used-shure-sm7db", pillarId: "used", category: "Microphones", brand: "Shure", model: "SM7dB", title: "Shure SM7dB", imageUrl: "/images/market/shure-sm7b.jpg", price: 385, compareAtAmount: 549, sellerId: "room-collective", locationId: "rouen-rive-droite", condition: "mint", conditionLabel: "Comme neuf · 5 mois", badge: "Facture incluse" }),
  createExpansionProduct({ id: "expansion-used-austrian-audio-oc18", pillarId: "used", category: "Microphones", brand: "Austrian Audio", model: "OC18", title: "Austrian Audio OC18", imageUrl: generatedImage("condenser-mic-champagne.webp"), price: 429, compareAtAmount: 699, sellerId: "waveform-studio", locationId: "clermont-jaude", condition: "excellent", conditionLabel: "Excellent · Studio uniquement" }),
  createExpansionProduct({ id: "expansion-used-beyer-dt1990", pillarId: "used", category: "Casques", brand: "Beyerdynamic", model: "DT 1990 Pro", title: "Beyerdynamic DT 1990 Pro", imageUrl: "/images/market/beyerdynamic-dt770.jpg", price: 329, compareAtAmount: 499, sellerId: "camille-mix", locationId: "angers-doutre", condition: "excellent", conditionLabel: "Excellent · Coussinets neufs", badge: "Deux câbles" }),
  createExpansionProduct({ id: "expansion-used-sennheiser-hd600", pillarId: "used", category: "Casques", brand: "Sennheiser", model: "HD 600", title: "Sennheiser HD 600", imageUrl: generatedImage("open-back-headphones.webp"), price: 219, compareAtAmount: 349, sellerId: "noemie-sound", locationId: "rennes-centre", condition: "very-good", conditionLabel: "Très bon · Arceau impeccable" }),
  createExpansionProduct({ id: "expansion-used-focal-shape65", pillarId: "used", category: "Monitoring", brand: "Focal", model: "Shape 65 Pair", title: "Paire Focal Shape 65", imageUrl: generatedImage("studio-monitors-amber.webp"), price: 890, compareAtAmount: 1398, sellerId: "waveform-studio", locationId: "bordeaux-chartrons", condition: "excellent", conditionLabel: "Excellent · Paire appairée", badge: "Mesures fournies" }),
  createExpansionProduct({ id: "expansion-used-genelec-8030c", pillarId: "used", category: "Monitoring", brand: "Genelec", model: "8030C Pair", title: "Paire Genelec 8030C", imageUrl: "/images/market/adam-a7x-used.jpg", price: 760, compareAtAmount: 1098, sellerId: "broadcast-lab", locationId: "toulouse-saint-cyprien", condition: "very-good", conditionLabel: "Très bon · Supports inclus" }),
  createExpansionProduct({ id: "expansion-used-fender-ampro2-jazzmaster", pillarId: "used", category: "Guitares", brand: "Fender", model: "American Professional II Jazzmaster", title: "Fender American Pro II Jazzmaster", imageUrl: generatedImage("electric-guitar-ocean.webp"), price: 1390, compareAtAmount: 1999, sellerId: "elise-tones", locationId: "paris-11", condition: "excellent", conditionLabel: "Excellent · Réglée et révisée", badge: "Étui d'origine", favorite: true }),
  createExpansionProduct({ id: "expansion-used-gibson-sg61", pillarId: "used", category: "Guitares", brand: "Gibson", model: "SG Standard '61", title: "Gibson SG Standard '61", imageUrl: "/images/market/gibson-les-paul-used.jpg", price: 1290, compareAtAmount: 1899, sellerId: "elise-tones", locationId: "lyon-2", condition: "very-good", conditionLabel: "Très bon · Micro-rayures", badge: "Case rigide" }),
  createExpansionProduct({ id: "expansion-used-musicman-stingray-special", pillarId: "used", category: "Guitares", brand: "Music Man", model: "StingRay Special 4H", title: "Music Man StingRay Special 4H", imageUrl: generatedImage("bass-walnut-four.webp"), price: 1790, compareAtAmount: 2699, sellerId: "session-club", locationId: "nantes-centre", condition: "excellent", conditionLabel: "Excellent · Réglage récent", badge: "Étui Music Man" }),
  createExpansionProduct({ id: "expansion-used-warwick-corvette", pillarId: "used", category: "Guitares", brand: "Warwick", model: "Corvette Standard", title: "Warwick Corvette Standard", imageUrl: generatedImage("bass-walnut-four.webp"), price: 890, compareAtAmount: 1499, sellerId: "noemie-sound", locationId: "strasbourg-krutenau", condition: "very-good", conditionLabel: "Très bon · Frettes contrôlées" }),
  createExpansionProduct({ id: "expansion-used-roland-td17kvx2", pillarId: "used", category: "Batteries électroniques", brand: "Roland", model: "TD-17KVX2", title: "Roland TD-17KVX2", imageUrl: generatedImage("electronic-drum-kit.webp"), price: 1390, compareAtAmount: 2099, sellerId: "rhythm-workshop", locationId: "lille-wazemmes", condition: "excellent", conditionLabel: "Excellent · Pads silencieux", badge: "Tabouret inclus" }),
  createExpansionProduct({ id: "expansion-used-yamaha-dtx6k3x", pillarId: "used", category: "Batteries électroniques", brand: "Yamaha", model: "DTX6K3-X", title: "Yamaha DTX6K3-X", imageUrl: generatedImage("electronic-drum-kit.webp"), price: 1180, compareAtAmount: 1799, sellerId: "rhythm-workshop", locationId: "grenoble-bouchayer", condition: "very-good", conditionLabel: "Très bon · Rack stable", badge: "Pédale incluse" }),
  createExpansionProduct({ id: "expansion-used-pioneer-xdjxz", pillarId: "used", category: "DJ & vinyle", brand: "Pioneer DJ", model: "XDJ-XZ", title: "Pioneer DJ XDJ-XZ", imageUrl: "/images/market/pioneer-ddj-1000-used.jpg", price: 1790, compareAtAmount: 2499, sellerId: "vinyl-circuit", locationId: "marseille-cours-julien", condition: "excellent", conditionLabel: "Excellent · Faders testés", badge: "Flight case inclus" }),
  createExpansionProduct({ id: "expansion-used-denon-prime4plus", pillarId: "used", category: "DJ & vinyle", brand: "Denon DJ", model: "Prime 4+", title: "Denon DJ Prime 4+", imageUrl: generatedImage("dj-controller-four.webp"), price: 1590, compareAtAmount: 2199, sellerId: "vinyl-circuit", locationId: "nice-port", condition: "mint", conditionLabel: "Comme neuf · 7 mois", badge: "Garantie restante" }),
  createExpansionProduct({ id: "expansion-used-technics-sl1200mk2-pair", pillarId: "used", category: "DJ & vinyle", brand: "Technics", model: "SL-1200 MK2 Pair", title: "Paire Technics SL-1200 MK2", imageUrl: "/images/market/technics-sl1200.jpg", price: 1590, compareAtAmount: 2200, sellerId: "vinyl-circuit", locationId: "bordeaux-chartrons", condition: "excellent", conditionLabel: "Révisées · Pitchs calibrés", badge: "Cellules incluses", favorite: true }),
  createExpansionProduct({ id: "expansion-used-zoom-f6-bag", pillarId: "used", category: "Enregistreurs", brand: "Zoom", model: "F6 Field Kit", title: "Zoom F6 + sac Orca", imageUrl: "/images/market/zoom-h6-used.jpg", price: 485, compareAtAmount: 699, sellerId: "room-collective", locationId: "rouen-rive-droite", condition: "excellent", conditionLabel: "Excellent · Tournage léger", badge: "Sac + batteries" }),
  createExpansionProduct({ id: "expansion-used-sounddevices-mixpre6ii", pillarId: "used", category: "Enregistreurs", brand: "Sound Devices", model: "MixPre-6 II", title: "Sound Devices MixPre-6 II", imageUrl: generatedImage("field-recorder-pro.webp"), price: 890, compareAtAmount: 1299, sellerId: "broadcast-lab", locationId: "dijon-centre", condition: "excellent", conditionLabel: "Excellent · Entrées contrôlées", badge: "Kit alimentation" }),
  createExpansionProduct({ id: "expansion-used-nord-stage3-73", pillarId: "used", category: "Synthétiseurs", brand: "Nord", model: "Stage 3 73", title: "Nord Stage 3 73", imageUrl: "/images/market/nord-stage-4.jpg", price: 2290, compareAtAmount: 3599, sellerId: "session-club", locationId: "montpellier-beaux-arts", condition: "very-good", conditionLabel: "Très bon · Clavier révisé", badge: "Housse Nord" }),
];

/**
 * Contrat d'intégration : importer ce tableau et l'ajouter une seule fois au
 * catalogue principal avant la création des vues enrichies seller/location.
 */
export const MARKET_EXPANSION_NEW_USED_PRODUCTS: MarketProduct[] = [
  ...MARKET_EXPANSION_NEW_PRODUCTS,
  ...MARKET_EXPANSION_USED_PRODUCTS,
];

export const MARKET_EXPANSION_NEW_USED_COUNTS = {
  new: MARKET_EXPANSION_NEW_PRODUCTS.length,
  used: MARKET_EXPANSION_USED_PRODUCTS.length,
  total: MARKET_EXPANSION_NEW_USED_PRODUCTS.length,
} as const;
