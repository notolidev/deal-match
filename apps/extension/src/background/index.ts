import type {
  AnalyzeRequest,
  AnalyzeResponse,
  ProductSignals,
} from "@deal-match/shared";

const API_BASE = __API_BASE__;
const LATEST_KEY = "deal-match:latest";

type Message =
  | { type: "analyze"; signals: ProductSignals }
  | { type: "set-latest"; url: string; result: unknown }
  | { type: "get-latest" }
  | { type: "open-popup" };

chrome.runtime.onMessage.addListener(
  (msg: Message, _sender, sendResponse) => {
    if (msg.type === "analyze") {
      const body: AnalyzeRequest = { signals: msg.signals };
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

    if (msg.type === "set-latest") {
      chrome.storage.session.set({
        [LATEST_KEY]: { url: msg.url, result: msg.result, at: Date.now() },
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
