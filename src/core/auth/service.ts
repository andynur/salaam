import type { SQL } from "bun";
import type { Config } from "../config";
import { HttpError } from "../errors";
import { recordAudit } from "../audit/repository";
import { findLoginUser, findSessionAccount, findSessionActor, findSessionPassword } from "../../modules/users/repository";
import type { PasswordChangeResult } from "../../shared/account";
import { createSessionToken, hashToken, readSessionToken, sessionCookie } from "./session";
import { hashPassword, verifyPassword } from "./password";

const unauthenticated = () => new HttpError(401, "UNAUTHENTICATED", "Silakan masuk untuk melanjutkan.");

export function createAuthService(db: SQL, config: Config) {
  // Equal-cost verification for unknown accounts, without a hard-coded credential.
  const dummyHash = hashPassword(createSessionToken());
  return {
    async login(email: string, password: string, request: Request, requestId: string): Promise<Response> {
      const user = await findLoginUser(db, email);
      const valid = await verifyPassword(password, user?.password_hash ?? await dummyHash);
      if (!user || !valid) throw new HttpError(401, "INVALID_CREDENTIALS", "Email atau kata sandi tidak sesuai.");
      const token = createSessionToken();
      const oldToken = readSessionToken(request, config);
      await db.begin(async tx => {
        if (oldToken) await tx`DELETE FROM sessions WHERE token_hash = ${hashToken(oldToken)}`;
        await tx`DELETE FROM sessions WHERE user_id = ${user.id} AND expires_at <= now()`;
        const inserted = await tx`INSERT INTO sessions (token_hash, user_id, expires_at)
          SELECT ${hashToken(token)}, id, now() + ${config.sessionTtlSeconds} * interval '1 second'
          FROM users WHERE id = ${user.id} AND is_active = true AND password_hash = ${user.password_hash}
          RETURNING user_id`;
        if (!inserted.length) throw new HttpError(401, "INVALID_CREDENTIALS", "Email atau kata sandi tidak sesuai.");
        await tx`INSERT INTO audit_logs (actor_id, event, request_id) VALUES (${user.id}, 'auth.login', ${requestId})`;
      });
      return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(config, token) } });
    },
    async actor(request: Request) {
      const token = readSessionToken(request, config);
      return token ? findSessionActor(db, hashToken(token)) : null;
    },
    async account(request: Request) {
      const token = readSessionToken(request, config);
      const account = token ? await findSessionAccount(db, hashToken(token)) : null;
      if (!account) throw unauthenticated();
      return account;
    },
    // Self-service change for a signed-in user who knows the current password. The session that
    // made the change survives; every other session of the account ends in the same transaction.
    // The update is conditioned on the hash that was verified, so a concurrent administrator reset
    // or a second change returns 409 instead of silently overwriting it.
    async changePassword(request: Request, body: Record<string, unknown>, requestId: string): Promise<PasswordChangeResult> {
      const token = readSessionToken(request, config);
      const user = token ? await findSessionPassword(db, hashToken(token)) : null;
      if (!token || !user) throw unauthenticated();
      const { currentPassword, newPassword } = body;
      if (typeof currentPassword !== "string" || currentPassword.length < 1 || currentPassword.length > 128) throw new HttpError(400, "INVALID_INPUT", "Isi kata sandi saat ini.");
      if (typeof newPassword !== "string" || newPassword.length < 12 || newPassword.length > 128) throw new HttpError(400, "INVALID_INPUT", "Kata sandi baru harus 12–128 karakter.");
      if (currentPassword === newPassword) throw new HttpError(400, "INVALID_INPUT", "Kata sandi baru harus berbeda dari kata sandi saat ini.");
      if (!await verifyPassword(currentPassword, user.password_hash)) throw new HttpError(400, "WRONG_PASSWORD", "Kata sandi saat ini tidak sesuai.");
      const passwordHash = await hashPassword(newPassword);
      return db.begin(async tx => {
        const updated = await tx`UPDATE users SET password_hash = ${passwordHash}, updated_at = clock_timestamp()
          WHERE id = ${user.id} AND is_active = true AND password_hash = ${user.password_hash} RETURNING id`;
        if (!updated.length) throw new HttpError(409, "PASSWORD_CHANGED", "Kata sandi akun baru saja berubah. Muat ulang halaman lalu coba lagi.");
        const revoked = await tx`DELETE FROM sessions WHERE user_id = ${user.id} AND token_hash <> ${hashToken(token)} RETURNING user_id`;
        await recordAudit(tx, user.id, "auth.password_changed", "user", user.id, requestId);
        return { sessionsRevoked: revoked.length };
      });
    },
    async logout(request: Request, requestId: string): Promise<Response> {
      const token = readSessionToken(request, config);
      if (token) await db.begin(async tx => {
        const revoked = await tx<{ user_id: string }[]>`DELETE FROM sessions WHERE token_hash = ${hashToken(token)} RETURNING user_id`;
        if (revoked[0]) await tx`INSERT INTO audit_logs (actor_id, event, request_id) VALUES (${revoked[0].user_id}, 'auth.logout', ${requestId})`;
      });
      return new Response(null, { status: 204, headers: { "Set-Cookie": sessionCookie(config, "", true) } });
    },
  };
}
export type AuthService = ReturnType<typeof createAuthService>;
