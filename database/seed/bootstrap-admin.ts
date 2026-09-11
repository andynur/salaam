import { loadConfig } from "../../src/core/config";
import { connectDatabase } from "../../src/core/database/connection";
import { bootstrapAdmin } from "../../src/modules/users/service";

const config = loadConfig();
const db = connectDatabase(config.databaseUrl);
try {
  await bootstrapAdmin(db, {
    email: process.env.BOOTSTRAP_ADMIN_EMAIL,
    name: process.env.BOOTSTRAP_ADMIN_NAME,
    identifier: process.env.BOOTSTRAP_ADMIN_IDENTIFIER,
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
  });
  console.log("Initial administrator created. Remove bootstrap credentials from your environment.");
} catch {
  console.error("Bootstrap failed. Run migrations, provide valid BOOTSTRAP_ADMIN_* values, and ensure no administrator exists. Existing accounts are never overwritten.");
  process.exitCode = 1;
} finally { await db.close(); }
