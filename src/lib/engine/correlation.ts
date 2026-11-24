import type {
  CorrelationMatrixResult,
  CorrelationPairAlert,
  OHLCVBar,
  StockEvaluation,
} from '../data/types.ts';

function toIstDateKey(timestampMs: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(
    new Date(timestampMs),
  );
}

/**
 * Extracts a date-keyed map of daily percentage returns from OHLCV bars.
 */
export function buildDailyReturnMap(bars: OHLCVBar[]): Map<string, number> {
  const returns = new Map<string, number>();
  if (bars.length < 2) return returns;

  const sorted = [...bars].sort((a, b) => a.timestamp - b.timestamp);
  for (let i = 1; i < sorted.length; i++) {
    const prevClose = sorted[i - 1].close;
    const close = sorted[i].close;
    if (prevClose > 0 && Number.isFinite(prevClose) && Number.isFinite(close)) {
      const dateKey = toIstDateKey(sorted[i].timestamp);
      returns.set(dateKey, (close - prevClose) / prevClose);
    }
  }
  return returns;
}

/**
 * Computes Pearson correlation coefficient r in [-1, 1] for two aligned return maps.
 * Returns null if fewer than minOverlap overlapping sessions exist.
 */
export function computePearsonCorrelation(
  returnsA: Map<string, number>,
  returnsB: Map<string, number>,
  minOverlap = 5,
): { r: number | null; overlapCount: number } {
  const xs: number[] = [];
  const ys: number[] = [];

  for (const [dateKey, valA] of returnsA.entries()) {
    const valB = returnsB.get(dateKey);
    if (typeof valB === 'number' && Number.isFinite(valB)) {
      xs.push(valA);
      ys.push(valB);
    }
  }

  const n = xs.length;
  if (n < minOverlap) {
    return { r: null, overlapCount: n };
  }

  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let cov = 0;
  let varX = 0;
  let varY = 0;

  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  const denom = Math.sqrt(varX * varY);
  if (denom === 0) {
    return { r: 0, overlapCount: n };
  }

  const rawR = cov / denom;
  const clamped = Math.max(-1, Math.min(1, rawR));
  return { r: Number(clamped.toFixed(2)), overlapCount: n };
}

/**
 * Computes an N x N daily-return correlation matrix across shortlisted stocks
 * to surface hidden sector or single-regime concentration risk.
 */
export function computeShortlistCorrelationMatrix(
  evaluations: StockEvaluation[],
  highCorrThreshold = 0.7,
): CorrelationMatrixResult | null {
  if (evaluations.length < 2) {
    return null;
  }

  const tickers = evaluations.map((e) => e.snapshot.meta.ticker);
  const sectors = evaluations.map((e) => e.snapshot.meta.sector);
  const returnMaps = evaluations.map((e) => buildDailyReturnMap(e.snapshot.dailyBars));

  const n = evaluations.length;
  const matrix: Array<Array<number | null>> = Array.from({ length: n }, () =>
    Array<number | null>(n).fill(null),
  );

  const offDiagonals: number[] = [];
  const highCorrelationPairs: CorrelationPairAlert[] = [];
  let maxOverlap = 0;

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1.0;
    for (let j = i + 1; j < n; j++) {
      const { r, overlapCount } = computePearsonCorrelation(returnMaps[i], returnMaps[j]);
      if (overlapCount > maxOverlap) maxOverlap = overlapCount;

      matrix[i][j] = r;
      matrix[j][i] = r;

      if (r !== null) {
        offDiagonals.push(r);
        if (Math.abs(r) >= highCorrThreshold) {
          highCorrelationPairs.push({
            tickerA: tickers[i],
            tickerB: tickers[j],
            sectorA: sectors[i],
            sectorB: sectors[j],
            correlation: r,
            sameSector: sectors[i] === sectors[j],
          });
        }
      }
    }
  }

  const avgPairwiseCorrelation =
    offDiagonals.length > 0
      ? Number((offDiagonals.reduce((a, b) => a + b, 0) / offDiagonals.length).toFixed(2))
      : null;

  const sectorGroups = new Map<string, string[]>();
  for (let i = 0; i < n; i++) {
    const list = sectorGroups.get(sectors[i]) ?? [];
    list.push(tickers[i]);
    sectorGroups.set(sectors[i], list);
  }
  const sameSectorClusters = Array.from(sectorGroups.entries())
    .filter(([, list]) => list.length >= 2)
    .map(([sector, list]) => ({ sector, tickers: list }));

  let concentrationLevel: CorrelationMatrixResult['concentrationLevel'] = 'LOW_CONCENTRATION';
  if (
    highCorrelationPairs.length >= 2 ||
    (avgPairwiseCorrelation !== null && avgPairwiseCorrelation >= 0.65) ||
    sameSectorClusters.some((c) => c.tickers.length >= 3)
  ) {
    concentrationLevel = 'HIGH_CONCENTRATION';
  } else if (
    highCorrelationPairs.length === 1 ||
    (avgPairwiseCorrelation !== null && avgPairwiseCorrelation >= 0.45) ||
    sameSectorClusters.length > 0
  ) {
    concentrationLevel = 'MODERATE_OVERLAP';
  }

  let summaryNote = `Well-diversified shortlist across ${n} setups`;
  if (concentrationLevel === 'HIGH_CONCENTRATION') {
    summaryNote =
      'High co-movement detected — consider replacing a correlated pair or splitting risk budget.';
  } else if (concentrationLevel === 'MODERATE_OVERLAP') {
    summaryNote =
      'Moderate sector/regime overlap — monitor combined exposure if both setups trigger simultaneously.';
  }

  return {
    tickers,
    sectors,
    matrix,
    lookbackSessions: maxOverlap,
    avgPairwiseCorrelation,
    highCorrelationPairs,
    sameSectorClusters,
    concentrationLevel,
    summaryNote,
  };
}
