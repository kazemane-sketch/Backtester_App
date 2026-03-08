"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  ChevronDown,
  Loader2,
  Play,
  Send,
  Sparkles,
  User2
} from "lucide-react";

import { useStrategyChat, type ChatMessage, type StrategyResponse } from "@/hooks/use-strategy-chat";
import type { EngineType } from "@/lib/ai/engine-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type SelectedInstrument = {
  instrumentId: string;
  symbol: string;
  name: string;
};

type Props = {
  selectedInstruments: SelectedInstrument[];
  onConfigGenerated: (response: StrategyResponse) => void;
  onRunBacktest: () => void;
  hasConfig: boolean;
  isRunning: boolean;
};

const ENGINE_LABELS: Record<EngineType, { label: string; color: string }> = {
  A: { label: "Portfolio Allocation", color: "bg-blue-500/10 text-blue-600 border-blue-200" },
  B: { label: "Tactical Rules", color: "bg-amber-500/10 text-amber-600 border-amber-200" },
  C: { label: "Single-Asset Trading", color: "bg-purple-500/10 text-purple-600 border-purple-200" }
};

const EXAMPLE_PROMPTS = [
  "60% VWCE and 40% bonds, monthly rebalance, 2015–2025",
  "Select top 5 ETFs above 10-month SMA from universe, weight by inverse vol",
  "Buy AAPL when RSI < 30, sell when RSI > 70, stop loss 5%"
];

export function ChatPanel({
  selectedInstruments,
  onConfigGenerated,
  onRunBacktest,
  hasConfig,
  isRunning
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [lastEngine, setLastEngine] = useState<EngineType | null>(null);
  const mutation = useStrategyChat();
  const scrollRef = useRef<HTMLDivElement>(null);

  const canSubmit = useMemo(
    () => input.trim().length > 0 && !mutation.isPending,
    [input, mutation.isPending]
  );

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, mutation.isPending]);

  // Build system context with selected instruments
  function buildSystemContext(): ChatMessage | null {
    if (selectedInstruments.length === 0) return null;

    const instrumentList = selectedInstruments
      .map((inst) => `${inst.symbol} (${inst.name})`)
      .join(", ");

    return {
      role: "system",
      content: `The user has selected these instruments in the instrument panel: ${instrumentList}. Include them in the backtest config when appropriate.`
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    const userMessage: ChatMessage = { role: "user", content: input.trim() };
    const nextMessages: ChatMessage[] = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");

    // Build full messages array with system context
    const systemCtx = buildSystemContext();
    const fullMessages = systemCtx ? [systemCtx, ...nextMessages] : nextMessages;

    try {
      const response = await mutation.mutateAsync({ messages: fullMessages });
      setLastEngine(response.engine);
      onConfigGenerated(response);

      const engineInfo = ENGINE_LABELS[response.engine];
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Engine ${response.engine} (${engineInfo.label}) selezionato.\n\n${response.reasoning}\n\nConfig generato e pronto per il run.`
        }
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: error instanceof Error ? error.message : "Errore nella generazione config"
        }
      ]);
    }
  }

  function handleExampleClick(prompt: string) {
    setInput(prompt);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10">
            <Sparkles className="h-4 w-4 text-accent" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">AI Strategy Builder</h2>
            <p className="text-[11px] text-muted-foreground">
              Descrivi la strategia, l&apos;AI genera la config
            </p>
          </div>
        </div>
        {lastEngine && (
          <Badge
            variant="outline"
            className={ENGINE_LABELS[lastEngine].color}
          >
            Engine {lastEngine}
          </Badge>
        )}
      </div>

      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10">
              <Bot className="h-6 w-6 text-accent" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Come posso aiutarti?</p>
              <p className="text-xs text-muted-foreground max-w-[280px]">
                Descrivi la strategia di investimento. Supporto 3 engine: portfolio allocation, tactical rules e single-asset trading.
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-[320px]">
              {EXAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleExampleClick(prompt)}
                  className="rounded-lg border bg-background/80 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                >
                  &ldquo;{prompt}&rdquo;
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={`msg-${index}`}
            className={`flex items-start gap-2.5 ${
              message.role === "user" ? "" : ""
            }`}
          >
            <div
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                message.role === "user"
                  ? "bg-primary/10"
                  : "bg-accent/10"
              }`}
            >
              {message.role === "user" ? (
                <User2 className="h-3.5 w-3.5 text-primary" />
              ) : (
                <Bot className="h-3.5 w-3.5 text-accent" />
              )}
            </div>
            <div
              className={`flex-1 rounded-xl px-3 py-2 text-sm ${
                message.role === "user"
                  ? "bg-primary/5 text-foreground"
                  : "bg-muted/50 text-foreground"
              }`}
            >
              <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
            </div>
          </div>
        ))}

        {mutation.isPending && (
          <div className="flex items-start gap-2.5">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10">
              <Bot className="h-3.5 w-3.5 text-accent" />
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
              <span className="text-xs text-muted-foreground">
                Analizzando la strategia...
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Instrument context indicator */}
      {selectedInstruments.length > 0 && (
        <div className="flex items-center gap-2 border-t px-4 py-2 bg-muted/20">
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
          <span className="text-[11px] text-muted-foreground">
            {selectedInstruments.length} strument{selectedInstruments.length === 1 ? "o" : "i"} selezionat{selectedInstruments.length === 1 ? "o" : "i"}:
          </span>
          <div className="flex gap-1 overflow-x-auto">
            {selectedInstruments.slice(0, 5).map((inst) => (
              <Badge key={inst.instrumentId} variant="secondary" className="text-[10px] shrink-0">
                {inst.symbol}
              </Badge>
            ))}
            {selectedInstruments.length > 5 && (
              <Badge variant="outline" className="text-[10px] shrink-0">
                +{selectedInstruments.length - 5}
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="border-t p-3 space-y-2">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (canSubmit) {
                  handleSubmit(event as unknown as FormEvent<HTMLFormElement>);
                }
              }
            }}
            placeholder="Descrivi la strategia..."
            rows={2}
            className="min-h-[56px] resize-none text-sm"
          />
          <div className="flex flex-col gap-1.5">
            <Button
              type="submit"
              size="icon"
              disabled={!canSubmit}
              className="h-[26px] w-[26px]"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
            {hasConfig && (
              <Button
                type="button"
                size="icon"
                variant="default"
                onClick={onRunBacktest}
                disabled={isRunning}
                className="h-[26px] w-[26px] bg-accent hover:bg-accent/90"
                title="Run backtest"
              >
                {isRunning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
          </div>
        </form>
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="text-[10px]">
            No advisory — technical config only
          </Badge>
        </div>
      </div>
    </div>
  );
}
