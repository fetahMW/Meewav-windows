export type VoiceCorrectionAbxIdentity = "A" | "B";

export type VoiceCorrectionAbxTrial = {
  answer: VoiceCorrectionAbxIdentity;
  selected: VoiceCorrectionAbxIdentity | null;
  revealed: boolean;
};

export function voiceCorrectionAbxRandomValue() {
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const sample = new Uint32Array(1);
    globalThis.crypto.getRandomValues(sample);
    return (sample[0] ?? 0) / 0x1_0000_0000;
  }
  return Math.random();
}

export function createVoiceCorrectionAbxTrial(
  random: () => number = voiceCorrectionAbxRandomValue,
): VoiceCorrectionAbxTrial {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError("La valeur de randomisation ABX doit être comprise entre 0 inclus et 1 exclu.");
  }
  return {
    answer: value < 0.5 ? "A" : "B",
    selected: null,
    revealed: false,
  };
}

export function selectVoiceCorrectionAbxAnswer(
  trial: VoiceCorrectionAbxTrial,
  selected: VoiceCorrectionAbxIdentity,
): VoiceCorrectionAbxTrial {
  if (trial.revealed) return trial;
  return { ...trial, selected };
}

export function revealVoiceCorrectionAbxTrial(
  trial: VoiceCorrectionAbxTrial,
): VoiceCorrectionAbxTrial {
  if (trial.selected === null || trial.revealed) return trial;
  return { ...trial, revealed: true };
}

export function isVoiceCorrectionAbxAnswerCorrect(trial: VoiceCorrectionAbxTrial) {
  return trial.revealed && trial.selected === trial.answer;
}
