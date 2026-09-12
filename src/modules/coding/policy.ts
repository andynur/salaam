import { HttpError } from "../../core/errors";

export const codingLimits = {
  sourceBytes: 32 * 1024,
  stdinBytes: 8 * 1024,
  outputBytes: 64 * 1024,
  wallTimeMs: 5_000,
  cpuTimeMs: 2_000,
  memoryBytes: 128 * 1024 * 1024,
  processes: 1,
} as const;

export type CodingLanguage = "javascript";
export type ExecutionStatus = "passed" | "failed" | "timed_out" | "rejected";

export interface CodingExecutionRequest {
  id: string;
  language: CodingLanguage;
  source: string;
  stdin: string;
}

export interface CodingExecutionResult {
  status: ExecutionStatus;
  stdout: string;
  stderr: string;
  durationMs: number;
  exitCode: number | null;
}

export interface RunnerExecutionRequest extends CodingExecutionRequest {
  policy: {
    network: "none";
    limits: typeof codingLimits;
  };
}

export function validateCodingExecutionRequest(value: unknown): CodingExecutionRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "INVALID_INPUT", "Data eksekusi tidak valid.");
  const body = value as Record<string, unknown>;
  if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id)) throw new HttpError(400, "INVALID_INPUT", "Identitas eksekusi tidak valid.");
  if (body.language !== "javascript") throw new HttpError(400, "INVALID_INPUT", "Bahasa pemrograman belum didukung.");
  if (typeof body.source !== "string" || byteLength(body.source) < 1 || byteLength(body.source) > codingLimits.sourceBytes) {
    throw new HttpError(400, "INVALID_INPUT", "Kode harus berukuran 1–32 KiB.");
  }
  if (typeof body.stdin !== "string" || byteLength(body.stdin) > codingLimits.stdinBytes) {
    throw new HttpError(400, "INVALID_INPUT", "Input program maksimal 8 KiB.");
  }
  return { id: body.id, language: "javascript", source: body.source, stdin: body.stdin };
}

export function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function boundedText(value: unknown, field: string): string {
  if (typeof value !== "string" || byteLength(value) > codingLimits.outputBytes) throw new Error(`Runner returned oversized ${field}`);
  return value;
}

export function parseRunnerResult(value: unknown): CodingExecutionResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Runner returned invalid data");
  const result = value as Record<string, unknown>;
  if (!["passed", "failed", "timed_out", "rejected"].includes(result.status as string)) throw new Error("Runner returned invalid status");
  if (typeof result.durationMs !== "number" || !Number.isSafeInteger(result.durationMs) || result.durationMs < 0 || result.durationMs > codingLimits.wallTimeMs) throw new Error("Runner returned invalid duration");
  if (result.exitCode !== null && (typeof result.exitCode !== "number" || !Number.isSafeInteger(result.exitCode))) throw new Error("Runner returned invalid exit code");
  return {
    status: result.status as ExecutionStatus,
    stdout: boundedText(result.stdout, "stdout"),
    stderr: boundedText(result.stderr, "stderr"),
    durationMs: result.durationMs,
    exitCode: result.exitCode as number | null,
  };
}
