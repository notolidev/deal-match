import { NextRequest, NextResponse } from "next/server";
import { runnerAuthHeader, runnerBase } from "@/lib/runner";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const res = await fetch(
      `${runnerBase()}/jobs/${encodeURIComponent(id)}`,
      { headers: runnerAuthHeader() },
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { jobId: id, status: "error", error: message },
      { status: 502 },
    );
  }
}
