import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runnerAuthHeader, runnerBase } from "@/lib/runner";

export const runtime = "nodejs";
export const maxDuration = 30;

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

  try {
    const res = await fetch(`${runnerBase()}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...runnerAuthHeader() },
      body: JSON.stringify(parsed.data),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { jobId: "error", status: "error", error: message },
      { status: 502 },
    );
  }
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
