import { HttpError } from "../errors";

// One-process fixed windows. Never trust forwarded IP headers without a proxy policy.
export class LoginLimiter {
  private windows = new Map<string, { count: number; resetAt: number }>();
  consume(key: string, now = Date.now()): void {
    for (const [ip, window] of this.windows) if (window.resetAt <= now) this.windows.delete(ip);
    let window = this.windows.get(key);
    if (!window) {
      if (this.windows.size >= 10000) throw new HttpError(429, "RATE_LIMITED", "Silakan coba lagi beberapa saat lagi.");
      window = { count: 0, resetAt: now + 15 * 60 * 1000 };
      this.windows.set(key, window);
    }
    if (++window.count > 10) throw new HttpError(429, "RATE_LIMITED", "Terlalu banyak percobaan masuk. Coba lagi dalam 15 menit.");
  }
}
