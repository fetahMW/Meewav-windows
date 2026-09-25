export type TrackPackInstrument =
  | "drums"
  | "bass"
  | "piano"
  | "guitar"
  | "violin"
  | "voice"
  | "synth";

type TrackPackInstrumentDefinition = {
  asset: string;
  name: string;
  description: string;
  matches: RegExp;
};

export type TrackPackStemPresentation = {
  instrument: TrackPackInstrument;
  name: string;
  description: string;
};

/**
 * Shared Track Pack instrument library.
 *
 * New instrument artwork and its matching rules belong here so the composer,
 * compact card and full player always use the same visual language.
 */
export const TRACK_PACK_INSTRUMENTS: Record<TrackPackInstrument, TrackPackInstrumentDefinition> = {
  drums: {
    asset: "/images/messaging/instruments/drums.svg",
    name: "Batterie",
    description: "Rythme principal",
    matches: /kick|drum|snare|hat|perc|batterie/i,
  },
  bass: {
    asset: "/images/messaging/instruments/bass.svg",
    name: "Basse",
    description: "Fondation grave",
    matches: /bass|808|sub|basse/i,
  },
  piano: {
    asset: "/images/messaging/instruments/piano.svg",
    name: "Piano",
    description: "Accords et harmonie",
    matches: /piano|keys|keyboard|chord|accord/i,
  },
  guitar: {
    asset: "/images/messaging/instruments/guitar.svg",
    name: "Guitare",
    description: "Texture mélodique",
    matches: /guitar|guitare|melody|mélodie/i,
  },
  violin: {
    asset: "/images/messaging/instruments/violin.svg",
    name: "Violon",
    description: "Cordes expressives",
    matches: /violin|violon|strings?|cordes?|cello|violoncelle/i,
  },
  voice: {
    asset: "/images/messaging/instruments/voice.svg",
    name: "Voix",
    description: "Interprétation vocale",
    matches: /voice|voix|vocal|vocals|vox|chant|choir|chœur/i,
  },
  synth: {
    asset: "/images/messaging/instruments/synth.svg",
    name: "Synthé",
    description: "Ambiance et effets",
    matches: /synth|pad|fx|lead|texture|ambient/i,
  },
};

export const TRACK_PACK_INSTRUMENT_ORDER: readonly TrackPackInstrument[] = [
  "drums",
  "bass",
  "piano",
  "guitar",
  "violin",
  "voice",
  "synth",
];

export function inferTrackPackInstrument(label: string, index: number): TrackPackInstrument {
  const normalized = label.toLocaleLowerCase("fr-FR");
  const match = TRACK_PACK_INSTRUMENT_ORDER.find((instrument) =>
    TRACK_PACK_INSTRUMENTS[instrument].matches.test(normalized),
  );

  return match ?? TRACK_PACK_INSTRUMENT_ORDER[index % TRACK_PACK_INSTRUMENT_ORDER.length];
}

const TRACK_PACK_STEM_PRESENTATIONS: ReadonlyArray<{
  matches: RegExp;
  instrument: TrackPackInstrument;
  name: string;
  description: string;
}> = [
  { matches: /kick/i, instrument: "drums", name: "Kick", description: "Impact grave" },
  { matches: /snare|clap/i, instrument: "drums", name: "Snare", description: "Caisse claire" },
  { matches: /hi[-_ ]?hat|hats?/i, instrument: "drums", name: "Hi-hat", description: "Charley et vélocité" },
  { matches: /perc/i, instrument: "drums", name: "Percussion", description: "Groove secondaire" },
  { matches: /808/i, instrument: "bass", name: "Basse 808", description: "Fondation sub" },
  { matches: /synth[-_ ]?lead/i, instrument: "synth", name: "Synth Lead", description: "Ligne mélodique" },
  { matches: /pads?/i, instrument: "synth", name: "Pads", description: "Nappe harmonique" },
  { matches: /fx/i, instrument: "synth", name: "FX", description: "Effets et transitions" },
  { matches: /melody|mélodie/i, instrument: "guitar", name: "Mélodie", description: "Texture mélodique" },
  { matches: /vocals?|voice|voix|vox|chant/i, instrument: "voice", name: "Voix", description: "Interprétation vocale" },
];

/**
 * Keeps the stem identity distinct from its broader instrument family.
 * A kick, a snare and a hi-hat share the drums artwork, but never the same label.
 */
export function getTrackPackStemPresentation(label: string, index: number): TrackPackStemPresentation {
  const specific = TRACK_PACK_STEM_PRESENTATIONS.find((presentation) => presentation.matches.test(label));
  if (specific) {
    return {
      instrument: specific.instrument,
      name: specific.name,
      description: specific.description,
    };
  }

  const instrument = inferTrackPackInstrument(label, index);
  return {
    instrument,
    name: TRACK_PACK_INSTRUMENTS[instrument].name,
    description: TRACK_PACK_INSTRUMENTS[instrument].description,
  };
}
