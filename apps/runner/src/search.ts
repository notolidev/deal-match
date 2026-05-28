import type { BrowserContext } from "playwright";

export interface SearchHit {
  title: string;
  url: string;
  snippet?: string;
}

// Match known retailers by name as a domain label, so region TLDs
// (amazon.co.uk, currys.co.uk, ebay.de, …) are all accepted.
const RETAILER_NAMES = [
  "amazon",
  "ebay",
  "walmart",
  "bestbuy",
  "target",
  "newegg",
  "bhphotovideo",
  "costco",
  "homedepot",
  "argos",
  "currys",
  "johnlewis",
  "very",
  "ao",
  "screwfix",
  "ebuyer",
  "overclockers",
  "scan",
  "box",
  "appliancesdirect",
  "richersounds",
];
const RETAILER_RE = new RegExp(`(^|\\.)(${RETAILER_NAMES.join("|")})\\.`, "i");

/**
 * Marketplace titles are often keyword-stuffed ("acer USB C Hub, 7IN1 USB-C
 * to 4K HDMI, 2×USB 3.0, …") — searching the whole thing matches nothing.
 * Keep the first clause and cap the length to a sane product query.
 */
function buildQuery(title: string, brand: string | undefined): string {
  let core = title.split(/[,|·•]/)[0].trim();
  const words = core.split(/\s+/);
  if (words.length > 8) core = words.slice(0, 8).join(" ");
  const hasBrand = brand && core.toLowerCase().includes(brand.toLowerCase());
  return brand && !hasBrand ? `${brand} ${core}` : core;
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
          return RETAILER_RE.test(host);
        } catch {
          return false;
        }
      });

    return filtered.slice(0, limit);
  } finally {
    await page.close().catch(() => {});
  }
}
