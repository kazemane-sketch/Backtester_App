import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({
    rpc: rpcMock
  })
}));

describe("GET /api/health/rpc", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("returns 200 when RPC call succeeds", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });

    const { GET } = await import("@/app/api/health/rpc/route");
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith("suggest_instruments", {
      limit_count: 1,
      query_text: "india",
      requested_type: "etf"
    });
  });

  it("returns 500 when RPC call fails", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        message: "Function not found"
      }
    });

    const { GET } = await import("@/app/api/health/rpc/route");
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.ok).toBe(false);
    expect(payload.error).toContain("Function not found");
  });
});
