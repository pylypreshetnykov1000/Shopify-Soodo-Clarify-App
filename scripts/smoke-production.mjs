import { spawn } from "node:child_process";
import { once } from "node:events";
import assert from "node:assert/strict";
const base = "http://127.0.0.1:3103";
const child = spawn(process.execPath, ["node_modules/@react-router/serve/bin.js", "build/server/index.js"], {
  env: { ...process.env, NODE_ENV: "production", PORT: "3103", HOST: "127.0.0.1", DEMO_MODE: "true", SHOPIFY_API_KEY: "production-smoke", SHOPIFY_API_SECRET: "production-smoke", SHOPIFY_APP_URL: base },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
child.stdout.on("data", chunk => { logs += chunk; });
child.stderr.on("data", chunk => { logs += chunk; });
try {
  let home;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited: ${logs}`);
    try { home = await fetch(base, { signal: AbortSignal.timeout(1500), headers: { Connection: "close" } }); break; } catch { await new Promise(resolve => setTimeout(resolve, 200)); }
  }
  assert.ok(home, `Server did not start: ${logs}`);
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.ok(html.includes("Connect your Shopify store"));
  assert.ok(!html.includes("Interactive demo"), "Demo must remain disabled in production even when DEMO_MODE is set");
  console.log("PASS: production server starts and demo access stays disabled");
  const css = html.match(/href="([^\"]+\.css)"/);
  assert.ok(css, "Built stylesheet is linked");
  const asset = await fetch(new URL(css[1], base), { headers: { Connection: "close" } });
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("Content-Type") ?? "", /text\/css/);
  await asset.text();
  console.log("PASS: built assets are served successfully");
  const app = await fetch(`${base}/app`, { redirect: "manual", headers: { Connection: "close", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36" } });
  const appHtml = await app.text();
  // Shopify may return its App Bridge authentication bootstrap as HTML 200.
  const bootstrap = app.status === 200 && appHtml.includes("shopifycloud/app-bridge.js");
  assert.ok([302, 303, 401].includes(app.status) || bootstrap, `Unexpected authentication response ${app.status}`);
  assert.ok(!appHtml.includes('class="app-shell"') && !appHtml.includes("Summit Shell Jacket") && !appHtml.includes("Information completeness"), "Unauthenticated response must not contain catalog data");
  console.log("PASS: unauthenticated production requests receive no catalog data");
  const health = await fetch(`${base}/health`, { headers: { Connection: "close" } });
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok" });
  console.log("PASS: health endpoint verifies database connectivity");
} finally {
  if (child.exitCode === null) { const stopped = once(child, "close"); child.kill(); await stopped; }
}
