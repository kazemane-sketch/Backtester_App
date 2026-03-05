import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.fn();
const generatorMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => ({
    auth: {
      getUser: authMock
    }
  })
}));

vi.mock("@/lib/ai/structured-output", () => ({
  generateBacktestConfigFromChat: generatorMock
}));

describe("POST /api/chat/strategy", () => {
  beforeEach(() => {
    authMock.mockReset();
    generatorMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue({ data: { user: null } });
    const { POST } = await import("@/app/api/chat/strategy/route");

    const response = await POST(
      new Request("http://localhost:3000/api/chat/strategy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "test" }] })
      })
    );

    expect(response.status).toBe(401);
  });

  it("returns config JSON on success", async () => {
    authMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    generatorMock.mockResolvedValue({
      name: "AI Config",
      startDate: "2020-01-01",
      endDate: "2025-01-01",
      initialCapital: 10000,
      assets: [{ query: "SPY", weight: 100 }],
      rebalancing: { mode: "none" },
      fees: { tradeFeePct: 0.1 },
      dataProvider: "EODHD"
    });

    const { POST } = await import("@/app/api/chat/strategy/route");
    const response = await POST(
      new Request("http://localhost:3000/api/chat/strategy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "60/40" }] })
      })
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.config.name).toBe("AI Config");
  });
});
