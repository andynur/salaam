import { loadConfig } from "../../src/core/config";
import { connectDatabase } from "../../src/core/database/connection";
import { HttpError } from "../../src/core/errors";
import { curriculumCsvInput } from "../../src/modules/curriculum/input";
import { importCurriculum } from "../../src/modules/curriculum/service";

// Imports the school curriculum CSV into the curriculum tables, the same upsert the
// administrator's "Import CSV" action runs. Safe to repeat: unchanged weeks are left alone.
// Usage: bun run db:seed:curriculum [path/to/curriculum.csv]
const path = process.argv[2] ?? new URL("data/curriculum.csv", import.meta.url).pathname;
const file = Bun.file(path);
if (!(await file.exists())) throw new Error(`Curriculum CSV not found at ${path}.`);
const config = loadConfig();
const db = connectDatabase(config.databaseUrl);
try {
  const result = await importCurriculum(db, null, curriculumCsvInput(await file.text()), crypto.randomUUID());
  console.log(`Curriculum imported: ${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged.`);
} catch (error) {
  console.error(error instanceof HttpError ? error.message : "Curriculum import failed. Run migrations first.");
  process.exitCode = 1;
} finally { await db.close(); }
