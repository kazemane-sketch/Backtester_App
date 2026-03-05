"use client";

import { useQuery } from "@tanstack/react-query";

import type { DataProvider, ProviderInstrument } from "@/lib/market-data/types";

type InstrumentSearchResponse = {
  primary: ProviderInstrument | null;
  alternatives: ProviderInstrument[];
};

async function searchInstruments(query: string, provider: DataProvider): Promise<InstrumentSearchResponse> {
  const response = await fetch(
    `/api/instruments/search?${new URLSearchParams({ q: query, provider }).toString()}`,
    {
      method: "GET"
    }
  );

  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload.error ?? "Instrument search failed");
  }

  return response.json();
}

export function useInstrumentSearch(query: string, provider: DataProvider) {
  return useQuery({
    queryKey: ["instrument-search", query, provider],
    queryFn: () => searchInstruments(query, provider),
    enabled: query.trim().length >= 2,
    staleTime: 1000 * 60 * 10
  });
}
