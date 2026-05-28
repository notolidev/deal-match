import { NextRequest, NextResponse } from "next/server";
import type { AnalyzeResponse } from "@deal-match/shared";
import { getJob } from "@/lib/jobs";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = getJob(id);
  if (!job) {
    return NextResponse.json(
      { error: "job not found" },
      { status: 404 },
    );
  }
  const res: AnalyzeResponse = {
    jobId: job.id,
    status: job.status,
    result: job.result,
    error: job.error,
  };
  return NextResponse.json(res);
}
