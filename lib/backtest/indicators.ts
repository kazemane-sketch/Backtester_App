/**
 * Technical indicator library for backtest engines B and C.
 *
 * All functions accept simple number[] price arrays and return number[] of the
 * same length.  Leading entries that cannot be computed yet are set to NaN.
 *
 * Convention: index 0 = oldest, index N-1 = newest (chronological order).
 */

// ─── Simple Moving Average ─────────────────────────────────────────────────

export function computeSMA(prices: number[], period: number): number[] {
  const result = new Array<number>(prices.length).fill(NaN);
  if (period <= 0 || prices.length < period) return result;

  let sum = 0;
  for (let i = 0; i < period; i++) sum += prices[i];
  result[period - 1] = sum / period;

  for (let i = period; i < prices.length; i++) {
    sum += prices[i] - prices[i - period];
    result[i] = sum / period;
  }
  return result;
}

// ─── Exponential Moving Average ─────────────────────────────────────────────

export function computeEMA(prices: number[], period: number): number[] {
  const result = new Array<number>(prices.length).fill(NaN);
  if (period <= 0 || prices.length < period) return result;

  // Seed with SMA of first `period` values
  let sum = 0;
  for (let i = 0; i < period; i++) sum += prices[i];
  let ema = sum / period;
  result[period - 1] = ema;

  const k = 2 / (period + 1);
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
    result[i] = ema;
  }
  return result;
}

// ─── Relative Strength Index (Wilder smoothing) ─────────────────────────────

export function computeRSI(prices: number[], period: number = 14): number[] {
  const result = new Array<number>(prices.length).fill(NaN);
  if (period <= 0 || prices.length < period + 1) return result;

  // Compute price changes
  const changes = new Array<number>(prices.length);
  changes[0] = 0;
  for (let i = 1; i < prices.length; i++) {
    changes[i] = prices[i] - prices[i - 1];
  }

  // First average gain/loss using simple average of first `period` changes
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    if (changes[i] >= 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  // Wilder smoothing for subsequent values
  for (let i = period + 1; i < prices.length; i++) {
    const gain = changes[i] >= 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return result;
}

// ─── Momentum (rate of change over lookback) ────────────────────────────────

/**
 * Returns the fractional return over the last `lookback` bars.
 * e.g. momentum[i] = prices[i] / prices[i - lookback] - 1
 */
export function computeMomentum(prices: number[], lookback: number): number[] {
  const result = new Array<number>(prices.length).fill(NaN);
  if (lookback <= 0) return result;

  for (let i = lookback; i < prices.length; i++) {
    const prev = prices[i - lookback];
    result[i] = prev !== 0 ? prices[i] / prev - 1 : 0;
  }
  return result;
}

// ─── Annualized Volatility (standard deviation of daily returns) ────────────

/**
 * Rolling annualized volatility based on daily log returns.
 */
export function computeVolatility(prices: number[], lookback: number): number[] {
  const result = new Array<number>(prices.length).fill(NaN);
  if (lookback <= 1 || prices.length < lookback + 1) return result;

  // Compute daily log returns
  const logReturns = new Array<number>(prices.length);
  logReturns[0] = 0;
  for (let i = 1; i < prices.length; i++) {
    logReturns[i] = prices[i - 1] > 0 ? Math.log(prices[i] / prices[i - 1]) : 0;
  }

  // Rolling standard deviation
  for (let i = lookback; i < prices.length; i++) {
    const window = logReturns.slice(i - lookback + 1, i + 1);
    const mean = window.reduce((s, v) => s + v, 0) / window.length;
    const variance = window.reduce((s, v) => s + (v - mean) ** 2, 0) / (window.length - 1);
    result[i] = Math.sqrt(variance) * Math.sqrt(252);
  }

  return result;
}

// ─── Current Drawdown from Peak ─────────────────────────────────────────────

/**
 * Returns the fractional drawdown from the running maximum.
 * drawdown[i] = prices[i] / max(prices[0..i]) - 1   (always <= 0)
 */
export function computeDrawdown(prices: number[]): number[] {
  const result = new Array<number>(prices.length);
  let peak = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < prices.length; i++) {
    peak = Math.max(peak, prices[i]);
    result[i] = peak > 0 ? prices[i] / peak - 1 : 0;
  }

  return result;
}

// ─── Average True Range (ATR) ───────────────────────────────────────────────

/**
 * ATR for stop-loss calculations (Engine C).
 * Uses Wilder smoothing.
 *
 * For daily close-only data, approximates True Range as abs(close - prevClose)
 * since we don't have intraday high/low in the standard ProviderPriceSeries.
 */
export function computeATR(closes: number[], period: number = 14): number[] {
  const result = new Array<number>(closes.length).fill(NaN);
  if (period <= 0 || closes.length < period + 1) return result;

  // True range approximation using close-to-close
  const tr = new Array<number>(closes.length);
  tr[0] = 0;
  for (let i = 1; i < closes.length; i++) {
    tr[i] = Math.abs(closes[i] - closes[i - 1]);
  }

  // Initial ATR = simple average of first `period` TRs
  let atr = 0;
  for (let i = 1; i <= period; i++) atr += tr[i];
  atr /= period;
  result[period] = atr;

  // Wilder smoothing
  for (let i = period + 1; i < closes.length; i++) {
    atr = (atr * (period - 1) + tr[i]) / period;
    result[i] = atr;
  }

  return result;
}

// ─── Highest High / Lowest Low ──────────────────────────────────────────────

/** Rolling maximum over the last `lookback` bars (inclusive). */
export function computeHighest(prices: number[], lookback: number): number[] {
  const result = new Array<number>(prices.length).fill(NaN);
  if (lookback <= 0) return result;

  for (let i = lookback - 1; i < prices.length; i++) {
    let max = Number.NEGATIVE_INFINITY;
    for (let j = i - lookback + 1; j <= i; j++) {
      max = Math.max(max, prices[j]);
    }
    result[i] = max;
  }
  return result;
}

/** Rolling minimum over the last `lookback` bars (inclusive). */
export function computeLowest(prices: number[], lookback: number): number[] {
  const result = new Array<number>(prices.length).fill(NaN);
  if (lookback <= 0) return result;

  for (let i = lookback - 1; i < prices.length; i++) {
    let min = Number.POSITIVE_INFINITY;
    for (let j = i - lookback + 1; j <= i; j++) {
      min = Math.min(min, prices[j]);
    }
    result[i] = min;
  }
  return result;
}
