import { loadConfig } from "../config";
import { connectDatabase } from "./connection";
import { rollback } from "./migrations";

const config = loadConfig();
if (config.environment === "production") throw new Error("Rollback is disabled in production. Write a forward migration instead.");
const db = connectDatabase(config.databaseUrl);
try {
  const name = await rollback(db);
  console.log(name ? `Rolled back: ${name}` : "No migrations to roll back.");
} catch {
  console.error("Rollback failed. Check database access, migration history, and that a down script exists; no changes were committed.");
  process.exitCode = 1;
} finally { await db.close(); }
