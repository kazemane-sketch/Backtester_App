import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.fn();
const resolveMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => ({
    auth: {
      getUser: authMock
    }
  })
}));

vi.mock("@/lib/instruments/resolve-instrument", () => ({
  resolveInstrumentsBySearch: resolveMock
}));

describe("GET /api/instruments/search", () => {
  beforeEach(() => {
    authMock.mockReset();
    resolveMock.mockReset();
  });

  it("returns 401 when user is unauthenticated", async () => {
    authMock.mockResolvedValue({ data: { user: null } });
    const { GET } = await import("@/app/api/instruments/search/route");

    const response = await GET(new Request("http://localhost:3000/api/instruments/search?q=spy"));

    expect(response.status).toBe(401);
  });

  it("returns primary and alternatives on success", async () => {
    authMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    resolveMock.mockResolvedValue({
      primary: {
        provider: "EODHD",
        providerInstrumentId: "SPY.US",
        symbol: "SPY",
        name: "SPDR S&P 500",
        exchange: "NYSE",
        currency: "USD"
      },
      alternatives: []
    });

    const { GET } = await import("@/app/api/instruments/search/route");
    const response = await GET(new Request("http://localhost:3000/api/instruments/search?q=spy"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.primary.symbol).toBe("SPY");
  });
});
