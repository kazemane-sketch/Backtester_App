import { Redis } from "@upstash/redis";
import { ConnectionOptions, JobsOptions, Queue } from "bullmq";

import { workerEnv } from "./config";

export type QueueMode = "full" | "delta";

export type IngestJobPayload = {
  mode?: QueueMode;
  symbols?: string[];
  cursor?: string;
  chunkSize?: number;
  trigger?: string;
};

export const queueNames = {
  universe: "universeQueue",
  fundamentals: "fundamentalsQueue",
  prices: "pricesQueue",
  embeddings: "embeddingsQueue"
} as const;

export type QueueName = keyof typeof queueNames;

const defaultJobOptions: JobsOptions = {
  removeOnComplete: {
    age: 24 * 60 * 60,
    count: 500
  },
  removeOnFail: {
    age: 7 * 24 * 60 * 60,
    count: 1000
  },
  attempts: 5,
  backoff: {
    type: "exponential",
    delay: 2_000
  }
};

const redisUrl = new URL(workerEnv.REDIS_URL as string);

export const redisConnection: ConnectionOptions = {
  host: redisUrl.hostname,
  port: redisUrl.port ? Number(redisUrl.port) : 6379,
  username: redisUrl.username ? decodeURIComponent(redisUrl.username) : undefined,
  password: redisUrl.password ? decodeURIComponent(redisUrl.password) : undefined,
  tls: redisUrl.protocol === "rediss:" ? {} : undefined,
  maxRetriesPerRequest: null
};

export const upstashRestClient =
  workerEnv.UPSTASH_REDIS_REST_URL && workerEnv.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: workerEnv.UPSTASH_REDIS_REST_URL,
        token: workerEnv.UPSTASH_REDIS_REST_TOKEN
      })
    : null;

function buildQueue(name: string) {
  return new Queue<IngestJobPayload>(name, {
    connection: redisConnection,
    defaultJobOptions
  });
}

export const universeQueue = buildQueue(queueNames.universe);
export const fundamentalsQueue = buildQueue(queueNames.fundamentals);
export const pricesQueue = buildQueue(queueNames.prices);
export const embeddingsQueue = buildQueue(queueNames.embeddings);

export const queues = {
  universeQueue,
  fundamentalsQueue,
  pricesQueue,
  embeddingsQueue
};

export async function closeQueueResources() {
  await Promise.all([
    universeQueue.close(),
    fundamentalsQueue.close(),
    pricesQueue.close(),
    embeddingsQueue.close()
  ]);
}
