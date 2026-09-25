import { waveSubmissionMaxBars } from "../tools/waveAudioRules";
import type { WaveState } from "../tools/roomTools.types";
import { waveAcceptedCategories, waveSubmissionCategory } from "../tools/waveLoopCategories";

export type ViewerRules = { id: string; bpm: number; key: string; signature: string; cycleBars: number; acceptedBars: number[]; maxDurationMs: number; repeatPolicy: string; mimeTypes: string[] };
export type ViewerReference = { id: string; beatRevisionId: string; revision: number; rules: ViewerRules; durationSeconds: number; originSeconds: number; label: string; url?: string; downloadable: boolean };
export type ViewerVote = { id: string; kind: "ADMISSION" | "REPLACEMENT" | "CLOSING"; title: string; credit: string; status: string; opensAt: string; closesAt: string; referenceBeatRevisionId: string; candidateVersion: number; eligible: boolean; choice: string | null; approved: boolean | null; options: Array<{ id: string; label: string; url?: string }> };
export type ViewerContribution = { id: string; title: string; category: string; status: string; reason: string | null; version: number; integrated: boolean };
export type WaveViewerSnapshot = {
  sessionId: string; sequence: number; serverNow: string; title: string; status: string;
  rules: ViewerRules | null; activeBeatId: string | null; activeRevision: number | null; programSource: string;
  pendingActivation: boolean; reference: ViewerReference | null;
  categories: Array<{ id: string; label: string; open: boolean; permitted: boolean; priority: boolean }>;
  contributions: ViewerContribution[];
  layers: Array<{ id: string; title: string; credit: string; category: string; url?: string; downloadable?: boolean; isBase?: boolean }>;
  vote: ViewerVote | null; termsVersion: string | null; submissionsOpen: boolean;
};
export const formatWaveBpm = (bpm: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(bpm);
export function contributionLabel(item: ViewerContribution) {
  if (item.integrated) return "Intégrée au Beat";
  return ({ UPLOADING: "Envoi en cours", PROCESSING: "Traitement du fichier", RECEIVED: "Reçue par le host", NEEDS_REVIEW: "À l’écoute du host", NEEDS_CORRECTION: "En correction", READY_FOR_VOTE: "Prête au vote", VOTING: "Au vote", ACCEPTED: "Validée — activation en préparation", NOT_SELECTED: "Non retenue par le public", REJECTED: "Refusée par le host", REMOVED: "Retirée", SUPERSEDED: "Version remplacée", PROCESSING_FAILED: "Traitement échoué" } as Record<string, string>)[item.status] ?? "État en synchronisation";
}
export function workshopCompatibility(duration: number, rules: ViewerRules | null) {
  if (!rules) return { bars: null, error: "Les règles musicales sont en préparation. L’écoute solo reste disponible." };
  const [numerator, denominator] = rules.signature.split("/").map(Number);
  const secondsPerBar = 60 / rules.bpm * numerator * 4 / denominator;
  // One PCM sample of rounding is allowed; a tolerance of tens of milliseconds
  // would accumulate drift every time a short contribution repeats.
  const bars = rules.acceptedBars.find(length => Math.abs(duration - length * secondsPerBar) <= 1 / 44100);
  if (!bars || duration * 1000 > rules.maxDurationMs + 1) return { bars: null, error: `Durée incompatible : longueurs autorisées ${rules.acceptedBars.join(", ")} mesures. Aucun recalage automatique.` };
  if (bars > rules.cycleBars || rules.cycleBars % bars !== 0 || rules.repeatPolicy !== "REPEAT_TO_CYCLE") return { bars, error: "Ce placement n’est pas pris en charge dans l’atelier. La boucle n’est ni tronquée ni étirée." };
  return { bars, error: null };
}
/** Demo projection is explicitly local. Never used for a live Room. */
export function demoViewerSnapshot(wave: WaveState, roomId: string, accountId: string): WaveViewerSnapshot {
  const rules: ViewerRules = { id: `demo-rules:${wave.baseLoop.bpm}:${wave.baseLoop.bars}:${wave.baseLoop.key}`, bpm: wave.baseLoop.bpm, key: wave.baseLoop.key, signature: "4/4", cycleBars: wave.baseLoop.bars, acceptedBars: [4, 8, 16].filter(bars => bars <= waveSubmissionMaxBars(wave)), maxDurationMs: 60 / wave.baseLoop.bpm * 4 * wave.baseLoop.bars * 1000, repeatPolicy: "REPEAT_TO_CYCLE", mimeTypes: ["audio/wav", "audio/mpeg", "audio/flac", "audio/aac", "audio/mp4", "audio/x-m4a"] };
  const baseId = `demo-base:${wave.baseLoop.mediaUrl ?? wave.baseLoop.title}:${rules.id}`;
  const vote = wave.submissions.find(item => item.vote?.open);
  return {
    sessionId: roomId, sequence: 0, serverNow: new Date().toISOString(), title: wave.title,
    status: "LOCAL_DEMO", rules, activeBeatId: null, activeRevision: null, programSource: "DEMO",
    pendingActivation: false, termsVersion: "demo-local", submissionsOpen: wave.submissionsOpen !== false,
    reference: wave.baseLoop.mediaUrl ? { id: baseId, beatRevisionId: baseId, revision: 1, rules, durationSeconds: rules.maxDurationMs / 1000, originSeconds: 0, label: "Base initiale — référence de démonstration", url: wave.baseLoop.mediaUrl, downloadable: true } : null,
    categories: waveAcceptedCategories(wave).map(id => ({ id, label: id, open: wave.submissionsOpen !== false, permitted: true, priority: false })),
    contributions: wave.submissions.filter(item => item.contributor.id === accountId).map(item => ({ id: item.id, title: item.title, category: waveSubmissionCategory(item), status: item.lifecycleStatus ?? ({ received: "RECEIVED", analysis: "NEEDS_REVIEW", "to-review": "READY_FOR_VOTE", accepted: "ACCEPTED", rejected: item.decisionSource === "public" ? "NOT_SELECTED" : "REJECTED", rework: "NEEDS_CORRECTION" }[item.status]), reason: item.reviewFeedback ?? null, version: item.version, integrated: wave.layers.some(layer => layer.submissionId === item.id && layer.submissionVersion === item.version) })),
    layers: wave.layers.filter(layer => layer.active).map(layer => {
      const submission = wave.submissions.find(item => item.id === layer.submissionId && item.version === layer.submissionVersion);
      const isBase = !layer.submissionId;
      const url = isBase ? wave.baseLoop.mediaUrl : submission?.mediaUrl;
      return { id: layer.id, title: layer.title, credit: layer.author, isBase, url, downloadable: Boolean(url),
        category: submission?.category ?? waveSubmissionCategory({ instrument: wave.baseLoop.kind, title: layer.title }) };
    }),
    vote: vote?.vote ? { id: vote.id, kind: vote.vote.replacesLayerId ? "REPLACEMENT" : "ADMISSION", title: vote.title, credit: vote.creditPublic ? vote.contributor.name : "Contribution Wave", status: "OPEN", opensAt: vote.vote.openedAt ?? new Date().toISOString(), closesAt: vote.vote.endsAt ?? new Date(0).toISOString(), referenceBeatRevisionId: "demo", candidateVersion: vote.vote.submissionVersion, eligible: true, choice: vote.vote.votes[accountId] ?? null, approved: null, options: vote.mediaUrl && vote.version === vote.vote.submissionVersion ? [{ id: "solo", label: "Candidate · solo de démonstration", url: vote.mediaUrl }] : [] } : null,
  };
}
