import { useEffect, useRef } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Form,
  useActionData,
  useLoaderData,
  useLocation,
  useNavigation,
} from "react-router";
import db from "../db.server";
import { ALL_RULES } from "../core/profiles";
import { GROUPS, type CheckGroup, type GeoCheck } from "../core/geo";
import { context } from "../services/context.server";
import {
  createDraft,
  publishDraft,
  rejectDraft,
} from "../services/catalog.server";
import { productWorkspace } from "../services/geo.server";
import { checkLivePage } from "../services/live.server";
import {
  AppLink,
  Badge,
  Dial,
  ExternalLink,
  formatDate,
  Icon,
  Mark,
  Notice,
  PRIORITY_LABEL,
  Spinner,
  Thumb,
} from "../ui/common";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { shop, demo } = await context(request);
  return { ...(await productWorkspace(shop, params.id!)), demo };
}
export async function action({ request, params }: ActionFunctionArgs) {
  const ctx = await context(request);
  const form = await request.formData();
  try {
    const id = params.id!;
    const intent = form.get("intent");
    if (intent === "live")
      return { ok: true, message: await checkLivePage(ctx.shop, id, ctx.fetcher) };
    if (intent === "draft") {
      if (form.get("confirmed") !== "yes")
        throw new Error(
          "Confirm that the specifications you entered are accurate.",
        );
      // Only keys of the product's checklist are used by the draft builder.
      const input = Object.fromEntries(
        ALL_RULES.filter((rule) => form.has(rule.key)).map((rule) => [
          rule.key,
          String(form.get(rule.key) ?? ""),
        ]),
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

type Data = Awaited<ReturnType<typeof loader>>;

function LiveForm({ busy, label = "Check live page", compact }: { busy: boolean; label?: string; compact?: boolean }) {
  const navigation = useNavigation();
  const running = busy && navigation.formData?.get("intent") === "live";
  return (
    <Form method="post">
      <input type="hidden" name="intent" value="live" />
      <button className={`button${compact ? " compact" : ""}`} disabled={busy} aria-busy={running}>
        {running ? <Spinner /> : <Icon name="globe" size={compact ? 13 : 15} />}
        {running ? "Checking..." : label}
      </button>
    </Form>
  );
}

function CheckRow({ check, data, busy }: { check: GeoCheck; data: Data; busy: boolean }) {
  const kind = check.status === "pass" ? "pass" : check.status === "unknown" ? "unknown" : check.priority;
  return (
    <div className="check">
      <Mark
        kind={kind}
        label={check.status === "pass" ? "Passed" : check.status === "unknown" ? "Not checked" : `${PRIORITY_LABEL[check.priority]} priority`}
      />
      <div style={{ minWidth: 0 }}>
        <h3>{check.label}</h3>
        <p>{check.evidence}</p>
        {check.status !== "pass" && <p className="advice">{check.action}</p>}
      </div>
      {check.status !== "pass" && (
        <div className="check-cta">
          {check.destination === "facts" ? (
            <a href="#specs" className="button compact">
              Add specifications
            </a>
          ) : check.destination === "live" ? (
            data.report.publicUrl && <LiveForm busy={busy} label="Check" compact />
          ) : check.destination === "scan" ? (
            <AppLink to="/app" className="button compact">
              Scan
            </AppLink>
          ) : check.destination === "shopify" && data.adminUrl ? (
            <ExternalLink href={data.adminUrl} className="button compact">
              Edit
            </ExternalLink>
          ) : null}
        </div>
      )}
    </div>
  );
}

function DraftReview({ data, busy, pending }: { data: Data; busy: boolean; pending: boolean }) {
  const navigation = useNavigation();
  const activeIntent = busy ? navigation.formData?.get("intent") : null;
  const draft = data.draft!;
  return (
    <section className="card draft-card" id={pending ? "draft" : undefined} tabIndex={-1}>
      <div className="card-heading">
        <div>
          <h2>Review description</h2>
          <p>
            {pending
              ? "Check the exact wording below. Nothing changes in your store until you approve."
              : `Draft status: ${draft.status.toLowerCase().replace(/_/g, " ")}`}
          </p>
        </div>
        <Badge tone={pending ? "info" : "neutral"}>
          {draft.status.toLowerCase().replace(/_/g, " ")}
        </Badge>
      </div>
      {pending && draft.stale && (
        <div style={{ padding: "16px 20px 0" }}>
          <Notice tone="error">
            The product changed in Shopify after this draft was made. Create a fresh draft before publishing.
          </Notice>
        </div>
      )}
      <div className="draft-columns">
        <div>
          <h3>Current</h3>
          <div className="description-text">{draft.beforeText || "No description"}</div>
        </div>
        <div className="proposed">
          <h3>Proposed</h3>
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
                I approve this change. It replaces the current {data.demo ? "demo" : "Shopify"} description; the
                previous version is saved in Change history.
              </span>
            </label>
            <button className="button primary" disabled={busy || draft.stale || data.row.deleted} aria-busy={activeIntent === "publish"}>
              {activeIntent === "publish" && <Spinner />}
              {activeIntent === "publish"
                ? "Publishing..."
                : data.demo
                  ? "Publish to demo catalog"
                  : "Publish to Shopify"}
            </button>
          </Form>
          <Form method="post">
            <input type="hidden" name="intent" value="reject" />
            <input type="hidden" name="suggestionId" value={draft.id} />
            <button className="button" disabled={busy}>
              {activeIntent === "reject" ? "Rejecting..." : "Reject draft"}
            </button>
          </Form>
        </div>
      )}
    </section>
  );
}

function LivePanel({ data, busy }: { data: Data; busy: boolean }) {
  const live = data.live;
  const yes = (ok: boolean | null, good: string, bad: string, unknown = "—") =>
    ok === null ? <span>{unknown}</span> : <span className={ok ? "ok" : "bad"}>{ok ? good : bad}</span>;
  const search = live?.crawlers.filter((c) => c.purpose !== "training") ?? [];
  const training = live?.crawlers.filter((c) => c.purpose === "training") ?? [];
  return (
    <section className="card" aria-labelledby="live-heading">
      <div className="card-heading">
        <div>
          <h2 id="live-heading">Live page</h2>
          <p>{live ? `Checked ${formatDate(live.checkedAt)}` : "What crawlers and assistants actually see."}</p>
        </div>
      </div>
      <div className="card-body">
        {!data.report.publicUrl ? (
          <p>This product has no public Online Store page to check.</p>
        ) : !live ? (
          <>
            <p style={{ marginBottom: 14, fontSize: 12.5 }}>
              Loads the public product page and robots.txt, then compares the page’s product markup with
              Shopify. Read-only.
            </p>
            <LiveForm busy={busy} />
          </>
        ) : (
          <>
            <dl className="live-list">
              <div>
                <dt>Page</dt>
                <dd>
                  {live.error
                    ? <span className="bad">{live.error}</span>
                    : live.passwordProtected
                      ? <span className="bad">Password protected</span>
                      : yes(live.httpStatus === 200, "Reachable", `HTTP ${live.httpStatus}`)}
                </dd>
              </div>
              <div>
                <dt>Indexing</dt>
                <dd>{live.error ? "—" : yes(!live.noindex, "Allowed", "noindex")}</dd>
              </div>
              <div>
                <dt>Canonical</dt>
                <dd>{yes(live.canonicalMatches, "Matches", "Different page", "Not set")}</dd>
              </div>
              <div>
                <dt>Product markup</dt>
                <dd>
                  {live.structured
                    ? yes(live.structured.count === 1 && !live.structured.invalidBlocks, "Found", live.structured.count > 1 ? `${live.structured.count} blocks` : "Invalid")
                    : live.error || live.passwordProtected ? "—" : <span className="bad">Missing</span>}
                </dd>
              </div>
              <div>
                <dt>Price matches</dt>
                <dd>{yes(live.priceMatches, "Yes", "No")}</dd>
              </div>
              <div>
                <dt>Stock matches</dt>
                <dd>{yes(live.availabilityMatches, "Yes", "No")}</dd>
              </div>
              <div>
                <dt>Specs on page</dt>
                <dd>{yes(live.specsVisible, "Visible", "Not visible", "None to check")}</dd>
              </div>
            </dl>
            <ul className="crawlers" aria-label="Crawler access from robots.txt">
              {search.map((c) => (
                <li key={c.agent}>
                  <span>
                    {c.agent}
                    <small>{c.owner}</small>
                  </span>
                  <span className={c.allowed ? "ok" : "bad"}>{c.allowed ? "Allowed" : "Blocked"}</span>
                </li>
              ))}
            </ul>
            <details className="disclosure" style={{ marginTop: 10 }}>
              <summary className="text-link" style={{ fontSize: 12.5 }}>
                Training crawlers ({training.filter((c) => !c.allowed).length} blocked)
              </summary>
              <ul className="crawlers disclosure-body" style={{ marginTop: 6 }}>
                {training.map((c) => (
                  <li key={c.agent}>
                    <span>
                      {c.agent}
                      <small>{c.owner}</small>
                    </span>
                    <span>{c.allowed ? "Allowed" : "Blocked"}</span>
                  </li>
                ))}
              </ul>
              <p style={{ fontSize: 12, marginTop: 6 }}>
                Training crawlers don’t affect search or assistant answers. Blocking them is your choice.
              </p>
            </details>
            <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <LiveForm busy={busy} label="Check again" compact />
              {!data.demo && <ExternalLink href={live.url} className="button compact">View page</ExternalLink>}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export default function ProductWorkspace() {
  const data = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle" && navigation.formMethod?.toLowerCase() === "post";
  const activeIntent = busy ? navigation.formData?.get("intent") : null;
  const { product, report, specs, draft } = data;
  const pending = draft?.status === "DRAFT";
  const { pathname, search } = useLocation();
  const draftRef = useRef<HTMLDivElement>(null);
  const focused = useRef<unknown>(null);
  const pendingId = pending ? draft?.id : null;
  useEffect(() => {
    // The action result can render before the revalidated draft does; focus
    // once both are present, and only once per result.
    if (!result?.ok || !("focusDraft" in result) || focused.current === result) return;
    const target = draftRef.current?.querySelector<HTMLElement>("#draft");
    if (!target || !pendingId) return;
    focused.current = result;
    target.focus();
  }, [result, pendingId]);
  const issues = report.issues;
  const passed = report.checks.filter((c) => c.status === "pass");
  const groups = (Object.keys(GROUPS) as CheckGroup[])
    .map((group) => ({ group, checks: issues.filter((c) => c.group === group) }))
    .filter((g) => g.checks.length);

  return (
    <>
      <AppLink to="/app/products" className="back-link">
        <Icon name="back" size={14} /> Products
      </AppLink>
      <div className="product-head">
        <div className="product-title">
          <Thumb image={product.image} large />
          <div style={{ minWidth: 0 }}>
            <h1>{product.title}</h1>
            <div className="meta-line">
              <span>{product.category ?? "No category"}</span>
              <span>{product.status.toLowerCase()}</span>
              <span>
                {data.profile.label} checklist{data.profile.automatic ? "" : " (fixed)"}
              </span>
            </div>
          </div>
        </div>
        <div className="head-score">
          <Dial value={report.readiness} label="Product readiness" />
          <div className="page-actions">
            {data.adminUrl && (
              <ExternalLink href={data.adminUrl} className="button">
                Edit in Shopify
              </ExternalLink>
            )}
            {report.publicUrl && !data.demo && (
              <ExternalLink href={report.publicUrl} className="button">
                View on store
              </ExternalLink>
            )}
          </div>
        </div>
      </div>
      <Notice result={result} />
      {data.row.deleted && (
        <Notice tone="error">This product was deleted in Shopify. Publishing is unavailable.</Notice>
      )}
      {report.needsRescan && (
        <Notice tone="info">
          This product was imported before some checks existed.{" "}
          <AppLink to="/app" className="text-link">
            Scan your catalog
          </AppLink>{" "}
          to complete them.
        </Notice>
      )}
      <div ref={draftRef}>{pending && <DraftReview data={data} busy={busy} pending />}</div>

      <div className="columns">
        <div>
          <section className="card" aria-labelledby="fixes-heading">
            <div className="card-heading">
              <div>
                <h2 id="fixes-heading">Checks and next steps</h2>
                <p>
                  {report.actions} to fix · {report.passed} passed
                  {report.unknown ? ` · ${report.unknown} not checked yet` : ""}
                </p>
              </div>
            </div>
            {groups.map(({ group, checks }) => (
              <div key={group}>
                <div className="group-title">
                  <h3>{GROUPS[group].label}</h3>
                  <small>{GROUPS[group].summary}</small>
                </div>
                <div className="stagger">
                  {checks.map((check) => (
                    <CheckRow check={check} data={data} busy={busy} key={check.id} />
                  ))}
                </div>
              </div>
            ))}
            {!issues.length && (
              <div className="empty">
                <Icon name="check" size={24} />
                <h3>Everything checks out</h3>
                <p>Keep facts current as the product changes.</p>
              </div>
            )}
            {passed.length > 0 && (
              <details className="passed disclosure">
                <summary>
                  <Icon name="chevron" size={14} />
                  Passed checks ({passed.length})
                </summary>
                <div className="disclosure-body">
                  {passed.map((check) => (
                    <CheckRow check={check} data={data} busy={busy} key={check.id} />
                  ))}
                </div>
              </details>
            )}
          </section>

          <section className="card" id="specs" aria-labelledby="specs-heading" style={{ scrollMarginTop: 16 }}>
            <div className="card-heading">
              <div>
                <h2 id="specs-heading">Specifications</h2>
                <p>
                  {specs.rules.length} key facts for {data.profile.label.toLowerCase()}. Add only values you
                  have verified; leave the rest empty.
                </p>
              </div>
              <Badge tone={specs.score === 100 ? "success" : "neutral"}>
                {specs.facts.length} / {specs.rules.length} found
              </Badge>
            </div>
            {!!specs.conflicts.length && (
              <div style={{ padding: "14px 20px 0" }}>
                <Notice tone="error">
                  Conflicting values for{" "}
                  {specs.conflicts.map((key) => specs.rules.find((r) => r.key === key)?.label).join(", ")}.
                  Correct them in Shopify, then scan again.
                </Notice>
              </div>
            )}
            <Form
              method="post"
              action={`${pathname}${search}#draft`}
              aria-busy={activeIntent === "draft"}
              className="facts-form"
              key={`${product.updatedAt}-${draft?.id ?? "none"}-${draft?.status ?? "none"}`}
            >
              <input type="hidden" name="intent" value="draft" />
              {specs.rules.map((rule) => {
                const fact = specs.facts.find((f) => f.key === rule.key);
                return (
                  <label className="field" key={rule.key}>
                    <span className="field-heading">
                      {rule.label}
                      <Badge tone={fact ? "success" : "warning"}>{fact ? "Found" : "Missing"}</Badge>
                    </span>
                    <input
                      name={rule.key}
                      aria-label={rule.label}
                      disabled={busy}
                      defaultValue={
                        fact?.value ??
                        (pending ? draft?.facts.find((f) => f.key === rule.key)?.value : "") ??
                        ""
                      }
                      maxLength={500}
                      readOnly={!!fact}
                      placeholder={fact ? "" : "Add a verified value"}
                    />
                    <small>{fact ? fact.source : rule.hint}</small>
                  </label>
                );
              })}
              <div className="form-foot">
                <label className="checkbox">
                  <input type="checkbox" name="confirmed" value="yes" required />
                  <span>The values I add are accurate for this product.</span>
                </label>
                <button
                  className="button primary"
                  disabled={busy || data.row.deleted || !!specs.conflicts.length}
                  aria-busy={activeIntent === "draft"}
                >
                  {activeIntent === "draft" && <Spinner />}
                  {activeIntent === "draft"
                    ? "Creating draft..."
                    : pending
                      ? "Replace draft with these facts"
                      : "Create description draft"}
                </button>
              </div>
            </Form>
          </section>

          <section className="card" aria-labelledby="answers-heading">
            <div className="card-heading">
              <div>
                <h2 id="answers-heading">Buyer questions</h2>
                <p>What an assistant could answer from your verified facts. Nothing is guessed.</p>
              </div>
            </div>
            <ul className="answers">
              {report.answers.map((answer) => (
                <li key={answer.key}>
                  <strong>{answer.question}</strong>
                  <Badge
                    tone={
                      answer.status === "description"
                        ? "success"
                        : answer.status === "stored"
                          ? "info"
                          : answer.status === "conflict"
                            ? "critical"
                            : "warning"
                    }
                  >
                    {answer.status === "description"
                      ? "In description"
                      : answer.status === "stored"
                        ? "Stored fact only"
                        : answer.status === "conflict"
                          ? "Conflicting values"
                          : "Missing"}
                  </Badge>
                  <p className={answer.value ? "answer-value" : undefined}>
                    {answer.value ??
                      (answer.status === "conflict"
                        ? "Correct the conflict before this can be answered."
                        : "No answer is generated without a verified value.")}
                  </p>
                  {answer.status === "stored" && (
                    <p>
                      {answer.source}. Your theme may not show this field, so add it to the description to be
                      sure buyers and crawlers can read it.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {draft && !pending && (
            <details className="old-draft disclosure">
              <summary>
                <Icon name="chevron" size={14} />
                View {draft.status.toLowerCase().replace(/_/g, " ")} draft
              </summary>
              <div className="disclosure-body">
                <DraftReview data={data} busy={busy} pending={false} />
              </div>
            </details>
          )}
        </div>

        <aside className="stack">
          <LivePanel data={data} busy={busy} />
          <section className="card">
            <div className="card-heading">
              <div>
                <h2>Current description</h2>
                <p>{product.descriptionText ? `${product.descriptionText.split(/\s+/).length} words` : "Empty"}</p>
              </div>
            </div>
            <div className="card-body">
              <div className="description-text scroll-text">
                {product.descriptionText || "This product has no description yet."}
              </div>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
