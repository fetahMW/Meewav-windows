/** User-supplied showcase stems; never a fallback for authenticated attachments. */
export const demoTrackPackStems = [
  { label: "Drums", fileName: "untitled - Drums.mp3", mediaUrl: "/audio/messaging/trackpack/untitled-drums.mp3", durationSeconds: 8497906 / 44100 },
  { label: "Bass", fileName: "untitled - Bass.mp3", mediaUrl: "/audio/messaging/trackpack/untitled-bass.mp3", durationSeconds: 8497706 / 44100 },
  { label: "Instruments", fileName: "untitled - Instruments.mp3", mediaUrl: "/audio/messaging/trackpack/untitled-instruments.mp3", durationSeconds: 8498105 / 44100 },
  { label: "Vocals", fileName: "untitled - Vocals.mp3", mediaUrl: "/audio/messaging/trackpack/untitled-vocals.mp3", durationSeconds: 8497906 / 44100 },
] as const;

export function demoTrackPackAudio(label: string) {
  const index = /bass|basse|sub|808/i.test(label) ? 1
    : /drum|batterie|perc|kick|snare|hat/i.test(label) ? 0
    : /vocal|acapella|voice|voix|vox|chant/i.test(label) ? 3 : 2;
  const { mediaUrl, durationSeconds } = demoTrackPackStems[index];
  return { mediaUrl, durationSeconds };
}

export function demoTrackPackDuration(seconds = Math.max(...demoTrackPackStems.map(stem => stem.durationSeconds))) {
  const wholeSeconds = Math.floor(seconds);
  return Math.floor(wholeSeconds / 60) + ":" + String(wholeSeconds % 60).padStart(2, "0");
}
