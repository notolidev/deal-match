import type { BrowserContext } from "playwright";

export interface SearchHit {
  title: string;
  url: string;
  snippet?: string;
}

const RETAILER_HINT = [
  "amazon.com",
  "walmart.com",
  "bestbuy.com",
  "target.com",
  "ebay.com",
  "newegg.com",
  "bhphotovideo.com",
  "costco.com",
  "homedepot.com",
];

function buildQuery(title: string, brand: string | undefined): string {
  const q = brand ? `${brand} ${title}` : title;
  return `${q} price`;
}

/**
 * Uses DuckDuckGo's HTML endpoint — no JS, no CAPTCHA in practice, no API key.
 * Results are noisy; downstream filtering keeps only retailer domains.
 */
export async function search(
  ctx: BrowserContext,
  signals: { title?: string; brand?: string },
  limit = 8,
): Promise<SearchHit[]> {
  if (!signals.title) return [];
  const page = await ctx.newPage();
  try {
    const q = encodeURIComponent(buildQuery(signals.title, signals.brand));
    await page.goto(`https://duckduckgo.com/html/?q=${q}`, {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });

    const hits = await page.$$eval(".result", (rows) =>
      rows
        .map((r) => {
          const a = r.querySelector<HTMLAnchorElement>(".result__a");
          const snippet = r.querySelector(".result__snippet");
          return {
            title: a?.textContent?.trim() ?? "",
            url: a?.href ?? "",
            snippet: snippet?.textContent?.trim() ?? "",
          };
        })
        .filter((h) => h.url),
    );

    const filtered = hits
      .map((h) => {
        try {
          const u = new URL(h.url);
          const direct = u.searchParams.get("uddg");
          return { ...h, url: direct ?? h.url };
        } catch {
          return h;
        }
      })
      .filter((h) => {
        try {
          const host = new URL(h.url).hostname.replace(/^www\./, "");
          return RETAILER_HINT.some((d) => host === d || host.endsWith(`.${d}`));
        } catch {
          return false;
        }
      });

    return filtered.slice(0, limit);
  } finally {
    await page.close().catch(() => {});
  }
}
