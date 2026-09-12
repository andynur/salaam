export interface StudentImportRow { name: string; email: string; identifier: string; password: string }
export interface StudentImportResult { row: number; email: string; identifier: string; errors: string[]; action: "create" | "enroll" | "skip" | "invalid" }
