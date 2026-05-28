import type { AnalysisResult } from "@deal-match/shared";
import { type CardMeta, type Tone, dealSummary, renderCard } from "../ui/card";

const TONE_COLOR: Record<Tone | "pending" | "error", string> = {
  buy: "#1aa260",
  wait: "#d93025",
  neutral: "#b48a00",
  pending: "#444",
  error: "#777",
};

export interface BadgeHandle {
  setPending(): void;
  setResult(result: AnalysisResult, meta?: CardMeta): void;
  setError(msg: string): void;
  destroy(): void;
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
    * { box-sizing: border-box; }
    .wrap {
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      display: flex; flex-direction: column; align-items: flex-end; gap: 10px;
    }
    .badge {
      font: 600 13px/1 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      color: #fff; background: ${TONE_COLOR.pending};
      padding: 9px 13px; border-radius: 999px; cursor: pointer;
      box-shadow: 0 4px 14px rgba(0,0,0,0.25);
      display: inline-flex; align-items: center; gap: 7px;
      user-select: none; transition: background 200ms ease; max-width: 360px;
    }
    .label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #fff; opacity: 0.85; flex: none; }
    .badge.pending { cursor: default; }
    .badge.pending .dot { animation: pulse 1.2s ease-in-out infinite; }
    @keyframes pulse {
      0%,100% { opacity: 0.4; transform: scale(0.9); }
      50% { opacity: 1; transform: scale(1.1); }
    }

    .panel {
      width: 340px; background: #fff; color: #16181d;
      border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,0.22);
      padding: 16px; display: none; overflow: hidden;
    }
    .panel.open { display: block; }

    .dm-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
    .dm-img { width: 44px; height: 44px; object-fit: contain; border-radius: 8px; background: #f4f5f7; flex: none; }
    .dm-title { font-size: 13px; font-weight: 600; line-height: 1.35; color: #16181d;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

    .dm-headline { font-size: 17px; font-weight: 700; letter-spacing: -0.01em; }
    .dm-headline.dm-buy { color: #1aa260; }
    .dm-headline.dm-wait { color: #d93025; }
    .dm-headline.dm-neutral { color: #b48a00; }
    .dm-reason { margin: 4px 0 14px; font-size: 13px; line-height: 1.45; color: #5b6066; }

    .dm-cta {
      display: block; text-align: center; text-decoration: none;
      background: #16181d; color: #fff; font-weight: 600; font-size: 13px;
      padding: 11px 14px; border-radius: 10px; margin-bottom: 14px;
      transition: background 150ms ease;
    }
    .dm-cta:hover { background: #000; }

    .dm-prices { border-top: 1px solid #ecedef; }
    .dm-row { display: flex; justify-content: space-between; align-items: center;
      gap: 12px; padding: 9px 0; border-bottom: 1px solid #f3f4f6; font-size: 13px;
      text-decoration: none; color: inherit; cursor: pointer; }
    .dm-row:last-child { border-bottom: none; }
    .dm-row:hover { background: #f7f8fa; margin: 0 -16px; padding: 9px 16px; }
    .dm-row.dm-best { margin: 0 -16px; padding: 9px 16px; background: #f0faf3; }
    .dm-retailer { color: #5b6066; }
    .dm-price { font-weight: 600; color: #1558d6; display: inline-flex; align-items: center; gap: 7px; }
    .dm-tag { background: #1aa260; color: #fff; font-size: 10px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.04em; padding: 2px 6px; border-radius: 5px; margin-left: 6px; }
    .dm-tag.dm-used { background: #8a8f96; }
    .dm-foot { margin-top: 12px; font-size: 11px; color: #9aa0a6; }
  `;

  const wrap = document.createElement("div");
  wrap.className = "wrap";

  const panel = document.createElement("div");
  panel.className = "panel";

  const el = document.createElement("div");
  el.className = "badge pending";
  el.innerHTML = `<span class="dot"></span><span class="label">Analysing…</span>`;

  wrap.append(panel, el);
  shadow.append(style, wrap);
  document.documentElement.appendChild(host);

  const label = el.querySelector<HTMLSpanElement>(".label")!;

  function paintPill(tone: Tone | "pending" | "error", text: string) {
    el.classList.toggle("pending", tone === "pending");
    el.style.background = TONE_COLOR[tone];
    label.textContent = text;
  }

  el.addEventListener("click", () => {
    if (el.classList.contains("pending")) return;
    panel.classList.toggle("open");
  });

  return {
    setPending: () => {
      panel.classList.remove("open");
      paintPill("pending", "Analysing…");
    },
    setResult: (r, meta) => {
      const { tone, headline } = dealSummary(r);
      paintPill(tone, headline);
      panel.innerHTML = renderCard(r, meta);
      panel.classList.add("open");
    },
    setError: (msg) => paintPill("error", `Unavailable (${msg})`.slice(0, 80)),
    destroy: () => host.remove(),
  };
}
