import type { Progress } from "./learning";

export interface CertificationProgress extends Progress { percent: number; eligible: boolean }
export interface Certification extends CertificationProgress {
  courseName: string;
  className: string;
  term: string;
  year: string;
  teachers: string[];
  generatedAt: string;
}
export function certificationProgress(progress: Progress): CertificationProgress {
  const total = progress.lessons + progress.activities;
  const completed = progress.completed + progress.submitted;
  return { ...progress, percent: total ? Math.min(100, Math.floor(completed * 100 / total)) : 0, eligible: total > 0 && completed === total };
}
