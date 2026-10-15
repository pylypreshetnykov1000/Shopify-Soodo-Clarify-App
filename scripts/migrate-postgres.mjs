import { spawn } from "node:child_process";
if (!/^postgres(?:ql)?:\/\//.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Production startup requires a PostgreSQL DATABASE_URL. Set it to the Render database's internal connection URL.");
}
const child = spawn(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", "prisma/postgresql/schema.prisma"], { stdio: "inherit", env: process.env });
child.on("close", code => { process.exitCode = code ?? 1; });
child.on("error", () => { process.exitCode = 1; });
