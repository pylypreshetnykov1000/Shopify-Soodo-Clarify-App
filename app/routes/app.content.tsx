import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import db from "../db.server";
import { context } from "../services/context.server";
import { ensureStore } from "../services/catalog.server";
import { seedDemo } from "../services/demo.server";
import { catalogOverview } from "../services/geo.server";
import { AppLink, Badge, Empty, formatDate, Panel, PanelLink, Thumb } from "../ui/common";
import { HelpButton } from "../ui/help";

const CHANGE_LABEL: Record<string, string> = {
  PUBLISHED: "Published",
  RESTORED: "Previous version restored",
  FAILED: "Publish failed",
  CONFLICT: "Stopped: product changed",
};

export async function loader({ request }: LoaderFunctionArgs) {
  const ctx = await context(request);
  if (ctx.demo) await seedDemo();
  else await ensureStore(ctx.shop);
  const [overview, drafts, changes] = await Promise.all([
    catalogOverview(ctx.shop),
    db.suggestion.findMany({
      where: { status: "DRAFT", product: { shop: ctx.shop, deleted: false } },
      orderBy: { createdAt: "desc" },
      select: { id: true, kind: true, createdAt: true, product: { select: { id: true, title: true } } },
    }),
    db.change.findMany({
      where: { product: { shop: ctx.shop } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, kind: true, status: true, createdAt: true, product: { select: { id: true, title: true } } },
    }),
  ]);
  const drafted = new Set(drafts.map((d) => `${d.product.id}:${d.kind}`));
  const needs = overview.products
    .filter((p) => p.status === "ACTIVE" && p.content.length)
    .sort((a, b) => b.content.length - a.content.length || a.readiness - b.readiness);
  return {
    drafts: drafts.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })),
    needs: needs.slice(0, 12).map((p) => ({
      recordId: p.recordId,
      title: p.title,
      image: p.image,
      content: p.content,
      description: p.content.some((c) => c.id !== "search-preview") && !drafted.has(`${p.recordId}:description`),
      listing: p.content.some((c) => c.id === "search-preview") && !drafted.has(`${p.recordId}:seo`),
    })),
    needsTotal: needs.length,
    active: overview.summary.active,
    changes: changes.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
  };
}

export default function Content() {
  const { drafts, needs, needsTotal, active, changes } = useLoaderData<typeof loader>();
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Content</h1>
          <p>Product descriptions, buyer Q&amp;A and search listings. Nothing is published until you approve it.</p>
        </div>
        <div className="page-actions">
          <HelpButton topic="content" />
        </div>
      </div>

      <section className="summary-card content-summary" aria-label="Content at a glance">
        <div className="summary-stat">
          <span className="stat-label">Waiting for your review</span>
          <strong className="summary-value">{drafts.length}</strong>
          <span className="stat-note">{drafts.length ? "Drafts ready to approve" : "No drafts waiting"}</span>
        </div>
        <div className="summary-stat">
          <span className="stat-label">Products needing better content</span>
          <strong className="summary-value">
            {needsTotal}
            <small> of {active}</small>
          </strong>
          <span className="stat-note">Thin descriptions, missing facts or weak search listings</span>
        </div>
        <div className="summary-stat">
          <span className="stat-label">Published from Soodo</span>
          <strong className="summary-value">{changes.filter((c) => c.status === "PUBLISHED").length}</strong>
          <span className="stat-note">
            <AppLink to="/app/history" className="text-link">
              See the full history
            </AppLink>
          </span>
        </div>
      </section>

      <div className="overview-columns content-columns">
        <div className="overview-column">
          <Panel
            id="review"
            title="Waiting for your review"
            description="Check the wording, approve it, and Soodo publishes it to Shopify."
          >
            {drafts.length ? (
              <ul className="panel-rows stagger">
                {drafts.map((d) => (
                  <li key={d.id}>
                    <div className="row-main">
                      <strong>{d.product.title}</strong>
                      <small>
                        {d.kind === "seo" ? "Search listing" : "Description"} · drafted {formatDate(d.createdAt)}
                      </small>
                    </div>
                    <AppLink
                      to={`/app/products/${d.product.id}${d.kind === "seo" ? "#listing" : "#draft"}`}
                      className="button compact primary"
                      label={`Review ${d.kind === "seo" ? "search listing" : "description"} for ${d.product.title}`}
                    >
                      Review
                    </AppLink>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="Nothing waiting">Drafts you create from a product appear here until you publish them.</Empty>
            )}
          </Panel>
          <Panel
            id="needs-content"
            title="Products that need better content"
            description="Most issues first. Soodo drafts the text from facts you confirm."
            action={needsTotal > needs.length && <PanelLink to="/app/products">All {needsTotal}</PanelLink>}
          >
            {needs.length ? (
              <ul className="panel-rows stagger content-needs">
                {needs.map((p) => (
                  <li key={p.recordId}>
                    <Thumb image={p.image} />
                    <div className="row-main">
                      <strong>{p.title}</strong>
                      <small>{p.content.map((c) => c.label).join(" · ")}</small>
                    </div>
                    <div className="row-actions">
                      {p.description && (
                        <AppLink
                          to={`/app/products/${p.recordId}#specs`}
                          className="button compact"
                          label={`Write description for ${p.title}`}
                        >
                          Description
                        </AppLink>
                      )}
                      {p.listing && (
                        <AppLink
                          to={`/app/products/${p.recordId}#listing`}
                          className="button compact"
                          label={`Improve search listing for ${p.title}`}
                        >
                          Listing
                        </AppLink>
                      )}
                      {!p.description && !p.listing && <Badge tone="info">Draft waiting</Badge>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="Every product’s content passes">Descriptions, facts and search listings all pass.</Empty>
            )}
          </Panel>
        </div>
        <div className="overview-column">
          <Panel
            id="published"
            title="Recently published"
            description="Every change is saved and can be restored from History."
            action={changes.length > 0 && <PanelLink to="/app/history">History</PanelLink>}
          >
            {changes.length ? (
              <ul className="panel-rows stagger">
                {changes.map((item) => (
                  <li key={item.id}>
                    <span className="activity-dot" aria-hidden="true" />
                    <div className="row-main">
                      <strong>{item.product.title}</strong>
                      <small>
                        {item.kind === "seo" ? "Search listing" : "Description"} ·{" "}
                        {CHANGE_LABEL[item.status] ?? item.status.toLowerCase().replace(/_/g, " ")} ·{" "}
                        {formatDate(item.createdAt)}
                      </small>
                    </div>
                    {!["PUBLISHED", "RESTORED"].includes(item.status) && <Badge tone="warning">Check</Badge>}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty icon="history" title="Nothing published yet">
                Descriptions and search listings you approve appear here.
              </Empty>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
