import { z } from "zod";

import { yearsBetween } from "@/lib/utils/date";

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const backtestAssetSchema = z.object({
  query: z.string().min(1, "Asset query is required"),
  resolvedInstrumentId: z.string().uuid().optional(),
  weight: z.number().min(0.01).max(100)
});

const noneRebalancingSchema = z.object({
  mode: z.literal("none")
});

const periodicRebalancingSchema = z.object({
  mode: z.literal("periodic"),
  periodicFrequency: z.enum(["weekly", "monthly", "quarterly"])
});

const thresholdRebalancingSchema = z.object({
  mode: z.literal("threshold"),
  thresholdPct: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20)])
});

export const backtestConfigSchema = z
  .object({
    name: z.string().min(3).max(120),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    initialCapital: z.number().positive().max(1_000_000_000).default(10_000),
    assets: z.array(backtestAssetSchema).min(1).max(30),
    rebalancing: z.union([noneRebalancingSchema, periodicRebalancingSchema, thresholdRebalancingSchema]),
    fees: z.object({
      tradeFeePct: z.number().min(0).max(5)
    }),
    benchmark: z
      .object({
        query: z.string().min(1)
      })
      .optional(),
    dataProvider: z.enum(["EODHD", "YAHOO"]).default("EODHD")
  })
  .superRefine((config, ctx) => {
    const totalWeight = config.assets.reduce((sum, asset) => sum + asset.weight, 0);

    if (Math.abs(totalWeight - 100) > 0.001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assets"],
        message: `Assets weights must sum to 100. Current: ${totalWeight.toFixed(4)}`
      });
    }

    if (config.endDate <= config.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "endDate must be after startDate"
      });
    }

    const years = yearsBetween(config.startDate, config.endDate);
    if (years > 20.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startDate"],
        message: "Date range cannot exceed 20 years"
      });
    }
  });

export type BacktestConfig = z.infer<typeof backtestConfigSchema>;

export const runBacktestPayloadSchema = z.object({
  config: backtestConfigSchema
});

export type RunBacktestPayload = z.infer<typeof runBacktestPayloadSchema>;
