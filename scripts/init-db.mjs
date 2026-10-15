import { closeSync, openSync } from "node:fs";
// Prisma's Windows schema engine can fail when the SQLite file does not exist.
// Create an empty file exclusively; never truncate an existing database.
try { closeSync(openSync(new URL("../prisma/dev.sqlite", import.meta.url), "wx")); }
catch (error) { if (error.code !== "EEXIST") throw error; }
