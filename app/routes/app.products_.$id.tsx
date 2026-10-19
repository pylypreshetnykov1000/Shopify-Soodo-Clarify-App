import { useEffect, useRef, useState, type ReactNode } from "react";
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
  createListingDraft,
  publishDraft,
  rejectDraft,
} from "../services/catalog.server";
import { LISTING_LIMITS, type Listing } from "../core/listing";
import { productWorkspace } from "../services/geo.server";
import { checkLivePage } from "../services/live.server";
import { recordSnapshot } from "../services/snapshots.server";
import {
  AppLink,
  Badge,
  Dial,
  ExternalLink,
  formatDate,
  Icon,
  Mark,
  Meter,
  Notice,
  PRIORITY_LABEL,
  Spinner,
  Thumb,
} from "../ui/common";
import { Collapsible, Steps, TabPanel, Tabs } from "../ui/motion";
import { HelpButton } from "../ui/help";

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
      await createDraft(ctx.shop, id, ctx.adapter, input, { faq: form.get("faq") === "yes" });
      return {
        ok: true,
        focusDraft: true,
        message:
          "Draft created. Review the sources and proposed description before publishing.",
      };
    }
    if (intent === "listing-draft") {
      await createListingDraft(ctx.shop, id, ctx.adapter, {
        title: String(form.get("seoTitle") ?? ""),
        description: String(form.get("seoDescription") ?? ""),
      });
      return {
        ok: true,
        message: "Listing draft created. Check the preview, then approve it to publish.",
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
      const message = await publishDraft(ctx.shop, suggestionId, ctx.adapter);
      await recordSnapshot(ctx.shop);
      return { ok: true, message };
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
type TabId = "checks" | "specs" | "listing" | "live";

function LiveForm({ busy, label = "Check live page", compact, primary }: { busy: boolean; label?: string; compact?: boolean; primary?: boolean }) {
  const navigation = useNavigation();
  const running = busy && navigation.formData?.get("intent") === "live";
  return (
    <Form method="post">
      <input type="hidden" name="intent" value="live" />
      <button
        className={`button${compact ? " compact" : ""}${primary ? " primary" : ""}`}
        disabled={busy}
        aria-busy={running}
      >
        {running ? <Spinner /> : <Icon name="globe" size={compact ? 13 : 15} />}
        {running ? "Checking..." : label}
      </button>
    </Form>
  );
}

const markKind = (check: GeoCheck) =>
  check.status === "pass" ? "pass" : check.status === "unknown" ? "unknown" : check.priority;
const markLabel = (check: GeoCheck) =>
  check.status === "pass"
    ? "Passed"
    : check.status === "unknown"
      ? "Not checked"
      : `${PRIORITY_LABEL[check.priority]} priority`;

function CheckItem({
  check,
  open,
  onToggle,
  cta,
}: {
  check: GeoCheck;
  open: boolean;
  onToggle: () => void;
  cta: ReactNode;
}) {
  if (check.status === "pass")
    return (
      <div className="check-item">
        <div className="check-static">
          <Mark kind="pass" label="Passed" />
          <span className="check-title">
            <strong>{check.label}</strong>
            <small>{check.evidence}</small>
          </span>
          <span className="check-meta">Passed</span>
        </div>
      </div>
    );
  return (
    <div className="check-item">
      <button
        type="button"
        className="check-trigger"
        aria-expanded={open}
        aria-controls={`check-${check.id}`}
        onClick={onToggle}
      >
        <Mark kind={markKind(check)} label={markLabel(check)} />
        <span className="check-title">
          <strong>{check.label}</strong>
          <small>{check.evidence}</small>
        </span>
        <span className="check-meta">
          {check.status === "unknown" ? "Not checked" : `${PRIORITY_LABEL[check.priority]} priority`}
        </span>
        <Icon name="chevron" size={15} />
      </button>
      <Collapsible open={open} id={`check-${check.id}`}>
        <div className="check-detail">
          <p>{check.action}</p>
          {cta}
        </div>
      </Collapsible>
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

function ChecksPanel({ data, busy, goTo }: { data: Data; busy: boolean; goTo: (tab: TabId) => void }) {
  const { report } = data;
  const groupOrder = Object.keys(GROUPS) as CheckGroup[];
  const groups = groupOrder
    .map((group) => ({ group, checks: report.issues.filter((c) => c.group === group) }))
    .filter((g) => g.checks.length);
  // Open the first actionable fix in on-screen order, not a "not checked" row.
  const firstAction = groups.flatMap((g) => g.checks).find((c) => c.status === "action");
  const [openId, setOpenId] = useState<string | null>(firstAction?.id ?? null);
  const [showPassed, setShowPassed] = useState(false);
  const passed = report.checks.filter((c) => c.status === "pass");
  const cta = (check: GeoCheck) =>
    check.id === "search-preview" ? (
      <button type="button" className="button compact primary" onClick={() => goTo("listing")}>
        Improve listing
      </button>
    ) : check.destination === "facts" ? (
      <button type="button" className="button compact primary" onClick={() => goTo("specs")}>
        Add specifications
      </button>
    ) : check.destination === "live" ? (
      data.report.publicUrl ? <LiveForm busy={busy} label="Run live check" compact /> : null
    ) : check.destination === "scan" ? (
      <AppLink to="/app" className="button compact">
        Go to scan
      </AppLink>
    ) : check.destination === "shopify" && data.adminUrl ? (
      <ExternalLink href={data.adminUrl} className="button compact">
        Edit in Shopify
      </ExternalLink>
    ) : check.destination === "theme" ? (
      <small>Online Store › Themes</small>
    ) : null;
  const areas = groupOrder.map((group) => {
    const checks = report.checks.filter((c) => c.group === group && c.status !== "unknown");
    const ok = checks.filter((c) => c.status === "pass").length;
    return { group, ok, total: checks.length };
  });
  const live = data.live;
  return (
    <div className="columns">
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
            {checks.map((check) => (
              <CheckItem
                key={check.id}
                check={check}
                open={openId === check.id}
                onToggle={() => setOpenId(openId === check.id ? null : check.id)}
                cta={cta(check)}
              />
            ))}
          </div>
        ))}
        {!report.issues.length && (
          <div className="empty">
            <Icon name="check" size={24} />
            <h3>Everything checks out</h3>
            <p>Keep facts current as the product changes.</p>
          </div>
        )}
        {passed.length > 0 && (
          <>
            <button
              type="button"
              className="toggle passed-toggle"
              aria-expanded={showPassed}
              aria-controls="passed-checks"
              onClick={() => setShowPassed(!showPassed)}
            >
              <Icon name="chevron" size={14} />
              Passed checks ({passed.length})
            </button>
            <Collapsible open={showPassed} id="passed-checks">
              <div className="passed-list">
                {passed.map((check) => (
                  <CheckItem key={check.id} check={check} open={false} onToggle={() => {}} cta={null} />
                ))}
              </div>
            </Collapsible>
          </>
        )}
      </section>
      <aside className="stack">
        <section className="card" aria-labelledby="areas-heading">
          <div className="card-heading">
            <div>
              <h2 id="areas-heading">By area</h2>
              <p>Checks passed, out of those that could run.</p>
            </div>
          </div>
          <ul className="areas">
            {areas.map((area) => (
              <li key={area.group}>
                <span>{GROUPS[area.group].label}</span>
                <Meter
                  value={area.total ? Math.round((area.ok / area.total) * 100) : 0}
                  label={`${GROUPS[area.group].label} checks passed`}
                />
                <span>
                  {area.ok}/{area.total}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="card" aria-labelledby="live-summary-heading">
          <div className="card-heading">
            <div>
              <h2 id="live-summary-heading">Live page</h2>
              <p>{live ? `Checked ${formatDate(live.checkedAt)}` : "Not checked yet"}</p>
            </div>
          </div>
          <div className="card-body">
            {!data.report.publicUrl ? (
              <p style={{ fontSize: 12.5 }}>No public Online Store page to check.</p>
            ) : live ? (
              <>
                <div className="status-line">
                  <Mark kind={live.error || live.passwordProtected || live.httpStatus !== 200 ? "high" : "pass"} />
                  {live.error
                    ? "Page unreachable"
                    : live.passwordProtected
                      ? "Password protected"
                      : live.httpStatus === 200
                        ? "Page reachable"
                        : `HTTP ${live.httpStatus}`}
                </div>
                <div className="status-line">
                  <Mark kind={live.crawlers.some((c) => c.purpose !== "training" && !c.allowed) ? "high" : "pass"} />
                  {live.crawlers.some((c) => c.purpose !== "training" && !c.allowed)
                    ? "Some crawlers blocked"
                    : "Search and AI crawlers allowed"}
                </div>
                <div className="status-line">
                  <Mark kind={live.structured?.count === 1 && live.priceMatches !== false ? "pass" : "medium"} />
                  {live.structured ? `${live.structured.count === 1 ? "Product markup found" : `${live.structured.count} product blocks`}` : "No product markup"}
                </div>
                <button type="button" className="text-link" style={{ marginTop: 14 }} onClick={() => goTo("live")}>
                  Live page details <Icon name="arrow" size={13} />
                </button>
              </>
            ) : (
              <>
                <p style={{ fontSize: 12.5, marginBottom: 12 }}>
                  See this page the way search engines and AI assistants do.
                </p>
                <LiveForm busy={busy} compact />
              </>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}

function SpecsPanel({ data, busy }: { data: Data; busy: boolean }) {
  const navigation = useNavigation();
  const activeIntent = busy ? navigation.formData?.get("intent") : null;
  const { pathname, search } = useLocation();
  const { specs, draft, report, product } = data;
  const pending = draft?.status === "DRAFT";
  const missing = specs.rules.length - specs.facts.length;
  return (
    <div className="columns">
      <div>
        <section className="card" id="specs" aria-labelledby="specs-heading">
          <div className="flow-head">
            <Steps
              label="Description update"
              steps={[
                {
                  title: "Add verified facts",
                  detail: missing ? `${missing} missing` : "Complete",
                  state: pending ? "done" : "current",
                },
                { title: "Review draft", detail: pending ? "Waiting for you" : "Before publishing", state: pending ? "current" : "todo" },
                { title: "Publish", detail: "Only after approval", state: "todo" },
              ]}
            />
          </div>
          <div className="card-heading">
            <div>
              <h2 id="specs-heading">Specifications</h2>
              <p>
                {specs.rules.length} key facts for {data.profile.label.toLowerCase()}. Add only values you have
                verified; leave the rest empty.
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
                      fact?.value ?? (pending ? draft?.facts.find((f) => f.key === rule.key)?.value : "") ?? ""
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
              <div className="form-options">
                <label className="checkbox">
                  <input type="checkbox" name="faq" value="yes" defaultChecked />
                  <span>Also add a short buyer Q&amp;A built from these facts.</span>
                </label>
                <label className="checkbox">
                  <input type="checkbox" name="confirmed" value="yes" required />
                  <span>The values I add are accurate for this product.</span>
                </label>
              </div>
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
          <ul className="answers stagger">
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
                    {answer.source}. Your theme may not show this field, so add it to the description to be sure
                    buyers and crawlers can read it.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
      <aside className="stack">
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
  );
}

function LivePanel({ data, busy }: { data: Data; busy: boolean }) {
  const live = data.live;
  const [showTraining, setShowTraining] = useState(false);
  const yes = (ok: boolean | null, good: string, bad: string, unknown = "—") =>
    ok === null ? <span>{unknown}</span> : <span className={ok ? "ok" : "bad"}>{ok ? good : bad}</span>;
  const search = live?.crawlers.filter((c) => c.purpose !== "training") ?? [];
  const training = live?.crawlers.filter((c) => c.purpose === "training") ?? [];
  if (!data.report.publicUrl)
    return (
      <section className="card empty">
        <Icon name="globe" size={26} />
        <h2>No public page</h2>
        <p>Publish this product to the Online Store sales channel, scan, and check again.</p>
      </section>
    );
  if (!live)
    return (
      <section className="card empty">
        <Icon name="globe" size={26} />
        <h2>See this page the way crawlers do</h2>
        <p>
          Loads the public product page and robots.txt, then compares the page’s product markup with Shopify.
          Read-only.
        </p>
        <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
          <LiveForm busy={busy} primary />
        </div>
      </section>
    );
  return (
    <div className="columns">
      <section className="card" aria-labelledby="live-heading">
        <div className="card-heading">
          <div>
            <h2 id="live-heading">Live page</h2>
            <p>Checked {formatDate(live.checkedAt)}</p>
          </div>
          <div className="page-actions">
            {!data.demo && (
              <ExternalLink href={live.url} className="button compact">
                View page
              </ExternalLink>
            )}
            <LiveForm busy={busy} label="Check again" compact />
          </div>
        </div>
        <div className="card-body">
          <dl className="live-list">
            <div>
              <dt>Page</dt>
              <dd>
                {live.error ? (
                  <span className="bad">{live.error}</span>
                ) : live.passwordProtected ? (
                  <span className="bad">Password protected</span>
                ) : (
                  yes(live.httpStatus === 200, "Reachable", `HTTP ${live.httpStatus}`)
                )}
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
                {live.structured ? (
                  yes(
                    live.structured.count === 1 && !live.structured.invalidBlocks,
                    "Found",
                    live.structured.count > 1 ? `${live.structured.count} blocks` : "Invalid",
                  )
                ) : live.error || live.passwordProtected ? (
                  "—"
                ) : (
                  <span className="bad">Missing</span>
                )}
              </dd>
            </div>
            <div>
              <dt>Brand in markup</dt>
              <dd>{live.structured?.brand ?? "—"}</dd>
            </div>
            <div>
              <dt>GTIN in markup</dt>
              <dd>{live.structured ? yes(live.structured.hasGtin, "Yes", "No") : "—"}</dd>
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
        </div>
      </section>
      <aside>
        <section className="card" aria-labelledby="crawlers-heading">
          <div className="card-heading">
            <div>
              <h2 id="crawlers-heading">Crawler access</h2>
              <p>{live.robotsFound ? "From robots.txt for this page." : "No robots.txt found: all allowed."}</p>
            </div>
          </div>
          <div className="card-body">
            <ul className="crawlers" aria-label="Crawler access from robots.txt" style={{ marginTop: 0 }}>
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
            <button
              type="button"
              className="toggle text-link"
              style={{ marginTop: 10, fontSize: 12.5 }}
              aria-expanded={showTraining}
              aria-controls="training-crawlers"
              onClick={() => setShowTraining(!showTraining)}
            >
              <Icon name="chevron" size={13} />
              Training crawlers ({training.filter((c) => !c.allowed).length} blocked)
            </button>
            <Collapsible open={showTraining} id="training-crawlers">
              <ul className="crawlers" aria-label="Training crawlers">
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
            </Collapsible>
          </div>
        </section>
      </aside>
    </div>
  );
}

export default function ProductWorkspace() {
  const data = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle" && navigation.formMethod?.toLowerCase() === "post";
  const { product, report, specs, draft } = data;
  const pending = draft?.status === "DRAFT";
  const [tab, setTab] = useState<TabId>("checks");
  const tabsRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<HTMLDivElement>(null);
  const focused = useRef<unknown>(null);
  const pendingId = pending ? draft?.id : null;

  // Deep links: #specs and #live open their tab; #draft keeps the draft in view.
  useEffect(() => {
    const hash = window.location.hash;
    const target: TabId | null =
      hash === "#specs" ? "specs" : hash === "#live" ? "live" : hash === "#listing" ? "listing" : null;
    if (!target) return;
    const frame = requestAnimationFrame(() => setTab(target));
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    // The action result can render before the revalidated draft does; focus
    // once both are present, and only once per result.
    if (!result?.ok || !("focusDraft" in result) || focused.current === result) return;
    const target = draftRef.current?.querySelector<HTMLElement>("#draft");
    if (!target || !pendingId) return;
    focused.current = result;
    target.focus();
  }, [result, pendingId]);
  const goTo = (next: TabId) => {
    setTab(next);
    tabsRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  const live = data.live;

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
            {/* Help follows the open tab; a pending draft is the publish step. */}
            <HelpButton
              topic={
                tab === "specs" ? (pending ? "publish" : "specs") : tab === "live" ? "live" : tab === "listing" ? "listing" : "product"
              }
            />
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

      <div ref={tabsRef} style={{ scrollMarginTop: 12 }}>
        <Tabs
          label="Product sections"
          value={tab}
          onChange={(id) => setTab(id as TabId)}
          tabs={[
            { id: "checks", label: "Checks", count: report.actions || undefined },
            { id: "specs", label: "Specifications", count: `${specs.facts.length}/${specs.rules.length}` },
            {
              id: "listing",
              label: "Search listing",
              count: data.listing.draft?.status === "DRAFT" ? "Draft" : undefined,
            },
            {
              id: "live",
              label: "Live page",
              count: live ? (live.error || live.passwordProtected || live.httpStatus !== 200 ? "!" : undefined) : undefined,
            },
          ]}
        />
      </div>
      <TabPanel id="checks" active={tab === "checks"}>
        <ChecksPanel data={data} busy={busy} goTo={goTo} />
      </TabPanel>
      <TabPanel id="specs" active={tab === "specs"}>
        <SpecsPanel data={data} busy={busy} />
        {draft && !pending && <OldDraft data={data} busy={busy} />}
      </TabPanel>
      <TabPanel id="listing" active={tab === "listing"}>
        {/* Remount after each change so the editor starts from the latest suggestion. */}
        <ListingPanel
          key={`${data.listing.draft?.id ?? "none"}-${data.listing.draft?.status ?? ""}-${data.listing.current.title}`}
          data={data}
          busy={busy}
        />
      </TabPanel>
      <TabPanel id="live" active={tab === "live"}>
        <LivePanel data={data} busy={busy} />
      </TabPanel>
    </>
  );
}

/** How a listing appears in Google results, so merchants see what they change. */
function SearchPreview({ listing, url, label }: { listing: Listing; url: string | null; label: string }) {
  const crumbs = (() => {
    if (!url) return "your-store.com › products";
    try {
      const u = new URL(url);
      return [u.hostname, ...u.pathname.split("/").filter(Boolean)].join(" › ");
    } catch {
      return url;
    }
  })();
  return (
    <figure className="serp" aria-label={label}>
      <figcaption>{label}</figcaption>
      <span className="serp-url">{crumbs}</span>
      <span className={`serp-title${listing.title.length > LISTING_LIMITS.title ? " over" : ""}`}>
        {listing.title || "Untitled"}
      </span>
      <span className="serp-desc">
        {listing.description.length > LISTING_LIMITS.idealDescription
          ? `${listing.description.slice(0, LISTING_LIMITS.idealDescription).trimEnd()}…`
          : listing.description || "No description"}
      </span>
    </figure>
  );
}

function ListingPanel({ data, busy }: { data: Data; busy: boolean }) {
  const navigation = useNavigation();
  const activeIntent = busy ? navigation.formData?.get("intent") : null;
  const { listing } = data;
  const draft = listing.draft;
  const pending = draft?.status === "DRAFT";
  const custom = !!(listing.current.title || listing.current.description);
  const shown = custom
    ? { title: listing.current.title || listing.fallback.title, description: listing.current.description || listing.fallback.description }
    : listing.fallback;
  const [title, setTitle] = useState(listing.suggested.title);
  const [description, setDescription] = useState(listing.suggested.description);

  if (pending && draft)
    return (
      <section className="card draft-card" aria-labelledby="listing-review">
        <div className="card-heading">
          <div>
            <h2 id="listing-review">Review search listing</h2>
            <p>Check how it will look on Google. Nothing changes until you approve.</p>
          </div>
          <Badge tone="info">draft</Badge>
        </div>
        {draft.stale && (
          <div style={{ padding: "16px 20px 0" }}>
            <Notice tone="error">
              The listing changed in Shopify after this draft was made. Create a fresh draft before publishing.
            </Notice>
          </div>
        )}
        <div className="draft-columns">
          <SearchPreview listing={draft.before.title || draft.before.description ? draft.before : listing.fallback} url={listing.url} label="Now" />
          <SearchPreview listing={draft.after} url={listing.url} label="Proposed" />
        </div>
        <div className="draft-actions">
          <Form method="post">
            <input type="hidden" name="intent" value="publish" />
            <input type="hidden" name="suggestionId" value={draft.id} />
            <label className="checkbox">
              <input type="checkbox" name="approved" value="yes" required />
              <span>I approve this search listing. The previous one is saved in Change history.</span>
            </label>
            <button className="button primary" disabled={busy || draft.stale || data.row.deleted} aria-busy={activeIntent === "publish"}>
              {activeIntent === "publish" && <Spinner />}
              {activeIntent === "publish" ? "Publishing..." : data.demo ? "Publish to demo catalog" : "Publish to Shopify"}
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
      </section>
    );

  return (
    <div className="columns">
      <section className="card" aria-labelledby="listing-heading">
        <div className="card-heading">
          <div>
            <h2 id="listing-heading">Search listing</h2>
            <p>The title and summary people see on Google and in AI answers before they click. We suggested one from your product data; edit it freely.</p>
          </div>
        </div>
        <Form method="post" className="listing-form">
          <input type="hidden" name="intent" value="listing-draft" />
          <label className="listing-field" htmlFor="seo-title">
            <span className="listing-label">
              Title
              <span className={`counter${title.length > LISTING_LIMITS.title ? " over" : ""}`}>
                {title.length}/{LISTING_LIMITS.title}
              </span>
            </span>
            <input
              id="seo-title"
              name="seoTitle"
              value={title}
              maxLength={LISTING_LIMITS.title + 30}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
            />
            <small>Name the product clearly. Add the brand or type if it fits.</small>
          </label>
          <label className="listing-field" htmlFor="seo-description">
            <span className="listing-label">
              Description
              <span className={`counter${description.length > LISTING_LIMITS.idealDescription ? " over" : ""}`}>
                {description.length}/{LISTING_LIMITS.idealDescription}
              </span>
            </span>
            <textarea
              id="seo-description"
              name="seoDescription"
              rows={4}
              value={description}
              maxLength={LISTING_LIMITS.description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={busy}
            />
            <small>One or two factual sentences. Google usually shows about 160 characters.</small>
          </label>
          <SearchPreview listing={{ title, description }} url={listing.url} label="Preview" />
          <div className="form-foot">
            <button
              type="button"
              className="button quiet"
              onClick={() => {
                setTitle(listing.suggested.title);
                setDescription(listing.suggested.description);
              }}
              disabled={busy}
            >
              Use suggestion
            </button>
            <button className="button primary" disabled={busy || data.row.deleted} aria-busy={activeIntent === "listing-draft"}>
              {activeIntent === "listing-draft" && <Spinner />}
              {activeIntent === "listing-draft" ? "Creating draft..." : "Create listing draft"}
            </button>
          </div>
        </Form>
      </section>
      <aside className="stack">
        <section className="card">
          <div className="card-heading">
            <div>
              <h2>On Google now</h2>
              <p>{custom ? "Your custom listing." : "No custom listing, so Google uses the product title and description."}</p>
            </div>
          </div>
          <div className="card-body">
            <SearchPreview listing={shown} url={listing.url} label="Current listing" />
          </div>
        </section>
      </aside>
    </div>
  );
}

function OldDraft({ data, busy }: { data: Data; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const draft = data.draft!;
  return (
    <div className="old-draft">
      <button
        type="button"
        className="toggle passed-toggle card"
        style={{ borderTop: "1px solid var(--line)" }}
        aria-expanded={open}
        aria-controls="old-draft"
        onClick={() => setOpen(!open)}
      >
        <Icon name="chevron" size={14} />
        View {draft.status.toLowerCase().replace(/_/g, " ")} draft
      </button>
      <Collapsible open={open} id="old-draft">
        <div style={{ paddingTop: 12 }}>
          <DraftReview data={data} busy={busy} pending={false} />
        </div>
      </Collapsible>
    </div>
  );
}
