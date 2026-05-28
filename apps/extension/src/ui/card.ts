import type { AnalysisResult } from "@deal-match/shared";

export interface CardMeta {
  title?: string;
  imageUrl?: string;
}

export type Tone = "buy" | "wait" | "neutral";

export function money(v: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(v);
  } catch {
    return `${currency} ${v.toFixed(2)}`;
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&"
      ? "&amp;"
      : c === "<"
        ? "&lt;"
        : c === ">"
          ? "&gt;"
          : c === '"'
            ? "&quot;"
            : "&#39;",
  );
}

/** Friendly, deal-focused headline — no buy/wait/neutral jargon. */
export function dealSummary(r: AnalysisResult): { tone: Tone; headline: string } {
  if (r.betterDeal) {
    return {
      tone: "wait",
      headline: `Save ${money(r.betterDeal.savings, r.betterDeal.currency)} at ${r.betterDeal.retailer}`,
    };
  }
  if (r.observations.length <= 1) {
    return { tone: "neutral", headline: "Only one price found" };
  }
  return { tone: "buy", headline: "You're seeing the best price" };
}

export function renderCard(r: AnalysisResult, meta: CardMeta = {}): string {
  const { tone, headline } = dealSummary(r);
  const sorted = [...r.observations].sort((a, b) => a.price - b.price);
  // "Best" is the cheapest NEW item — used/refurbished aren't like-for-like.
  const cheapestNew = sorted.find((o) => (o.condition ?? "new") === "new");

  const rows = sorted
    .map((o) => {
      const isBest = cheapestNew && o.url === cheapestNew.url && sorted.length > 1;
      const cond = o.condition ?? "new";
      const condTag =
        cond === "used"
          ? '<span class="dm-tag dm-used">Used</span>'
          : cond === "refurbished"
            ? '<span class="dm-tag dm-used">Refurb</span>'
            : "";
      return `<a class="dm-row${isBest ? " dm-best" : ""}" href="${esc(o.url)}" target="_blank" rel="noreferrer">
        <span class="dm-retailer">${esc(o.retailer)}${condTag}</span>
        <span class="dm-price">${money(o.price, o.currency)}${isBest ? '<span class="dm-tag">Best</span>' : ""}</span>
      </a>`;
    })
    .join("");

  const cta = r.betterDeal
    ? `<a class="dm-cta" href="${esc(r.betterDeal.url)}" target="_blank" rel="noreferrer">
         View deal at ${esc(r.betterDeal.retailer)} · ${money(r.betterDeal.price, r.betterDeal.currency)} →
       </a>`
    : "";

  const n = r.observations.length;

  return `
    <div class="dm-head">
      ${meta.imageUrl ? `<img class="dm-img" src="${esc(meta.imageUrl)}" alt="" referrerpolicy="no-referrer" />` : ""}
      ${meta.title ? `<div class="dm-title">${esc(meta.title)}</div>` : ""}
    </div>
    <div class="dm-headline dm-${tone}">${esc(headline)}</div>
    <p class="dm-reason">${esc(r.oneLineReason)}</p>
    ${cta}
    <div class="dm-prices">${rows}</div>
    <div class="dm-foot">Compared ${n} retailer${n === 1 ? "" : "s"}</div>
  `;
}
