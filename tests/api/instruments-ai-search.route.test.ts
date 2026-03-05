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

  it("returns filters and results on success", async () => {
    authMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    aiSearchMock.mockResolvedValue({
      filters: {
        type: "etf",
        keywords: ["msci world"],
        index_contains: "MSCI World",
        country_exposure: [],
        domicile: null,
        currency: null,
        accumulation: null
      },
      results: [
        {
          instrumentId: "i1",
          symbol: "SWDA.LSE",
          name: "iShares Core MSCI World",
          isin: "IE00B4L5Y983",
          type: "etf",
          exchange: "LSE",
          currency: "USD",
          indexName: "MSCI World",
          domicile: "Ireland",
          score: 99,
          source: "db"
        }
      ],
      explanation: ["Filtro index_contains applicato: MSCI World"]
    });

    const { POST } = await import("@/app/api/instruments/ai-search/route");
    const response = await POST(
      new Request("http://localhost:3000/api/instruments/ai-search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "ETF MSCI World" })
      })
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.results).toHaveLength(1);
    expect(payload.filters.type).toBe("etf");
  });
});
