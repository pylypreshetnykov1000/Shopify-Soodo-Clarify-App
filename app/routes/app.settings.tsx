import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { context } from "../services/context.server";
import { RULES } from "../core/catalog";
import { Badge } from "../ui/common";
export async function loader({ request }: LoaderFunctionArgs) { const { shop, demo } = await context(request); return { shop, demo }; }
export default function Settings() {
  const { shop, demo } = useLoaderData<typeof loader>();
  return <><div className="page-heading"><div><div className="eyebrow">SIMPLE BY DESIGN</div><h1>Settings & checklist</h1><p>Understand exactly what your app checks and changes.</p></div></div><div className="settings-grid">
    <section className="card padded"><h2>Store connection</h2><p className="setting-value">{demo ? "Trail Supply · local demo" : shop}</p><Badge tone="success">{demo ? "Demo active" : "Authenticated with Shopify"}</Badge><hr/><h3>Publishing</h3><p>Manual approval is required. The app adds a specifications section to your product description and preserves the original content.</p><h3>Access</h3><p>Product read and write access only. Customer and order data are not used.</p></section>
    <section className="card padded"><h2>Outdoor gear checklist</h2><p>Five equally weighted checks. A field counts as found when it has an explicit description label or a recognized product metafield, with no conflicting values.</p>{RULES.map(rule => <div className="rule" key={rule.key}><strong>{rule.label}</strong><small>{rule.hint}</small></div>)}<p className="muted">Unlabelled prose may contain facts this checklist does not recognize. “Missing” means the app needs an explicit value, not that the product necessarily lacks one.</p></section>
    <section className="card padded"><h2>Plan</h2><Badge>Pilot version · no billing enabled</Badge><p>This build focuses on accurate audits and safe publishing. Paid plans will be added after validation with real development stores.</p><h3>Draft generation</h3><p>Source-based templates organize your verified facts. No external AI service is used, and specifications are never invented.</p></section>
    <section className="card padded"><h2>Synchronization & recovery</h2><p>Catalog scans run in resumable batches. Product webhooks invalidate cached data; a fresh Shopify read happens before drafting, publishing, and restoring.</p><p>Every publishing attempt saves both descriptions. If a result cannot be confirmed, History lets you verify it before making another change.</p></section>
  </div></>;
}
