import { resolve } from "node:path";

export interface Config {
  environment: "development" | "test" | "production";
  host: string;
  port: number;
  databaseUrl: string;
  storageRoot: string;
  baseUrl: string;
  timezone: string;
  sessionTtlSeconds: number;
  codingRunnerUrl: string | null;
  codingRunnerToken: string | null;
  codingRunnerTimeoutMs: number;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const required = (key: string) => {
    const value = env[key]?.trim();
    if (!value) throw new Error(`Missing environment variable: ${key}`);
    return value;
  };
  const integer = (key: string, fallback: string, max: number) => {
    const value = env[key] ?? fallback;
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > max) {
      throw new Error(`Invalid environment variable: ${key}`);
    }
    return Number(value);
  };
  const environment = env.NODE_ENV ?? "development";
  if (environment !== "development" && environment !== "test" && environment !== "production") {
    throw new Error("Invalid NODE_ENV");
  }
  const databaseUrl = required("DATABASE_URL");
  try {
    const url = new URL(databaseUrl);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.pathname.length < 2) throw new Error();
  } catch { throw new Error("Invalid DATABASE_URL; expected a PostgreSQL URL with database name"); }
  let base: URL;
  try {
    base = new URL(required("APP_BASE_URL"));
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.pathname !== "/" || base.search || base.hash) throw new Error();
    if (environment === "production" && base.protocol !== "https:") throw new Error();
  } catch { throw new Error("Invalid APP_BASE_URL; use an origin (HTTPS in production)"); }
  const timezone = env.SCHOOL_TIMEZONE ?? "Asia/Jakarta";
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }); }
  catch { throw new Error("Invalid SCHOOL_TIMEZONE"); }
  const codingRunnerUrl = env.CODE_RUNNER_URL?.trim() || null;
  const codingRunnerToken = env.CODE_RUNNER_TOKEN?.trim() || null;
  const codingRunnerTimeoutMs = integer("CODE_RUNNER_TIMEOUT_MS", "5000", 10000);
  if (codingRunnerTimeoutMs < 100) throw new Error("Invalid environment variable: CODE_RUNNER_TIMEOUT_MS");
  if (codingRunnerUrl) {
    try {
      const runner = new URL(codingRunnerUrl);
      if (!["http:", "https:"].includes(runner.protocol) || runner.username || runner.password || runner.search || runner.hash || !runner.hostname) throw new Error();
      if (environment === "production" && runner.protocol !== "https:" && !["127.0.0.1", "localhost"].includes(runner.hostname)) throw new Error();
    } catch { throw new Error("Invalid CODE_RUNNER_URL"); }
    if (!codingRunnerToken || codingRunnerToken.length < 16 || codingRunnerToken.length > 256) throw new Error("Invalid CODE_RUNNER_TOKEN");
  } else if (codingRunnerToken) throw new Error("CODE_RUNNER_TOKEN requires CODE_RUNNER_URL");
  return {
    environment, host: env.HOST?.trim() || "127.0.0.1",
    port: integer("PORT", "3000", 65535), databaseUrl,
    baseUrl: base.origin, timezone,
    storageRoot: resolve(required("STORAGE_ROOT")),
    sessionTtlSeconds: integer("SESSION_TTL_HOURS", "12", 168) * 3600,
    codingRunnerUrl,
    codingRunnerToken,
    codingRunnerTimeoutMs,
  };
}
