import { ConnectionOptions, Queue } from "bullmq";

export type AdminJobName = "universe" | "fundamentals" | "prices" | "embeddings";
export type AdminJobMode = "full" | "delta";

type EnqueueResult = {
  queue: string;
  jobName: string;
  jobId: string;
  deduped: boolean;
};

const queueNames = {
  universe: "universeQueue",
  fundamentals: "fundamentalsQueue",
  prices: "pricesQueue",
  embeddings: "embeddingsQueue"
} as const;

const jobNames = {
  universe: "sync-universe",
  fundamentals: "sync-etf-fundamentals",
  prices: "sync-prices-daily",
  embeddings: "refresh-embeddings"
} as const;

function redisConnectionFromEnv(): ConnectionOptions {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    throw new Error("Missing required environment variable: REDIS_URL");
  }

  const parsed = new URL(redisUrl);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    tls: parsed.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null
  };
}

function buildBucket(job: AdminJobName) {
  const now = new Date();

  if (job === "embeddings") {
    return now.toISOString().slice(0, 13);
  }

  return now.toISOString().slice(0, 10);
}

function queueForJob(job: AdminJobName) {
  const connection = redisConnectionFromEnv();
  return new Queue(queueNames[job], {
    connection,
    defaultJobOptions: {
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 2_000
      },
      removeOnComplete: {
        age: 24 * 60 * 60,
        count: 500
      },
      removeOnFail: {
        age: 7 * 24 * 60 * 60,
        count: 1000
      }
    }
  });
}

export async function enqueueAdminJob(args: {
  job: AdminJobName;
  mode: AdminJobMode;
  trigger: string;
}): Promise<EnqueueResult> {
  const queue = queueForJob(args.job);
  const jobName = jobNames[args.job];
  const bucket = buildBucket(args.job);
  const jobId = `admin:${jobName}:${args.mode}:${bucket}`;

  try {
    const existingJob = await queue.getJob(jobId);
    if (existingJob) {
      return {
        queue: queueNames[args.job],
        jobName,
        jobId,
        deduped: true
      };
    }

    const created = await queue.add(
      jobName,
      {
        mode: args.mode,
        trigger: args.trigger
      },
      {
        jobId
      }
    );

    await queue.close();

    return {
      queue: queueNames[args.job],
      jobName,
      jobId: created.id ?? jobId,
      deduped: false
    };
  } finally {
    await queue.close();
  }
}
