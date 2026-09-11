import type { SQL } from "bun";
import type { Config } from "../config";
import { HttpError } from "../errors";
import { findLoginUser, findSessionActor } from "../../modules/users/repository";
import { createSessionToken, hashToken, readSessionToken, sessionCookie } from "./session";
import { hashPassword, verifyPassword } from "./password";

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
