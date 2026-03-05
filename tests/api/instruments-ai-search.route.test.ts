import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const aiSearchMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => ({
    auth: {
      getUser: authMock
    }
  })
}));

vi.mock("@/lib/instruments/smart-search", () => ({
  runAiInstrumentSearch: aiSearchMock
}));

describe("POST /api/instruments/ai-search", () => {
  beforeEach(() => {
    authMock.mockReset();
    aiSearchMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue({ data: { user: null } });

    const { POST } = await import("@/app/api/instruments/ai-search/route");
    const response = await POST(
      new Request("http://localhost:3000/api/instruments/ai-search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "msci world" })
      })
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid payload", async () => {
    authMock.mockResolvedValue({ data: { user: { id: "u1" } } });

    const { POST } = await import("@/app/api/instruments/ai-search/route");
    const response = await POST(
      new Request("http://localhost:3000/api/instruments/ai-search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "x" })
      })
    );

    expect(response.status).toBe(400);
  });

  it("returns filters and results on success for italian semantic query", async () => {
    authMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    aiSearchMock.mockResolvedValue({
      query_it: "indice con india",
      query_en: "index with india",
      interpretedQuery: "india index",
      filters: {
        type: "etf",
        keywords: ["india index"],
        index_contains: "India",
        country_exposure: [{ country: "India", min: 0.08, max: 0.12 }],
        domicile: null,
        currency: null,
        accumulation: null
      },
      results: [
        {
          instrumentId: "i1",
          symbol: "INDA.US",
          name: "iShares MSCI India ETF",
          isin: null,
          type: "etf",
          exchange: "NASDAQ",
          currency: "USD",
          indexName: "MSCI India",
          domicile: "US",
          score: 99,
          source: "db"
        }
      ],
      explanation: ["Filtro index_contains applicato: India"]
    });

    const { POST } = await import("@/app/api/instruments/ai-search/route");
    const response = await POST(
      new Request("http://localhost:3000/api/instruments/ai-search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "indice con india", type: "etf" })
      })
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(aiSearchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "indice con india",
        type: "etf",
        limit: 20
      })
    );
    expect(payload.results).toHaveLength(1);
    expect(payload.filters.type).toBe("etf");
    expect(payload.interpretedQuery).toBe("india index");
  });
});
