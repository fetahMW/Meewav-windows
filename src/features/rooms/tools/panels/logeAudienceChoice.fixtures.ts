import type { PlacePollOptionInput } from "../../place/place.types";

export type LogeAudienceChoiceDraft = {
  question: string;
  options: Array<Exclude<PlacePollOptionInput, string> & { id: string }>;
};

export const LOGE_AUDIENCE_CHOICE_EXAMPLES = {
  music: {
    question: "Quel morceau je joue ensuite pour vous ?",
    options: [
      { id: "eclipse", label: "Éclipse", durationLabel: "3:12", imageUrl: "/images/tremplin/lunae-studio-editorial-v2.png", mediaId: "demo-eclipse" },
      { id: "minuit", label: "Minuit", durationLabel: "3:45", imageUrl: "/images/tremplin/professions/mael-nox-beatmaker-saint-denis-v1.webp", mediaId: "demo-minuit" },
      { id: "sans-retour", label: "Sans retour", durationLabel: "2:58", imageUrl: "/images/profile-viewer/paris-singer-producer-studio-v1.webp", mediaId: "demo-sans-retour" },
    ],
  },
  artwork: {
    question: "Quelle pochette vous préférez ?",
    options: [
      { id: "artwork-a", label: "Halo violet", imageUrl: "/images/tremplin/tremplin-collective-hero-v1.webp" },
      { id: "artwork-b", label: "Nuit électrique", imageUrl: "/images/market/service-live-room-starlight.png" },
    ],
  },
  performance: {
    question: "Vous voulez la version acoustique ou studio ?",
    options: [
      { id: "acoustic", label: "Acoustique" },
      { id: "studio", label: "Studio" },
    ],
  },
} satisfies Record<string, LogeAudienceChoiceDraft>;

export function createLogeAudienceChoiceDraft(demo: boolean): LogeAudienceChoiceDraft {
  const source = demo ? LOGE_AUDIENCE_CHOICE_EXAMPLES.music : LOGE_AUDIENCE_CHOICE_EXAMPLES.performance;
  return {
    question: demo ? source.question : "",
    options: source.options.map((option) => ({ ...option, label: demo ? option.label : "" })),
  };
}
