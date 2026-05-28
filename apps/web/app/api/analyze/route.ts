import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { AnalyzeResponse } from "@deal-match/shared";
import { analyzeNow, fastPath } from "@/lib/jobs";

export const runtime = "nodejs";
export const maxDuration = 60;

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

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid signals", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { signals } = parsed.data;

  const cached = await fastPath(signals);
  if (cached) {
    const res: AnalyzeResponse = {
      jobId: "cached",
      status: "ready",
      result: cached,
    };
    return NextResponse.json(res);
  }

  const result = await analyzeNow(signals);
  const res: AnalyzeResponse = {
    jobId: "sync",
    status: "ready",
    result,
  };
  return NextResponse.json(res);
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
