export type QuestionType = "single_choice" | "multiple_choice" | "true_false";
export type AssessmentKind = "quiz" | "exam";
export type ResultsVisibility = "after_submit" | "after_close" | "score_only" | "hidden";
export interface QuestionOption { id: string; text: string }
export interface Question { id: string; type: QuestionType; prompt: string; options: QuestionOption[]; correct: string[]; explanation: string; archived: boolean; usage: number; createdAt: string }
export interface AssessmentSettings { opensAt: string | null; closesAt: string | null; timeLimitMinutes: number | null; maxAttempts: number; shuffleQuestions: boolean; shuffleOptions: boolean; resultsVisibility: ResultsVisibility }
export interface AssessmentItem { questionId: string; position: number; points: number }
export interface AttemptSummary { id: string; number: number; startedAt: string; deadlineAt: string | null; submittedAt: string | null; submissionReason: "student" | "expired" | null; score: number | null; maxScore: number; adjusted: boolean }
// Managers receive `items`; students receive only counts and their own attempts.
export interface Assessment {
  id: string; lessonId: string; kind: AssessmentKind; title: string; instructions: string; published: boolean; archived: boolean;
  settings: AssessmentSettings; questionCount: number; maxScore: number; locked: boolean; items: AssessmentItem[] | null; attempts: AttemptSummary[];
}
export interface AttemptQuestion { questionId: string; position: number; type: QuestionType; prompt: string; options: QuestionOption[]; points: number; selected: string[]; revision: number; correct: string[] | null; explanation: string | null; awarded: number | null }
export interface AttemptDetail extends AttemptSummary { activityId: string; studentId: string; studentName: string; serverNow: string; resultsVisible: boolean; scoreVisible: boolean; canAnswer: boolean; questions: AttemptQuestion[] }
export interface AttemptRow extends AttemptSummary { studentId: string; studentName: string }
export interface ScoreAdjustment { id: string; score: number; reason: string; graderName: string; createdAt: string }
