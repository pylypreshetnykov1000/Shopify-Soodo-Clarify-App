import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import db from "../db.server";
import { context } from "../services/context.server";
import { restoreChange, verifyChange } from "../services/catalog.server";
import { AppLink, Badge, Icon, Notice } from "../ui/common";
import { plainText } from "../core/catalog";
export async function loader({ request }: LoaderFunctionArgs) {
  const { shop } = await context(request);
  return { changes: await db.change.findMany({ where: { product: { shop } }, orderBy: { createdAt: "desc" }, take: 100, include: { product: { select: { id: true, title: true } } } }) };
}
export async function action({ request }: ActionFunctionArgs) {
  const ctx = await context(request);
  const form = await request.formData();
  try {
    const id = String(form.get("changeId") ?? "");
    if (form.get("intent") === "verify") return { ok: true, message: await verifyChange(ctx.shop, id, ctx.adapter) };
    if (form.get("intent") === "restore") {
      if (form.get("confirmed") !== "yes") throw new Error("Confirm that you want to restore the previous description.");
      return { ok: true, message: await restoreChange(ctx.shop, id, ctx.adapter) };
    }
    throw new Error("Unknown action.");
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Operation failed. Please retry." }; }
}
export default function History() {
  const { changes } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const busy = useNavigation().state !== "idle";
  return <><div className="page-heading"><div><div className="eyebrow">A RECORD OF EVERY CHANGE</div><h1>Change history</h1><p>Verified results and saved snapshots. Restore a description without losing newer edits.</p></div></div><Notice result={result}/>
    {!changes.length ? <section className="card empty"><Icon name="history" size={36}/><h2>No published changes yet</h2><p>Your snapshots will appear here after you publish your first draft.</p><AppLink to="/app/products" className="button primary">Review products</AppLink></section> : changes.map(change => <section className="card history-card" key={change.id}><div className="card-heading"><div><AppLink to={`/app/products/${change.product.id}`} className="text-link"><h2>{change.product.title}</h2></AppLink><p>{new Date(change.createdAt).toISOString().replace("T", " ").slice(0, 16)} UTC</p></div><Badge tone={change.status === "PUBLISHED" || change.status === "RESTORED" ? "success" : "warning"}>{change.status.toLowerCase().replace(/_/g, " ")}</Badge></div>
      {change.message && <div className="notice">{change.message}</div>}
      <details><summary>View saved descriptions</summary><div className="draft-columns"><div><h3>Before</h3><div className="description-text">{plainText(change.beforeHtml) || "No description"}</div></div><div><h3>Published</h3><div className="description-text">{plainText(change.afterHtml)}</div></div></div></details>
      {change.status === "PUBLISHED" && <Form method="post" className="restore-form"><input type="hidden" name="changeId" value={change.id}/><input type="hidden" name="intent" value="restore"/><label className="checkbox"><input type="checkbox" name="confirmed" value="yes" required/><span>Restore the saved previous description.</span></label><button className="button secondary" disabled={busy}>Restore previous description</button></Form>}
      {["PUBLISHING", "UNCERTAIN", "RESTORING", "RESTORE_UNCERTAIN"].includes(change.status) && <Form method="post"><input type="hidden" name="changeId" value={change.id}/><input type="hidden" name="intent" value="verify"/><button className="button primary" disabled={busy}>Verify saved result</button></Form>}
    </section>)}<p className="footer-note">Showing the most recent 100 operations. Snapshot content is displayed as text for safe review.</p></>;
}
