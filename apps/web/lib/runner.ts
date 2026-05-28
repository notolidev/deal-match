/**
 * The runner (on the VPS) now owns the full analysis pipeline. Vercel just
 * proxies to it. WEBWRIGHT_RUNNER_URL historically pointed at ".../run";
 * derive the base so we can also reach "/jobs/:id".
 */
export function runnerBase(): string {
  const url = process.env.WEBWRIGHT_RUNNER_URL;
  if (!url) throw new Error("WEBWRIGHT_RUNNER_URL is not set");
  return url.replace(/\/run\/?$/, "");
}

export function runnerAuthHeader(): Record<string, string> {
  return { Authorization: `Bearer ${process.env.WEBWRIGHT_RUNNER_TOKEN ?? ""}` };
}
