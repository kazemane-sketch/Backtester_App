"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import { GripVertical } from "lucide-react";

import type { EngineType } from "@/lib/ai/engine-router";
import type { StrategyResponse } from "@/hooks/use-strategy-chat";
import { ChatPanel } from "@/components/strategy/chat-panel";
import { ConfigPreview } from "@/components/strategy/config-preview";
import {
  InstrumentPanel,
  type SelectedInstrument
} from "@/components/strategy/instrument-panel";

export function StrategyBuilder() {
  const router = useRouter();

  // Config state from AI
  const [engine, setEngine] = useState<EngineType | null>(null);
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  // Selected instruments (from instrument panel)
  const [selectedInstruments, setSelectedInstruments] = useState<
    SelectedInstrument[]
  >([]);

  const handleConfigGenerated = useCallback(
    (response: StrategyResponse) => {
      setEngine(response.engine);
      setConfig(response.config as Record<string, unknown>);
      setRunError(null);
    },
    []
  );

  const handleAddInstrument = useCallback(
    (instrument: SelectedInstrument) => {
      setSelectedInstruments((prev) => {
        if (prev.some((i) => i.instrumentId === instrument.instrumentId)) {
          return prev;
        }
        return [...prev, instrument];
      });
    },
    []
  );

  const handleRemoveInstrument = useCallback((instrumentId: string) => {
    setSelectedInstruments((prev) =>
      prev.filter((i) => i.instrumentId !== instrumentId)
    );
  }, []);

  const handleWeightChange = useCallback(
    (instrumentId: string, weight: number) => {
      setSelectedInstruments((prev) =>
        prev.map((i) =>
          i.instrumentId === instrumentId ? { ...i, weight } : i
        )
      );
    },
    []
  );

  async function handleRunBacktest() {
    if (!config || !engine) return;

    setIsRunning(true);
    setRunError(null);

    try {
      // Build the final config merging selected instruments if Engine A
      let finalConfig = config;
      if (engine === "A" && selectedInstruments.length > 0) {
        // Check if the AI already populated assets; if not, use selected instruments
        const configAssets = config.assets as Array<Record<string, unknown>> | undefined;
        const hasResolvedAssets = configAssets?.some(
          (a) => a.resolvedInstrumentId || a.instrumentId
        );

        if (!hasResolvedAssets) {
          finalConfig = {
            ...config,
            assets: selectedInstruments.map((inst) => ({
              query: inst.symbol,
              instrumentId: inst.instrumentId,
              weight: inst.weight
            }))
          };
        }
      }

      const response = await fetch("/api/backtests/run-v2", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ engine, config: finalConfig })
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Backtest run failed");
      }

      router.push(`/backtests/${payload.id}`);
      router.refresh();
    } catch (error) {
      setRunError(
        error instanceof Error ? error.message : "Backtest execution failed"
      );
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="h-full flex flex-col">
      {runError && (
        <div className="mx-1 mb-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2">
          <p className="text-xs text-destructive">{runError}</p>
        </div>
      )}

      <PanelGroup direction="horizontal" className="flex-1 rounded-xl border bg-card/60 backdrop-blur-sm overflow-hidden">
        {/* Left: Chat + Config Preview */}
        <Panel defaultSize={58} minSize={35}>
          <div className="flex h-full flex-col">
            <div className="flex-1 overflow-hidden">
              <ChatPanel
                selectedInstruments={selectedInstruments.map((i) => ({
                  instrumentId: i.instrumentId,
                  symbol: i.symbol,
                  name: i.name
                }))}
                onConfigGenerated={handleConfigGenerated}
                onRunBacktest={handleRunBacktest}
                hasConfig={config !== null}
                isRunning={isRunning}
              />
            </div>
            <ConfigPreview engine={engine} config={config} />
          </div>
        </Panel>

        {/* Resize handle */}
        <PanelResizeHandle className="relative flex w-1.5 items-center justify-center bg-border/50 transition-colors hover:bg-border data-[resize-handle-active]:bg-primary/30">
          <GripVertical className="h-4 w-4 text-muted-foreground/50" />
        </PanelResizeHandle>

        {/* Right: Instrument Panel */}
        <Panel defaultSize={42} minSize={28}>
          <InstrumentPanel
            selected={selectedInstruments}
            onAdd={handleAddInstrument}
            onRemove={handleRemoveInstrument}
            onWeightChange={handleWeightChange}
          />
        </Panel>
      </PanelGroup>
    </div>
  );
}
