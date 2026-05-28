import pLimit from "p-limit";
import type { PriceObservation, ProductSignals } from "@deal-match/shared";
import { withContext } from "./browser.js";
import { search } from "./search.js";
import { extractFromPage } from "./extract.js";

const MAX_CANDIDATES = 10;
const PARALLEL = 4;

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
    const target = {
      title: signals.title,
      brand: signals.brand,
      upc: signals.upc ?? signals.gtin,
    };

    // 1. Observe the user's current page. Re-extract with the LLM so the
    //    single-unit price is correct even when the page leads with a bulk /
    //    multi-buy price; fall back to the content script's price if the
    //    visit fails (e.g. bot-blocked).
    let currentPrice = signals.price;
    let currentCurrency = signals.currency;
    try {
      const self = await extractFromPage(ctx, signals.url, target);
      if (self.matches && self.price != null) {
        currentPrice = self.price;
        currentCurrency = self.currency ?? currentCurrency;
      }
      console.log(`[agent] self ${hostname(signals.url)} price=${self.price ?? "?"} (signals=${signals.price ?? "?"})`);
    } catch (err) {
      console.warn("self-extract failed, using signals price", err);
    }
    if (currentPrice != null) {
      observations.push({
        retailer: hostname(signals.url),
        url: signals.url,
        price: currentPrice,
        currency: currentCurrency ?? "USD",
        observedAt: new Date().toISOString(),
        inStock: true,
      });
    }

    // 2. Search the open web for the same product across other retailers.
    if (!signals.title) return observations;
    const hits = await search(signals, MAX_CANDIDATES);

    const limit = pLimit(PARALLEL);
    const sameHost = hostname(signals.url);
    const candidates = hits.filter((h) => hostname(h.url) !== sameHost);
    console.log(
      `[agent] candidates=${candidates.length}: ${candidates.map((c) => hostname(c.url)).join(", ")}`,
    );

    const extractions = await Promise.all(
      candidates.map((hit) =>
        limit(async () => {
          const ex = await extractFromPage(ctx, hit.url, target);
          return { hit, ex };
        }),
      ),
    );

    const now = new Date().toISOString();
    const targetCurrency = signals.currency?.toUpperCase();
    for (const { hit, ex } of extractions) {
      console.log(
        `[agent] ${hostname(hit.url)} matches=${ex.matches} price=${ex.price ?? "?"} ${ex.reason ?? ""}`,
      );
      if (!ex.matches || ex.price == null) continue;
      // Drop foreign-currency listings — comparing €23 to £22 is meaningless
      // and surfaces out-of-region shops as bogus "deals".
      if (ex.currency && targetCurrency && ex.currency.toUpperCase() !== targetCurrency) {
        console.log(`[agent] skip ${hostname(hit.url)}: ${ex.currency} != ${targetCurrency}`);
        continue;
      }
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
