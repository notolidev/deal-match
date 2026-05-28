import type { AnalysisResult } from "@deal-match/shared";

interface LatestEntry {
  url: string;
  result: AnalysisResult;
  at: number;
}

function fmt(price: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(price);
  } catch {
    return `${currency} ${price.toFixed(2)}`;
  }
}

function render(entry: LatestEntry | null) {
  const root = document.getElementById("state")!;
  if (!entry) {
    root.innerHTML =
      '<p class="empty">Open a product page and the badge will appear in the bottom-right. Click it to see the breakdown here.</p>';
    return;
  }
  const r = entry.result;
  const currency = r.currency ?? "USD";
  const rows: string[] = [];
  for (const obs of r.observations) {
    rows.push(
      `<div class="row${r.betterDeal && obs.url === r.betterDeal.url ? " better" : ""}">
         <span class="retailer">${escape(obs.retailer)}</span>
         <span class="price"><a href="${escape(obs.url)}" target="_blank" rel="noreferrer">${fmt(obs.price, obs.currency)}</a></span>
       </div>`,
    );
  }
  root.innerHTML = `
    <div class="verdict ${r.verdict}">${r.verdict}</div>
    <p class="reason">${escape(r.oneLineReason)}</p>
    ${r.currentPrice != null ? `<div class="row"><span class="retailer">Current price</span><span class="price">${fmt(r.currentPrice, currency)}</span></div>` : ""}
    ${r.ninetyDayLow != null ? `<div class="row"><span class="retailer">Cheapest seen</span><span class="price">${fmt(r.ninetyDayLow, currency)}</span></div>` : ""}
    ${rows.join("")}
  `;
}

function escape(s: string): string {
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

chrome.runtime.sendMessage({ type: "get-latest" }, (entry: LatestEntry | null) => {
  render(entry);
});
