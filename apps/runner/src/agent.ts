import pLimit from "p-limit";
import type { PriceObservation, ProductSignals } from "@deal-match/shared";
import { withContext } from "./browser.js";
import { buildQuery, search } from "./search.js";
import { extractFromPage, extractFromText, resolveDirectLink } from "./extract.js";
import { SERPER_ENABLED, filterOffers, shoppingSearch } from "./shopping.js";

const MAX_CANDIDATES = 6;
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

    // 1. Observe the user's current page. Use the page text the content script
    //    captured in the user's real browser (the runner often can't load the
    //    page itself due to bot blocks) and let the LLM pick the single-unit
    //    price — so a bulk/multi-buy headline price doesn't win. Fall back to
    //    the content script's own price if text isn't available.
    let currentPrice = signals.price;
    let currentCurrency = signals.currency;
    if (signals.pageTextSnippet) {
      const self = await extractFromText(signals.url, signals.pageTextSnippet, target);
      if (self.price != null && self.price > 0) {
        currentPrice = self.price;
        currentCurrency = self.currency ?? currentCurrency;
      }
      console.log(`[agent] self ${hostname(signals.url)} price=${self.price ?? "?"} (signals=${signals.price ?? "?"})`);
    }
    if (currentPrice != null && currentPrice > 0) {
      observations.push({
        retailer: hostname(signals.url),
        url: signals.url,
        price: currentPrice,
        currency: currentCurrency ?? "USD",
        observedAt: new Date().toISOString(),
        inStock: true,
        condition: "new",
      });
    }

    // 2. Find the same product at other retailers.
    if (!signals.title) return observations;
    const now = new Date().toISOString();
    const sameHost = hostname(signals.url);
    const targetCurrency = signals.currency?.toUpperCase();
    const query = await buildQuery(signals);

    // Preferred: Google Shopping via Serper — structured retailer + price data,
    // no page visits (so no datacenter-IP bot blocks). One LLM pass filters out
    // different models/variants.
    if (SERPER_ENABLED) {
      const offers = await shoppingSearch(query, signals.currency);
      const matched = await filterOffers(target, offers);
      console.log(`[agent] shopping offers=${offers.length} matched=${matched.length}`);
      for (const o of matched) {
        const h = hostname(o.link);
        if (h === sameHost) {
          console.log(`[agent] drop same-host ${h} ${o.price}`);
          continue;
        }
        if (targetCurrency && o.currency.toUpperCase() !== targetCurrency) {
          console.log(`[agent] drop currency ${o.currency} ${h}`);
          continue;
        }
        console.log(`[agent] add ${o.retailer} ${o.currency} ${o.price} ${o.condition} (${h})`);
        observations.push({
          retailer: o.retailer,
          url: o.link,
          price: o.price,
          currency: o.currency,
          observedAt: now,
          inStock: true,
          condition: o.condition,
        });
      }

      // Resolve the cheapest NEW offer (the "View deal" target) from its
      // Google Shopping link to the real retailer URL.
      const cta = observations
        .filter((o) => (o.condition ?? "new") === "new" && hostname(o.url) !== sameHost)
        .sort((a, b) => a.price - b.price)[0];
      if (cta && /(^|\.)google\./.test(hostname(cta.url))) {
        const direct = await resolveDirectLink(ctx, cta.url);
        if (direct !== cta.url) {
          console.log(`[agent] resolved direct ${hostname(direct)} for ${cta.retailer}`);
          cta.url = direct;
        }
      }
      return observations;
    }

    // Fallback: SearXNG + per-page LLM extraction (works without a Serper key,
    // but recall is limited by retailer bot blocks).
    const hits = await search(query, MAX_CANDIDATES);
    const limit = pLimit(PARALLEL);
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

    for (const { hit, ex } of extractions) {
      console.log(
        `[agent] ${hostname(hit.url)} matches=${ex.matches} price=${ex.price ?? "?"} ${ex.reason ?? ""}`,
      );
      if (!ex.matches || ex.price == null || ex.price <= 0) continue;
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
