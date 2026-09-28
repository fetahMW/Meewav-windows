import { signedWaveAudienceUrl } from "./audience/waveAudienceUpload.service";
import type { WaveSubmission } from "./roomTools.types";

const safePart = (value: string) => value.normalize("NFC").replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/g, "").slice(0, 65);
const extensions: Record<string, string> = { "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/flac": "flac", "audio/aac": "aac", "audio/ogg": "ogg" };
export function waveAttributedFileName(submission: WaveSubmission, original = submission.fileName ?? submission.mediaUrl ?? "", version = submission.version) {
  const extension = original.split(/[?#]/)[0].match(/\.(wav|mp3|aac|flac|m4a|mp4|ogg)$/i)?.[1].toLowerCase()
    ?? extensions[submission.mimeType ?? ""] ?? "wav";
  const artist = safePart(submission.contributor.name) || "Artiste";
  return `${artist} — ${safePart(submission.title) || "Boucle"} — ${safePart(submission.id).slice(-12)} — v${version}.${extension}`;
}

export async function downloadWaveSubmission(submission: WaveSubmission) {
  const src = submission.mediaPath ? await signedWaveAudienceUrl(submission.mediaPath) : submission.mediaUrl;
  if (!src) throw new Error("Cette boucle n’a pas de fichier téléchargeable.");
  const response = await fetch(src);
  if (!response.ok) throw new Error("Téléchargement indisponible. Réessaie.");
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = waveAttributedFileName(submission);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Allow the browser to consume the file before releasing its object URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
