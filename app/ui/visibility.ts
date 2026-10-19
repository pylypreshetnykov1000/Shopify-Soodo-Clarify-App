import type { Appearance } from "../core/visibility";

export const APPEARANCE: Record<Appearance, { label: string; tone: "success" | "info" | "neutral" }> = {
  recommended: { label: "Recommended", tone: "success" },
  cited: { label: "Your site cited", tone: "info" },
  absent: { label: "Not mentioned", tone: "neutral" },
};

/** The score in plain words: below 20 is low, 50 or more is strong. */
export const visibilityBand = (score: number) =>
  score >= 50
    ? { label: "Strong", badge: "success" as const, tone: "pass" }
    : score >= 20
      ? { label: "Growing", badge: "warning" as const, tone: "medium" }
      : { label: "Low", badge: "critical" as const, tone: "high" };
