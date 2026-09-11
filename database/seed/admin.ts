import { loadConfig } from "../../src/core/config";
import { connectDatabase } from "../../src/core/database/connection";
import { hashPassword } from "../../src/core/auth/password";

const config = loadConfig();
if (config.environment !== "development") throw new Error("Admin seed is development-only.");
const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
const name = process.env.SEED_ADMIN_NAME?.trim();
const password = process.env.SEED_ADMIN_PASSWORD;
if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name || name.length > 100 || !password) {
  throw new Error("Supply valid SEED_ADMIN_EMAIL, SEED_ADMIN_NAME, and SEED_ADMIN_PASSWORD privately.");
}
const passwordHash = await hashPassword(password);
const db = connectDatabase(config.databaseUrl);
try {
  await db.begin(async tx => {
    const users = await tx<{ id: string }[]>`INSERT INTO users (email, display_name, password_hash)
      VALUES (${email}, ${name}, ${passwordHash}) RETURNING id`;
    const user = users[0];
    if (!user) throw new Error("Seed insert failed");
    const roles = await tx`INSERT INTO user_roles (user_id, role_id)
      SELECT ${user.id}, id FROM roles WHERE key = 'admin' RETURNING role_id`;
    if (roles.length !== 1) throw new Error("Run migrations before seeding");
    await tx`INSERT INTO user_profiles (user_id, role_id) SELECT user_id, role_id FROM user_roles WHERE user_id = ${user.id}`;
    await tx`INSERT INTO audit_logs (actor_id, event) VALUES (${user.id}, 'user.development_seed')`;
  });
  console.log("Development admin created. Remove seed credentials from your environment.");
} catch {
  console.error("Seed failed. Run migrations and use a new email; existing accounts are never overwritten.");
  process.exitCode = 1;
} finally { await db.close(); }
