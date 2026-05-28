import { randomUUID } from "node:crypto";
import type {
  AnalysisResult,
  AnalyzeStatus,
  ProductSignals,
} from "@deal-match/shared";
import { getCached, upsertProduct, writeAnalysis, writeObservations } from "./cache";
import { findDeals } from "./webwright";
import { synthesizeVerdict } from "./verdict";

interface JobRecord {
  id: string;
  status: AnalyzeStatus;
  result?: AnalysisResult;
  error?: string;
  startedAt: number;
}

const jobs = new Map<string, JobRecord>();
const TTL_MS = 10 * 60 * 1000;

function gc() {
  const now = Date.now();
  for (const [id, j] of jobs) {
    if (now - j.startedAt > TTL_MS) jobs.delete(id);
  }
}

export function getJob(id: string): JobRecord | undefined {
  gc();
  return jobs.get(id);
}

export function startJob(signals: ProductSignals): JobRecord {
  gc();
  const id = randomUUID();
  const record: JobRecord = { id, status: "pending", startedAt: Date.now() };
  jobs.set(id, record);

  void run(record, signals).catch((err) => {
    console.error("analyze job failed", err);
    record.status = "error";
    record.error = err instanceof Error ? err.message : String(err);
  });

  return record;
}

async function run(record: JobRecord, signals: ProductSignals) {
  const productId = await safeUpsert(signals);
  const observations = await findDeals(signals);
  if (productId) {
    await safeWriteObservations(productId, observations);
  }
  const result = await synthesizeVerdict(signals, observations);
  if (productId) {
    await safeWriteAnalysis(productId, result);
  }
  record.result = result;
  record.status = "ready";
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
