import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }

  return "RPC health check failed";
}

export async function GET() {
  try {
    const admin = createServiceRoleClient();
    const { error } = await admin.rpc("suggest_instruments", {
      limit_count: 1,
      query_text: "india",
      requested_type: "etf"
    });

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: toErrorMessage(error)
      },
      { status: 500 }
    );
  }
}
