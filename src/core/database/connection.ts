import { SQL } from "bun";

export function connectDatabase(url: string): SQL {
  return new SQL(url, {
    max: 4,
    idleTimeout: 20,
    maxLifetime: 1800,
    connectionTimeout: 5,
  });
}

export async function checkDatabase(db: SQL): Promise<void> {
  const query = db`SELECT 1 AS ok`;
  const timer = setTimeout(() => query.cancel(), 2000);
  try { await query; } finally { clearTimeout(timer); }
}
