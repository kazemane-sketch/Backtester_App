import type { Queue } from "bullmq";

import { log } from "./config";
import { embeddingsQueue, fundamentalsQueue, pricesQueue, universeQueue, type IngestJobPayload } from "./queues";
import { getSyncState, setSyncState } from "./supabase/upserts";

type ScheduleSpec = {
  key: string;
  queue: Queue<IngestJobPayload>;
  jobName: string;
  mode: "full" | "delta";
  trigger: string;
  bucket: () => string;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

function dailyBucket() {
  return new Date().toISOString().slice(0, 10);
}

function hourlyBucket() {
  return new Date().toISOString().slice(0, 13);
}

function weeklyBucket() {
  const date = new Date();
  const day = date.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  date.setUTCDate(date.getUTCDate() - diffToMonday);
  return date.toISOString().slice(0, 10);
}

async function enqueueIfDue(spec: ScheduleSpec) {
  const bucket = spec.bucket();
  const state = await getSyncState(spec.key);
  const lastBucket = typeof state?.value?.lastBucket === "string" ? state.value.lastBucket : null;

  if (lastBucket === bucket) {
    return;
  }

  const jobId = `scheduler:${spec.jobName}:${bucket}`;
  await spec.queue.add(
    spec.jobName,
    {
      mode: spec.mode,
      trigger: spec.trigger
    },
    {
      jobId
    }
  );

  await setSyncState(spec.key, {
    lastBucket: bucket,
    lastJobId: jobId,
    enqueuedAt: new Date().toISOString(),
    mode: spec.mode
  });

  log("info", "scheduler enqueued job", {
    scheduleKey: spec.key,
    jobId,
    mode: spec.mode
  });
}

const schedules: Array<{
  everyMs: number;
  spec: ScheduleSpec;
}> = [
  {
    everyMs: DAY_MS,
    spec: {
      key: "schedule:universe:last_bucket",
      queue: universeQueue,
      jobName: "sync-universe",
      mode: "delta",
      trigger: "internal-scheduler",
      bucket: dailyBucket
    }
  },
  {
    everyMs: DAY_MS,
    spec: {
      key: "schedule:prices:last_bucket",
      queue: pricesQueue,
      jobName: "sync-prices-daily",
      mode: "delta",
      trigger: "internal-scheduler",
      bucket: dailyBucket
    }
  },
  {
    everyMs: WEEK_MS,
    spec: {
      key: "schedule:fundamentals:last_bucket",
      queue: fundamentalsQueue,
      jobName: "sync-etf-fundamentals",
      mode: "full",
      trigger: "internal-scheduler",
      bucket: weeklyBucket
    }
  },
  {
    everyMs: HOUR_MS,
    spec: {
      key: "schedule:embeddings:last_bucket",
      queue: embeddingsQueue,
      jobName: "refresh-embeddings",
      mode: "delta",
      trigger: "internal-scheduler",
      bucket: hourlyBucket
    }
  }
];

export function startScheduler() {
  const timers: NodeJS.Timeout[] = [];

  schedules.forEach(({ everyMs, spec }) => {
    const runner = () => {
      void enqueueIfDue(spec).catch((error) => {
        log("error", "scheduler enqueue failed", {
          scheduleKey: spec.key,
          error: error instanceof Error ? error.message : String(error)
        });
      });
    };

    runner();
    timers.push(setInterval(runner, everyMs));
  });

  return () => {
    timers.forEach((timer) => clearInterval(timer));
  };
}
