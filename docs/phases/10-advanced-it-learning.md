# Phase 10 — Advanced IT learning boundary

Validated locally on 2026-09-12 with Bun 1.4.2. No scoping round was held, so the safety
decisions below were made during implementation and are recorded here.

## Scope decisions

- SALAAM does not execute student code in the Bun process, a Bun child process, or a local
  shell. The only integration is an explicit HTTP boundary to a separately operated runner.
- The first contract supports JavaScript only. Adding another language requires a new runner
  image and a separate review of its interpreter and filesystem behavior.
- Execution is disabled unless both `CODE_RUNNER_URL` and a bearer token are configured.
- Every job carries `network: none` and fixed limits: 32 KiB source, 8 KiB stdin, 64 KiB
  output, 5 seconds wall time, 2 seconds CPU, 128 MiB memory, and one process.
- The application validates and bounds data; the runner must enforce OS isolation and limits.
  A configured endpoint is not approved merely because it responds successfully.

## Delivered scope

- `src/modules/coding/policy.ts` defines the request, policy, and result contracts; validates
  UUID-shaped job IDs, supported language, UTF-8 byte limits, statuses, duration, exit code,
  and output size.
- `src/modules/coding/runner.ts` provides `HttpExecutionBoundary`, which sends only the
  contract payload to the configured endpoint, uses a bearer token, applies an abort timeout,
  caps the response before parsing, and maps timeout or runner failure to safe HTTP errors.
- `createExecutionBoundary` returns `null` when configuration is incomplete, so callers cannot
  silently fall back to local execution.
- Configuration validates runner URL shape, production HTTPS requirements, token presence and
  length, and a 100–10,000 ms timeout. The token is never included in logs or errors.
- No migration, capability, route, screen, or student workflow was added. Existing project
  challenges remain project submissions, not an online judge.

## Runner review gate

Before enabling a runner in any environment, the owner must record:

1. The immutable image or deployment digest and patch source.
2. A disposable, read-only base filesystem with no host mounts or application secrets.
3. A network namespace with no egress and a test proving DNS and direct connections fail.
4. Enforcement tests for one process, 128 MiB memory, 2 seconds CPU, 5 seconds wall time,
   output limits, and cleanup after timeout.
5. Authentication, request replay handling, redacted logs, health monitoring, and a rollback
   owner.

The runner must return only `passed`, `failed`, `timed_out`, or `rejected`, stdout, stderr,
duration, and an exit code. Its response is treated as untrusted input.

## Verified behavior

- `tests/coding.test.ts` (3 tests): request validation and source/input bounds, runner-result
  validation and output bounds, and fail-closed behavior without runner configuration.
- `tests/config.test.ts`: optional runner URL/token validation, production transport policy,
  and timeout bounds.
- No browser QA was run because this phase adds no screen or HTTP route.

## Boundaries

This is a local contract and configuration delivery, not approval or deployment of a sandbox.
The following remain out of scope until the review gate passes:

- coding-challenge authoring, test-case storage, submissions, grading, and student screens;
- a runner implementation, container runtime, language images, or network policy enforcement;
- automatic retries, persistent execution queues, or asynchronous job storage;
- multi-language support, collaborative coding, plagiarism detection, and AI assistance.
