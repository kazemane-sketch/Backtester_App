import { Worker } from "bullmq";

import { log, workerEnv } from "./config";
import { processRefreshEmbeddings } from "./jobs/refreshEmbeddings";
import { processSyncEtfFundamentals } from "./jobs/syncEtfFundamentals";
import { processSyncPricesDaily } from "./jobs/syncPricesDaily";
import { processSyncUniverse } from "./jobs/syncUniverse";
import { closeQueueResources, queueNames, redisConnection, upstashRestClient } from "./queues";
import { startScheduler } from "./scheduler";

async function pingUpstashRestIfConfigured() {
  if (!upstashRestClient) {
    return;
  }

  try {
    await upstashRestClient.ping();
    log("info", "Upstash REST ping ok");
  } catch (error) {
    log("warn", "Upstash REST ping failed", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function bootstrap() {
  await pingUpstashRestIfConfigured();

  const concurrency = workerEnv.WORKER_CONCURRENCY;

  const workers = [
    new Worker(queueNames.universe, processSyncUniverse, {
      connection: redisConnection,
      concurrency
    }),
    new Worker(queueNames.fundamentals, processSyncEtfFundamentals, {
      connection: redisConnection,
      concurrency
    }),
    new Worker(queueNames.prices, processSyncPricesDaily, {
      connection: redisConnection,
      concurrency
    }),
    new Worker(queueNames.embeddings, processRefreshEmbeddings, {
      connection: redisConnection,
      concurrency
    })
  ];

  workers.forEach((worker) => {
    worker.on("completed", (job) => {
      log("info", "job completed", {
        queue: worker.name,
        jobId: job.id
      });
    });

    worker.on("failed", (job, error) => {
      log("error", "job failed", {
        queue: worker.name,
        jobId: job?.id,
        error: error.message
      });
    });
  });

  log("info", "worker started", {
    queues: Object.values(queueNames),
    concurrency
  });

  const stopScheduler = startScheduler();

  const heartbeat = setInterval(() => {
    log("debug", "worker heartbeat", {
      pid: process.pid
    });
  }, 60_000);

  const shutdown = async (signal: string) => {
    clearInterval(heartbeat);
    stopScheduler();
    log("warn", "worker shutdown requested", { signal });

    await Promise.all(workers.map((worker) => worker.close()));
    await closeQueueResources();

    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

bootstrap().catch((error) => {
  log("error", "worker bootstrap failed", {
    error: error instanceof Error ? error.message : String(error)
  });
  process.exit(1);
});
