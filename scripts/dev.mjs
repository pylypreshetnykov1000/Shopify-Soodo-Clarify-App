import { spawn } from "node:child_process";
const child = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1"], {
  stdio: "inherit", env: { ...process.env, DEMO_MODE: "true", SHOPIFY_API_KEY: "local-demo", SHOPIFY_API_SECRET: "local-demo", SHOPIFY_APP_URL: `http://127.0.0.1:${process.env.PORT || 3000}` },
});
child.on("close", code => { process.exitCode = code ?? 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
