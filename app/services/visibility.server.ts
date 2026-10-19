import db from "../db.server";
import type { ProductData } from "../core/catalog";
import type { StoreProfile } from "../core/geo";
import {
  catalogBrief,
  findStore,
  parseAnswer,
  QUESTIONS_PER_TEST,
  storeIdentity,
  summarizeTest,
  type Appearance,
} from "../core/visibility";
import { EngineError, type VisibilityEngine } from "./gemini.server";

/** Questions asked per request; each answer takes several seconds. */
const BATCH = 3;
const LEASE_MS = 150_000;
/** A test older than this is due again. */
const STALE_DAYS = 7;
const MAX_ANSWER = 8000;

const parse = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

async function storeContext(shop: string) {
  const [store, rows] = await Promise.all([
    db.store.findUnique({ where: { shop } }),
    db.catalogProduct.findMany({ where: { shop, deleted: false }, select: { payload: true } }),
  ]);
  const products = rows.map((r) => JSON.parse(r.payload) as ProductData);
  const profile = parse<StoreProfile | null>(store?.profile, null);
  const currency = parse<{ currency?: string | null } | null>(store?.orderStats, null)?.currency ?? null;
  return { products, identity: storeIdentity(shop, profile, products), currency };
}

const failure = (error: unknown) =>
  error instanceof EngineError ? error.message : "The assistant could not answer. Try the test again later.";

/**
 * Starts a visibility test: writes buyer questions from the catalog. A test
 * that is already running is continued instead of starting a second one.
 */
export async function startTest(shop: string, engine: VisibilityEngine) {
  const running = await db.visibilityTest.findFirst({ where: { shop, status: "RUNNING" } });
  if (running) return running;
  const { products, currency } = await storeContext(shop);
  const brief = catalogBrief(products, currency);
  if (!brief.topics.length) throw new Error("Import your active products first, then run the test.");
  let questions;
  try {
    questions = await engine.questions(brief, QUESTIONS_PER_TEST);
  } catch (error) {
    throw new Error(failure(error));
  }
  return db.visibilityTest.create({
    data: {
      shop,
      assistant: engine.assistant,
      model: engine.model,
      total: questions.length,
      answers: {
        create: questions.map((q, position) => ({ position, prompt: q.prompt, topic: q.topic })),
      },
    },
  });
}

/**
 * Asks the next few questions of the running test. Call repeatedly until it
 * reports done; a lease stops two tabs from asking the same questions.
 */
