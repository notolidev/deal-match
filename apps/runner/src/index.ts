import express from "express";
import { z } from "zod";
import type { AnalyzeResponse } from "@deal-match/shared";
import { getJob, startAnalysis } from "./jobs.js";
import { shutdownBrowser } from "./browser.js";

const PORT = Number(process.env.PORT ?? 8080);
const TOKEN = process.env.RUNNER_TOKEN;

if (!TOKEN) {
  console.warn(
    "WARN: RUNNER_TOKEN is not set — /run will reject every request. Set this env var to your shared secret.",
  );
}

const signalsSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  brand: z.string().optional(),
  upc: z.string().optional(),
  gtin: z.string().optional(),
  sku: z.string().optional(),
  price: z.number().optional(),
  currency: z.string().optional(),
  imageUrl: z.string().optional(),
  jsonLd: z.unknown().optional(),
  pageTextSnippet: z.string().optional(),
});

const bodySchema = z.object({
  signals: signalsSchema,
  refresh: z.boolean().optional(),
});

const app = express();
app.use(express.json({ limit: "256kb" }));

function authed(req: express.Request): boolean {
  const auth = req.header("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return !!TOKEN && provided === TOKEN;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Start an analysis. Returns immediately with a jobId (or a cached result),
// then runs the full pipeline in the background — no request-time limit here,
// unlike Vercel functions.
app.post("/run", async (req, res) => {
  if (!authed(req)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "invalid body", details: parsed.error.flatten() });
    return;
  }

  try {
    const job = await startAnalysis(parsed.data.signals, !!parsed.data.refresh);
    const out: AnalyzeResponse = {
      jobId: job.id,
      status: job.status,
      result: job.result,
    };
    res.json(out);
  } catch (err) {
    console.error("startAnalysis failed", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// Poll a running job.
app.get("/jobs/:id", (req, res) => {
  if (!authed(req)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: "job not found" });
    return;
  }
  const out: AnalyzeResponse = {
    jobId: job.id,
    status: job.status,
    result: job.result,
    error: job.error,
  };
  res.json(out);
});

const server = app.listen(PORT, () => {
  console.log(`runner listening on :${PORT}`);
});

async function shutdown(signal: string) {
  console.log(`received ${signal}, shutting down`);
  server.close();
  await shutdownBrowser();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
