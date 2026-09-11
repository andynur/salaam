import { loadConfig } from "../config";
import { connectDatabase } from "./connection";
import { migrate } from "./migrations";

const db = connectDatabase(loadConfig().databaseUrl);
try {
  const applied = await migrate(db);
  console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database is up to date.");
} catch {
  console.error("Migration failed. Check database access and migration history; no changes were committed.");
  process.exitCode = 1;
} finally { await db.close(); }
