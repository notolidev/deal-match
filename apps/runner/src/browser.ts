import { chromium, type Browser, type BrowserContext } from "playwright";

let browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (browser && browser.isConnected()) return browser;
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  browser.on("disconnected", () => {
    browser = null;
  });
  return browser;
}

export async function withContext<T>(
  fn: (ctx: BrowserContext) => Promise<T>,
): Promise<T> {
  const b = await getBrowser();
  const ctx = await b.newContext({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    locale: "en-US",
    viewport: { width: 1280, height: 800 },
  });
  try {
    return await fn(ctx);
  } finally {
    await ctx.close().catch(() => {});
  }
}

export async function shutdownBrowser(): Promise<void> {
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
  }
}
