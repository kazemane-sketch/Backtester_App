import { NextResponse } from "next/server";

/**
 * Temporary debug endpoint to verify which env vars are set on Vercel.
 * Returns only presence (true/false), never the actual value.
 * DELETE THIS FILE after debugging.
 */
export async function GET() {
  const keys = [
    "SUPABASE_SERVICE_ROLE_KEY",
    "EODHD_API_KEY",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_MODEL_SEARCH",
    "ANTHROPIC_MODEL_BACKTEST",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  ];

  const result: Record<string, boolean> = {};
  for (const key of keys) {
    result[key] = !!process.env[key] && process.env[key]!.length > 0;
  }

  return NextResponse.json({
    env: result,
    nodeEnv: process.env.NODE_ENV
  });
}
