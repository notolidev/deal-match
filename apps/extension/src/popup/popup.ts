import type { AnalysisResult } from "@deal-match/shared";
import { renderCard } from "../ui/card";

interface LatestEntry {
  url: string;
  result: AnalysisResult;
  title?: string;
  imageUrl?: string;
  at: number;
}

async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function init() {
  const root = document.getElementById("state")!;
  const button = document.getElementById("analyse") as HTMLButtonElement;
  const tab = await activeTab();

  let refresh = false;
  chrome.runtime.sendMessage({ type: "get-latest" }, (entry: LatestEntry | null) => {
    if (entry && tab?.url && entry.url === tab.url) {
      root.innerHTML = renderCard(entry.result, {
        title: entry.title,
        imageUrl: entry.imageUrl,
      });
      button.textContent = "Re-analyse this page";
      refresh = true; // already have a result for this page — force a fresh run
    } else {
      root.innerHTML =
        '<p class="empty">Click below to check whether this is a good deal.</p>';
      button.textContent = "Analyse this page";
    }
  });

  button.addEventListener("click", () => {
    if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, { type: "start-analysis", refresh });
    window.close();
  });
}

void init();
