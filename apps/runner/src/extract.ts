import { z } from "zod";
import type { BrowserContext } from "playwright";
import { LLM_ENABLED, MODEL, anthropic } from "./llm.js";

const extractionSchema = z.object({
  matches: z.boolean(),
  confidence: z.number().min(0).max(1),
  productTitle: z.string().optional(),
  price: z.number().optional(),
  currency: z.string().optional(),
  inStock: z.boolean().optional(),
  reason: z.string().optional(),
});

export type Extraction = z.infer<typeof extractionSchema>;

interface ExtractInput {
  url: string;
  pageText: string;
  jsonLd: unknown[];
  target: { title?: string; brand?: string; upc?: string };
}

/**
 * Fetches a candidate page in the shared browser context, extracts
 * structured signals (JSON-LD + visible text), then asks an LLM:
 *   - is this the same product the user is looking at?
 *   - if yes, what is its current price?
 *
 * Falls back to a JSON-LD-only heuristic when no LLM key is configured,
 * so the runner remains functional in dev.
 */
export async function extractFromPage(
  ctx: BrowserContext,
  url: string,
  target: ExtractInput["target"],
): Promise<Extraction> {
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 18_000 });
    const { pageText, jsonLd } = await page.evaluate(() => {
      const lds: unknown[] = [];
      document
        .querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')
        .forEach((s) => {
          try {
            lds.push(JSON.parse(s.textContent ?? "null"));
          } catch {
            // ignore
          }
        });
      return {
        pageText: (document.body?.innerText ?? "").slice(0, 6000),
        jsonLd: lds,
      };
    });

    if (!LLM_ENABLED) {
      return heuristicExtract({ url, pageText, jsonLd, target });
    }

    const msg = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 512,
      system:
        "You decide whether a web page is a RETAILER PRODUCT LISTING where the target product can be BOUGHT RIGHT NOW, and extract its price. " +
        "Set matches=true ONLY if BOTH hold: (1) it is the same product — reject different models, variants, sizes, or bundles; and (2) the page is a shop's product/checkout page where you can purchase it (a current listed price with an add-to-cart/buy action and availability). " +
        "Set matches=false for reviews, blog posts, news, articles, forums, videos, how-to/guide pages, and price-comparison or aggregator pages — anything that merely mentions the product or a price without selling it. When unsure, return matches=false. " +
        "Always respond by calling the report_match tool.",
      tools: [
        {
          name: "report_match",
          description:
            "Report whether the candidate listing matches the target product and its price.",
          input_schema: {
            type: "object",
            properties: {
              matches: { type: "boolean" },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              productTitle: { type: "string" },
              price: { type: "number" },
              currency: { type: "string" },
              inStock: { type: "boolean" },
              reason: { type: "string" },
            },
            required: ["matches", "confidence"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "report_match" },
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            target,
            candidate: { url, pageText: pageText.slice(0, 4000), jsonLd },
          }),
        },
      ],
    });

    const toolUse = msg.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return heuristicExtract({ url, pageText, jsonLd, target });
    }
    return extractionSchema.parse(toolUse.input);
  } catch (err) {
    return {
      matches: false,
      confidence: 0,
      reason: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await page.close().catch(() => {});
  }
}

function heuristicExtract(input: ExtractInput): Extraction {
  for (const node of input.jsonLd) {
    const product = findProduct(node);
    if (!product) continue;
    const offers = Array.isArray(product.offers)
      ? product.offers[0]
      : product.offers;
    const price = parsePrice(offers?.price);
    if (price == null) continue;
    const targetNorm = input.target.title?.toLowerCase() ?? "";
    const candidateNorm = product.name?.toLowerCase() ?? "";
    const matches =
      targetNorm.length > 0 &&
      candidateNorm.length > 0 &&
      jaccard(targetNorm, candidateNorm) > 0.4;
    return {
      matches,
      confidence: matches ? 0.5 : 0.2,
      productTitle: product.name,
      price,
      currency: offers?.priceCurrency ?? "USD",
      reason: "heuristic JSON-LD match (no LLM key configured)",
    };
  }
  return { matches: false, confidence: 0, reason: "no JSON-LD Product found" };
}

interface LdProduct {
  "@type"?: string | string[];
  name?: string;
  offers?:
    | { price?: number | string; priceCurrency?: string }
    | Array<{ price?: number | string; priceCurrency?: string }>;
}

function findProduct(node: unknown): LdProduct | null {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const f = findProduct(n);
      if (f) return f;
    }
    return null;
  }
  if (typeof node !== "object") return null;
  const t = (node as LdProduct)["@type"];
  const isProduct =
    typeof t === "string"
      ? t.toLowerCase() === "product"
      : Array.isArray(t) && t.map((x) => x.toLowerCase()).includes("product");
  if (isProduct) return node as LdProduct;
  const graph = (node as { "@graph"?: unknown })["@graph"];
  return graph ? findProduct(graph) : null;
}

function parsePrice(raw: string | number | undefined): number | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : undefined;
  const n = parseFloat(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function jaccard(a: string, b: string): number {
  const sa = new Set(a.split(/\s+/).filter((w) => w.length > 2));
  const sb = new Set(b.split(/\s+/).filter((w) => w.length > 2));
  const inter = [...sa].filter((x) => sb.has(x)).length;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : inter / union;
}
