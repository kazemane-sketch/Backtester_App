import { NextResponse } from "next/server";

import { runAiInstrumentSearch } from "@/lib/instruments/smart-search";
import { aiSearchRequestSchema } from "@/lib/schemas/instrument-search";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user && process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = aiSearchRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await runAiInstrumentSearch({
      supabase,
      query: parsed.data.query,
      type: parsed.data.type,
      limit: parsed.data.limit,
      euMode: parsed.data.eu_mode
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "AI instrument search failed"
      },
      { status: 500 }
    );
  }
}
