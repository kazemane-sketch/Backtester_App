"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { BacktestConfig } from "@/lib/schemas/backtest-config";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  config: BacktestConfig;
  isValid: boolean;
  issues: { path: (string | number)[]; message: string }[];
};

export function ReviewRunStep({ config, isValid, issues }: Props) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runBacktest() {
    if (!isValid) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/backtests/run", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ config })
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Backtest run failed");
      }

      router.push(`/backtests/${payload.id}`);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unknown backtest error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review & Run</CardTitle>
        <CardDescription>Conferma la configurazione finale e avvia il backtest server-side.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isValid ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <p className="font-semibold">Config non valida</p>
            <ul className="mt-2 list-disc pl-4">
              {issues.map((issue, index) => (
                <li key={`${issue.path.join(".")}-${index}`}>
                  {issue.path.join(".")}: {issue.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <pre className="max-h-80 overflow-auto rounded-md border bg-slate-900 p-4 text-xs text-slate-100">
          {JSON.stringify(config, null, 2)}
        </pre>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button disabled={!isValid || isSubmitting} onClick={runBacktest} type="button">
          {isSubmitting ? "Running..." : "Run Backtest"}
        </Button>
      </CardContent>
    </Card>
  );
}
