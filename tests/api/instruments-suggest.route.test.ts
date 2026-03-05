import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const suggestMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => ({
    auth: {
      getUser: authMock
    }
  })
}));

vi.mock("@/lib/instruments/smart-search", () => ({
  getInstrumentSuggestions: suggestMock
}));

describe("GET /api/instruments/suggest", () => {
  beforeEach(() => {
    authMock.mockReset();
    suggestMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue({ data: { user: null } });

    const { GET } = await import("@/app/api/instruments/suggest/route");
    const response = await GET(new Request("http://localhost:3000/api/instruments/suggest?q=msci"));

    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid query", async () => {
    authMock.mockResolvedValue({ data: { user: { id: "u1" } } });

    const { GET } = await import("@/app/api/instruments/suggest/route");
    const response = await GET(new Request("http://localhost:3000/api/instruments/suggest?q=x"));

    expect(response.status).toBe(400);
  });

  it("returns suggestions on success", async () => {
    authMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    suggestMock.mockResolvedValue([
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
    ]);

    const { GET } = await import("@/app/api/instruments/suggest/route");
    const response = await GET(new Request("http://localhost:3000/api/instruments/suggest?q=msci%20world"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(suggestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "msci world",
        type: "etf",
        limit: 10
      })
    );
    expect(payload).toHaveLength(1);
    expect(payload[0].symbol).toBe("SWDA.LSE");
  });
});
