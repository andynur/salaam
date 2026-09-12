export type QuestionType = "single_choice" | "multiple_choice" | "true_false" | "short_answer" | "essay";
export type AssessmentKind = "quiz" | "exam";
export type SurveyKind = "survey" | "questionnaire";
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
export interface SurveyQuestion { id: string; prompt: string; type: "single_choice" | "multiple_choice" | "short_answer"; options: QuestionOption[]; required: boolean; position: number }
export interface Survey { id: string; lessonId: string; kind: SurveyKind; title: string; instructions: string; published: boolean; archived: boolean; locked: boolean; questions: SurveyQuestion[]; responded: boolean; response: Record<string, string | string[]> | null }
export interface ManualQuestionGrade { id: string; score: number; feedback: string; createdAt: string }
export interface RubricCriterion { id: string; label: string; description: string; maxPoints: number }
export interface AssessmentRubric { id: string; questionId: string; title: string; criteria: RubricCriterion[] }
export interface ManualQuestionGrade { id: string; score: number; feedback: string; createdAt: string; breakdown: { criterionId: string; score: number }[] }
export interface AttemptQuestion { questionId: string; position: number; type: QuestionType; prompt: string; options: QuestionOption[]; points: number; selected: string[]; answerText: string | null; revision: number; correct: string[] | null; explanation: string | null; awarded: number | null; rubric: AssessmentRubric | null; manualGrade: ManualQuestionGrade | null }
export interface AttemptDetail extends AttemptSummary { activityId: string; studentId: string; studentName: string; serverNow: string; resultsVisible: boolean; scoreVisible: boolean; canAnswer: boolean; questions: AttemptQuestion[] }
export interface AttemptRow extends AttemptSummary { studentId: string; studentName: string }
export interface ScoreAdjustment { id: string; score: number; reason: string; graderName: string; createdAt: string }
