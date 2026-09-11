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
  return {
    environment, host: env.HOST?.trim() || "127.0.0.1",
    port: integer("PORT", "3000", 65535), databaseUrl,
    baseUrl: base.origin, timezone,
    storageRoot: resolve(required("STORAGE_ROOT")),
    sessionTtlSeconds: integer("SESSION_TTL_HOURS", "12", 168) * 3600,
  };
}
