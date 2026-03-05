"use client";

import { useMutation } from "@tanstack/react-query";

import type { BacktestConfig } from "@/lib/schemas/backtest-config";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

async function postStrategy(messages: ChatMessage[]) {
  const response = await fetch("/api/chat/strategy", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ messages })
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? "Chat generation failed");
  }

  return payload as { config: BacktestConfig };
}

export function useStrategyChat() {
  return useMutation({
    mutationFn: (messages: ChatMessage[]) => postStrategy(messages)
  });
}