export async function continueTest(shop: string, engine: VisibilityEngine, now = new Date()) {
  const test = await db.visibilityTest.findFirst({ where: { shop, status: "RUNNING" }, orderBy: { createdAt: "desc" } });
  if (!test) return { done: true, answered: 0, total: 0, score: null as number | null };
  const claimed = await db.visibilityTest.updateMany({
    where: { id: test.id, status: "RUNNING", OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
    data: { leaseUntil: new Date(now.getTime() + LEASE_MS) },
  });
  if (!claimed.count) throw new Error("The visibility test is already running. Try again in a moment.");

  const { identity } = await storeContext(shop);
  const pending = await db.visibilityAnswer.findMany({
    where: { testId: test.id, status: "PENDING" },
    orderBy: { position: "asc" },
    take: BATCH,
  });
  const results = await Promise.allSettled(pending.map((q) => engine.ask(q.prompt)));
  let lastError: string | null = null;
  for (const [i, result] of results.entries()) {
    const question = pending[i];
    if (result.status === "rejected") {
      lastError = failure(result.reason);
      await db.visibilityAnswer.update({
        where: { id: question.id },
        data: { status: "FAILED", error: lastError },
      });
      continue;
    }
    const answer = parseAnswer(result.value.raw, result.value.citedHosts);
    const found = findStore(answer, identity);
    await db.visibilityAnswer.update({
      where: { id: question.id },
      data: {
        status: "DONE",
        appearance: found.appearance,
        products: JSON.stringify(found.products),
        brands: JSON.stringify(answer.brands),
        sources: JSON.stringify(answer.sources),
        answer: answer.text.slice(0, MAX_ANSWER),
      },
    });
  }

  const counts = await db.visibilityAnswer.groupBy({
    by: ["status"],
    where: { testId: test.id },
    _count: { _all: true },
  });
  const count = (status: string) => counts.find((c) => c.status === status)?._count._all ?? 0;
  const answered = count("DONE");
  // Every question in this batch failed the same way (a bad key, a usage
  // limit): stop rather than burn through the rest.
  const allFailed = pending.length > 0 && results.every((r) => r.status === "rejected");
  const done = allFailed || count("PENDING") === 0;
  let score: number | null = null;
  if (done) {
    const answers = await db.visibilityAnswer.findMany({ where: { testId: test.id, status: "DONE" } });
    score = summarizeTest(
      answers.map((a) => ({
        prompt: a.prompt,
        appearance: a.appearance as Appearance,
        brands: parse<string[]>(a.brands, []),
        sources: parse<string[]>(a.sources, []),
      })),
      identity,
    ).score;
    const failed = allFailed || answered === 0;
    await db.visibilityTest.update({
      where: { id: test.id },
      data: {
        status: failed ? "FAILED" : "DONE",
        score: failed ? null : score,
        error: failed ? lastError : null,
        finishedAt: now,
        leaseUntil: null,
      },
    });
    if (failed) throw new Error(lastError ?? "The assistant could not answer. Try the test again later.");
  } else {
    await db.visibilityTest.update({ where: { id: test.id }, data: { leaseUntil: null } });
  }
  return { done, answered, total: test.total, score };
}

/** The latest finished test in detail, the score history and any test in progress. */
export async function visibilitySummary(shop: string, configured: boolean, now = new Date()) {
  const [latest, running, failed, history] = await Promise.all([
    db.visibilityTest.findFirst({
      where: { shop, status: "DONE" },
      orderBy: { createdAt: "desc" },
      include: { answers: { orderBy: { position: "asc" } } },
    }),
    db.visibilityTest.findFirst({
      where: { shop, status: "RUNNING" },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { answers: { where: { status: { not: "PENDING" } } } } } },
    }),
    db.visibilityTest.findFirst({ where: { shop, status: "FAILED" }, orderBy: { createdAt: "desc" } }),
    db.visibilityTest.findMany({
      where: { shop, status: "DONE" },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { createdAt: true, score: true },
    }),
  ]);
  const { identity } = latest ? await storeContext(shop) : { identity: null };
  const questions =
    latest?.answers.map((a) => ({
      id: a.id,
      prompt: a.prompt,
      topic: a.topic,
      status: a.status,
      appearance: a.appearance as Appearance | null,
      products: parse<string[]>(a.products, []),
      brands: parse<string[]>(a.brands, []),
      sources: parse<string[]>(a.sources, []),
      answer: a.answer,
      error: a.error,
    })) ?? [];
  const summary = latest && identity ? summarizeTest(questions, identity) : null;
  return {
    configured,
    running: running ? { answered: running._count.answers, total: running.total } : null,
    // Shown only when it is newer than the last good result.
    failed:
      failed && (!latest || failed.createdAt > latest.createdAt)
        ? { error: failed.error, createdAt: failed.createdAt.toISOString() }
        : null,
    latest:
      latest && summary
        ? {
            createdAt: latest.createdAt.toISOString(),
            assistant: latest.assistant,
            ...summary,
            score: latest.score ?? summary.score ?? 0,
            total: latest.total,
            questions,
          }
        : null,
    history: history.reverse().map((h) => ({ date: h.createdAt.toISOString(), score: h.score ?? 0 })),
    due: !latest || now.getTime() - latest.createdAt.getTime() > STALE_DAYS * 86_400_000,
  };
}
export type VisibilitySummary = Awaited<ReturnType<typeof visibilitySummary>>;

/** The latest score for the Overview, without the detail. */
export async function visibilityHeadline(shop: string) {
  const latest = await db.visibilityTest.findFirst({
    where: { shop, status: "DONE" },
    orderBy: { createdAt: "desc" },
    select: {
      score: true,
      createdAt: true,
      assistant: true,
      answers: { where: { status: "DONE" }, select: { appearance: true } },
    },
  });
  if (!latest) return null;
  return {
    score: latest.score ?? 0,
    assistant: latest.assistant,
    createdAt: latest.createdAt.toISOString(),
    answered: latest.answers.length,
    appeared: latest.answers.filter((a) => a.appearance !== "absent").length,
  };
}
