import { z } from "zod";

const instrumentTypeSchema = z.enum(["etf", "stock"]);

const percentageFraction = z
  .number()
  .min(0)
  .max(1)
  .transform((value) => Number(value.toFixed(6)));

export const suggestQuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
  type: instrumentTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(10).default(10)
});

export const aiSearchRequestSchema = z.object({
  query: z.string().trim().min(2).max(500),
  type: instrumentTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

export const aiCountryExposureSchema = z
  .object({
    country: z.string().trim().min(2).max(120),
    min: percentageFraction.optional(),
    max: percentageFraction.optional()
  })
  .superRefine((value, ctx) => {
    if (value.min !== undefined && value.max !== undefined && value.min > value.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "country_exposure.min must be <= country_exposure.max"
      });
    }
  });

export const aiExtractedFiltersSchema = z.object({
  type: instrumentTypeSchema.nullable().optional(),
  keywords: z.array(z.string().trim().min(1).max(120)).default([]),
  index_contains: z.string().trim().min(1).max(160).nullable().optional(),
  country_exposure: z.array(aiCountryExposureSchema).default([]),
  domicile: z.string().trim().min(1).max(80).nullable().optional(),
  currency: z.string().trim().min(1).max(12).nullable().optional(),
  accumulation: z.enum(["accumulating", "distributing"]).nullable().optional()
});

export type InstrumentTypeFilter = z.infer<typeof instrumentTypeSchema>;
export type SuggestQuery = z.infer<typeof suggestQuerySchema>;
export type AiSearchRequest = z.infer<typeof aiSearchRequestSchema>;
export type AiExtractedFilters = z.infer<typeof aiExtractedFiltersSchema>;
