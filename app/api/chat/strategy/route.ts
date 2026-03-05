import { NextResponse } from "next/server";

import { generateBacktestConfigFromChat } from "@/lib/ai/structured-output";
import { strategyChatRequestSchema } from "@/lib/schemas/chat";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = strategyChatRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const config = await generateBacktestConfigFromChat({
      messages: parsed.data.messages,
      maxRetries: 2
    });

    return NextResponse.json({ config });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to generate strategy config"
      },
      { status: 500 }
    );
  }
}
