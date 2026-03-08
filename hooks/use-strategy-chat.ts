"use client";

import { useMutation } from "@tanstack/react-query";

import type { BacktestConfig } from "@/lib/schemas/backtest-config";
import type { EngineType } from "@/lib/ai/engine-router";

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type StrategyResponse = {
  engine: EngineType;
  config: BacktestConfig | Record<string, unknown>;
  reasoning: string;
};

async function postStrategy(
  messages: ChatMessage[],
  forceEngine?: EngineType
): Promise<StrategyResponse> {
  const response = await fetch("/api/chat/strategy", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ messages, forceEngine })
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? "Chat generation failed");
  }

  return payload as StrategyResponse;
}

export function useStrategyChat() {
  return useMutation({
    mutationFn: ({
      messages,
      forceEngine
    }: {
      messages: ChatMessage[];
      forceEngine?: EngineType;
    }) => postStrategy(messages, forceEngine)
  });
}
