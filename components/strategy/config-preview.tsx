"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Code } from "lucide-react";

import type { EngineType } from "@/lib/ai/engine-router";
import { Badge } from "@/components/ui/badge";

const ENGINE_LABELS: Record<EngineType, string> = {
  A: "Portfolio Allocation",
  B: "Tactical Rules",
  C: "Single-Asset Trading"
};

type Props = {
  engine: EngineType | null;
  config: Record<string, unknown> | null;
};

export function ConfigPreview({ engine, config }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!config || !engine) {
    return null;
  }

  // Extract key info for compact display
  const name = (config.name as string) || "Unnamed";
  const startDate = config.startDate as string;
  const endDate = config.endDate as string;

  // Engine-specific compact info
  let engineDetail = "";
  if (engine === "A") {
    const assets = (config.assets as Array<{ query?: string; weight?: number }>) ?? [];
    engineDetail = assets.map((a) => `${a.query ?? "?"} ${a.weight}%`).join(", ");
  } else if (engine === "B") {
    const maxPos = config.maxPositions as number;
    const allocation = config.allocation as string;
    engineDetail = `Top ${maxPos ?? "N"} · ${allocation ?? "equal_weight"}`;
  } else if (engine === "C") {
    const asset = config.asset as { query?: string };
    const stopLoss = config.stopLoss as { type?: string } | undefined;
    engineDetail = `${asset?.query ?? "?"} · stop: ${stopLoss?.type ?? "none"}`;
  }

  return (
    <div className="border-t bg-muted/10">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs transition-colors hover:bg-muted/20"
      >
        <Code className="h-3 w-3 text-muted-foreground" />
        <span className="font-medium">{name}</span>
        <Badge variant="outline" className="text-[10px] ml-1">
          {ENGINE_LABELS[engine]}
        </Badge>
        {startDate && endDate && (
          <span className="text-muted-foreground ml-auto mr-2">
            {startDate} → {endDate}
          </span>
        )}
        {expanded ? (
          <ChevronUp className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        )}
      </button>

      {!expanded && engineDetail && (
        <div className="px-4 pb-2">
          <p className="text-[11px] text-muted-foreground truncate">{engineDetail}</p>
        </div>
      )}

      {expanded && (
        <div className="px-4 pb-3">
          <pre className="max-h-60 overflow-auto rounded-md border bg-slate-900 p-3 text-[11px] text-slate-200 leading-relaxed">
            {JSON.stringify(config, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
