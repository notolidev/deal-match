import type { AnalysisResult, Verdict } from "@deal-match/shared";

const COLORS: Record<Verdict | "pending" | "error", string> = {
  buy: "#1aa260",
  wait: "#d93025",
  neutral: "#b48a00",
  pending: "#444",
  error: "#777",
};

const LABELS: Record<Verdict | "pending" | "error", string> = {
  buy: "Good deal",
  wait: "Wait",
  neutral: "Average",
  pending: "Analyzing…",
  error: "Unavailable",
};

export interface BadgeHandle {
  setPending(): void;
  setResult(result: AnalysisResult): void;
  setError(msg: string): void;
  destroy(): void;
}

function fmt(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(price);
  } catch {
    return `${currency} ${price.toFixed(2)}`;
  }
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

export function mountBadge(): BadgeHandle {
  const host = document.createElement("div");
  host.id = "deal-match-badge-host";
  host.style.all = "initial";
  host.style.position = "fixed";
  host.style.bottom = "16px";
  host.style.right = "16px";
  host.style.zIndex = "2147483647";

  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    .wrap { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
    .badge {
      font: 600 13px/1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      color: #fff;
      background: ${COLORS.pending};
      padding: 8px 12px;
      border-radius: 999px;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(0,0,0,0.25);
      display: inline-flex;
      align-items: center;
      gap: 6px;
      user-select: none;
      transition: background 200ms ease;
      max-width: 360px;
    }
    .label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #fff; opacity: 0.85; flex: none; }
    .badge.pending { cursor: default; }
    .badge.pending .dot { animation: pulse 1.2s ease-in-out infinite; }
    @keyframes pulse {
      0%, 100% { opacity: 0.4; transform: scale(0.9); }
      50%      { opacity: 1;   transform: scale(1.1); }
    }
    .panel {
      font: 400 13px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      color: #1a1a1a;
      background: #fff;
      width: 320px;
      border-radius: 12px;
      box-shadow: 0 8px 28px rgba(0,0,0,0.28);
      padding: 14px 16px;
      box-sizing: border-box;
      display: none;
    }
    .panel.open { display: block; }
    .panel .verdict {
      font-weight: 700; text-transform: capitalize; font-size: 15px; margin-bottom: 2px;
    }
    .panel .verdict.buy { color: ${COLORS.buy}; }
    .panel .verdict.wait { color: ${COLORS.wait}; }
    .panel .verdict.neutral { color: ${COLORS.neutral}; }
    .panel .reason { color: #444; margin: 0 0 10px; }
    .panel .row {
      display: flex; justify-content: space-between; gap: 12px;
      padding: 6px 0; border-top: 1px solid #eee;
    }
    .panel .row.better { background: #f0faf3; margin: 0 -16px; padding: 6px 16px; }
    .panel .retailer { color: #555; }
    .panel .price a { color: #1558d6; text-decoration: none; }
    .panel .price a:hover { text-decoration: underline; }
  `;

  const wrap = document.createElement("div");
  wrap.className = "wrap";

  const panel = document.createElement("div");
  panel.className = "panel";

  const el = document.createElement("div");
  el.className = "badge pending";
  el.innerHTML = `<span class="dot"></span><span class="label">${LABELS.pending}</span>`;

  wrap.append(panel, el);
  shadow.append(style, wrap);
  document.documentElement.appendChild(host);

  const label = el.querySelector<HTMLSpanElement>(".label")!;

  function paint(state: Verdict | "pending" | "error", text?: string) {
    el.classList.toggle("pending", state === "pending");
    el.style.background = COLORS[state];
    label.textContent = text ?? LABELS[state];
  }

  function renderPanel(r: AnalysisResult) {
    const currency = r.currency ?? "USD";
    const rows: string[] = [];
    for (const obs of r.observations) {
      const isBetter = r.betterDeal && obs.url === r.betterDeal.url;
      rows.push(
        `<div class="row${isBetter ? " better" : ""}">
           <span class="retailer">${escape(obs.retailer)}</span>
           <span class="price"><a href="${escape(obs.url)}" target="_blank" rel="noreferrer">${fmt(obs.price, obs.currency)}</a></span>
         </div>`,
      );
    }
    panel.innerHTML = `
      <div class="verdict ${r.verdict}">${escape(r.verdict)}</div>
      <p class="reason">${escape(r.oneLineReason)}</p>
      ${r.currentPrice != null ? `<div class="row"><span class="retailer">Current price</span><span class="price">${fmt(r.currentPrice, currency)}</span></div>` : ""}
      ${r.ninetyDayLow != null ? `<div class="row"><span class="retailer">Cheapest seen</span><span class="price">${fmt(r.ninetyDayLow, currency)}</span></div>` : ""}
      ${rows.join("")}
    `;
  }

  el.addEventListener("click", () => {
    if (el.classList.contains("pending")) return;
    panel.classList.toggle("open");
  });

  return {
    setPending: () => {
      panel.classList.remove("open");
      paint("pending");
    },
    setResult: (r) => {
      paint(r.verdict, `${LABELS[r.verdict]} · ${r.oneLineReason}`.slice(0, 80));
      renderPanel(r);
      panel.classList.add("open");
    },
    setError: (msg) => paint("error", `${LABELS.error} (${msg})`.slice(0, 80)),
    destroy: () => host.remove(),
  };
}
