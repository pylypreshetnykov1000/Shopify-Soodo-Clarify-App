import { useEffect, useRef } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
  useLocation,
} from "react-router";
import db from "../db.server";
import {
  audit,
  plainText,
  RULES,
  type Fact,
  type ProductData,
} from "../core/catalog";
import { fingerprint } from "../services/drafts.server";
import { context } from "../services/context.server";
import {
  createDraft,
  publishDraft,
  rejectDraft,
} from "../services/catalog.server";
import { AppLink, Badge, Icon, Notice } from "../ui/common";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { shop, demo } = await context(request);
  const row = await db.catalogProduct.findFirst({
    where: { shop, id: params.id },
    include: { suggestions: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!row) throw new Response("Product not found", { status: 404 });
  const product = JSON.parse(row.payload) as ProductData;
  const draft = row.suggestions[0] ?? null;
  return {
    row: { id: row.id, deleted: row.deleted },
    product: {
      title: product.title,
      productType: product.productType,
      status: product.status,
      updatedAt: product.updatedAt,
      descriptionText: plainText(product.descriptionHtml),
    },
    audit: audit(product),
    draft: draft
      ? {
          id: draft.id,
          status: draft.status,
          beforeText: plainText(draft.beforeHtml),
          afterText: plainText(draft.afterHtml),
          facts: JSON.parse(draft.facts) as Fact[],
          stale: draft.fingerprint !== fingerprint(product),
        }
      : null,
    demo,
  };
}
export async function action({ request, params }: ActionFunctionArgs) {
  const ctx = await context(request);
  const form = await request.formData();
  try {
    const id = params.id!;
    const intent = form.get("intent");
    if (intent === "draft") {
      if (form.get("confirmed") !== "yes")
        throw new Error(
          "Confirm that the specifications you entered are accurate.",
        );
      const input = Object.fromEntries(
        RULES.map((rule) => [rule.key, String(form.get(rule.key) ?? "")]),
      );
      await createDraft(ctx.shop, id, ctx.adapter, input);
      return {
        ok: true,
        focusDraft: true,
        message:
          "Draft created. Review the sources and proposed description before publishing.",
      };
    }
    const suggestionId = String(form.get("suggestionId") ?? "");
    const belongs = await db.suggestion.findFirst({
      where: { id: suggestionId, productId: id, product: { shop: ctx.shop } },
    });
    if (!belongs) throw new Error("Draft not found for this product.");
    if (intent === "publish") {
      if (form.get("approved") !== "yes")
        throw new Error("Approve the proposed change before publishing.");
      return {
        ok: true,
        message: await publishDraft(ctx.shop, suggestionId, ctx.adapter),
      };
    }
    if (intent === "reject") {
      await rejectDraft(ctx.shop, suggestionId);
      return {
        ok: true,
        message: "Draft rejected. Your product was not changed.",
      };
    }
    throw new Error("Unknown action.");
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Request failed. Please retry.",
    };
  }
}
export default function ProductReview() {
  const data = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy =
    navigation.state !== "idle" &&
    navigation.formMethod?.toLowerCase() === "post";
  const activeIntent = busy ? navigation.formData?.get("intent") : null;
  const { product, audit: report, draft } = data;
  const pending = draft?.status === "DRAFT";
  const { pathname, search } = useLocation();
  const reviewHeading = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (result?.ok && "focusDraft" in result && result.focusDraft) {
      reviewHeading.current?.focus({ preventScroll: true });
    }
  }, [result]);
  const draftReview = draft && (
    <details
      className={`draft-details${pending ? " active" : ""}`}
      open={pending}
      key={`review-${draft.id}-${draft.status}`}
    >
      <summary>
        {pending
          ? "Description draft"
          : `View ${draft.status.toLowerCase().replace(/_/g, " ")} draft`}
      </summary>
      <section className="card draft-card" tabIndex={-1}>
        <div className="card-heading">
          <div>
            <h2>Review description</h2>
            <p>
              {pending
                ? "Check the exact values below before approving."
                : `Draft status: ${draft.status.toLowerCase().replace(/_/g, " ")}`}
            </p>
          </div>
          <Badge tone={pending ? "warning" : "neutral"}>
            {draft.status.toLowerCase()}
          </Badge>
        </div>
        {pending && draft.stale && (
          <div className="notice error">
            Source product data changed. Create a fresh draft before publishing.
          </div>
        )}
        <div className="draft-columns">
          <div>
            <h3>Current description</h3>
            <div className="description-text">
              {draft.beforeText || "No description"}
            </div>
          </div>
          <div className="proposed">
            <h3>Proposed description</h3>
            <div className="description-text">{draft.afterText}</div>
          </div>
        </div>
        <div className="sources">
          <h3>Where these facts came from</h3>
          {draft.facts.map((fact) => (
            <div key={fact.key}>
              <strong>{fact.label}</strong>
              <span>{fact.value}</span>
              <small>{fact.source}</small>
            </div>
          ))}
        </div>
        {pending && (
          <div className="draft-actions">
            <Form method="post">
              <input type="hidden" name="intent" value="publish" />
              <input type="hidden" name="suggestionId" value={draft.id} />
              <label className="checkbox">
                <input type="checkbox" name="approved" value="yes" required />
                <span>
                  I approve this description change. It will replace the current{" "}
                  {data.demo ? "demo" : "Shopify"} description.
                </span>
              </label>
              <button
                className="button primary"
                disabled={busy || draft.stale || data.row.deleted}
              >
                {activeIntent === "publish"
                  ? "Publishing..."
                  : data.demo
                    ? "Publish to demo catalog"
                    : "Publish to Shopify"}
                <Icon name="arrow" />
              </button>
            </Form>
            <Form method="post">
              <input type="hidden" name="intent" value="reject" />
              <input type="hidden" name="suggestionId" value={draft.id} />
              <button className="button secondary" disabled={busy}>
                {activeIntent === "reject" ? "Rejecting..." : "Reject draft"}
              </button>
            </Form>
          </div>
        )}
      </section>
    </details>
  );
  return (
    <>
      <AppLink to="/app/products" className="back-link">
        ← Back to products
      </AppLink>
      <div
        className="page-heading"
        id={pending ? "draft" : undefined}
        ref={reviewHeading}
        tabIndex={-1}
      >
        <div>
          <h1>{product.title}</h1>
          <p>
            {product.productType || "Uncategorized"} ·{" "}
            {product.status.toLowerCase()} · {report.score}% information
            completeness
          </p>
        </div>
        <div className="page-actions">
          <AppLink to={`/app/geo/${data.row.id}`} className="button secondary">
            GEO checks
          </AppLink>
          <Badge tone={report.score === 100 ? "success" : "warning"}>
            {report.missing.length
              ? `${report.missing.length} missing fields`
              : "Checklist complete"}
          </Badge>
        </div>
      </div>
      <Notice result={result} />
      {pending && draftReview}
      {data.row.deleted && (
        <div className="notice error">
          This product was deleted in Shopify. Publishing is unavailable.
        </div>
      )}
      {!!report.conflicts.length && (
        <div className="notice error">
          Conflicting values for{" "}
          {report.conflicts
            .map((key) => RULES.find((r) => r.key === key)?.label)
            .join(", ")}
          . Correct them in Shopify, then scan again.
        </div>
      )}
      <details
        className={`facts-details${pending ? " editable" : ""}`}
        open={!pending || !!draft?.stale}
        key={`facts-${draft?.id ?? "none"}-${draft?.status ?? "none"}`}
      >
        <summary>Edit product facts</summary>
        <div className="review-grid">
          <section className="card">
            <div className="card-heading">
              <div>
                <h2>Product facts</h2>
                <p>
                  Add verified details. Leave anything you do not know empty.
                </p>
              </div>
            </div>
            <Form
              method="post"
              action={`${pathname}${search}#draft`}
              aria-busy={activeIntent === "draft"}
              className="facts-form"
              key={`${product.updatedAt}-${draft?.id ?? "none"}-${draft?.status ?? "none"}`}
            >
              <input type="hidden" name="intent" value="draft" />
              {RULES.map((rule) => {
                const fact = report.facts.find((f) => f.key === rule.key);
                return (
                  <label className="field" key={rule.key}>
                    <span className="field-heading">
                      {rule.label}
                      <Badge tone={fact ? "success" : "warning"}>
                        {fact ? "Found" : "Missing"}
                      </Badge>
                    </span>
                    <input
                      name={rule.key}
                      aria-label={rule.label}
                      disabled={busy}
                      defaultValue={
                        fact?.value ??
                        (pending
                          ? draft?.facts.find((f) => f.key === rule.key)?.value
                          : "") ??
                        ""
                      }
                      maxLength={500}
                      readOnly={!!fact}
                      placeholder={fact ? "" : "Add a verified specification"}
                    />
                    <small>{fact ? fact.source : rule.hint}</small>
                  </label>
                );
              })}
              <label className="checkbox">
                <input type="checkbox" name="confirmed" value="yes" required />
                <span>
                  I confirm that any specifications I add are accurate for this
                  product.
                </span>
              </label>
              <button
                className="button primary"
                disabled={busy || data.row.deleted || !!report.conflicts.length}
              >
                {activeIntent === "draft"
                  ? "Creating draft..."
                  : pending
                    ? "Replace draft with these facts"
                    : "Create description draft"}
              </button>
            </Form>
          </section>
          <aside className="card context-card">
            <h3>Current description</h3>
            <div className="description-text">
              {product.descriptionText ||
                "This product has no description yet."}
            </div>
            <p className="muted">
              Published specifications are added to the product description.
              Check your storefront after publishing.
            </p>
          </aside>
        </div>
      </details>
      {!pending && draftReview}
    </>
  );
}
