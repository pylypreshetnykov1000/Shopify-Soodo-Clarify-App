import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRevalidator } from "react-router";
import { useEffect, useRef } from "react";
import { context } from "../services/context.server";
import { ensureStore } from "../services/catalog.server";
import { seedDemo } from "../services/demo.server";
import { visibilityEngine } from "../services/gemini.server";
import { continueTest, startTest, visibilitySummary } from "../services/visibility.server";
import { QUESTIONS_PER_TEST } from "../core/visibility";
import { APPEARANCE, visibilityBand } from "../ui/visibility";
import { AppLink, Badge, Empty, formatDate, Icon, Notice, Panel, Spinner } from "../ui/common";
import { CountUp } from "../ui/motion";
import { HelpButton } from "../ui/help";
import { useVisibilityTest } from "../ui/jobs";

export async function loader({ request }: LoaderFunctionArgs) {
  const ctx = await context(request);
  if (ctx.demo) await seedDemo();
  else await ensureStore(ctx.shop);
  return { visibility: await visibilitySummary(ctx.shop, visibilityEngine() !== null) };
}

/** Starts a test or asks its next few questions; the client continues until done. */
export async function action({ request }: ActionFunctionArgs) {
  const ctx = await context(request);
  const form = await request.formData();
  const engine = visibilityEngine();
  if (!engine)
    return { ok: false, done: true, answered: 0, total: 0, message: "AI visibility tests are not set up yet." };
  try {
    if (form.get("intent") === "start") await startTest(ctx.shop, engine);
    const result = await continueTest(ctx.shop, engine);
    return {
      ok: true,
      done: result.done,
      answered: result.answered,
      total: result.total,
      message: result.done
        ? `Test finished: ${engine.assistant} answered ${result.answered} question${result.answered === 1 ? "" : "s"}.`
        : `${result.answered} of ${result.total} questions answered.`,
    };
  } catch (error) {
    return {
      ok: false,
      done: true,
      answered: 0,
      total: 0,
      message: error instanceof Error ? error.message : "The test could not run. Please retry.",
    };
  }
}

