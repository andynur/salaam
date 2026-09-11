import type { Config } from "../config";

export function createSessionToken(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
}
export function hashToken(token: string): string {
  return new Bun.CryptoHasher("sha256").update(token).digest("hex");
}
export function cookieName(config: Config): string {
  return config.environment === "production" ? "__Host-hsi_session" : "hsi_session";
}
export function sessionCookie(config: Config, token: string, revoke = false): string {
  return `${cookieName(config)}=${revoke ? "" : token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${revoke ? 0 : config.sessionTtlSeconds}${config.environment === "production" ? "; Secure" : ""}`;
}
export function readSessionToken(request: Request, config: Config): string | null {
  const cookies = new Bun.CookieMap(request.headers.get("cookie") ?? "");
  const token = cookies.get(cookieName(config));
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
