import type { AnalysisResult, ProductSignals } from "@deal-match/shared";
import { getCached, upsertProduct, writeAnalysis, writeObservations } from "./cache";
import { findDeals } from "./webwright";
import { synthesizeVerdict } from "./verdict";

/**
 * Runs the full analysis inline and returns the verdict. The /api/analyze
 * route awaits this directly — Vercel functions are ephemeral, so
 * fire-and-forget background jobs + polling don't survive across invocations.
 */
export async function analyzeNow(
  signals: ProductSignals,
): Promise<AnalysisResult> {
  const productId = await safeUpsert(signals);
  const observations = await findDeals(signals);
  if (productId) {
    await safeWriteObservations(productId, observations);
  }
  const result = await synthesizeVerdict(signals, observations);
  if (productId) {
    await safeWriteAnalysis(productId, result);
  }
  return result;
}

export async function fastPath(
  signals: ProductSignals,
): Promise<AnalysisResult | null> {
  try {
    const cached = await getCached(signals);
    if (cached?.fresh) return cached.result;
  } catch {
    // DB not provisioned yet — fall through to cold path
  }
  return null;
}

async function safeUpsert(signals: ProductSignals): Promise<string | null> {
  try {
    return await upsertProduct(signals);
  } catch (err) {
    console.warn("DB unavailable, skipping persistence", err);
    return null;
  }
}

async function safeWriteObservations(
  productId: string,
  observations: Awaited<ReturnType<typeof findDeals>>,
) {
  try {
    await writeObservations(productId, observations);
  } catch (err) {
    console.warn("writeObservations failed", err);
  }
}

async function safeWriteAnalysis(productId: string, result: AnalysisResult) {
  try {
    await writeAnalysis(productId, result);
  } catch (err) {
    console.warn("writeAnalysis failed", err);
  }
}
