import { describe, expect, test } from "bun:test";
import { HttpError } from "../src/core/errors";
import { codingLimits, parseRunnerResult, validateCodingExecutionRequest } from "../src/modules/coding/policy";
import { createExecutionBoundary } from "../src/modules/coding/runner";

const id = "11111111-1111-4111-8111-111111111111";

describe("coding execution boundary", () => {
  test("validates bounded source and input", () => {
    expect(validateCodingExecutionRequest({ id, language: "javascript", source: "console.log(1)", stdin: "" })).toMatchObject({ id, language: "javascript" });
    expect(() => validateCodingExecutionRequest({ id, language: "python", source: "print(1)", stdin: "" })).toThrow(HttpError);
    expect(() => validateCodingExecutionRequest({ id, language: "javascript", source: "x".repeat(codingLimits.sourceBytes + 1), stdin: "" })).toThrow(HttpError);
  });

  test("parses only bounded runner results", () => {
    expect(parseRunnerResult({ status: "passed", stdout: "ok", stderr: "", durationMs: 4, exitCode: 0 })).toEqual({ status: "passed", stdout: "ok", stderr: "", durationMs: 4, exitCode: 0 });
    expect(() => parseRunnerResult({ status: "passed", stdout: "x".repeat(codingLimits.outputBytes + 1), stderr: "", durationMs: 4, exitCode: 0 })).toThrow();
    expect(() => parseRunnerResult({ status: "passed", stdout: "", stderr: "", durationMs: codingLimits.wallTimeMs + 1, exitCode: 0 })).toThrow();
  });

  test("fails closed when the runner is not configured", () => {
    expect(createExecutionBoundary(null, null, 5000)).toBeNull();
  });
});
