/**
 * AI Engine Router
 *
 * Two-stage approach:
 * 1. Intent Classification: Analyze user message → determine engine (A, B, or C)
 * 2. Config Generation: Route to engine-specific prompt + Zod schema
 *
 * Uses Anthropic Opus/Sonnet (ANTHROPIC_MODEL_BACKTEST) for strong reasoning.
 */

import { callAnthropicJson, getBacktestModel } from "@/lib/ai/models";
import {
  BACKTEST_CONFIG_SYSTEM_PROMPT,
  buildCorrectionPrompt
} from "@/lib/ai/backtest-config-prompt";
import {
  ENGINE_B_SYSTEM_PROMPT,
  buildEngineBCorrectionPrompt
} from "@/lib/ai/prompts/engine-b";
import {
  ENGINE_C_SYSTEM_PROMPT,
  buildEngineCCorrectionPrompt
} from "@/lib/ai/prompts/engine-c";
import { backtestConfigSchema, type BacktestConfig } from "@/lib/schemas/backtest-config";
import { engineBConfigSchema, type EngineBConfig } from "@/lib/schemas/engine-b-config";
import { engineCConfigSchema, type EngineCConfig } from "@/lib/schemas/engine-c-config";

export type EngineType = "A" | "B" | "C";

export type RoutedConfig =
  | { engine: "A"; config: BacktestConfig }
  | { engine: "B"; config: EngineBConfig }
  | { engine: "C"; config: EngineCConfig };

type Message = {
  role: "user" | "assistant" | "system";
  content: string;
};

// ─── Intent Classification ──────────────────────────────────────────────────

const INTENT_SYSTEM_PROMPT = `You are a backtest strategy classifier. Given a user's message describing a trading or investment strategy, classify which backtesting engine is most appropriate.

Return JSON only: {"engine": "A" | "B" | "C", "reasoning": "brief explanation"}

Engine A — Fixed-Weight Portfolio Allocation:
- User specifies exact assets with fixed percentage weights
- Buy and hold with optional rebalancing
- Examples: "60/40 SPY/TLT", "equal weight portfolio of 5 ETFs", "backtest VWCE buy and hold"

Engine B — Tactical Rule-Based Allocation:
- User describes rules for dynamically selecting assets from a universe
- Momentum, trend-following, or factor-based rotation strategies
- Filtering and ranking based on technical indicators
- Examples: "select ETFs above 10-month SMA, weight by inverse volatility", "dual momentum between stocks and bonds", "rotate into top 3 sectors by 12-month momentum"

Engine C — Single-Asset Trading:
- User describes entry/exit signals for trading ONE specific asset
- Technical analysis: SMA crossovers, RSI, breakouts, stop losses
- Examples: "buy AAPL when RSI < 30, sell when RSI > 70", "golden cross strategy on SPY", "breakout above 20-day high with trailing stop"

When in doubt:
- Multiple assets with fixed weights → Engine A
- Multiple assets with dynamic selection rules → Engine B
- Single asset with entry/exit conditions → Engine C
- Simple "backtest X" without rules → Engine A`;

/** Classify strategy intent — uses Opus/Sonnet (ANTHROPIC_MODEL_BACKTEST) */
export async function classifyEngine(messages: Message[]): Promise<{
  engine: EngineType;
  reasoning: string;
}> {
  try {
    // Filter to only user/assistant messages (Anthropic doesn't accept system in messages)
    const chatMessages = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    // Ensure at least one user message
    if (chatMessages.length === 0) {
      return { engine: "A", reasoning: "No user messages, defaulting to Engine A" };
    }

    const parsed = await callAnthropicJson<{ engine: string; reasoning: string }>({
      model: getBacktestModel(),
      systemPrompt: INTENT_SYSTEM_PROMPT,
      messages: chatMessages
    });

    const engine = (["A", "B", "C"].includes(parsed.engine) ? parsed.engine : "A") as EngineType;
    return { engine, reasoning: parsed.reasoning ?? "" };
  } catch {
    return { engine: "A", reasoning: "Failed to parse classification, defaulting to Engine A" };
  }
}

// ─── Config Generation ──────────────────────────────────────────────────────

/** Generate config with retry — uses Opus/Sonnet (ANTHROPIC_MODEL_BACKTEST) */
async function generateWithRetry<T>(args: {
  messages: Message[];
  systemPrompt: string;
  schema: { parse: (data: unknown) => T };
  buildCorrection: (error: string) => string;
  maxRetries?: number;
}): Promise<T> {
  const model = getBacktestModel();
  const maxRetries = args.maxRetries ?? 2;
  let attempt = 0;
  let systemPrompt = args.systemPrompt;

  // Filter to only user/assistant messages
  const chatMessages = args.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  while (attempt <= maxRetries) {
    try {
      const raw = await callAnthropicJson<unknown>({
        model,
        systemPrompt,
        messages: chatMessages
      });

      return args.schema.parse(raw);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Invalid JSON";
      console.error(`[engine-router] Validation failed (attempt ${attempt + 1}/${maxRetries + 1}):`, reason);
      // Append correction to system prompt for next attempt
      systemPrompt = args.systemPrompt + "\n\n" + args.buildCorrection(reason);
      attempt += 1;
    }
  }

  throw new Error("Unable to generate valid config after retries");
}

// ─── Main Router ────────────────────────────────────────────────────────────

/**
 * Classify the user's strategy intent and generate the appropriate engine config.
 * Uses Anthropic Opus/Sonnet for both classification and generation.
 */
export async function routeAndGenerateConfig(args: {
  messages: Message[];
  forceEngine?: EngineType;
}): Promise<RoutedConfig & { reasoning: string }> {
  // Step 1: Classify (or use forced engine)
  let engine: EngineType;
  let reasoning: string;

  if (args.forceEngine) {
    engine = args.forceEngine;
    reasoning = `Engine ${engine} forced by user`;
  } else {
    const classification = await classifyEngine(args.messages);
    engine = classification.engine;
    reasoning = classification.reasoning;
  }

  // Step 2: Generate config for the classified engine
  switch (engine) {
    case "A": {
      const config = await generateWithRetry({
        messages: args.messages,
        systemPrompt: BACKTEST_CONFIG_SYSTEM_PROMPT,
        schema: backtestConfigSchema,
        buildCorrection: buildCorrectionPrompt
      });
      return { engine: "A", config, reasoning };
    }

    case "B": {
      const config = await generateWithRetry({
        messages: args.messages,
        systemPrompt: ENGINE_B_SYSTEM_PROMPT,
        schema: engineBConfigSchema,
        buildCorrection: buildEngineBCorrectionPrompt
      });
      return { engine: "B", config, reasoning };
    }

    case "C": {
      const config = await generateWithRetry({
        messages: args.messages,
        systemPrompt: ENGINE_C_SYSTEM_PROMPT,
        schema: engineCConfigSchema,
        buildCorrection: buildEngineCCorrectionPrompt
      });
      return { engine: "C", config, reasoning };
    }

    default:
      throw new Error(`Unknown engine type: ${engine}`);
  }
}
