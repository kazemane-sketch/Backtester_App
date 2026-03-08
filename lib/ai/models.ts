/**
 * Centralized Anthropic model configuration.
 *
 * Two tiers:
 *
 * 1. SEARCH model (Haiku) — fast, cheap, latency-sensitive
 *    Used by: ETF semantic search, query translation, filter extraction,
 *    search explanation, instrument discovery.
 *    Env: ANTHROPIC_MODEL_SEARCH  (default: "claude-haiku-4-5")
 *
 * 2. BACKTEST model (Opus → Sonnet fallback) — strong reasoning
 *    Used by: strategy chat, engine router classification, config generation,
 *    backtest parameter reasoning, portfolio logic.
 *    Env: ANTHROPIC_MODEL_BACKTEST (default: "claude-opus-4-6")
 *
 * Embeddings remain on OpenAI (text-embedding-3-small) — unchanged.
 */

import Anthropic from "@anthropic-ai/sdk";

// ─── Model IDs ───────────────────────────────────────────────────────────────

/** Lightweight model for search / discovery flows (Haiku) */
export function getSearchModel(): string {
  return process.env.ANTHROPIC_MODEL_SEARCH || "claude-haiku-4-5";
}

/**
 * Strong reasoning model for backtest / strategy flows (Opus → Sonnet).
 * Priority: claude-opus-4-6 → claude-sonnet-4-6
 */
export function getBacktestModel(): string {
  return process.env.ANTHROPIC_MODEL_BACKTEST || "claude-opus-4-6";
}

// ─── Client Factory ──────────────────────────────────────────────────────────

let _client: Anthropic | null = null;

/** Singleton Anthropic client. Uses ANTHROPIC_API_KEY env var. */
export function getAnthropicClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("Missing required environment variable: ANTHROPIC_API_KEY");
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

/**
 * Call Anthropic messages API and return the text response.
 * Handles the system prompt + messages pattern used across the codebase.
 *
 * @param model - model ID from getSearchModel() or getBacktestModel()
 * @param systemPrompt - system-level instructions
 * @param messages - user/assistant conversation turns
 * @param maxTokens - max tokens in response (default 4096)
 */
export async function callAnthropic(args: {
  model: string;
  systemPrompt: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: args.model,
    max_tokens: args.maxTokens ?? 4096,
    temperature: args.temperature ?? 0,
    system: args.systemPrompt,
    messages: args.messages
  });

  // Extract text from response content blocks
  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock?.text ?? "";
}

/**
 * Call Anthropic and parse the response as JSON.
 * Wraps the prompt to enforce JSON-only output.
 */
export async function callAnthropicJson<T = unknown>(args: {
  model: string;
  systemPrompt: string;
  messages: ChatMessage[];
  maxTokens?: number;
}): Promise<T> {
  const raw = await callAnthropic({
    ...args,
    // Enforce JSON output via system prompt suffix
    systemPrompt: args.systemPrompt + "\n\nIMPORTANT: Return ONLY valid JSON. No markdown, no code fences, no explanation text."
  });

  // Strip any markdown code fence the model might add despite instructions
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  return JSON.parse(cleaned) as T;
}
