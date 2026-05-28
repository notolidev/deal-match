import { createHash } from "node:crypto";
import type { ProductSignals } from "@deal-match/shared";

const NOISE_WORDS = new Set([
  "the", "a", "an", "with", "and", "for", "of", "in", "on", "to",
  "new", "sale", "deal", "buy", "official", "genuine",
]);

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !NOISE_WORDS.has(w))
    .sort()
    .join(" ");
}

export function identityHash(signals: ProductSignals): string {
  const key =
    signals.upc ??
    signals.gtin ??
    (signals.brand && signals.title
      ? `${signals.brand.toLowerCase()}::${normalizeTitle(signals.title)}`
      : signals.title
        ? normalizeTitle(signals.title)
        : signals.url);
  return createHash("sha256").update(key).digest("hex").slice(0, 32);
}
