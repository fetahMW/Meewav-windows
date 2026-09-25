import { describe, expect, it } from "vitest";
import {
  createVoiceCorrectionAbxTrial,
  isVoiceCorrectionAbxAnswerCorrect,
  revealVoiceCorrectionAbxTrial,
  selectVoiceCorrectionAbxAnswer,
} from "./voiceCorrectionLab.abx";

describe("voiceCorrectionLab ABX protocol", () => {
  it("randomizes X between the dry A and processed B references", () => {
    expect(createVoiceCorrectionAbxTrial(() => 0).answer).toBe("A");
    expect(createVoiceCorrectionAbxTrial(() => 0.499_999).answer).toBe("A");
    expect(createVoiceCorrectionAbxTrial(() => 0.5).answer).toBe("B");
    expect(createVoiceCorrectionAbxTrial(() => 0.999_999).answer).toBe("B");
  });

  it("keeps the result hidden until a choice is explicitly revealed", () => {
    const trial = createVoiceCorrectionAbxTrial(() => 0.25);
    const selected = selectVoiceCorrectionAbxAnswer(trial, "A");

    expect(selected).toMatchObject({ answer: "A", selected: "A", revealed: false });
    expect(isVoiceCorrectionAbxAnswerCorrect(selected)).toBe(false);

    const revealed = revealVoiceCorrectionAbxTrial(selected);
    expect(revealed.revealed).toBe(true);
    expect(isVoiceCorrectionAbxAnswerCorrect(revealed)).toBe(true);
  });

  it("does not reveal or mutate a completed trial without a valid action", () => {
    const trial = createVoiceCorrectionAbxTrial(() => 0.75);
    expect(revealVoiceCorrectionAbxTrial(trial)).toBe(trial);

    const revealed = revealVoiceCorrectionAbxTrial(selectVoiceCorrectionAbxAnswer(trial, "A"));
    expect(isVoiceCorrectionAbxAnswerCorrect(revealed)).toBe(false);
    expect(selectVoiceCorrectionAbxAnswer(revealed, "B")).toBe(revealed);
  });

  it("rejects an invalid random source instead of silently biasing a trial", () => {
    expect(() => createVoiceCorrectionAbxTrial(() => -0.1)).toThrow(RangeError);
    expect(() => createVoiceCorrectionAbxTrial(() => 1)).toThrow(RangeError);
    expect(() => createVoiceCorrectionAbxTrial(() => Number.NaN)).toThrow(RangeError);
  });
});
