import { HttpError } from "../../core/errors";
import { codingLimits, parseRunnerResult, type CodingExecutionRequest, type CodingExecutionResult, type RunnerExecutionRequest } from "./policy";

export interface ExecutionBoundary {
  execute(request: CodingExecutionRequest): Promise<CodingExecutionResult>;
}

export class HttpExecutionBoundary implements ExecutionBoundary {
  constructor(private readonly endpoint: URL, private readonly token: string, private readonly timeoutMs: number = codingLimits.wallTimeMs) {}

  async execute(request: CodingExecutionRequest): Promise<CodingExecutionResult> {
    const body: RunnerExecutionRequest = { ...request, policy: { network: "none", limits: codingLimits } };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.token}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > codingLimits.outputBytes) throw new Error("Runner response is too large");
      if (!response.ok) throw new Error(`Runner returned HTTP ${response.status}`);
      let value: unknown;
      try { value = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error("Runner returned invalid JSON"); }
      return parseRunnerResult(value);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw new HttpError(504, "RUNNER_TIMEOUT", "Layanan eksekusi tidak merespons tepat waktu.");
      throw new HttpError(503, "RUNNER_UNAVAILABLE", "Layanan eksekusi belum tersedia.");
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createExecutionBoundary(endpoint: string | null, token: string | null, timeoutMs: number): ExecutionBoundary | null {
  if (!endpoint || !token) return null;
  return new HttpExecutionBoundary(new URL(endpoint), token, timeoutMs);
}
