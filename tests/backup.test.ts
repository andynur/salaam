import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readdir, rm, writeFile, chmod, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

async function backupFixture(fail: boolean) {
  const root = await mkdtemp(join(tmpdir(), "salaam-backup-test-"));
  const storage = join(root, "storage");
  const backups = join(root, "backups");
  const bin = join(root, "bin");
  await mkdir(storage);
  await mkdir(bin);
  await writeFile(join(storage, "example.txt"), "matching uploaded file");
  const dump = join(bin, "pg_dump");
  await writeFile(dump, `#!${process.execPath}\n
if (process.argv.some(arg => arg.includes("test-only-password"))) process.exit(91);
if (process.env.PGPASSWORD !== "test-only-password") process.exit(92);
if (!process.argv.some(arg => arg.startsWith("--dbname=postgres://backup@localhost/"))) process.exit(93);
${fail ? "process.exit(2);" : 'await Bun.write(process.argv.find(arg => arg.startsWith("--file=")).slice(7), "test database dump");'}
`);
  await chmod(dump, 0o700);
  return { root, storage, backups, bin };
}

for (const fail of [false, true]) test(`backup ${fail ? "cleans failed staging" : "pairs archives and streaming checksums without password arguments"}`, async () => {
  const fixture = await backupFixture(fail);
  try {
    const child = Bun.spawn([process.execPath, resolve("scripts/backup.ts")], {
      cwd: fixture.root,
      env: { ...process.env, PATH: `${fixture.bin}:${process.env.PATH}`, DATABASE_URL: "postgres://backup:test-only-password@localhost/salaam_test", STORAGE_ROOT: fixture.storage, BACKUP_ROOT: fixture.backups },
      stdout: "pipe", stderr: "pipe",
    });
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    expect(stdout + stderr).not.toContain("test-only-password");
    const directories = await readdir(fixture.backups);
    if (fail) {
      expect(code).not.toBe(0);
      expect(directories).toEqual([]);
    } else {
      expect(code).toBe(0);
      expect(directories).toHaveLength(1);
      const directory = join(fixture.backups, directories[0]!);
      const manifest = await readFile(join(directory, "SHA256SUMS"), "utf8");
      for (const name of ["database.dump", "storage.tgz"]) {
        expect(manifest).toContain(`${createHash("sha256").update(await readFile(join(directory, name))).digest("hex")}  ${name}\n`);
      }
      const tar = Bun.spawn(["tar", "-tzf", join(directory, "storage.tgz")], { stdout: "pipe" });
      expect(await new Response(tar.stdout).text()).toContain("storage/example.txt");
      expect(await tar.exited).toBe(0);
    }
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
});
