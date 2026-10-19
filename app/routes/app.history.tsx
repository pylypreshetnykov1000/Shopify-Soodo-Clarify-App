import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Collapsible } from "../ui/motion";
import { HelpButton } from "../ui/help";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import db from "../db.server";
import { context } from "../services/context.server";
import { restoreChange, verifyChange } from "../services/catalog.server";
import { recordSnapshot } from "../services/snapshots.server";
import { AppLink, Badge, formatDate, Icon, Notice, Spinner } from "../ui/common";
import { previewText } from "../core/catalog";

const UNRESOLVED = ["PUBLISHING", "UNCERTAIN", "RESTORING", "RESTORE_UNCERTAIN"];

/** A search listing snapshot as readable text. */
function listingText(json: string) {
  try {
    const listing = JSON.parse(json) as { title?: string; description?: string };
    return [`Title: ${listing.title || "(product title)"}`, `Description: ${listing.description || "(from product description)"}`].join("\n");
  } catch {
    return json;
  }
}
export async function loader({ request }: LoaderFunctionArgs) {
  const { shop } = await context(request);
  const changes = await db.change.findMany({
    where: { product: { shop } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      kind: true,
      status: true,
      createdAt: true,
      message: true,
      beforeHtml: true,
      afterHtml: true,
      product: { select: { id: true, title: true } },
    },
  });
  return {
    changes: changes.map(({ beforeHtml, afterHtml, ...change }) => ({
      ...change,
      beforeText: change.kind === "seo" ? listingText(beforeHtml) : previewText(beforeHtml),
      afterText: change.kind === "seo" ? listingText(afterHtml) : previewText(afterHtml),
    })),
  };
}
export async function action({ request }: ActionFunctionArgs) {
  const ctx = await context(request);
  const form = await request.formData();
  try {
    const id = String(form.get("changeId") ?? "");
    if (form.get("intent") === "verify")
      return {
        ok: true,
        message: await verifyChange(ctx.shop, id, ctx.adapter),
      };
    if (form.get("intent") === "restore") {
      if (form.get("confirmed") !== "yes")
        throw new Error(
          "Confirm that you want to restore the previous description.",
        );
      const message = await restoreChange(ctx.shop, id, ctx.adapter);
      await recordSnapshot(ctx.shop);
      return { ok: true, message };
    }
    throw new Error("Unknown action.");
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Operation failed. Please retry.",
    };
  }
}

function SavedDescriptions({ id, before, after }: { id: string; before: string; after: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="toggle text-link"
        style={{ marginTop: 8, fontSize: 12.5 }}
        aria-expanded={open}
        aria-controls={`saved-${id}`}
        onClick={() => setOpen(!open)}
      >
        <Icon name="chevron" size={13} />
        View saved descriptions
      </button>
      <Collapsible open={open} id={`saved-${id}`}>
        <div className="draft-columns">
          <div>
            <h3>Before</h3>
            <div className="description-text">{before || "No description"}</div>
          </div>
          <div className="proposed">
            <h3>Published</h3>
            <div className="description-text">{after}</div>
          </div>
        </div>
      </Collapsible>
    </>
  );
}

const tone = (status: string) =>
  status === "PUBLISHED" || status === "RESTORED"
    ? "success"
    : UNRESOLVED.includes(status) || status === "CONFLICT"
      ? "warning"
      : "neutral";

export default function History() {
  const { changes } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const pendingId = busy ? navigation.formData?.get("changeId") : null;
  const attention = changes.filter((c) => UNRESOLVED.includes(c.status)).length;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Change history</h1>
          <p>
            Every description Soodo published, with the version it replaced. Restoring is blocked if the
            product was edited afterwards.
          </p>
        </div>
        <div className="page-actions">
          <HelpButton topic="history" />
        </div>
      </div>
      <Notice result={result} />
      {attention > 0 && (
        <Notice tone="error">
          {attention} change{attention === 1 ? " needs" : "s need"} verification before that product can be
          changed again.
        </Notice>
      )}
      {!changes.length ? (
        <section className="card empty">
          <Icon name="history" size={26} />
          <h2>No published changes yet</h2>
          <p>Approved description changes appear here, with the previous version saved for restoring.</p>
          <AppLink to="/app/products" className="button primary">
            Review products
          </AppLink>
        </section>
      ) : (
        <section className="card">
          <ol className="timeline stagger">
            {changes.map((change) => (
              <li className="history-card" key={change.id}>
                <time dateTime={new Date(change.createdAt).toISOString()}>{formatDate(change.createdAt)}</time>
                <div className="history-body" style={{ minWidth: 0 }}>
                  <AppLink to={`/app/products/${change.product.id}`} className="text-link">
                    <h2 style={{ fontSize: 14 }}>{change.product.title}</h2>
                  </AppLink>
                  <div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Badge tone="neutral">{change.kind === "seo" ? "Search listing" : "Description"}</Badge>
                    <Badge tone={tone(change.status)}>{change.status.toLowerCase().replace(/_/g, " ")}</Badge>
                  </div>
                  {change.message && <Notice tone="info">{change.message}</Notice>}
                  <SavedDescriptions id={change.id} before={change.beforeText} after={change.afterText} />
                </div>
                <div className="history-actions">
                  {change.status === "PUBLISHED" && (
                    <Form method="post" className="history-actions">
                      <input type="hidden" name="changeId" value={change.id} />
                      <input type="hidden" name="intent" value="restore" />
                      <label className="checkbox">
                        <input type="checkbox" name="confirmed" value="yes" required />
                        <span>Restore the previous version</span>
                      </label>
                      <button className="button compact" disabled={busy}>
                        {pendingId === change.id && <Spinner />}
                        {change.kind === "seo" ? "Restore previous listing" : "Restore previous description"}
                      </button>
                    </Form>
                  )}
                  {UNRESOLVED.includes(change.status) && (
                    <Form method="post">
                      <input type="hidden" name="changeId" value={change.id} />
                      <input type="hidden" name="intent" value="verify" />
                      <button className="button primary compact" disabled={busy}>
                        {pendingId === change.id && <Spinner />}
                        Verify saved result
                      </button>
                    </Form>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
      <p className="footer-note">
        Showing the latest 100 changes. Saved descriptions are shown as plain text for safe review.
      </p>
    </>
  );
}
