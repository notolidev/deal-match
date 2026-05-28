import type { AnalyzeResponse, ProductSignals } from "@deal-match/shared";
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
    (response?: AnalyzeResponse | { error: string }) => handle(response, signals),
  );
}

type Response = AnalyzeResponse | { error: string } | undefined;

function handle(response: Response, signals: ProductSignals, attempt = 0) {
  if (chrome.runtime.lastError) {
    badge!.setError("bg unavailable");
    return;
  }
  if (!response || "error" in response) {
    badge!.setError(response?.error ?? "no response");
    return;
  }
  if (response.status === "ready" && response.result) {
    finish(response.result, signals);
  } else if (response.status === "error") {
    badge!.setError(response.error ?? "error");
  } else {
    poll(response.jobId, signals, attempt);
  }
}

function poll(jobId: string, signals: ProductSignals, attempt: number) {
  if (attempt > 60) {
    badge!.setError("timeout");
    return;
  }
  setTimeout(() => {
    chrome.runtime.sendMessage({ type: "poll", jobId }, (response?: Response) =>
      handle(response, signals, attempt + 1),
    );
  }, 2000);
}

function finish(result: NonNullable<AnalyzeResponse["result"]>, signals: ProductSignals) {
  badge!.setResult(result, { title: signals.title, imageUrl: signals.imageUrl });
  chrome.runtime.sendMessage({
    type: "set-latest",
    url: location.href,
    result,
    title: signals.title,
    imageUrl: signals.imageUrl,
  });
}
