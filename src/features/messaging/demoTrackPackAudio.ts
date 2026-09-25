/** Local showcase files only; never a fallback for authenticated attachments. */
export function demoTrackPackAudio(label: string) {
  const part = /bass|basse|sub|808/i.test(label) ? "Bass_A"
    : /drum|batterie|perc|kick|snare|hat/i.test(label) ? "Drums_A"
    : /vocal|acapella/i.test(label) ? "Acapella_Test_A"
    : /fx|texture|atmo|synth/i.test(label) ? "Melody_B" : "Melody_A";
  return {
    mediaUrl: `/audio/rooms/wave-test-pack/House_124BPM_A_minor/Loops_8bars/House_${part}_124BPM_8bars.wav`,
    durationSeconds: 32 * 60 / 124,
  };
}
