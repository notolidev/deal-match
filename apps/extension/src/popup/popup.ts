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

async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function renderResult(r: AnalysisResult) {
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
  return `
    <div class="verdict ${r.verdict}">${escape(r.verdict)}</div>
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

async function init() {
  const root = document.getElementById("state")!;
  const button = document.getElementById("analyse") as HTMLButtonElement;
  const tab = await activeTab();

  chrome.runtime.sendMessage({ type: "get-latest" }, (entry: LatestEntry | null) => {
    if (entry && tab?.url && entry.url === tab.url) {
      root.innerHTML = renderResult(entry.result);
      button.textContent = "Re-analyse this page";
    } else {
      root.innerHTML =
        '<p class="empty">Click below to check whether this is a good deal.</p>';
      button.textContent = "Analyse this page";
    }
  });

  button.addEventListener("click", () => {
    if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, { type: "start-analysis" });
    window.close();
  });
}

void init();
