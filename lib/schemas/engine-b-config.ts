import { z } from "zod";

import { yearsBetween } from "@/lib/utils/date";

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

// ─── Indicator Definitions ──────────────────────────────────────────────────

const indicatorEnum = z.enum([
  "sma",
  "ema",
  "rsi",
  "momentum",
  "volatility",
  "drawdown",
  "price"
]);

export type IndicatorType = z.infer<typeof indicatorEnum>;

// ─── Filter Rules ───────────────────────────────────────────────────────────

/**
 * A filter decides whether an asset PASSES (stays in consideration).
 * ALL filters must pass for an asset to survive (AND logic).
 *
 * Examples:
 *   - "SMA 10-month cross": price > SMA(200)
 *   - "RSI below 70":       RSI(14) < 70
 *   - "Momentum positive":  momentum(252) > 0
 */
const filterRuleSchema = z.object({
  /** The indicator to compute (left side of comparison). */
  indicator: indicatorEnum,
  /** Period/lookback in trading days for the indicator. */
  period: z.number().int().min(1).max(504).default(200),
  /** Comparison operator. */
  operator: z.enum(["gt", "lt", "gte", "lte"]),
  /**
   * What to compare against.
   * - For "price": compares indicator value vs. current price
   * - For a number: compares indicator value vs. fixed threshold
   *   e.g. RSI(14) < 70 → indicator=rsi, period=14, operator=lt, threshold=70
   */
  threshold: z.union([z.literal("price"), z.number()]),
  /** Human-readable label for the rule (optional, used in UI). */
  label: z.string().max(120).optional()
});

export type FilterRule = z.infer<typeof filterRuleSchema>;

// ─── Ranking Criteria ───────────────────────────────────────────────────────

/**
 * After filtering, surviving assets are ranked.
 * Multiple ranking criteria can be combined (first is primary, etc.).
 */
const rankingCriterionSchema = z.object({
  /** The metric to rank by. */
  metric: z.enum(["momentum", "volatility", "rsi", "drawdown"]),
  /** Period/lookback in trading days. */
  period: z.number().int().min(1).max(504).default(252),
  /**
   * Sort direction:
   * - "desc": highest first (e.g. best momentum)
   * - "asc": lowest first (e.g. lowest volatility)
   */
  direction: z.enum(["asc", "desc"]).default("desc")
});

export type RankingCriterion = z.infer<typeof rankingCriterionSchema>;

// ─── Weight Allocation Methods ──────────────────────────────────────────────

const allocationMethodSchema = z.enum([
  "equal_weight",
  "inverse_volatility",
  "rank_weighted",
  "risk_parity"
]);

export type AllocationMethod = z.infer<typeof allocationMethodSchema>;

// ─── Universe Asset ─────────────────────────────────────────────────────────

const universeAssetSchema = z.object({
  query: z.string().min(1, "Asset query is required").optional(),
  instrumentId: z.string().uuid().optional(),
  resolvedInstrumentId: z.string().uuid().optional()
});

// ─── Main Engine B Config ───────────────────────────────────────────────────

export const engineBConfigSchema = z
  .object({
    name: z.string().min(3).max(120).optional(),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    initialCapital: z.number().positive().max(1_000_000_000).default(10_000),
    dataProvider: z.enum(["EODHD", "YAHOO"]).default("EODHD"),
    priceField: z.enum(["adjClose", "close"]).default("adjClose"),

    /** Pool of candidate assets to select from at each rebalance. */
    universe: z.array(universeAssetSchema).min(2).max(50),

    /** How often to re-evaluate the universe. */
    rebalanceFrequency: z.enum(["weekly", "monthly", "quarterly"]).default("monthly"),

    /**
     * Conditions an asset must satisfy to be included.
     * ALL must be true (AND logic). Empty = no filtering.
     */
    filters: z.array(filterRuleSchema).max(10).default([]),

    /**
     * How to order surviving assets. First criterion is primary.
     * Empty = no ranking, all surviving assets are selected.
     */
    ranking: z.array(rankingCriterionSchema).max(5).default([]),

    /** Weight distribution method for selected assets. */
    allocation: allocationMethodSchema.default("equal_weight"),

    /** Maximum number of positions to hold simultaneously. */
    maxPositions: z.number().int().min(1).max(50).default(10),

    /** Volatility lookback for inverse_volatility and risk_parity (trading days). */
    volatilityLookback: z.number().int().min(5).max(252).default(63),

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

    for (const [i, asset] of config.universe.entries()) {
      const id = asset.instrumentId ?? asset.resolvedInstrumentId;
      if (!id && !asset.query) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["universe", i],
          message: "Each universe asset must include instrumentId/resolvedInstrumentId or query"
        });
      }
    }

    if (config.maxPositions > config.universe.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxPositions"],
        message: "maxPositions cannot exceed universe size"
      });
    }
  });

export type EngineBConfig = z.infer<typeof engineBConfigSchema>;
