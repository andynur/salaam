type LogEntry = {
  level: "info" | "warn" | "error";
  event: string;
  requestId?: string;
  status?: number;
  durationMs?: number;
};

// Allowlisted fields only: never pass request bodies, cookies, or raw SQL errors.
export function log(entry: LogEntry): void {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), ...entry }));
}
