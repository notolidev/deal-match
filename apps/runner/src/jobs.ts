import { randomUUID } from "node:crypto";
import type {
  AnalysisResult,
  AnalyzeStatus,
  ProductSignals,
} from "@deal-match/shared";
import {
  getCached,
  upsertProduct,
  writeAnalysis,
  writeObservations,
} from "./cache.js";
import { findDeals } from "./agent.js";
import { synthesizeVerdict } from "./verdict.js";

export interface JobRecord {
  id: string;
  status: AnalyzeStatus;
  result?: AnalysisResult;
  error?: string;
  startedAt: number;
}

const jobs = new Map<string, JobRecord>();
const TTL_MS = 15 * 60 * 1000;

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

/** Cache hit → ready result inline. Otherwise start a background job. */
export async function startAnalysis(
  signals: ProductSignals,
  refresh: boolean,
): Promise<JobRecord> {
  gc();

  if (!refresh) {
    const cached = await safeCacheRead(signals);
    if (cached?.fresh) {
      return {
        id: "cached",
        status: "ready",
        result: cached.result,
        startedAt: Date.now(),
      };
    }
  }

  const record: JobRecord = {
    id: randomUUID(),
    status: "pending",
    startedAt: Date.now(),
  };
  jobs.set(record.id, record);

  void run(record, signals).catch((err) => {
    console.error("analysis job failed", err);
    record.status = "error";
    record.error = err instanceof Error ? err.message : String(err);
  });

  return record;
}

async function run(record: JobRecord, signals: ProductSignals) {
  const productId = await safeUpsert(signals);
  const observations = await findDeals(signals);
  if (productId) await safeWriteObservations(productId, observations);
  const result = await synthesizeVerdict(signals, observations);
  if (productId) await safeWriteAnalysis(productId, result);
  record.result = result;
  record.status = "ready";
}

async function safeCacheRead(signals: ProductSignals) {
  try {
    return await getCached(signals);
  } catch (err) {
    console.warn("cache read failed", err);
    return null;
  }
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
