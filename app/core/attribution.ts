/**
 * Recognizes visits that came from AI assistants, from the referrer and the
 * UTM source Shopify records for each order's first and last visit.
 * Assistants that open links in a browser pass a referrer or tag the link
 * (ChatGPT adds utm_source=chatgpt.com); in-app browsers may send neither, so
 * these figures are a floor, not a total.
 */
export const ASSISTANTS = [
  { name: "ChatGPT", hosts: ["chatgpt.com", "chat.openai.com"], utm: ["chatgpt.com", "chatgpt", "openai"] },
  { name: "Perplexity", hosts: ["perplexity.ai"], utm: ["perplexity", "perplexity.ai"] },
  { name: "Gemini", hosts: ["gemini.google.com", "bard.google.com"], utm: ["gemini", "gemini.google.com"] },
  { name: "Copilot", hosts: ["copilot.microsoft.com", "copilot.cloud.microsoft"], utm: ["copilot", "copilot.com"] },
  { name: "Claude", hosts: ["claude.ai"], utm: ["claude", "claude.ai"] },
  { name: "Meta AI", hosts: ["meta.ai"], utm: ["meta.ai", "metaai"] },
  { name: "Grok", hosts: ["grok.com"], utm: ["grok", "grok.com"] },
  { name: "DeepSeek", hosts: ["chat.deepseek.com"], utm: ["deepseek", "deepseek.com"] },
] as const;
export type AssistantName = (typeof ASSISTANTS)[number]["name"];

export type Visit = {
  referrerUrl?: string | null;
  landingPage?: string | null;
  utmParameters?: { source?: string | null } | null;
} | null;

const hostOf = (value?: string | null) => {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
};
const utmFromLanding = (landing?: string | null) => {
  if (!landing) return null;
  try {
    return new URL(landing, "https://shop.example").searchParams.get("utm_source");
  } catch {
    return null;
  }
};

export function assistantForVisit(visit: Visit): AssistantName | null {
  if (!visit) return null;
  const host = hostOf(visit.referrerUrl);
  if (host) {
    const byHost = ASSISTANTS.find((a) => a.hosts.some((h) => host === h || host.endsWith(`.${h}`)));
    if (byHost) return byHost.name;
  }
  const utm = (visit.utmParameters?.source ?? utmFromLanding(visit.landingPage))?.trim().toLowerCase();
  if (utm) {
    const byUtm = ASSISTANTS.find((a) => (a.utm as readonly string[]).includes(utm));
    if (byUtm) return byUtm.name;
  }
  return null;
}

/** The assistant behind an order: the last visit first, then the first visit. */
export function classifyOrder(journey: { firstVisit?: Visit; lastVisit?: Visit } | null | undefined) {
  if (!journey) return null;
  const last = assistantForVisit(journey.lastVisit ?? null);
  if (last) return { assistant: last, touch: "last" as const, landingPage: journey.lastVisit?.landingPage ?? null };
  const first = assistantForVisit(journey.firstVisit ?? null);
  if (first) return { assistant: first, touch: "first" as const, landingPage: journey.firstVisit?.landingPage ?? null };
  return null;
}
