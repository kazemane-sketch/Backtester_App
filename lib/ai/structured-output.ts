import OpenAI from "openai";

import { getServerSecrets } from "@/lib/env";
import { BACKTEST_CONFIG_SYSTEM_PROMPT, buildCorrectionPrompt } from "@/lib/ai/backtest-config-prompt";
import { backtestConfigSchema, type BacktestConfig } from "@/lib/schemas/backtest-config";

type Message = {
  role: "user" | "assistant" | "system";
  content: string;
};

export async function generateBacktestConfigFromChat(args: {
  messages: Message[];
  maxRetries?: number;
}): Promise<BacktestConfig> {
  const { openAiApiKey } = getServerSecrets();
  const client = new OpenAI({
    apiKey: openAiApiKey
  });

  const maxRetries = args.maxRetries ?? 2;
  let attempt = 0;
  let correctionNote: string | null = null;

  while (attempt <= maxRetries) {
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0,
      response_format: {
        type: "json_object"
      },
      messages: [
        {
          role: "system",
          content: BACKTEST_CONFIG_SYSTEM_PROMPT
        },
        ...args.messages,
        ...(correctionNote
          ? [
              {
                role: "system" as const,
                content: correctionNote
              }
            ]
          : [])
      ]
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";

    try {
      const parsed = JSON.parse(raw) as unknown;
      return backtestConfigSchema.parse(parsed);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Invalid JSON";
      correctionNote = buildCorrectionPrompt(reason);
      attempt += 1;
    }
  }

  throw new Error("Unable to generate a valid BacktestConfig after retries");
}
