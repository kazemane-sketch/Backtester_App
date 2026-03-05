import { beforeEach, describe, expect, it, vi } from "vitest";

const enqueueMock = vi.fn();

vi.mock("@/lib/ingest/queue", () => ({
  enqueueAdminJob: enqueueMock
}));

describe("/api/admin/enqueue", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret";
    enqueueMock.mockReset();
  });

  it("returns 401 when missing auth", async () => {
    const { POST } = await import("@/app/api/admin/enqueue/route");
    const response = await POST(
      new Request("http://localhost:3000/api/admin/enqueue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job: "prices", mode: "delta" })
      })
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid payload", async () => {
    const { POST } = await import("@/app/api/admin/enqueue/route");
    const response = await POST(
      new Request("http://localhost:3000/api/admin/enqueue", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer test-secret"
        },
        body: JSON.stringify({ job: "invalid" })
      })
    );

    expect(response.status).toBe(400);
  });

  it("enqueues single job", async () => {
    enqueueMock.mockResolvedValue({
      queue: "pricesQueue",
      jobName: "sync-prices-daily",
      jobId: "x",
      deduped: false
    });

    const { POST } = await import("@/app/api/admin/enqueue/route");
    const response = await POST(
      new Request("http://localhost:3000/api/admin/enqueue", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer test-secret"
        },
        body: JSON.stringify({ job: "prices", mode: "delta" })
      })
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(enqueueMock).toHaveBeenCalledWith({
      job: "prices",
      mode: "delta",
      trigger: "api-admin-post"
    });
  });
});
