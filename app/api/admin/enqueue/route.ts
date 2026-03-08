import { NextResponse } from "next/server";
import { z } from "zod";

import { enqueueAdminJob, type AdminJobMode, type AdminJobName } from "@/lib/ingest/queue";

const requestSchema = z.object({
  job: z.enum(["universe", "universeV2", "fundamentals", "prices", "embeddings"]),
  mode: z.enum(["full", "delta"]).optional()
});

function ensureAuthorized(request: Request) {
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    throw new Error("Missing required environment variable: CRON_SECRET");
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  return token.length > 0 && token === expectedSecret;
}

function defaultMode(job: AdminJobName): AdminJobMode {
  if (job === "fundamentals") {
    return "delta";
  }

  return "delta";
}

export async function POST(request: Request) {
  if (!ensureAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await enqueueAdminJob({
      job: parsed.data.job,
      mode: parsed.data.mode ?? defaultMode(parsed.data.job),
      trigger: "api-admin-post"
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to enqueue job"
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  if (!ensureAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const jobParam = url.searchParams.get("job");

  try {
    if (jobParam) {
      const parsed = requestSchema.safeParse({
        job: jobParam,
        mode: url.searchParams.get("mode") ?? undefined
      });

      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
      }

      const singleResult = await enqueueAdminJob({
        job: parsed.data.job,
        mode: parsed.data.mode ?? defaultMode(parsed.data.job),
        trigger: "api-admin-get-single"
      });

      return NextResponse.json({ ok: true, results: [singleResult] });
    }

    const jobs: AdminJobName[] = ["universe", "fundamentals", "prices", "embeddings"];
    const results = [];

    for (const job of jobs) {
      const result = await enqueueAdminJob({
        job,
        mode: defaultMode(job),
        trigger: "api-admin-get-daily-cron"
      });
      results.push(result);
    }

    return NextResponse.json({ ok: true, results });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to enqueue jobs"
      },
      { status: 500 }
    );
  }
}
