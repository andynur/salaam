export const academicResources = ["years", "terms", "classes", "enrollments", "subjects", "courses", "teaching-assignments"] as const;
export type AcademicResource = typeof academicResources[number];
export type FoundationResource = "users" | AcademicResource | "audit";
export interface RecordRow { id: string; [key: string]: string | boolean | null }
export interface RecordPage { items: RecordRow[]; nextOffset: number | null }
