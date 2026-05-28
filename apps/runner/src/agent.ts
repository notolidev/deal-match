import pLimit from "p-limit";
import type { PriceObservation, ProductSignals } from "@deal-match/shared";
import { withContext } from "./browser.js";
import { search } from "./search.js";
import { extractFromPage } from "./extract.js";

const MAX_CANDIDATES = 6;
const PARALLEL = 3;

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

export async function findDeals(
  signals: ProductSignals,
): Promise<PriceObservation[]> {
  return withContext(async (ctx) => {
    const observations: PriceObservation[] = [];

    // 1. Always observe the user's current page (cheap baseline).
    if (signals.price != null) {
      observations.push({
        retailer: hostname(signals.url),
        url: signals.url,
        price: signals.price,
        currency: signals.currency ?? "USD",
        observedAt: new Date().toISOString(),
        inStock: true,
      });
    }

    // 2. Search the open web for the same product across other retailers.
    if (!signals.title) return observations;
    const hits = await search(ctx, signals, MAX_CANDIDATES);

    const limit = pLimit(PARALLEL);
    const sameHost = hostname(signals.url);
    const candidates = hits.filter((h) => hostname(h.url) !== sameHost);

    const extractions = await Promise.all(
      candidates.map((hit) =>
        limit(async () => {
          const ex = await extractFromPage(ctx, hit.url, {
            title: signals.title,
            brand: signals.brand,
            upc: signals.upc ?? signals.gtin,
          });
          return { hit, ex };
        }),
      ),
    );

    const now = new Date().toISOString();
    for (const { hit, ex } of extractions) {
      if (!ex.matches || ex.price == null) continue;
      observations.push({
        retailer: hostname(hit.url),
        url: hit.url,
        price: ex.price,
        currency: ex.currency ?? signals.currency ?? "USD",
        observedAt: now,
        inStock: ex.inStock ?? true,
      });
    }

    return observations;
  });
}
