import { expect, test } from "bun:test";
import { adjustmentInput, answerInput, assessmentKindInput, itemsInput, manualGradeInput, questionInput, rubricInput, settingsInput, surveyQuestionsInput } from "../src/modules/assessments/input";

test("questions support choice and written answers with valid answer keys", () => {
  expect(questionInput({ type: "single_choice", prompt: " 2 + 2? ", options: ["3", " 4 "], correct: ["b"] })).toEqual({
    type: "single_choice", prompt: "2 + 2?", options: [{ id: "a", text: "3" }, { id: "b", text: "4" }], correct: ["b"], explanation: "",
  });
  expect(questionInput({ type: "multiple_choice", prompt: "Bilangan prima", options: ["2", "3", "4"], correct: ["b", "a", "b"] }).correct).toEqual(["a", "b"]);
  expect(questionInput({ type: "true_false", prompt: "HTML bahasa markup", options: ["ignored"], correct: ["a"], explanation: "Benar." }).options).toEqual([{ id: "a", text: "Benar" }, { id: "b", text: "Salah" }]);
  for (const body of [
    { type: "single_choice", prompt: " ", options: ["a", "b"], correct: ["a"] },
    { type: "single_choice", prompt: "Q", options: ["Only"], correct: ["a"] },
    { type: "single_choice", prompt: "Q", options: Array.from({ length: 11 }, (_, index) => `O${index}`), correct: ["a"] },
    { type: "single_choice", prompt: "Q", options: ["Sama", "sama"], correct: ["a"] },
    { type: "single_choice", prompt: "Q", options: ["A", "B"], correct: ["a", "b"] },
    { type: "single_choice", prompt: "Q", options: ["A", "B"], correct: ["c"] },
    { type: "multiple_choice", prompt: "Q", options: ["A", "B"], correct: [] },
    { type: "true_false", prompt: "Q", correct: "a" },
    { type: "single_choice", prompt: "Q", options: ["A", 2], correct: ["a"] },
  ]) expect(() => questionInput(body)).toThrow();
  expect(questionInput({ type: "essay", prompt: "Jelaskan alasanmu" }).options).toEqual([]);
  expect(questionInput({ type: "short_answer", prompt: "Sebutkan ibu kota" }).correct).toEqual([]);
});
test("quiz and exam settings enforce windows, limits and exam integrity rules", () => {
  expect(assessmentKindInput({ kind: "exam" })).toBe("exam");
  expect(() => assessmentKindInput({ kind: "assignment" })).toThrow();
  expect(settingsInput({}, "quiz")).toEqual({ opensAt: null, closesAt: null, timeLimitMinutes: null, maxAttempts: 1, shuffleQuestions: true, shuffleOptions: true, resultsVisibility: "after_submit" });
  const exam = settingsInput({ opensAt: "2026-09-12T01:00:00Z", closesAt: "2026-09-12T03:00:00Z", timeLimitMinutes: 90, shuffleOptions: false, resultsVisibility: "after_close" }, "exam");
  expect(exam).toMatchObject({ opensAt: "2026-09-12T01:00:00.000Z", closesAt: "2026-09-12T03:00:00.000Z", timeLimitMinutes: 90, maxAttempts: 1, shuffleOptions: false });
  for (const [body, kind] of [
    [{ opensAt: "2026-09-12T03:00:00Z", closesAt: "2026-09-12T01:00:00Z" }, "quiz"],
    [{ timeLimitMinutes: 0 }, "quiz"], [{ timeLimitMinutes: 1.5 }, "quiz"], [{ maxAttempts: 11 }, "quiz"],
    [{ shuffleQuestions: "yes" }, "quiz"], [{ resultsVisibility: "always" }, "quiz"], [{ closesAt: "tomorrow" }, "quiz"],
    [{ closesAt: "2026-09-12T03:00:00Z", timeLimitMinutes: 60, maxAttempts: 2 }, "exam"],
    [{ closesAt: "2026-09-12T03:00:00Z" }, "exam"],
    [{ timeLimitMinutes: 60 }, "exam"],
  ] as const) expect(() => settingsInput(body, kind)).toThrow();
});
test("assessment items, autosaved answers and score adjustments are strictly bounded", () => {
  const questionId = crypto.randomUUID();
  expect(itemsInput({ items: [{ questionId, points: 2.5 }] })).toEqual([{ questionId, position: 0, points: 2.5 }]);
  for (const items of [[], [{ questionId, points: 0 }], [{ questionId, points: 1.001 }], [{ questionId, points: 1 }, { questionId, points: 2 }], [{ questionId: "bad", points: 1 }], "x"]) {
    expect(() => itemsInput({ items })).toThrow();
  }
  expect(answerInput({ questionId, selected: ["c", "a", "c"], revision: 3 })).toEqual({ questionId, selected: ["a", "c"], answerText: null, revision: 3 });
  expect(answerInput({ questionId, selected: [], revision: 1 }).selected).toEqual([]);
  expect(answerInput({ questionId, answerText: " Jawaban tertulis ", revision: 2 })).toMatchObject({ answerText: "Jawaban tertulis" });
  expect(manualGradeInput({ score: 4.5, feedback: "Argumen cukup kuat." })).toEqual({ score: 4.5, feedback: "Argumen cukup kuat.", breakdown: [] });
  expect(rubricInput({ title: "Kualitas", criteria: [{ id: "isi", label: "Isi", description: "Akurat", maxPoints: 2 }] }).criteria[0]?.id).toBe("isi");
  expect(() => rubricInput({ title: "Kualitas", criteria: [{ id: "isi", label: "Isi", description: "Akurat", maxPoints: 0 }] })).toThrow();
  for (const body of [{ questionId, selected: ["z"], revision: 1 }, { questionId, selected: "a", revision: 1 }, { questionId, selected: ["a"], revision: 0 }, { questionId, selected: ["a"], revision: 1.5 }]) {
    expect(() => answerInput(body)).toThrow();
  }
  expect(adjustmentInput({ score: 7.5, reason: " Salah kunci soal 3 " })).toEqual({ score: 7.5, reason: "Salah kunci soal 3" });
  for (const body of [{ score: -1, reason: "x" }, { score: 1.001, reason: "x" }, { score: 5, reason: " " }]) expect(() => adjustmentInput(body)).toThrow();
});
test("survey questions normalize options and reject duplicates", () => {
  expect(surveyQuestionsInput({ questions: [{ prompt: "Alasan?", type: "short_answer", required: true }] })[0]?.options).toEqual([]);
  expect(surveyQuestionsInput({ questions: [{ prompt: "Pilihan", type: "single_choice", options: ["Ya", "Tidak"] }] })[0]?.options[1]?.id).toBe("b");
  expect(() => surveyQuestionsInput({ questions: [{ prompt: "Pilihan", type: "single_choice", options: ["Ya", "ya"] }] })).toThrow();
});
