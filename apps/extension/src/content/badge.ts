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

export function mountBadge(onClick: () => void): BadgeHandle {
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
    }
    .dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: #fff; opacity: 0.85;
    }
    .badge.pending .dot { animation: pulse 1.2s ease-in-out infinite; }
    @keyframes pulse {
      0%, 100% { opacity: 0.4; transform: scale(0.9); }
      50%      { opacity: 1;   transform: scale(1.1); }
    }
  `;
  const el = document.createElement("div");
  el.className = "badge pending";
  el.innerHTML = `<span class="dot"></span><span class="label">${LABELS.pending}</span>`;
  el.addEventListener("click", onClick);

  shadow.append(style, el);
  document.documentElement.appendChild(host);

  const label = el.querySelector<HTMLSpanElement>(".label")!;

  function paint(state: Verdict | "pending" | "error", text?: string) {
    el.classList.toggle("pending", state === "pending");
    el.style.background = COLORS[state];
    label.textContent = text ?? LABELS[state];
  }

  return {
    setPending: () => paint("pending"),
    setResult: (r) => {
      paint(r.verdict, `${LABELS[r.verdict]} · ${r.oneLineReason}`.slice(0, 80));
    },
    setError: (msg) => paint("error", `${LABELS.error} (${msg})`.slice(0, 80)),
    destroy: () => host.remove(),
  };
}