export default function Visibility() {
  const { visibility: v } = useLoaderData<typeof loader>();
  const test = useVisibilityTest();
  const revalidator = useRevalidator();
  // Each finished batch refreshes the results underneath.
  const seen = useRef(test.last);
  useEffect(() => {
    if (test.last && test.last !== seen.current) {
      seen.current = test.last;
      revalidator.revalidate();
    }
  }, [test.last, revalidator]);

  const latest = v.latest;
  const progress = test.last ?? (v.running ? { answered: v.running.answered, total: v.running.total } : null);
  const runLabel = v.running ? "Continue test" : latest ? "Run test again" : "Run first test";
  const runButton = (primary: boolean) => (
    <button
      type="button"
      className={`button${primary ? " primary" : ""}`}
      onClick={test.start}
      disabled={test.running || !v.configured}
      aria-busy={test.running}
    >
      {test.running ? <Spinner /> : <Icon name="refresh" size={15} />}
      {test.running ? "Testing..." : runLabel}
    </button>
  );
  const band = latest ? visibilityBand(latest.score) : null;
  const previous = v.history.length > 1 ? v.history[v.history.length - 2] : null;
  const change = latest && previous ? latest.score - previous.score : 0;
  const topBrand = latest?.competitors[0];

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>AI visibility</h1>
          <p>How often AI assistants recommend your store when shoppers ask for products like yours</p>
        </div>
        <div className="page-actions">
          <HelpButton topic="visibility" />
          {latest && runButton(false)}
        </div>
      </div>

      {!v.configured && (
        <Notice tone="info">
          AI visibility tests are not set up on this server yet. Add a Gemini API key (GEMINI_API_KEY) to turn them on.
        </Notice>
      )}
      {test.running && (
        <div className="scan-panel" role="status">
          <div className="scan-panel-text">
            <span>{test.stopping ? "Pausing after these questions..." : "Asking Gemini your shoppers' questions"}</span>
            <div
              className={`meter${progress?.total ? "" : " indeterminate"}`}
              style={{ ["--progress" as string]: progress?.total ? progress.answered / progress.total : 0 }}
            >
              <span />
            </div>
            <small>
              {progress?.total
                ? `${progress.answered} of ${progress.total} questions answered`
                : "Writing buyer questions from your catalog"}
            </small>
          </div>
          <button type="button" className="button compact quiet" onClick={test.stop} disabled={test.stopping}>
            <Icon name="pause" size={14} /> Pause
          </button>
        </div>
      )}
      <Notice result={test.result} />
      {!test.running && !test.result && v.failed && (
        <Notice tone="error">
          The last test stopped on {formatDate(v.failed.createdAt)}: {v.failed.error ?? "the assistant could not answer."}
        </Notice>
      )}
      {!test.running && v.running && (
        <Notice tone="info">
          A test is paused at {v.running.answered} of {v.running.total} questions. Continue it to see the results.
        </Notice>
      )}

      {!latest ? (
        <section className="panel visibility-intro" aria-labelledby="intro-title">
          <div className="visibility-intro-body">
            <h2 id="intro-title">See what Gemini tells your shoppers</h2>
            <p>
              Soodo writes {QUESTIONS_PER_TEST} questions shoppers ask about products like yours, such as “best rain jacket under $200”,
              and asks Gemini each one with Google Search turned on. You’ll see how often it recommends your store, which
              brands it suggests instead, and which websites it trusts.
            </p>
            <ul className="intro-points">
              <li>Takes about a minute</li>
              <li>Changes nothing in your store</li>
              <li>Questions never name your store, so the answers are fair</li>
            </ul>
            <div>{runButton(true)}</div>
          </div>
        </section>
      ) : (
        <>
          <section className="summary-card visibility-summary" aria-labelledby="visibility-title">
            <div className="summary-score">
              <div className="summary-head">
                <h2 id="visibility-title">AI visibility score</h2>
                <span className={`badge ${band!.badge}`}>{band!.label}</span>
              </div>
              <p className="summary-number">
                <CountUp value={latest.score} />
                <small>/100</small>
              </p>
              <div
                className="summary-meter"
                role="img"
                aria-label={`Score ${latest.score} out of 100`}
              >
                <span className={band!.tone} style={{ width: `${latest.score}%` }} />
              </div>
              <p className="summary-text">
                {latest.assistant} recommended or cited your store in {latest.recommended + latest.cited} of{" "}
                {latest.answered} shopper questions.
                {change !== 0 && (
                  <>
                    {" "}
                    <span className={`delta ${change > 0 ? "up" : "down"}`}>
                      {change > 0 ? "Up" : "Down"} {Math.abs(change)} points
                    </span>{" "}
                    since the last test.
                  </>
                )}
              </p>
            </div>
            <div className="summary-stat">
              <span className="stat-label">Recommended by name</span>
              <strong className="summary-value">
                {latest.recommended}
                <small> of {latest.answered}</small>
              </strong>
              <span className="stat-note">Your store or a product was named</span>
            </div>
            <div className="summary-stat">
              <span className="stat-label">Recommended most instead</span>
              <strong className="summary-value brand-value">{topBrand ? topBrand.name : "None"}</strong>
              <span className="stat-note">
                {topBrand ? `In ${topBrand.count} of ${latest.answered} answers` : "No other brand stood out"}
              </span>
            </div>
          </section>

          <div className="overview-columns visibility-columns">
            <Panel
              id="questions"
              title="Shopper questions"
              description={`Asked ${formatDate(latest.createdAt)}. Open a question to read the full answer.`}
              className="visibility-questions"
            >
              <ul className="question-list">
                {latest.questions.map((q) => (
                  <li key={q.id}>
                    <details>
                      <summary>
                        <div className="row-main">
                          <strong>{q.prompt}</strong>
                          <small>
                            {q.status === "FAILED"
                              ? (q.error ?? "No answer")
                              : q.appearance === "recommended" && q.products.length
                                ? `Named ${q.products.join(", ")}`
                                : q.brands.length
                                  ? `Suggested ${q.brands.slice(0, 3).join(", ")}`
                                  : q.topic}
                          </small>
                        </div>
                        {q.appearance ? (
                          <Badge tone={APPEARANCE[q.appearance].tone}>{APPEARANCE[q.appearance].label}</Badge>
                        ) : (
                          <Badge tone="warning">No answer</Badge>
                        )}
                        <span className="question-chevron" aria-hidden="true">
                          <Icon name="chevron" size={14} />
                        </span>
                      </summary>
                      <div className="question-answer">
                        {q.answer ? <AnswerText text={q.answer} /> : <p>{q.error}</p>}
                        {q.sources.length > 0 && (
                          <p className="question-sources">Sources: {q.sources.join(", ")}</p>
                        )}
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
              <p className="sales-note">
                AI answers vary from one ask to the next. Compare tests over weeks rather than single questions.
              </p>
            </Panel>
            <div className="overview-column">
              <Panel
                id="competitors"
                title="Recommended instead of you"
                description="Brands and stores Gemini suggested, by how many answers named them."
              >
                {latest.competitors.length ? (
                  <RankBars
                    label="Brands recommended"
                    items={latest.competitors.map((c) => ({
                      key: c.name,
                      name: c.name,
                      count: c.count,
                      note: c.youSell ? "You sell this brand" : null,
                    }))}
                    total={latest.answered}
                  />
                ) : (
                  <Empty title="No other brands stood out" />
                )}
              </Panel>
              <Panel
                id="sources"
                title="Websites Gemini relies on"
                description="Reviews and stores it read or linked to. Being on these sites helps you get recommended."
              >
                {latest.sources.length ? (
                  <RankBars
                    label="Websites cited"
                    items={latest.sources.map((s) => ({
                      key: s.host,
                      name: s.host,
                      count: s.count,
                      note: s.yours ? "Your site" : null,
                    }))}
                    total={latest.answered}
                  />
                ) : (
                  <Empty title="No websites were cited" />
                )}
              </Panel>
              <Panel id="improve" title="How to show up more">
                <ul className="panel-rows improve-list">
                  <li>
                    <div className="row-main">
                      <strong>Answer the questions shoppers ask</strong>
                      <small>Specs, sizes, materials and use cases written on the product page.</small>
                    </div>
                    <AppLink to="/app/fixes" className="button compact">
                      Fix plan
                    </AppLink>
                  </li>
                  <li>
                    <div className="row-main">
                      <strong>Get listed where assistants look</strong>
                      <small>Reviews and buying guides on the websites above carry weight.</small>
                    </div>
                  </li>
                </ul>
              </Panel>
            </div>
          </div>
        </>
      )}
    </>
  );
}

/** Answer text with **bold** product names, as the assistant wrote them. */
function AnswerText({ text }: { text: string }) {
  return (
    <div className="answer-text">
      {text
        .split(/\n{2,}/)
        .filter((p) => p.trim())
        .map((paragraph, i) => (
          <p key={i}>
            {paragraph
              .replace(/^#+\s*/gm, "")
              .replace(/^\s*[*-]\s+/gm, "• ")
              .split(/\*\*([^*]+)\*\*/g)
              .map((part, j) => (j % 2 ? <strong key={j}>{part}</strong> : part))}
          </p>
        ))}
    </div>
  );
}

function RankBars({
  label,
  items,
  total,
}: {
  label: string;
  items: { key: string; name: string; count: number; note: string | null }[];
  total: number;
}) {
  return (
    <ul className="rank-bars" aria-label={label}>
      {items.map((item) => (
        <li key={item.key}>
          <div className="rank-name">
            <strong>{item.name}</strong>
            {item.note && <small>{item.note}</small>}
          </div>
          <span className="rank-track" aria-hidden="true">
            <span style={{ width: `${(item.count / Math.max(1, total)) * 100}%` }} />
          </span>
          <span className="rank-count">
            {item.count} of {total}
          </span>
        </li>
      ))}
    </ul>
  );
}
