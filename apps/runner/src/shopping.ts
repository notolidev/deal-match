import { z } from "zod";
import { LLM_ENABLED, chatJson } from "./llm.js";

export const SERPER_ENABLED = !!process.env.SERPER_API_KEY;

export interface ShoppingOffer {
  title: string;
  retailer: string;
  price: number;
  currency: string;
  link: string;
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

// Google's gl param uses "uk" (not gb) for the United Kingdom.
const GL_BY_CURRENCY: Record<string, string> = {
  GBP: "uk",
  USD: "us",
  EUR: "de",
  AUD: "au",
  CAD: "ca",
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

  const gl =
    process.env.SERPER_GL ??
    (targetCurrency ? GL_BY_CURRENCY[targetCurrency.toUpperCase()] : undefined) ??
    "us";

  let items: SerperShoppingItem[] = [];
  try {
    const res = await fetch("https://google.serper.dev/shopping", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, gl }),
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
    });
  }
  console.log(`[shopping] query=${JSON.stringify(query)} gl=${gl} offers=${offers.length}`);
  return offers;
}

const filterSchema = z.object({ sameProductIndexes: z.array(z.number()) });

/**
 * One LLM pass to keep only offers that are the SAME product as the target,
 * rejecting different models/variants/sizes, accessories, and bundles.
 */
export async function filterOffers(
  target: { title?: string; brand?: string },
  offers: ShoppingOffer[],
): Promise<ShoppingOffer[]> {
  if (offers.length === 0) return [];
  if (!LLM_ENABLED) return offers;

  const result = await chatJson(
    "You match shopping results to a target product. Return the indexes of offers that are the EXACT same product as the target — same model, variant, and size. Reject different models or generations, accessories, cases, bundles/multipacks, and listings for a different capacity/colour when the target specifies one. When unsure, exclude it.",
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
      description: "Report which offers are the same product as the target.",
      parameters: {
        type: "object",
        properties: {
          sameProductIndexes: {
            type: "array",
            items: { type: "integer" },
            description:
              "0-based indexes of offers that are the exact same product as the target.",
          },
        },
        required: ["sameProductIndexes"],
      },
    },
  );

  if (result == null) return offers;
  let keep: Set<number>;
  try {
    keep = new Set(filterSchema.parse(result).sameProductIndexes);
  } catch {
    return offers;
  }
  return offers.filter((_, i) => keep.has(i));
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}
