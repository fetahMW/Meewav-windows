import type { MarketProduct } from "./marketDemoData";

type Wave2EditorialSeed = {
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

const imageUrl = (filename: string) =>
  `/images/market/expansion/wave2-editorial/${filename}`;

const seeds: Wave2EditorialSeed[] = [
  { id: "wave2-new-editorial-mixdesk", pillarId: "new", category: "Interfaces audio", brand: "Graphite Audio", model: "MixDesk 24", title: "MixDesk 24 · Console hybride", description: "Console numérique premium, vingt-quatre faders motorisés et routage studio complet.", image: "digital-mixing-console.webp", price: 2890, compareAt: 3190, sellerId: "studio-supply", locationId: "paris-11", badge: "Nouvelle génération" },
  { id: "wave2-new-editorial-stage-pa", pillarId: "new", category: "Monitoring", brand: "Stage One", model: "PA Creator 12", title: "PA Creator 12 · Pack scène", description: "Système de diffusion compact avec deux enceintes, mixeur et pieds renforcés.", image: "portable-pa-rental.webp", price: 1490, compareAt: 1690, sellerId: "session-club", locationId: "lyon-2", badge: "Pack complet" },
  { id: "wave2-new-editorial-dj-rig", pillarId: "new", category: "DJ & vinyle", brand: "Night Deck", model: "Tour Case Pro", title: "Night Deck · Rig DJ flight case", description: "Contrôleur quatre voies intégré dans un flight case prêt pour la scène et la tournée.", image: "dj-flightcase-rental.webp", price: 2190, compareAt: 2390, sellerId: "vinyl-circuit", locationId: "marseille-cours-julien", badge: "Prêt à jouer" },
  { id: "wave2-new-editorial-iem", pillarId: "new", category: "Monitoring", brand: "Pulse Link", model: "IEM Stage 4", title: "Pulse Link IEM · Pack 4 artistes", description: "Quatre retours intra-auriculaires sans fil coordonnés pour groupes et plateaux live.", image: "wireless-iem-collective.webp", price: 1780, compareAt: 1980, sellerId: "broadcast-lab", locationId: "bordeaux-chartrons", badge: "Fréquences configurées" },
  { id: "wave2-new-editorial-creator-stage", pillarId: "new", category: "Rooms & studios", brand: "Creator Stage", model: "Live Studio Kit", title: "Creator Stage · Studio live mobile", description: "Éclairage, captation et diffusion réunis dans un kit transportable pour sessions filmées.", image: "stage-creator-collective.webp", price: 3490, compareAt: 3790, sellerId: "room-collective", locationId: "nantes-centre", badge: "Installation incluse" },

  { id: "wave2-used-editorial-vintage-synth", pillarId: "used", category: "Synthétiseurs", brand: "Aster", model: "Poly Six Vintage", title: "Aster Poly Six · Atelier 1984", description: "Synthé analogique patiné, entièrement révisé, touches nivelées et mémoire calibrée.", image: "vintage-analog-synth-used.webp", price: 1280, compareAt: 1690, sellerId: "noemie-sound", locationId: "rennes-centre", badge: "Révision documentée" },
  { id: "wave2-used-editorial-guitar-recorder", pillarId: "used", category: "Guitares", brand: "Cedar House", model: "Songwriter Kit", title: "Cedar Songwriter · Kit nomade", description: "Guitare acoustique, enregistreur et étui rigide utilisés sur un seul projet live.", image: "acoustic-guitar-recorder-used.webp", price: 760, compareAt: 1090, sellerId: "elise-tones", locationId: "montpellier-beaux-arts", badge: "Essai possible" },
  { id: "wave2-used-editorial-mixdesk", pillarId: "used", category: "Interfaces audio", brand: "Graphite Audio", model: "MixDesk 24", title: "MixDesk 24 · Ex-démo studio", description: "Console de démonstration, faders contrôlés et connectique testée avant remise en vente.", image: "digital-mixing-console.webp", price: 2290, compareAt: 2890, sellerId: "camille-mix", locationId: "nice-port", badge: "Garantie 12 mois" },
  { id: "wave2-used-editorial-pa", pillarId: "used", category: "Monitoring", brand: "Stage One", model: "PA Creator 12", title: "PA Creator 12 · Six dates", description: "Pack scène propre, housses incluses et contrôle complet effectué après la dernière date.", image: "portable-pa-rental.webp", price: 990, compareAt: 1490, sellerId: "rhythm-workshop", locationId: "lille-wazemmes", badge: "Contrôlé en atelier" },
  { id: "wave2-used-editorial-dj-case", pillarId: "used", category: "DJ & vinyle", brand: "Night Deck", model: "Tour Case Pro", title: "Night Deck Tour Case · Occasion", description: "Rig DJ de club, flight case marqué mais matériel impeccable et révisé cette semaine.", image: "dj-flightcase-rental.webp", price: 1580, compareAt: 2190, sellerId: "vinyl-circuit", locationId: "strasbourg-krutenau", badge: "Historique fourni" },

  { id: "wave2-rental-editorial-pa", pillarId: "rental", category: "Monitoring", brand: "Stage One", model: "PA Creator 12", title: "PA complète · soirée 250 personnes", description: "Deux enceintes, retours, petite console et câblage repéré, prêts à retirer.", image: "portable-pa-rental.webp", price: 95, sellerId: "session-club", locationId: "paris-11", badge: "Libre ce week-end" },
  { id: "wave2-rental-editorial-dj", pillarId: "rental", category: "DJ & vinyle", brand: "Night Deck", model: "Tour Case Pro", title: "Rig DJ quatre voies · flight case", description: "Configuration club complète avec branchement rapide et assistance de départ.", image: "dj-flightcase-rental.webp", price: 110, sellerId: "vinyl-circuit", locationId: "marseille-cours-julien", badge: "Réservation instantanée" },
  { id: "wave2-rental-editorial-iem", pillarId: "rental", category: "Monitoring", brand: "Pulse Link", model: "IEM Stage 4", title: "Pack IEM sans fil · 4 artistes", description: "Retours de scène individuels, émetteurs coordonnés et embouts désinfectés.", image: "wireless-iem-collective.webp", price: 84, sellerId: "broadcast-lab", locationId: "lyon-2", badge: "Technicien disponible" },
  { id: "wave2-rental-editorial-stage", pillarId: "rental", category: "Rooms & studios", brand: "Creator Stage", model: "Live Studio Kit", title: "Plateau créateur mobile", description: "Kit vidéo, lumière et son pour showcase, live session ou contenu vertical premium.", image: "stage-creator-collective.webp", price: 145, sellerId: "room-collective", locationId: "bordeaux-chartrons", badge: "Montage inclus" },
  { id: "wave2-rental-editorial-writer", pillarId: "rental", category: "Guitares", brand: "Cedar House", model: "Songwriter Kit", title: "Kit songwriter acoustique", description: "Guitare réglée, enregistreur portable et étui pour résidence ou écriture nomade.", image: "acoustic-guitar-recorder-used.webp", price: 42, sellerId: "guitar-house", locationId: "nantes-centre", badge: "Assurance incluse" },

  { id: "wave2-service-editorial-mix", pillarId: "services", category: "Mix & mastering", brand: "Camille Mix", model: "Immersive Mix", title: "Mix premium avec session de révision", description: "Mix complet, automation détaillée et session vidéo de validation avec l’ingénieure.", image: "female-mixing-engineer.webp", price: 165, sellerId: "camille-mix", locationId: "paris-11", badge: "Livré sous 72 h" },
  { id: "wave2-service-editorial-cello", pillarId: "services", category: "Cours & coaching", brand: "Noémie Sound", model: "Cello Studio", title: "Coaching violoncelle & arrangement", description: "Travail du son, placement rythmique et arrangement de cordes pour votre morceau.", image: "cello-coaching-session.webp", price: 78, sellerId: "noemie-sound", locationId: "lyon-2", badge: "Créneaux cette semaine" },
  { id: "wave2-service-editorial-songwriter", pillarId: "services", category: "Cours & coaching", brand: "Élise Tones", model: "Song Lab", title: "Session songwriting acoustique", description: "Structure, harmonie et prise maquette accompagnée pour transformer une idée en chanson.", image: "acoustic-guitar-recorder-used.webp", price: 89, sellerId: "elise-tones", locationId: "montpellier-beaux-arts", badge: "Maquette incluse" },
  { id: "wave2-service-editorial-live", pillarId: "services", category: "Rooms & studios", brand: "Room Collective", model: "Creator Live", title: "Captation live session premium", description: "Plateau, lumière, prise son multipiste et montage d’une live session prête à publier.", image: "stage-creator-collective.webp", price: 390, sellerId: "room-collective", locationId: "bordeaux-chartrons", badge: "Équipe complète" },
  { id: "wave2-service-editorial-console", pillarId: "services", category: "Mix & mastering", brand: "Waveform Studio", model: "Console Session", title: "Session mix sur console hybride", description: "Quatre heures de studio avec ingénieur, recall du projet et exports haute résolution.", image: "digital-mixing-console.webp", price: 240, sellerId: "waveform-studio", locationId: "lille-wazemmes", badge: "Recall inclus" },

  { id: "wave2-collective-editorial-iem", pillarId: "collective", category: "Monitoring", brand: "Pulse Link", model: "Community IEM 4", title: "Pulse Link IEM · Pack collectif", description: "Quatre systèmes sans fil au tarif communauté avec configuration offerte.", image: "wireless-iem-collective.webp", price: 1450, compareAt: 1780, sellerId: "broadcast-lab", locationId: "paris-11", badge: "Palier proche" },
  { id: "wave2-collective-editorial-stage", pillarId: "collective", category: "Rooms & studios", brand: "Creator Stage", model: "Community Live Kit", title: "Creator Stage · Kit collectif", description: "Plateau mobile vidéo et son avec atelier de prise en main débloqué au prochain palier.", image: "stage-creator-collective.webp", price: 2890, compareAt: 3490, sellerId: "room-collective", locationId: "lyon-2", badge: "Atelier bientôt débloqué" },
  { id: "wave2-collective-editorial-mixdesk", pillarId: "collective", category: "Interfaces audio", brand: "Graphite Audio", model: "MixDesk 24 Community", title: "MixDesk 24 · Série communauté", description: "Console hybride livrée avec templates de routing et support collectif prioritaire.", image: "digital-mixing-console.webp", price: 2490, compareAt: 2890, sellerId: "studio-supply", locationId: "bordeaux-chartrons", badge: "71 % atteint" },
  { id: "wave2-collective-editorial-pa", pillarId: "collective", category: "Monitoring", brand: "Stage One", model: "PA Creator Community", title: "PA Creator 12 · Achat groupé", description: "Système de diffusion complet avec housses offertes dès le prochain objectif.", image: "portable-pa-rental.webp", price: 1190, compareAt: 1490, sellerId: "session-club", locationId: "nantes-centre", badge: "Housses à débloquer" },
  { id: "wave2-collective-editorial-dj", pillarId: "collective", category: "DJ & vinyle", brand: "Night Deck", model: "Tour Case Community", title: "Night Deck · Rig DJ collectif", description: "Rig quatre voies en flight case, contrôlé et configuré avant expédition communautaire.", image: "dj-flightcase-rental.webp", price: 1890, compareAt: 2190, sellerId: "vinyl-circuit", locationId: "marseille-cours-julien", badge: "Plus que 9 places" },
];

function createProduct(seed: Wave2EditorialSeed, index: number): MarketProduct {
  const purchase = seed.pillarId === "new" || seed.pillarId === "used";
  const rental = seed.pillarId === "rental";
  const service = seed.pillarId === "services";
  const collective = seed.pillarId === "collective";
  const compareAt = seed.compareAt ?? Math.round(seed.price * 1.2);
  const target = 52 + (index % 4) * 8;
  const joined = Math.round(target * (0.63 + (index % 4) * 0.06));

  return {
    id: seed.id,
    slug: seed.id,
    pillarId: seed.pillarId,
    category: seed.category,
    brand: seed.brand,
    model: seed.model,
    title: seed.title,
    description: seed.description,
    imageUrl: imageUrl(seed.image),
    imageAlt: `${seed.title}, offre Market Meewav`,
    condition: seed.pillarId === "used" ? "excellent" : "new",
    conditionLabel: seed.pillarId === "used" ? "Excellent · Contrôlé" : rental ? "Parc vérifié" : service ? "Prestation Meewav" : collective ? "Commande collective" : "Neuf · Garantie 2 ans",
    price: { amount: seed.price, currency: "EUR", unit: rental ? "day" : "item", ...(!rental && seed.compareAt ? { compareAtAmount: seed.compareAt } : {}) },
    sellerId: seed.sellerId,
    locationId: seed.locationId,
    rating: { score: index % 4 === 0 ? 5 : 4.9, count: 45 + index * 9 },
    favorite: false,
    cart: { eligible: purchase, quantity: 0, maxQuantity: seed.pillarId === "new" ? 8 : purchase ? 1 : 0 },
    rental: rental ? { dailyPrice: seed.price, weekendPrice: seed.price * 2, weeklyPrice: seed.price * 5, deposit: Math.max(260, seed.price * 10), minimumDays: 1, availableFrom: "2026-07-21", instantBook: true } : null,
    service: service ? { kind: seed.category === "Cours & coaching" ? "coaching" : seed.category === "Rooms & studios" ? "room" : "production", format: seed.category === "Cours & coaching" ? "Studio ou visio" : "En studio", durationLabel: seed.category === "Mix & mastering" ? "Par titre" : "2 h", deliveryLabel: seed.category === "Mix & mastering" ? "Sous 72 h" : "Réservation immédiate", nextAvailability: "Cette semaine" } : null,
    collective: collective ? { joined, target, progressPercent: Math.round((joined / target) * 100), daysRemaining: 3 + (index % 7), retailUnitPrice: compareAt, unlockedUnitPrice: seed.price, savingsPercent: Math.round(((compareAt - seed.price) / compareAt) * 100) } : null,
    featured: false,
    badge: seed.badge,
  };
}

export const marketWave2EditorialProducts: MarketProduct[] = seeds.map(createProduct);

export const MARKET_WAVE2_EDITORIAL_COUNTS = {
  new: marketWave2EditorialProducts.filter((product) => product.pillarId === "new").length,
  used: marketWave2EditorialProducts.filter((product) => product.pillarId === "used").length,
  rental: marketWave2EditorialProducts.filter((product) => product.pillarId === "rental").length,
  services: marketWave2EditorialProducts.filter((product) => product.pillarId === "services").length,
  collective: marketWave2EditorialProducts.filter((product) => product.pillarId === "collective").length,
  total: marketWave2EditorialProducts.length,
} as const;
