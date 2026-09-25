// Curated photographs for demonstration listings only. Live listings keep their uploaded media.
const scene = (name: string) => `/images/market/scenes/${name}.webp`;
const direct: Readonly<Record<string, string>> = {
  'new-apollo-twin-x': 'new-apollo-twin-x',
  'new-shure-sm7b': 'new-shure-sm7b',
  'new-beyerdynamic-dt770': 'new-beyerdynamic-dt770',
  'new-focusrite-scarlett': 'new-focusrite-scarlett',
  'new-audient-id14': 'new-audient-id14',
  'used-fender-strat': 'used-fender-strat',
  'used-roland-td17kvx': 'used-roland-td17kvx',
  'used-arturia-minifreak': 'used-arturia-minifreak',
  'rental-moog-subsequent-37': 'rental-moog-subsequent-37',
  'rental-apollo-twin-x': 'rental-apollo-twin-x',
  'rental-shure-sm7b': 'rental-shure-sm7b',
  'rental-roland-td17kvx': 'rental-roland-td17kvx',
  'service-mix-mastering': 'service-mix-mastering',
  'service-coaching-mao': 'service-coaching-mao',
  'service-artist-coaching': 'service-artist-coaching',
  'service-live-room-ticket': 'service-live-room-ticket',
  'service-studio-room': 'service-studio-room',
  'service-room-drum-tracking': 'drums-room',
  'wave2-rental-piano-songwriter-lyon': 'grand-piano-studio',
  'wave2-used-editorial-guitar-recorder': 'acoustic-guitar-room',
  'wave2-rental-editorial-writer': 'acoustic-guitar-studio',
  'wave2-service-editorial-songwriter': 'acoustic-guitar-room',
  'exp-service-acoustic-guitar-session': 'acoustic-guitar-studio',
};
type SceneProduct = { id: string; title: string; pillarId: string };
export function getMarketSceneImage(product: SceneProduct): string | undefined {
  if (direct[product.id]) return scene(direct[product.id]);
  const title = product.title.toLowerCase();
  const used = product.pillarId === 'used';
  const rental = product.pillarId === 'rental';
  const hash = [...product.id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const pick = (names: string[]) => scene(names[hash % names.length]);
  if (/moog subsequent/.test(title)) return rental
    ? scene('rental-moog-subsequent-37') : pick(['new-moog-subsequent-37','synth-room','synth-studio']);
  if (/technics sl.?1200/i.test(title)) return pick(['used-technics-sl1200','turntable-room','turntable-studio']);
  if (/nord stage/.test(title)) return pick(['rental-nord-stage-4','stage-keyboard-studio']);
  if (/fender.*strat/.test(title) && used) return pick(['used-fender-strat','electric-guitar-room','electric-guitar-studio']);
  if (/arturia mini.?freak/.test(title) && used) return scene('used-arturia-minifreak');
  if (/apollo twin/.test(title)) return scene(rental || used ? 'rental-apollo-twin-x' : 'new-apollo-twin-x');
  if (/shure sm7b/.test(title)) return scene(rental || used ? 'rental-shure-sm7b' : 'new-shure-sm7b');
  if (/beyerdynamic dt.?770/.test(title)) return scene('new-beyerdynamic-dt770');
  if (/roland td.?17/.test(title)) return scene(used ? 'used-roland-td17kvx' : 'rental-roland-td17kvx');
  return undefined;
}
