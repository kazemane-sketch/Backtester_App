import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => ({
    auth: {
      getUser: authMock
    }
  }),
  createServiceRoleClient: vi.fn()
}));

describe("POST /api/backtests/run", () => {
  beforeEach(() => {
    authMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue({ data: { user: null } });

    const { POST } = await import("@/app/api/backtests/run/route");

    const response = await POST(
      new Request("http://localhost:3000/api/backtests/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config: {} })
      })
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid payload", async () => {
    authMock.mockResolvedValue({ data: { user: { id: "u1" } } });

    const { POST } = await import("@/app/api/backtests/run/route");

    const response = await POST(
      new Request("http://localhost:3000/api/backtests/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config: { name: "x" } })
      })
    );

    expect(response.status).toBe(400);
  });
});
