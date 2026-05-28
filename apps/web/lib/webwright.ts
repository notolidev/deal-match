import type {
  PriceObservation,
  ProductSignals,
} from "@deal-match/shared";

/**
 * Runs the webwright deal-finding agent against the open web.
 *
 * In production this is dispatched to a Vercel Sandbox (Firecracker microVM)
 * where webwright drives a headless Playwright session: it searches the web
 * for the same product, opens candidate listings, and the LLM judges whether
 * each candidate is truly the same SKU.
 *
 * The implementation here is the integration seam — the actual Sandbox
 * orchestration is wired via `WEBWRIGHT_RUNNER_URL`. Without it set we fall
 * back to a deterministic stub so the rest of the stack remains exercisable
 * end-to-end.
 */
export async function findDeals(
  signals: ProductSignals,
): Promise<PriceObservation[]> {
  const runner = process.env.WEBWRIGHT_RUNNER_URL;
  if (runner) {
    const res = await fetch(runner, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.WEBWRIGHT_RUNNER_TOKEN ?? ""}`,
      },
      body: JSON.stringify({ signals }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `webwright runner failed: ${res.status} ${detail}`.trim(),
      );
    }
    const data = (await res.json()) as { observations: PriceObservation[] };
    return data.observations;
  }

  return stubObservations(signals);
}

function stubObservations(signals: ProductSignals): PriceObservation[] {
  const now = new Date().toISOString();
  const basePrice = signals.price ?? 99.99;
  const currency = signals.currency ?? "USD";
  return [
    {
      retailer: hostname(signals.url),
      url: signals.url,
      price: basePrice,
      currency,
      observedAt: now,
      inStock: true,
    },
    {
      retailer: "example-competitor.com",
      url: "https://example-competitor.com/listing",
      price: Math.round(basePrice * 0.92 * 100) / 100,
      currency,
      observedAt: now,
      inStock: true,
    },
  ];
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}
