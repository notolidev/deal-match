import type { AnalyzeResponse } from "@deal-match/shared";
import { extractProductSignals } from "./extract";
import { mountBadge } from "./badge";

async function bootstrap() {
  if (window.top !== window.self) return; // skip iframes
  const signals = extractProductSignals();
  if (!signals) return;

  const badge = mountBadge(() => {
    chrome.runtime.sendMessage({ type: "open-popup" });
  });

  badge.setPending();

  chrome.runtime.sendMessage(
    { type: "analyze", signals },
    (response?: AnalyzeResponse | { error: string }) => {
      if (chrome.runtime.lastError) {
        badge.setError("bg unavailable");
        return;
      }
      if (!response || "error" in response) {
        badge.setError(response?.error ?? "no response");
        return;
      }
      if (response.status === "ready" && response.result) {
        badge.setResult(response.result);
        cacheForPopup(response.result);
      } else if (response.status === "error") {
        badge.setError(response.error ?? "error");
      }
    },
  );
}

function cacheForPopup(result: unknown) {
  chrome.runtime.sendMessage({ type: "set-latest", url: location.href, result });
}

if (document.readyState === "complete") {
  void bootstrap();
} else {
  window.addEventListener("load", () => void bootstrap(), { once: true });
}
