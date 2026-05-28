import { z } from "zod";
import type { ProductCondition } from "@deal-match/shared";
import { LLM_ENABLED, chatJson } from "./llm.js";

export const SERPER_ENABLED = !!process.env.SERPER_API_KEY;

export interface ShoppingOffer {
  title: string;
  retailer: string;
  price: number;
  currency: string;
  link: string;
  condition: ProductCondition;
}

interface SerperShoppingItem {
  title?: string;
  source?: string;
  link?: string;
  price?: string;
  delivery?: string;
}

const CURRENCY_BY_SYMBOL: Record<string, string> = {
  "£": "GBP",
  "$": "USD",
  "€": "EUR",
  "¥": "JPY",
};

// Region controls the currency Google Shopping returns. gl alone wasn't
// enough (gl=uk still came back USD); the `location` string is the reliable
// signal, so we send both.
const REGION_BY_CURRENCY: Record<string, { gl: string; location: string }> = {
  GBP: { gl: "uk", location: "United Kingdom" },
  USD: { gl: "us", location: "United States" },
  EUR: { gl: "de", location: "Germany" },
  AUD: { gl: "au", location: "Australia" },
  CAD: { gl: "ca", location: "Canada" },
};

function parsePrice(raw: string | undefined): { price?: number; currency?: string } {
  if (!raw) return {};
  const symbol = raw.match(/[£$€¥]/)?.[0];
  const currency = symbol ? CURRENCY_BY_SYMBOL[symbol] : undefined;
  const n = parseFloat(raw.replace(/[^0-9.]/g, ""));
  return { price: Number.isFinite(n) ? n : undefined, currency };
}

/**
 * Queries Serper's Google Shopping endpoint, which returns retailer + price +
 * link as structured data — no page visits, so it avoids the datacenter-IP
 * bot blocks that make scraping retailer pages unreliable.
 */
export async function shoppingSearch(
  query: string,
  targetCurrency?: string,
): Promise<ShoppingOffer[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];

  const region =
    (targetCurrency && REGION_BY_CURRENCY[targetCurrency.toUpperCase()]) ||
    REGION_BY_CURRENCY.USD;
  const gl = process.env.SERPER_GL ?? region.gl;
  const location = process.env.SERPER_LOCATION ?? region.location;

  let items: SerperShoppingItem[] = [];
  try {
    const res = await fetch("https://google.serper.dev/shopping", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, gl, location }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`serper responded ${res.status}`);
    const data = (await res.json()) as { shopping?: SerperShoppingItem[] };
    items = data.shopping ?? [];
  } catch (err) {
    console.error("serper shopping failed", err);
    return [];
  }

  const offers: ShoppingOffer[] = [];
  for (const it of items) {
    if (!it.link || !it.title) continue;
    const { price, currency } = parsePrice(it.price);
    if (price == null || price <= 0) continue;
    offers.push({
      title: it.title,
      retailer: it.source || hostname(it.link),
      price,
      currency: currency ?? targetCurrency ?? "USD",
      link: it.link,
      condition: "new",
    });
  }
  console.log(`[shopping] query=${JSON.stringify(query)} gl=${gl} location=${JSON.stringify(location)} offers=${offers.length}`);
  return offers;
}

const filterSchema = z.object({
  matches: z.array(
    z.object({
      index: z.number(),
      condition: z.enum(["new", "used", "refurbished"]),
    }),
  ),
});

/**
 * One LLM pass to keep only offers that are the SAME product as the target
 * (rejecting different models/variants/sizes, accessories, and bundles) and
 * to classify each kept offer's condition (new / used / refurbished).
 */
export async function filterOffers(
  target: { title?: string; brand?: string },
  offers: ShoppingOffer[],
): Promise<ShoppingOffer[]> {
  if (offers.length === 0) return [];
  if (!LLM_ENABLED) return offers;

  const result = await chatJson(
    "You match shopping results to a target product. Identify the product primarily by its MODEL NUMBER or SKU (e.g. '34WR50QK-B', 'PL5124') — retailer titles vary in wording, so allow differences in phrasing, word order, and extra marketing text. Return every offer that is the SAME product. Reject ONLY offers that are clearly a DIFFERENT model or generation, a different size/capacity/colour than the target specifies, an accessory (case, stand, cable, screen protector), or a multipack/bundle. For each kept offer also classify its condition: 'used' (pre-owned, second-hand, for parts), 'refurbished' (refurbished, renewed, open-box), or 'new' (default for standard retail listings).",
    JSON.stringify({
      target,
      offers: offers.map((o, i) => ({
        index: i,
        title: o.title,
        retailer: o.retailer,
        price: o.price,
      })),
    }),
    {
      name: "report_matches",
      description:
        "Report which offers are the same product and each one's condition.",
      parameters: {
        type: "object",
        properties: {
          matches: {
            type: "array",
            items: {
              type: "object",
              properties: {
                index: { type: "integer" },
                condition: {
                  type: "string",
                  enum: ["new", "used", "refurbished"],
                },
              },
              required: ["index", "condition"],
            },
          },
        },
        required: ["matches"],
      },
    },
  );

  if (result == null) return offers;
  try {
    const matches = filterSchema.parse(result).matches;
    const kept: ShoppingOffer[] = [];
    for (const m of matches) {
      const offer = offers[m.index];
      if (offer) kept.push({ ...offer, condition: m.condition });
    }
    return kept;
  } catch {
    return offers;
  }
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}
