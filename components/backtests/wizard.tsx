"use client";

import { useMemo, useState } from "react";

import { useBacktestConfig } from "@/hooks/use-backtest-config";
import { StrategyChat } from "@/components/chat/strategy-chat";
import { AssetsStep } from "@/components/backtests/steps-assets";
import { WeightsStep } from "@/components/backtests/steps-weights";
import { RulesStep } from "@/components/backtests/steps-rules";
import { BenchmarkStep } from "@/components/backtests/steps-benchmark";
import { ReviewRunStep } from "@/components/backtests/steps-review-run";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Step = {
  key: string;
  title: string;
};

const steps: Step[] = [
  { key: "assets", title: "Assets" },
  { key: "weights", title: "Pesi" },
  { key: "rules", title: "Regole" },
  { key: "benchmark", title: "Benchmark" },
  { key: "review", title: "Run" }
];

export function PortfolioWizard() {
  const [currentStep, setCurrentStep] = useState(0);
  const { config, setConfig, isValid, issues } = useBacktestConfig();

  const content = useMemo(() => {
    switch (steps[currentStep]?.key) {
      case "assets":
        return <AssetsStep config={config} onChange={setConfig} />;
      case "weights":
        return <WeightsStep config={config} onChange={setConfig} />;
      case "rules":
        return <RulesStep config={config} onChange={setConfig} />;
      case "benchmark":
        return <BenchmarkStep config={config} onChange={setConfig} />;
      case "review":
        return <ReviewRunStep config={config} isValid={isValid} issues={issues} />;
      default:
        return null;
    }
  }, [config, currentStep, isValid, issues, setConfig]);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <Card className="border-primary/20">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              {steps.map((step, index) => (
                <button
                  className={`rounded-full px-3 py-1 text-sm transition ${
                    index === currentStep
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-secondary"
                  }`}
                  key={step.key}
                  onClick={() => setCurrentStep(index)}
                  type="button"
                >
                  {index + 1}. {step.title}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {content}

        <div className="flex items-center justify-between">
          <Button
            disabled={currentStep === 0}
            onClick={() => setCurrentStep((step) => Math.max(0, step - 1))}
            type="button"
            variant="outline"
          >
            Indietro
          </Button>
          <Button
            disabled={currentStep === steps.length - 1}
            onClick={() => setCurrentStep((step) => Math.min(steps.length - 1, step + 1))}
            type="button"
          >
            Avanti
          </Button>
        </div>
      </div>

      <StrategyChat onConfigGenerated={setConfig} />
    </div>
  );
}
