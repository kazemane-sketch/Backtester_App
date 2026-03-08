/**
 * Legacy backtest config generator (Engine A only).
 * Used by the original /api/chat/strategy flow.
 *
 * Uses Anthropic Opus/Sonnet (ANTHROPIC_MODEL_BACKTEST) for strong reasoning.
 */

import { callAnthropicJson, getBacktestModel } from "@/lib/ai/models";
import { BACKTEST_CONFIG_SYSTEM_PROMPT, buildCorrectionPrompt } from "@/lib/ai/backtest-config-prompt";
import { backtestConfigSchema, type BacktestConfig } from "@/lib/schemas/backtest-config";

type Message = {
  role: "user" | "assistant" | "system";
  content: string;
};

/** Generate Engine A config from chat — uses Opus/Sonnet (ANTHROPIC_MODEL_BACKTEST) */
export async function generateBacktestConfigFromChat(args: {
  messages: Message[];
  maxRetries?: number;
}): Promise<BacktestConfig> {
  const model = getBacktestModel();
  const maxRetries = args.maxRetries ?? 2;
  let attempt = 0;
  let systemPrompt = BACKTEST_CONFIG_SYSTEM_PROMPT;

  // Filter to only user/assistant messages (Anthropic requires this)
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

      return backtestConfigSchema.parse(raw);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Invalid JSON";
      console.error(`[structured-output] Validation failed (attempt ${attempt + 1}/${maxRetries + 1}):`, reason);
      systemPrompt = BACKTEST_CONFIG_SYSTEM_PROMPT + "\n\n" + buildCorrectionPrompt(reason);
      attempt += 1;
    }
  }

  throw new Error("Unable to generate a valid BacktestConfig after retries");
}
