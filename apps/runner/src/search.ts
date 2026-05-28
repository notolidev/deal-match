import type { ProductSignals } from "@deal-match/shared";
import { LLM_ENABLED, MODEL, anthropic } from "./llm.js";

export interface SearchHit {
  title: string;
  url: string;
  snippet?: string;
}

const SEARXNG_URL = process.env.SEARXNG_URL ?? "http://searxng:8080";

interface SearxResult {
  url?: string;
  title?: string;
  content?: string;
}

// Rather than allowlist retailers (brittle, misses brand stores and regional
// shops), drop only obvious non-sellers — search engines, social, forums,
// encyclopaedias, review sites, and price-comparison aggregators. The LLM
// extraction then judges whether each remaining page is the same product
// with a real, buyable price.
const BLOCKED_NAMES = [
  "google",
  "bing",
  "duckduckgo",
  "youtube",
  "youtu",
  "reddit",
  "quora",
  "pinterest",
  "facebook",
  "instagram",
  "twitter",
  "tiktok",
  "linkedin",
  "wikipedia",
  "fandom",
  "pricerunner",
  "idealo",
  "kelkoo",
  "pricespy",
  "camelcamelcamel",
  "shopzilla",
  "techradar",
  "tomsguide",
  "tomshardware",
  "cnet",
  "theverge",
  "engadget",
  "wirecutter",
  "trustedreviews",
  "pcmag",
  "gizmodo",
  "digitaltrends",
];
const BLOCKED_RE = new RegExp(`(^|\\.)(${BLOCKED_NAMES.join("|")})\\.`, "i");

/**
 * Marketplace titles are keyword-stuffed feature dumps ("acer USB C Hub,
 * 7IN1 USB-C to 4K HDMI, 2×USB 3.0, …"). Searching the whole string matches
 * no other retailer. Ask the LLM to distill it into a concise product query
 * (brand + product + model/SKU), falling back to a heuristic if the LLM is
 * unavailable.
 */
async function buildQuery(signals: ProductSignals): Promise<string> {
  const fallback = heuristicQuery(signals.title ?? "", signals.brand);
  if (!LLM_ENABLED || !signals.title) return fallback;
  try {
    const msg = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 40,
      system:
        "Turn a noisy e-commerce product title into a short web search query that finds the SAME product at other retailers. Include the brand, the product type, and any model or SKU number. Drop marketing adjectives, compatibility lists, and feature specs. Reply with ONLY the query — no quotes, no preamble.",
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            title: signals.title,
            brand: signals.brand,
            sku: signals.sku,
            gtin: signals.gtin ?? signals.upc,
          }),
        },
      ],
    });
    const block = msg.content.find((b) => b.type === "text");
    const query = block && block.type === "text" ? block.text.trim() : "";
    return query || fallback;
  } catch {
    return fallback;
  }
}

function heuristicQuery(title: string, brand: string | undefined): string {
  let core = title.split(/[,|·•]/)[0].trim();
  const words = core.split(/\s+/);
  if (words.length > 8) core = words.slice(0, 8).join(" ");
  const hasBrand = brand && core.toLowerCase().includes(brand.toLowerCase());
  return brand && !hasBrand ? `${brand} ${core}` : core;
}

/**
 * Queries the self-hosted SearXNG instance's JSON API (it aggregates many
 * engines server-side, avoiding the datacenter-IP blocks that killed direct
 * search-engine scraping). Results are filtered to known retailer domains.
 */
export async function search(
  signals: ProductSignals,
  limit = 8,
): Promise<SearchHit[]> {
  if (!signals.title) return [];

  const query = await buildQuery(signals);

  // Fetch two result pages in parallel for better recall, then dedupe by URL.
  const pages = await Promise.all(
    [1, 2].map(async (pageno) => {
      const url = new URL("/search", SEARXNG_URL);
      url.searchParams.set("q", query);
      url.searchParams.set("format", "json");
      url.searchParams.set("categories", "general");
      url.searchParams.set("pageno", String(pageno));
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        if (!res.ok) throw new Error(`searxng responded ${res.status}`);
        const data = (await res.json()) as { results?: SearxResult[] };
        return data.results ?? [];
      } catch (err) {
        console.error(`searxng search failed (page ${pageno})`, err);
        return [];
      }
    }),
  );

  const seen = new Set<string>();
  const results: SearxResult[] = [];
  for (const r of pages.flat()) {
    if (!r.url || seen.has(r.url)) continue;
    seen.add(r.url);
    results.push(r);
  }

  const hits = results
    .filter((r): r is SearxResult & { url: string } => Boolean(r.url))
    .map((r) => ({
      title: r.title ?? "",
      url: r.url,
      snippet: r.content,
    }))
    .filter((h) => {
      try {
        const host = new URL(h.url).hostname.replace(/^www\./, "");
        return !BLOCKED_RE.test(host);
      } catch {
        return false;
      }
    });

  console.log(
    `[search] query=${JSON.stringify(query)} searxng=${results.length} kept=${hits.length}`,
  );
  return hits.slice(0, limit);
}
