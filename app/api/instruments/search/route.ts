import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveInstrumentsBySearch } from "@/lib/instruments/resolve-instrument";
import type { DataProvider } from "@/lib/market-data/types";

export async function GET(request: Request) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q || q.length < 1) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  const provider = (searchParams.get("provider")?.toUpperCase() as DataProvider | null) ?? "EODHD";
  const locale = request.headers.get("x-vercel-ip-country") || request.headers.get("accept-language") || "en-US";

  try {
    const result = await resolveInstrumentsBySearch({
      query: q,
      locale,
      dataProvider: provider
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search failed" },
      { status: 500 }
    );
  }
}
