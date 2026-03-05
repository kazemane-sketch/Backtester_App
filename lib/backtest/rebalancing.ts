import type { BacktestConfig } from "@/lib/schemas/backtest-config";
import { isPeriodEnd } from "@/lib/backtest/calendar";

export function shouldRebalance(args: {
  mode: BacktestConfig["rebalancing"];
  date: string;
  nextDate?: string;
  currentWeights: number[];
  targetWeights: number[];
}): boolean {
  if (args.mode.mode === "none") {
    return false;
  }

  if (args.mode.mode === "periodic") {
    return isPeriodEnd(args.date, args.nextDate, args.mode.periodicFrequency);
  }

  const threshold = args.mode.thresholdPct;
  return args.currentWeights.some((weight, index) => Math.abs(weight - args.targetWeights[index]) * 100 > threshold);
}
