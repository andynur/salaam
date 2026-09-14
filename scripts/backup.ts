import { mkdir, readdir, rm, rename, stat, writeFile } from "node:fs/promises";
import { dirname, basename, resolve, join, relative } from "node:path";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";

const databaseUrl = Bun.env.DATABASE_URL;
const storageRoot = Bun.env.STORAGE_ROOT;
const backupRoot = resolve(Bun.env.BACKUP_ROOT ?? "./backups");
const retentionDays = Number(Bun.env.BACKUP_RETENTION_DAYS ?? "14");

if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (!storageRoot) throw new Error("STORAGE_ROOT is required");
if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
  throw new Error("BACKUP_RETENTION_DAYS must be an integer between 1 and 3650");
}

const sourceStorage = resolve(storageRoot);
if (backupRoot === sourceStorage || !relative(sourceStorage, backupRoot).startsWith("..")) {
  throw new Error("BACKUP_ROOT must be outside STORAGE_ROOT");
}
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const staging = join(backupRoot, `.staging-${timestamp}-${crypto.randomUUID()}`);
const destination = join(backupRoot, timestamp);

async function run(command: string[], label: string, env = Bun.env): Promise<void> {
  const child = Bun.spawn(command, { stdout: "inherit", stderr: "inherit", env });
  const exitCode = await child.exited;
  if (exitCode !== 0) throw new Error(`${label} failed with exit code ${exitCode}`);
}

async function sha256(path: string): Promise<string> {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest("hex");
}

try {
  const storageInfo = await stat(sourceStorage);
  if (!storageInfo.isDirectory()) throw new Error("STORAGE_ROOT must be a directory");
  await mkdir(staging, { recursive: true });

  // libpq does not expand a connection URI supplied through PGDATABASE. Keep the
  // password in the child environment, and pass the remaining URI explicitly.
  const dumpUrl = new URL(databaseUrl);
  const password = decodeURIComponent(dumpUrl.password) || dumpUrl.searchParams.get("password");
  dumpUrl.password = "";
  dumpUrl.searchParams.delete("password");
  await run(["pg_dump", "--format=custom", `--file=${join(staging, "database.dump")}`, `--dbname=${dumpUrl}`], "pg_dump", { ...Bun.env, ...(password ? { PGPASSWORD: password } : {}) });
  await run(["tar", "-czf", join(staging, "storage.tgz"), "-C", dirname(sourceStorage), basename(sourceStorage)], "storage archive");
  await writeFile(join(staging, "SHA256SUMS"), `${await sha256(join(staging, "database.dump"))}  database.dump\n${await sha256(join(staging, "storage.tgz"))}  storage.tgz\n`);

  await rename(staging, destination);
  const entries = await readdir(backupRoot, { withFileTypes: true });
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d{4}-\d{2}-\d{2}T/.test(entry.name)) continue;
    const path = join(backupRoot, entry.name);
    if ((await stat(path)).mtimeMs < cutoff) await rm(path, { recursive: true, force: true });
  }
  console.log(`Backup completed: ${destination}`);
} catch (error) {
  await rm(staging, { recursive: true, force: true });
  throw error;
}
