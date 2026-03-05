import { getISOWeek, getMonth, getQuarter, parseISO } from "date-fns";

import type { ProviderPriceSeries } from "@/lib/market-data/types";

type PriceMap = Map<string, number>;

function sortDates(dates: Iterable<string>): string[] {
  return [...dates].sort((a, b) => a.localeCompare(b));
}

function interpolateSeries(series: PriceMap, globalDates: string[], maxGap: number): PriceMap {
  const output = new Map<string, number>();

  for (const [date, value] of series.entries()) {
    output.set(date, value);
  }

  const knownIndices = globalDates
    .map((date, index) => ({ date, index, price: series.get(date) }))
    .filter((entry): entry is { date: string; index: number; price: number } =>
      Number.isFinite(entry.price)
    );

  for (let i = 0; i < knownIndices.length - 1; i += 1) {
    const left = knownIndices[i];
    const right = knownIndices[i + 1];
    const gap = right.index - left.index - 1;

    if (gap <= 0 || gap > maxGap) {
      continue;
    }

    for (let step = 1; step <= gap; step += 1) {
      const ratio = step / (gap + 1);
      const interpolated = left.price + (right.price - left.price) * ratio;
      const date = globalDates[left.index + step];
      output.set(date, interpolated);
    }
  }

  return output;
}

export function alignSeriesWithInterpolation(args: {
  series: ProviderPriceSeries[];
  maxInterpolationGap: number;
}) {
  const allDates = new Set<string>();
  const seriesMaps = args.series.map((entry) => {
    const map = new Map<string, number>();
    entry.points.forEach((point) => {
      if (Number.isFinite(point.adjustedClose)) {
        map.set(point.date, point.adjustedClose);
        allDates.add(point.date);
      }
    });

    return {
      ...entry,
      map
    };
  });

  const globalDates = sortDates(allDates);

  const interpolatedMaps = seriesMaps.map((entry) => ({
    ...entry,
    map: interpolateSeries(entry.map, globalDates, args.maxInterpolationGap)
  }));

  const commonDates = globalDates.filter((date) => interpolatedMaps.every((entry) => entry.map.has(date)));

  const alignedSeries = interpolatedMaps.map((entry) => ({
    providerInstrumentId: entry.providerInstrumentId,
    symbol: entry.symbol,
    currency: entry.currency,
    points: commonDates.map((date) => ({
      date,
      adjustedClose: entry.map.get(date) as number
    }))
  }));

  return {
    dates: commonDates,
    series: alignedSeries
  };
}

export function alignBenchmarkSeries(args: {
  benchmark: ProviderPriceSeries | null;
  dates: string[];
  maxInterpolationGap: number;
}) {
  if (!args.benchmark) {
    return null;
  }

  const baseMap = new Map<string, number>();
  args.benchmark.points.forEach((point) => {
    baseMap.set(point.date, point.adjustedClose);
  });

  return interpolateSeries(baseMap, args.dates, args.maxInterpolationGap);
}

export function isPeriodEnd(date: string, nextDate: string | undefined, frequency: "weekly" | "monthly" | "quarterly") {
  if (!nextDate) {
    return true;
  }

  const current = parseISO(`${date}T00:00:00.000Z`);
  const next = parseISO(`${nextDate}T00:00:00.000Z`);

  if (frequency === "weekly") {
    return getISOWeek(current) !== getISOWeek(next);
  }

  if (frequency === "monthly") {
    return getMonth(current) !== getMonth(next);
  }

  return getQuarter(current) !== getQuarter(next);
}
