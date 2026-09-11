import { loadConfig } from "../config";
import { connectDatabase } from "./connection";
import { reset } from "./migrations";

const config = loadConfig();
if (config.environment === "production") throw new Error("Reset is disabled in production. It drops all data.");
const db = connectDatabase(config.databaseUrl);
try {
  const result = await reset(db);
  console.log(`Rolled back: ${result.rolledBack.join(", ") || "(none)"}`);
  console.log(`Re-applied: ${result.applied.join(", ") || "(none)"}`);
} catch {
  console.error("Reset failed partway through. Check database access, migration history, and that every down script exists, then inspect schema_migrations before retrying.");
  process.exitCode = 1;
} finally { await db.close(); }
