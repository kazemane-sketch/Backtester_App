import { NextResponse } from "next/server";

import { getInstrumentSuggestions } from "@/lib/instruments/smart-search";
import { suggestQuerySchema } from "@/lib/schemas/instrument-search";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = suggestQuerySchema.safeParse({
    q: searchParams.get("q"),
    type: searchParams.get("type") ?? undefined,
    limit: searchParams.get("limit") ?? undefined
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const locale = request.headers.get("x-vercel-ip-country") || request.headers.get("accept-language") || "en-US";

  try {
    const suggestions = await getInstrumentSuggestions({
      query: parsed.data.q,
      type: parsed.data.type,
      limit: parsed.data.limit,
      locale
    });

    return NextResponse.json(suggestions);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to suggest instruments"
      },
      { status: 500 }
    );
  }
}
