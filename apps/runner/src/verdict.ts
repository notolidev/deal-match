import { z } from "zod";
import type {
  AnalysisResult,
  PriceObservation,
  ProductSignals,
} from "@deal-match/shared";
import { LLM_ENABLED, chatJson } from "./llm.js";

const verdictSchema = z.object({
  verdict: z.enum(["buy", "wait", "neutral"]),
  confidence: z.number().min(0).max(1),
  oneLineReason: z.string(),
  waitForEvent: z.string().optional(),
});

export async function synthesizeVerdict(
  signals: ProductSignals,
  observations: PriceObservation[],
): Promise<AnalysisResult> {
  // Prefer the corrected current-page observation (single-unit price) over
  // the raw content-script price, which may be a bulk/multi-buy headline.
  const currentPrice =
    observations.find((o) => sameHost(o.url, signals.url))?.price ??
    signals.price ??
    observations[0]?.price;
  const currency = signals.currency ?? observations[0]?.currency ?? "USD";

  const sorted = [...observations].sort((a, b) => a.price - b.price);
  const cheapest = sorted[0];
  const betterDeal =
    cheapest && currentPrice && cheapest.price < currentPrice * 0.97
      ? {
          retailer: cheapest.retailer,
          url: cheapest.url,
          price: cheapest.price,
          currency: cheapest.currency,
          savings: Math.round((currentPrice - cheapest.price) * 100) / 100,
        }
      : undefined;

  const ninetyDayLow = Math.min(...observations.map((o) => o.price));

  const fallback: AnalysisResult = {
    verdict: betterDeal ? "wait" : "neutral",
    confidence: 0.4,
    oneLineReason: betterDeal
      ? `Same item is ${betterDeal.savings.toFixed(2)} cheaper at ${betterDeal.retailer}.`
      : "Not enough data to judge — price looks typical.",
    currentPrice,
    currency,
    ninetyDayLow: Number.isFinite(ninetyDayLow) ? ninetyDayLow : undefined,
    observations,
    betterDeal,
    generatedAt: new Date().toISOString(),
  };

  if (!LLM_ENABLED) return fallback;

  try {
    const result = await chatJson(
      "You are a deal-evaluation assistant. Given a current price and a comparison table of the same product at other retailers, decide whether the user should buy now, wait, or stay neutral. Keep reasoning concise and consumer-friendly.",
      JSON.stringify({
        product: {
          title: signals.title,
          brand: signals.brand,
          currentPrice,
          currency,
          url: signals.url,
        },
        observations,
      }),
      {
        name: "report_verdict",
        description: "Report the buy/wait/neutral verdict for the product.",
        parameters: {
          type: "object",
          properties: {
            verdict: { type: "string", enum: ["buy", "wait", "neutral"] },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            oneLineReason: { type: "string" },
            waitForEvent: { type: "string" },
          },
          required: ["verdict", "confidence", "oneLineReason"],
        },
      },
    );

    if (result == null) return fallback;
    const object = verdictSchema.parse(result);
    return {
      ...fallback,
      verdict: object.verdict,
      confidence: object.confidence,
      oneLineReason: object.oneLineReason,
      waitForEvent: object.waitForEvent,
    };
  } catch (err) {
    console.error("verdict synthesis failed, returning fallback", err);
    return fallback;
  }
}

function sameHost(a: string, b: string): boolean {
  try {
    return new URL(a).hostname === new URL(b).hostname;
  } catch {
    return false;
  }
}
