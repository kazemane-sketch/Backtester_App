import { NextResponse } from "next/server";

import { routeAndGenerateConfig, type EngineType } from "@/lib/ai/engine-router";
import { strategyChatRequestSchema } from "@/lib/schemas/chat";
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
  const parsed = strategyChatRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Optional: allow caller to force a specific engine
  const forceEngine = (body.forceEngine as EngineType) || undefined;

  try {
    const result = await routeAndGenerateConfig({
      messages: parsed.data.messages,
      forceEngine
    });

    return NextResponse.json({
      engine: result.engine,
      config: result.config,
      reasoning: result.reasoning
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to generate strategy config"
      },
      { status: 500 }
    );
  }
}
