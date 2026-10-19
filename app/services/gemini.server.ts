import type { BuyerQuestion, CatalogBrief } from "../core/visibility";
import { templateQuestions } from "../core/visibility";
import { demoAnswer } from "../core/demo";

/** Asks one AI assistant buyer questions, the way a shopper would. */
export interface VisibilityEngine {
  assistant: string;
  model: string;
  questions(brief: CatalogBrief, count: number): Promise<BuyerQuestion[]>;
  /** The raw answer, plus the sites it says it used. */
  ask(prompt: string): Promise<{ raw: string; citedHosts: string[] }>;
}

export class EngineError extends Error {}

const API = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 60_000;

const SHOPPER = `You are an AI shopping assistant. A shopper asks you a question. Answer the way you normally would: recommend specific products and the brands or stores to buy them from, with short reasons. Use Google Search for current products, prices and stores.
After the answer, add one final line that starts with "BRANDS:" and lists every brand or store you recommended, separated by semicolons.`;

type GenerateResponse = {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    finishReason?: string;
    groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] };
  }[];
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
};

async function generate(key: string, model: string, body: unknown): Promise<GenerateResponse> {
  let response: Response;
  try {
    response = await fetch(`${API}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new EngineError(
      error instanceof Error && error.name === "TimeoutError"
        ? "Gemini took too long to answer."
        : "Gemini could not be reached.",
    );
  }
  const data = (await response.json().catch(() => ({}))) as GenerateResponse;
  if (!response.ok) {
    const status = data.error?.status ?? response.status;
    if (response.status === 429 || status === "RESOURCE_EXHAUSTED")
      throw new EngineError("Gemini's usage limit was reached. Try again later or raise the limit in Google AI Studio.");
    if (response.status === 400 && /api key/i.test(data.error?.message ?? ""))
      throw new EngineError("The Gemini API key is not valid. Check GEMINI_API_KEY.");
    if (response.status === 403) throw new EngineError("The Gemini API key is not allowed to use this model.");
    throw new EngineError(`Gemini returned an error (${status}).`);
  }
  return data;
}

const textOf = (data: GenerateResponse) =>
  (data.candidates?.[0]?.content?.parts ?? [])
    .filter((p) => !p.thought)
    .map((p) => p.text ?? "")
    .join("")
    .trim();

export function geminiEngine(key: string, model: string): VisibilityEngine {
  return {
    assistant: "Gemini",
    model,
    async questions(brief, count) {
      const data = await generate(key, model, {
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Write ${count} questions real shoppers would type into an AI assistant when looking for products like the ones this store sells. Mix "best" questions, questions with a budget, questions about a use or need, and comparisons. Do not mention any store or brand name. Spread the questions across the product types.
Prices are in ${brief.currency ?? "the store's currency"}.
Product types:
${brief.topics
  .map(
    (t) =>
      `- ${t.name}: ${t.products} products${t.minPrice !== null ? `, ${t.minPrice}–${t.maxPrice}` : ""}. Examples: ${t.examples.join("; ")}`,
  )
  .join("\n")}`,
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: { prompt: { type: "STRING" }, topic: { type: "STRING" } },
              required: ["prompt", "topic"],
            },
          },
        },
      });
      try {
        const list = JSON.parse(textOf(data)) as BuyerQuestion[];
        const clean = list
          .filter((q) => typeof q?.prompt === "string" && q.prompt.trim())
          .map((q) => ({ prompt: q.prompt.trim().slice(0, 300), topic: String(q.topic ?? "").slice(0, 80) }))
          .slice(0, count);
        if (clean.length) return clean;
      } catch {
        // Fall through to the built-in questions.
      }
      return templateQuestions(brief, count);
    },
    async ask(prompt) {
      const data = await generate(key, model, {
        systemInstruction: { parts: [{ text: SHOPPER }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
      });
      if (data.promptFeedback?.blockReason) throw new EngineError("Gemini declined to answer this question.");
      const raw = textOf(data);
      if (!raw) throw new EngineError("Gemini returned an empty answer.");
      const chunks = data.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      // Search results come back as redirect links titled with the site's domain.
      const citedHosts = chunks.map((c) => c.web?.title ?? "").filter((t) => /\./.test(t));
      return { raw, citedHosts };
    },
  };
}

/** Answers from a fixed script, for the demo store and tests. */
export function demoEngine(): VisibilityEngine {
  return {
    assistant: "Gemini",
    model: "demo",
    async questions(brief, count) {
      return templateQuestions(brief, count);
    },
    async ask(prompt) {
      return demoAnswer(prompt);
    },
  };
}

export const geminiModel = () => process.env.GEMINI_MODEL?.trim() || "gemini-flash-latest";

/** The engine for this environment, or null when no Gemini key is set. */
export function visibilityEngine(): VisibilityEngine | null {
  // Same rule as demoEnabled() in context.server, which this module cannot import
  // without loading the Shopify app configuration.
  const demo = process.env.DEMO_MODE === "true" && process.env.NODE_ENV !== "production";
  if (demo || process.env.SOODO_TEST_DATABASE === "true") return demoEngine();
  const key = process.env.GEMINI_API_KEY?.trim();
  return key ? geminiEngine(key, geminiModel()) : null;
}
