import { beforeEach, describe, expect, it, vi } from "vitest";

const startJobRunMock = vi.fn();
const finishJobRunMock = vi.fn();
const setSyncStateMock = vi.fn();
const listInstrumentsMock = vi.fn();
const getLatestPriceDateMock = vi.fn();
const upsertPricesDailyMock = vi.fn();
const getInstrumentsBySymbolsMock = vi.fn();
const pricesQueueAddMock = vi.fn();
const getDailyHistoryMock = vi.fn();

vi.mock("../../apps/worker/src/supabase/upserts", () => ({
  startJobRun: startJobRunMock,
  finishJobRun: finishJobRunMock,
  setSyncState: setSyncStateMock,
  listInstruments: listInstrumentsMock,
  getLatestPriceDate: getLatestPriceDateMock,
  upsertPricesDaily: upsertPricesDailyMock,
  getInstrumentsBySymbols: getInstrumentsBySymbolsMock
}));

vi.mock("../../apps/worker/src/queues", () => ({
  pricesQueue: {
    add: pricesQueueAddMock
  }
}));

vi.mock("../../apps/worker/src/eodhd/client", () => ({
  eodhdClient: {
    getDailyHistory: getDailyHistoryMock
  }
}));

describe("worker chunk chaining", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
    process.env.EODHD_API_KEY = "eodhd-test";
    process.env.OPENAI_API_KEY = "openai-test";
    process.env.REDIS_URL = "redis://default:password@127.0.0.1:6379";
    process.env.WORKER_CONCURRENCY = "5";
    process.env.LOG_LEVEL = "error";

    startJobRunMock.mockResolvedValue("run-1");
    finishJobRunMock.mockResolvedValue(undefined);
    setSyncStateMock.mockResolvedValue(undefined);
    listInstrumentsMock.mockReset();
    getLatestPriceDateMock.mockReset();
    upsertPricesDailyMock.mockReset();
    getInstrumentsBySymbolsMock.mockReset();
    pricesQueueAddMock.mockReset();
    getDailyHistoryMock.mockReset();
  });

  it("enqueues next prices chunk when current chunk is full", async () => {
    const { processSyncPricesDaily } = await import("../../apps/worker/src/jobs/syncPricesDaily");

    listInstrumentsMock.mockResolvedValue([
      {
        id: "i-1",
        symbol: "SPY.US",
        provider: "EODHD"
      },
      {
        id: "i-2",
        symbol: "QQQ.US",
        provider: "EODHD"
      }
    ]);
    getLatestPriceDateMock.mockResolvedValue(null);
    getDailyHistoryMock.mockResolvedValue([]);

    await processSyncPricesDaily({
      id: "job-1",
      attemptsMade: 0,
      data: {
        mode: "delta",
        chunkSize: 2,
        cursor: "0",
        trigger: "test"
      }
    } as never);

    expect(pricesQueueAddMock).toHaveBeenCalledTimes(1);
    expect(pricesQueueAddMock.mock.calls[0]?.[0]).toBe("sync-prices-daily");
    expect(pricesQueueAddMock.mock.calls[0]?.[1]).toMatchObject({
      mode: "delta",
      chunkSize: 2,
      cursor: "2"
    });
  });

  it("does not enqueue cursor job when explicit symbols are provided", async () => {
    const { processSyncPricesDaily } = await import("../../apps/worker/src/jobs/syncPricesDaily");

    getInstrumentsBySymbolsMock.mockResolvedValue([
      {
        id: "i-1",
        symbol: "SPY.US",
        provider: "EODHD"
      }
    ]);
    getLatestPriceDateMock.mockResolvedValue(null);
    getDailyHistoryMock.mockResolvedValue([]);

    await processSyncPricesDaily({
      id: "job-2",
      attemptsMade: 0,
      data: {
        mode: "delta",
        symbols: ["SPY.US"],
        chunkSize: 2,
        trigger: "test"
      }
    } as never);

    expect(pricesQueueAddMock).not.toHaveBeenCalled();
  });
});
