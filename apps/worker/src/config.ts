import { z } from "zod";

const workerEnvSchema = z
  .object({
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    EODHD_API_KEY: z.string().min(1),
    OPENAI_API_KEY: z.string().min(1),
    REDIS_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(5),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    CRON_SECRET: z.string().min(1).optional()
  })
  .superRefine((value, ctx) => {
    if (!value.REDIS_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "REDIS_URL is required for BullMQ workers. Upstash Redis provides a redis:// connection string in addition to REST credentials."
      });
    }
  });

const parsed = workerEnvSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid worker environment: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`);
}

export const workerEnv = parsed.data;

export type WorkerEnv = typeof workerEnv;

export function log(level: "debug" | "info" | "warn" | "error", message: string, meta?: unknown) {
  const order: Record<typeof workerEnv.LOG_LEVEL, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40
  };

  if (order[level] < order[workerEnv.LOG_LEVEL]) {
    return;
  }

  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(meta ? { meta } : {})
  };

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload));
}
