import type {
  AnalyzeRequest,
  AnalyzeResponse,
  ProductSignals,
} from "@deal-match/shared";

const API_BASE = __API_BASE__;
const LATEST_KEY = "deal-match:latest";

type Message =
  | { type: "analyze"; signals: ProductSignals; refresh?: boolean }
  | { type: "poll"; jobId: string }
  | {
      type: "set-latest";
      url: string;
      result: unknown;
      title?: string;
      imageUrl?: string;
    }
  | { type: "get-latest" };

chrome.runtime.onMessage.addListener(
  (msg: Message, _sender, sendResponse) => {
    if (msg.type === "analyze") {
      const body: AnalyzeRequest = { signals: msg.signals, refresh: msg.refresh };
      fetch(`${API_BASE}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
        .then(async (r) => (await r.json()) as AnalyzeResponse)
        .then((data) => sendResponse(data))
        .catch((err) => sendResponse({ error: String(err) }));
      return true;
    }

    if (msg.type === "poll") {
      fetch(`${API_BASE}/api/jobs/${encodeURIComponent(msg.jobId)}`)
        .then(async (r) => (await r.json()) as AnalyzeResponse)
        .then((data) => sendResponse(data))
        .catch((err) => sendResponse({ error: String(err) }));
      return true;
    }

    if (msg.type === "set-latest") {
      chrome.storage.session.set({
        [LATEST_KEY]: {
          url: msg.url,
          result: msg.result,
          title: msg.title,
          imageUrl: msg.imageUrl,
          at: Date.now(),
        },
      });
      sendResponse({ ok: true });
      return false;
    }

    if (msg.type === "get-latest") {
      chrome.storage.session.get(LATEST_KEY, (data) => {
        sendResponse(data[LATEST_KEY] ?? null);
      });
      return true;
    }

    return false;
  },
);
