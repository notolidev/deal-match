import express from "express";
import { z } from "zod";
import { findDeals } from "./agent.js";
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

const bodySchema = z.object({ signals: signalsSchema });

const app = express();
app.use(express.json({ limit: "256kb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/run", async (req, res) => {
  const auth = req.header("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!TOKEN || provided !== TOKEN) {
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
    const observations = await findDeals(parsed.data.signals);
    res.json({ observations });
  } catch (err) {
    console.error("findDeals failed", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
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
