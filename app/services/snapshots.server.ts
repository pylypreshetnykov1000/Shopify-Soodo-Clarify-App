import db from "../db.server";
import { catalogOverview } from "./geo.server";

const dayOf = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Records today's catalog readiness (one reading per UTC day; later readings
 * on the same day replace earlier ones). Called after scans, live checks and
 * published changes, so the trend reflects real work, not page views.
 */
export async function recordSnapshot(shop: string, now = new Date()) {
  // History is a side effect of real work: it must never turn a successful
  // scan or publish into an error for the merchant.
  try {
    const { summary, fixPlan } = await catalogOverview(shop);
    if (!summary.active) return null;
    const data = {
      readiness: summary.readiness,
      ready: summary.ready,
      active: summary.active,
      fixes: fixPlan.length,
    };
    return await db.readinessSnapshot.upsert({
      where: { shop_day: { shop, day: dayOf(now) } },
      create: { shop, day: dayOf(now), createdAt: now, ...data },
      update: { createdAt: now, ...data },
    });
  } catch (error) {
    console.error(`Could not record readiness for ${shop}`, error);
    return null;
  }
}

/** Daily readings for the last `days` days, oldest first. */
export async function readinessTrend(shop: string, days = 90, now = new Date()) {
  const since = dayOf(new Date(now.getTime() - (days - 1) * 86_400_000));
  const rows = await db.readinessSnapshot.findMany({
    where: { shop, day: { gte: since } },
    orderBy: { day: "asc" },
    select: { day: true, readiness: true, ready: true, active: true, fixes: true },
  });
  return rows;
}
