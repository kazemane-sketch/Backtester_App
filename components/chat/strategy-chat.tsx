"use client";

import { FormEvent, useMemo, useState } from "react";
import { Bot, Sparkles, User2 } from "lucide-react";

import type { BacktestConfig } from "@/lib/schemas/backtest-config";
import { useStrategyChat } from "@/hooks/use-strategy-chat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export function StrategyChat({
  onConfigGenerated
}: {
  onConfigGenerated: (config: BacktestConfig) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const mutation = useStrategyChat();

  const canSubmit = useMemo(() => input.trim().length > 0 && !mutation.isPending, [input, mutation.isPending]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    const nextMessages = [...messages, { role: "user", content: input.trim() } as Message];
    setMessages(nextMessages);
    setInput("");

    try {
      const response = await mutation.mutateAsync(nextMessages);
      onConfigGenerated(response.config);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Config generato: ${response.config.name ?? "Backtest run"}. Il wizard è stato aggiornato automaticamente.`
        }
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: error instanceof Error ? error.message : "Errore durante generazione config"
        }
      ]);
    }
  }

  return (
    <Card className="h-full border-accent/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-accent" />
          AI Strategy Builder
        </CardTitle>
        <CardDescription>
          Scrivi in linguaggio naturale. L&apos;AI restituisce solo JSON BacktestConfig validato server-side.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ScrollArea className="h-72 rounded-md border bg-background/80 p-3">
          <div className="space-y-3">
            {!messages.length ? (
              <p className="text-sm text-muted-foreground">
                Esempio: 60% azioni mondo, 40% bond, rebalance trimestrale, fee 0.1%, 2015-01-01 a 2025-01-01.
              </p>
            ) : null}
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`flex items-start gap-2 rounded-md p-2 ${
                  message.role === "user" ? "bg-primary/10" : "bg-muted"
                }`}
              >
                {message.role === "user" ? (
                  <User2 className="mt-1 h-4 w-4 text-primary" />
                ) : (
                  <Bot className="mt-1 h-4 w-4 text-accent" />
                )}
                <p className="text-sm">{message.content}</p>
              </div>
            ))}
          </div>
        </ScrollArea>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <Textarea
            onChange={(event) => setInput(event.target.value)}
            placeholder="Descrivi la strategia tecnica del backtest..."
            rows={4}
            value={input}
          />
          <div className="flex items-center justify-between">
            <Badge variant="outline">No advisory, technical config only</Badge>
            <Button disabled={!canSubmit} type="submit">
              {mutation.isPending ? "Generazione..." : "Genera config"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
