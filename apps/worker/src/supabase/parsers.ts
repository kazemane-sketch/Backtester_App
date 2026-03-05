import { createHash } from "node:crypto";

export function normalizeText(input: unknown): string {
  if (typeof input !== "string") {
    return "";
  }

  return input.trim();
}

export function asNumber(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input)) {
    return input;
  }

  if (typeof input === "string") {
    const value = Number(input.replace("%", ""));
    if (Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

export function sha256Hex(payload: string) {
  return createHash("sha256").update(payload).digest("hex");
}

type NameWeight = {
  name: string;
  value: number;
};

export type ParsedFundamentals = {
  indexName: string | null;
  domicile: string | null;
  category: string | null;
  description: string | null;
  updatedAtProvider: string | null;
  regionWeights: NameWeight[];
  sectorWeights: NameWeight[];
  countryWeights: NameWeight[];
  raw: Record<string, unknown>;
};

function asObject(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

function normalizeWeight(rawValue: unknown): number | null {
  const numeric = asNumber(rawValue);
  if (numeric === null || numeric < 0) {
    return null;
  }

  if (numeric > 1) {
    return Math.min(1, numeric / 100);
  }

  return Math.min(1, numeric);
}

function parseNameWeightFromObject(input: unknown): NameWeight[] {
  const obj = asObject(input);
  const rows: NameWeight[] = [];

  Object.entries(obj).forEach(([name, value]) => {
    const numeric =
      normalizeWeight(value) ??
      normalizeWeight(asObject(value).Equity_Pct) ??
      normalizeWeight(asObject(value).Equity_pct) ??
      normalizeWeight(asObject(value).Weight) ??
      normalizeWeight(asObject(value)["Assets_%"]);

    if (numeric !== null && name.trim()) {
      rows.push({
        name: name.trim(),
        value: numeric
      });
    }
  });

  return rows;
}

function parseNameWeightFromArray(input: unknown): NameWeight[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const rows: NameWeight[] = [];

  input.forEach((entry) => {
    const row = asObject(entry);
    const name =
      normalizeText(row.Country) ||
      normalizeText(row.Region) ||
      normalizeText(row.Sector) ||
      normalizeText(row.Name) ||
      normalizeText(row.Holding);

    const numeric =
      normalizeWeight(row.Equity_Pct) ??
      normalizeWeight(row.Equity_pct) ??
      normalizeWeight(row.Weight) ??
      normalizeWeight(row["Assets_%"]) ??
      normalizeWeight(row.AssetsPct);

    if (name && numeric !== null) {
      rows.push({
        name,
        value: numeric
      });
    }
  });

  return rows;
}

function parseNameWeight(input: unknown): NameWeight[] {
  const parsed = [...parseNameWeightFromArray(input), ...parseNameWeightFromObject(input)];
  const map = new Map<string, number>();

  parsed.forEach((item) => {
    const normalizedName = item.name.trim();
    if (!normalizedName) {
      return;
    }

    map.set(normalizedName, (map.get(normalizedName) ?? 0) + item.value);
  });

  return [...map.entries()]
    .map(([name, value]) => ({ name, value: Math.min(1, value) }))
    .sort((a, b) => b.value - a.value);
}

function pickUpdatedAt(input: Record<string, unknown>): string | null {
  const direct = normalizeText(input.UpdatedAt);
  if (direct) {
    const parsed = new Date(direct);
    if (!Number.isNaN(parsed.valueOf())) {
      return parsed.toISOString();
    }
  }

  return null;
}

export function parseFundamentalsPayload(payload: unknown): ParsedFundamentals {
  const raw = asObject(payload);
  const general = asObject(raw.General);
  const etfData = asObject(raw.ETF_Data);

  const indexName =
    normalizeText(etfData.Index_Name) || normalizeText(etfData.IndexName) || normalizeText(general.Index_Name) || null;
  const domicile =
    normalizeText(etfData.Domicile) || normalizeText(etfData.Fund_Domicile) || normalizeText(general.Domicile) || null;
  const category = normalizeText(etfData.Category) || normalizeText(general.Category) || null;
  const description = normalizeText(general.Description) || normalizeText(etfData.Description) || null;
  const updatedAtProvider = pickUpdatedAt(raw) ?? pickUpdatedAt(general) ?? pickUpdatedAt(etfData);

  const regionWeights = parseNameWeight(etfData.World_Regions || raw.World_Regions);
  const sectorWeights = parseNameWeight(etfData.Sector_Weights || raw.Sector_Weights);

  const holdings =
    etfData.Holdings ||
    raw.Holdings ||
    etfData.Top_10_Holdings ||
    raw.Top_10_Holdings ||
    etfData.TopHoldings ||
    raw.TopHoldings;

  const countryWeightsFromHoldings = parseNameWeight(
    Array.isArray(holdings)
      ? holdings
      : Object.values(asObject(holdings)).map((entry) => {
          const row = asObject(entry);
          return {
            Country: row.Country ?? row.CountryName ?? row.Location,
            "Assets_%": row["Assets_%"] ?? row.Weight ?? row.Allocation
          };
        })
  );

  const countryWeightsFallback = parseNameWeight(etfData.Country_Weights || raw.Country_Weights);
  const countryWeights =
    countryWeightsFromHoldings.length > 0 ? countryWeightsFromHoldings : countryWeightsFallback;

  return {
    indexName,
    domicile,
    category,
    description,
    updatedAtProvider,
    regionWeights,
    sectorWeights,
    countryWeights,
    raw
  };
}

function formatTags(args: { prefix: string; rows: NameWeight[] }) {
  return args.rows
    .slice(0, 5)
    .map((row) => `${args.prefix}:${row.name}:${(row.value * 100).toFixed(2)}%`)
    .join(" | ");
}

export function buildEmbeddingText(args: {
  type: "etf" | "stock";
  symbol: string;
  isin: string | null;
  name: string;
  indexName: string | null;
  category: string | null;
  domicile: string | null;
  description: string | null;
  regionWeights: NameWeight[];
  sectorWeights: NameWeight[];
  countryWeights: NameWeight[];
}) {
  const tags = [
    formatTags({ prefix: "REGION", rows: args.regionWeights }),
    formatTags({ prefix: "SECTOR", rows: args.sectorWeights }),
    formatTags({ prefix: "COUNTRY", rows: args.countryWeights })
  ]
    .filter(Boolean)
    .join(" | ");

  return [
    `TYPE: ${args.type}`,
    `SYMBOL: ${args.symbol}`,
    `ISIN: ${args.isin ?? ""}`,
    `NAME: ${args.name}`,
    `INDEX: ${args.indexName ?? ""}`,
    `CATEGORY: ${args.category ?? ""}`,
    `DOMICILE: ${args.domicile ?? ""}`,
    `DESCRIPTION: ${args.description ?? ""}`,
    `TAGS: ${tags}`
  ].join("\n");
}

export function hasEmbeddingTextChanged(previousEmbeddingText: string | null, nextEmbeddingText: string) {
  if (!previousEmbeddingText) {
    return true;
  }

  return sha256Hex(previousEmbeddingText) !== sha256Hex(nextEmbeddingText);
}
