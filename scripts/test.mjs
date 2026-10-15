import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";

const mode = process.argv[2];
if (!["unit", "browser", "production"].includes(mode)) throw new Error("Choose unit, browser, or production tests.");
const tempRoot = resolve(tmpdir());
const directory = mkdtempSync(join(tempRoot, "soodo-tests-"));
const file = join(directory, "test.sqlite");
const db = new DatabaseSync(file);
db.exec("PRAGMA foreign_keys = ON;");
for (const migration of readdirSync("prisma/migrations").filter(name => /^\d/.test(name)).sort()) {
  db.exec(readFileSync(join("prisma/migrations", migration, "migration.sql"), "utf8"));
}
db.close();
const command = mode === "unit"
  ? ["node_modules/tsx/dist/cli.mjs", "--test", ...readdirSync("tests").filter(name => name.endsWith(".test.ts")).map(name => join("tests", name))]
  : mode === "browser" ? ["node_modules/@playwright/test/cli.js", "test"] : ["scripts/smoke-production.mjs"];
const child = spawn(process.execPath, command, { stdio: "inherit", env: { ...process.env, DATABASE_URL: `file:${file.replace(/\\/g, "/")}`, SOODO_TEST_DATABASE: "true" } });
child.on("close", code => {
  // Delete only the freshly created directory within the OS temp directory.
  const target = resolve(directory);
  const inside = relative(tempRoot, target);
  if (!inside.startsWith("soodo-tests-") || inside.includes("..") || inside.includes("/") || inside.includes("\\")) throw new Error("Invalid test cleanup target.");
  rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
