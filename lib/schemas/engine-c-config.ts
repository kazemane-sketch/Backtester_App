import { z } from "zod";

import { yearsBetween } from "@/lib/utils/date";

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

// ─── Signal Types ───────────────────────────────────────────────────────────

/**
 * A signal condition that evaluates to true or false on each bar.
 *
 * Examples:
 *  - SMA crossover:    { type: "sma_cross_above", period: 50 }
 *  - RSI oversold:     { type: "rsi_below", period: 14, threshold: 30 }
 *  - Breakout:         { type: "price_above_highest", period: 20 }
 */
const signalConditionSchema = z.discriminatedUnion("type", [
  // Price crosses above/below SMA
  z.object({
    type: z.literal("sma_cross_above"),
    period: z.number().int().min(1).max(504).default(50),
    label: z.string().max(120).optional()
  }),
  z.object({
    type: z.literal("sma_cross_below"),
    period: z.number().int().min(1).max(504).default(50),
    label: z.string().max(120).optional()
  }),

  // Price is above/below SMA (level, not cross)
  z.object({
    type: z.literal("price_above_sma"),
    period: z.number().int().min(1).max(504).default(200),
    label: z.string().max(120).optional()
  }),
  z.object({
    type: z.literal("price_below_sma"),
    period: z.number().int().min(1).max(504).default(200),
    label: z.string().max(120).optional()
  }),

  // RSI above/below threshold
  z.object({
    type: z.literal("rsi_above"),
    period: z.number().int().min(1).max(100).default(14),
    threshold: z.number().min(0).max(100).default(70),
    label: z.string().max(120).optional()
  }),
  z.object({
    type: z.literal("rsi_below"),
    period: z.number().int().min(1).max(100).default(14),
    threshold: z.number().min(0).max(100).default(30),
    label: z.string().max(120).optional()
  }),

  // Breakout (price above/below N-day highest/lowest)
  z.object({
    type: z.literal("price_above_highest"),
    period: z.number().int().min(2).max(504).default(20),
    label: z.string().max(120).optional()
  }),
  z.object({
    type: z.literal("price_below_lowest"),
    period: z.number().int().min(2).max(504).default(20),
    label: z.string().max(120).optional()
  }),

  // Momentum positive/negative
  z.object({
    type: z.literal("momentum_positive"),
    period: z.number().int().min(1).max(504).default(252),
    label: z.string().max(120).optional()
  }),
  z.object({
    type: z.literal("momentum_negative"),
    period: z.number().int().min(1).max(504).default(252),
    label: z.string().max(120).optional()
  })
]);

export type SignalCondition = z.infer<typeof signalConditionSchema>;

// ─── Stop-Loss Types ────────────────────────────────────────────────────────

const stopLossSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("fixed_pct"),
    /** Stop loss percentage from entry price (e.g. 5 means -5%). */
    pct: z.number().min(0.1).max(50).default(5)
  }),
  z.object({
    type: z.literal("trailing_pct"),
    /** Trailing stop percentage from running peak since entry (e.g. 10 means -10%). */
    pct: z.number().min(0.1).max(50).default(10)
  }),
  z.object({
    type: z.literal("atr_multiple"),
    /** ATR period for computation. */
    period: z.number().int().min(1).max(100).default(14),
    /** How many ATRs below entry/peak. */
    multiple: z.number().min(0.1).max(10).default(2)
  })
]);

export type StopLoss = z.infer<typeof stopLossSchema>;

// ─── Asset ──────────────────────────────────────────────────────────────────

const singleAssetSchema = z.object({
  query: z.string().min(1, "Asset query is required").optional(),
  instrumentId: z.string().uuid().optional(),
  resolvedInstrumentId: z.string().uuid().optional()
});

// ─── Main Engine C Config ───────────────────────────────────────────────────

export const engineCConfigSchema = z
  .object({
    name: z.string().min(3).max(120).optional(),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    initialCapital: z.number().positive().max(1_000_000_000).default(10_000),
    dataProvider: z.enum(["EODHD", "YAHOO"]).default("EODHD"),
    priceField: z.enum(["adjClose", "close"]).default("adjClose"),

    /** The single asset to trade. */
    asset: singleAssetSchema,

    /**
     * Entry conditions — ALL must be true to open a position (AND logic).
     * At least one entry rule is required.
     */
    entryRules: z.array(signalConditionSchema).min(1).max(5),

    /**
     * Exit conditions — ANY can trigger closing the position (OR logic).
     * Empty array means only stop-loss/take-profit can exit.
     */
    exitRules: z.array(signalConditionSchema).max(5).default([]),

    /** Stop-loss configuration. Optional — no stop loss if omitted. */
    stopLoss: stopLossSchema.optional(),

    /** Take-profit percentage from entry price (e.g. 20 means +20%). Omit for no take-profit. */
    takeProfitPct: z.number().min(0.1).max(500).optional(),

    /** Percentage of capital to allocate per trade (default 100%). */
    positionSizePct: z.number().min(1).max(100).default(100),

    /** Trade fee as percentage (0 to 5). */
    fees: z.object({
      tradeFeePct: z.number().min(0).max(5)
    }),

    /** Optional benchmark for comparison. */
    benchmark: z
      .object({
        query: z.string().min(1).optional(),
        instrumentId: z.string().uuid().optional()
      })
      .optional()
  })
  .superRefine((config, ctx) => {
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

    const id = config.asset.instrumentId ?? config.asset.resolvedInstrumentId;
    if (!id && !config.asset.query) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["asset"],
        message: "Asset must include instrumentId/resolvedInstrumentId or query"
      });
    }
  });

export type EngineCConfig = z.infer<typeof engineCConfigSchema>;
