import type { ProductSignals } from "@deal-match/shared";

interface JsonLdProduct {
  "@type"?: string | string[];
  name?: string;
  brand?: string | { name?: string };
  gtin?: string;
  gtin12?: string;
  gtin13?: string;
  gtin14?: string;
  sku?: string;
  image?: string | string[];
  offers?:
    | { price?: number | string; priceCurrency?: string }
    | Array<{ price?: number | string; priceCurrency?: string }>;
}

function isProduct(node: unknown): node is JsonLdProduct {
  if (!node || typeof node !== "object") return false;
  const t = (node as JsonLdProduct)["@type"];
  if (typeof t === "string") return t.toLowerCase() === "product";
  if (Array.isArray(t)) return t.map((x) => x.toLowerCase()).includes("product");
  return false;
}

function findProductInLd(node: unknown): JsonLdProduct | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findProductInLd(item);
      if (found) return found;
    }
    return null;
  }
  if (node && typeof node === "object") {
    if (isProduct(node)) return node as JsonLdProduct;
    const graph = (node as { "@graph"?: unknown })["@graph"];
    if (graph) return findProductInLd(graph);
  }
  return null;
}

function parseJsonLdNodes(): JsonLdProduct[] {
  const out: JsonLdProduct[] = [];
  const scripts = document.querySelectorAll<HTMLScriptElement>(
    'script[type="application/ld+json"]',
  );
  for (const s of scripts) {
    try {
      const data = JSON.parse(s.textContent ?? "null");
      const found = findProductInLd(data);
      if (found) out.push(found);
    } catch {
      // ignore malformed JSON-LD
    }
  }
  return out;
}

function currencyFromSymbol(sym: string): string | undefined {
  switch (sym) {
    case "£":
      return "GBP";
    case "€":
      return "EUR";
    case "¥":
      return "JPY";
    case "$":
      return "USD";
    default:
      return undefined;
  }
}

function firstOffer(p: JsonLdProduct) {
  if (!p.offers) return undefined;
  return Array.isArray(p.offers) ? p.offers[0] : p.offers;
}

function metaContent(selector: string): string | undefined {
  const el = document.querySelector<HTMLMetaElement>(selector);
  return el?.content || undefined;
}

function parsePrice(raw: string | number | undefined): number | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : undefined;
  const cleaned = raw.replace(/[^0-9.,]/g, "").replace(/,(?=\d{3}\b)/g, "");
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized = cleaned;
  if (lastComma > lastDot) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = cleaned.replace(/,/g, "");
  }
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : undefined;
}

export function extractProductSignals(): ProductSignals | null {
  const url = location.href;
  const ldProducts = parseJsonLdNodes();
  const ld = ldProducts[0];

  let title: string | undefined;
  let brand: string | undefined;
  let upc: string | undefined;
  let gtin: string | undefined;
  let sku: string | undefined;
  let imageUrl: string | undefined;
  let price: number | undefined;
  let currency: string | undefined;

  if (ld) {
    title = ld.name;
    brand =
      typeof ld.brand === "string"
        ? ld.brand
        : ld.brand?.name;
    upc = ld.gtin12;
    gtin = ld.gtin13 ?? ld.gtin14 ?? ld.gtin;
    sku = ld.sku;
    imageUrl = Array.isArray(ld.image) ? ld.image[0] : ld.image;
    const offer = firstOffer(ld);
    price = parsePrice(offer?.price);
    currency = offer?.priceCurrency;
  }

  title ??=
    metaContent('meta[property="og:title"]') ??
    metaContent('meta[name="twitter:title"]') ??
    document.title;
  imageUrl ??= metaContent('meta[property="og:image"]');
  price ??= parsePrice(metaContent('meta[property="product:price:amount"]'));
  price ??= parsePrice(metaContent('meta[property="og:price:amount"]'));
  currency ??=
    metaContent('meta[property="product:price:currency"]') ??
    metaContent('meta[property="og:price:currency"]');

  // Heuristic price-like visible string fallback.
  if (price == null) {
    const text = document.body?.innerText?.slice(0, 5000) ?? "";
    const match = text.match(/([$€£¥])\s?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?/);
    if (match) {
      price = parsePrice(match[0]);
      currency ??= currencyFromSymbol(match[1]);
    }
  }

  // Last resort: infer currency from a price symbol on the page, so we don't
  // wrongly fall back to USD downstream.
  if (currency == null) {
    const sym = document.body?.innerText?.match(/[£€¥$]/)?.[0];
    if (sym) currency = currencyFromSymbol(sym);
  }

  if (!title && !price && !ld) return null;

  return {
    url,
    title,
    brand,
    upc,
    gtin,
    sku,
    price,
    currency,
    imageUrl,
    jsonLd: ld,
    // Always include a generous chunk of the visible text. The runner uses it
    // to extract the correct single-unit current price with the LLM (the page
    // itself often can't be loaded server-side due to bot blocks).
    pageTextSnippet: document.body?.innerText?.slice(0, 4000),
  };
}
