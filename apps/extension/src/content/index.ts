import type { AnalyzeResponse } from "@deal-match/shared";
import { extractProductSignals } from "./extract";
import { mountBadge, type BadgeHandle } from "./badge";

let badge: BadgeHandle | null = null;

chrome.runtime.onMessage.addListener(
  (msg: { type?: string; refresh?: boolean }, _sender, sendResponse) => {
    if (msg?.type === "start-analysis") {
      if (window.top !== window.self) return false; // skip iframes
      void startAnalysis(msg.refresh);
      sendResponse({ ok: true });
    }
    return false;
  },
);

async function startAnalysis(refresh?: boolean) {
  const signals = extractProductSignals();
  if (!badge) badge = mountBadge();
  if (!signals) {
    badge.setError("no product detected on this page");
    return;
  }
  badge.setPending();

  chrome.runtime.sendMessage(
    { type: "analyze", signals, refresh },
    (response?: AnalyzeResponse | { error: string }) => {
      if (chrome.runtime.lastError) {
        badge!.setError("bg unavailable");
        return;
      }
      if (!response || "error" in response) {
        badge!.setError(response?.error ?? "no response");
        return;
      }
      if (response.status === "ready" && response.result) {
        badge!.setResult(response.result);
        chrome.runtime.sendMessage({
          type: "set-latest",
          url: location.href,
          result: response.result,
        });
      } else if (response.status === "error") {
        badge!.setError(response.error ?? "error");
      }
    },
  );
}
