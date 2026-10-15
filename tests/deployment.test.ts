import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
test("PostgreSQL schema matches local models and stays in sync", () => {
  const result = spawnSync(process.execPath, ["scripts/sync-postgres-schema.mjs", "--check"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const production = readFileSync("prisma/postgresql/schema.prisma", "utf8");
  assert.match(production, /provider = "postgresql"/);
  assert.match(production, /env\("DATABASE_URL"\)/);
});
test("production migration refuses SQLite or missing database credentials", () => {
  for (const url of ["", "file:dev.sqlite"]) {
    const result = spawnSync(process.execPath, ["scripts/migrate-postgres.mjs"], { env: { ...process.env, DATABASE_URL: url }, encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /requires a PostgreSQL DATABASE_URL/);
  }
});
