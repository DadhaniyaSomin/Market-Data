import type {
  CatalystFreshness,
  ComputedIndicators,
  CriterionEvaluation,
  CriterionKey,
  FilterConfig,
  NewsItem,
  StockMarketSnapshot,
  TradeDirection,
} from '../data/types.ts';

export const DEFAULT_FILTER_CONFIG: FilterConfig = {
  minAvgVolume: 1_000_000,
  maxSpreadPct: 0.1,
  minAtrPct: 1.5,
  maxAtrPct: 2.5,
  minPrice: 100,
  minFreeFloatPct: 25,
  unusualVolumeMultiplier: 1.5,
  pricedInMovePct: 3.0,
};

function formatCroresOrLakhs(shares: number): string {
  if (shares >= 10_000_000) return `${(shares / 10_000_000).toFixed(2)} Cr`;
  if (shares >= 100_000) return `${(shares / 100_000).toFixed(2)} L`;
  return Math.round(shares).toLocaleString('en-IN');
}

export function evaluateFivePointFilter(
  snapshot: StockMarketSnapshot,
  indicators: ComputedIndicators,
  matchedNews: NewsItem[],
  config: FilterConfig = DEFAULT_FILTER_CONFIG,
): {
  criteria: Record<CriterionKey, CriterionEvaluation>;
  catalystStatus: CatalystFreshness;
  direction: TradeDirection;
  disqualificationReasons: string[];
} {
  const disqualificationReasons: string[] = [];

  // 1. Liquidity: avg daily volume above threshold, bid-ask spread under 0.1%
  const volPass = snapshot.avgVolume20 >= config.minAvgVolume;
  const spreadKnown = snapshot.bidAskSpreadPct !== null;
  const spreadPass = spreadKnown ? (snapshot.bidAskSpreadPct as number) < config.maxSpreadPct : true;
  const liquidityPass = volPass && spreadPass;
  const liquidityHardFail = !liquidityPass;

  let liquidityScore: 0 | 1 | 2 = 0;
  if (liquidityPass) {
    liquidityScore = snapshot.avgVolume20 >= config.minAvgVolume * 2 ? 2 : 1;
  } else {
    if (!volPass) {
      disqualificationReasons.push(
        `Liquidity hard-fail: 20D avg vol ${formatCroresOrLakhs(snapshot.avgVolume20)} < ${formatCroresOrLakhs(config.minAvgVolume)}`,
      );
    }
    if (!spreadPass) {
      disqualificationReasons.push(
        `Liquidity hard-fail: Bid-ask spread ${(snapshot.bidAskSpreadPct ?? 0).toFixed(3)}% >= ${config.maxSpreadPct}%`,
      );
    }
  }

  const spreadDisplay = spreadKnown
    ? `${(snapshot.bidAskSpreadPct as number).toFixed(3)}%`
    : 'L1 N/A (Yahoo)';

  const liquidity: CriterionEvaluation = {
    key: 'liquidity',
    label: 'Liquidity',
    pass: liquidityPass,
    hardFail: liquidityHardFail,
    score: liquidityScore,
    actualValue: `${formatCroresOrLakhs(snapshot.avgVolume20)} · ${spreadDisplay}`,
    thresholdNote: `Avg Vol >= ${formatCroresOrLakhs(config.minAvgVolume)}, Spread < ${config.maxSpreadPct}%`,
    details: liquidityPass
      ? spreadKnown
        ? `Meets volume and < ${config.maxSpreadPct}% spread threshold.`
        : `Meets volume threshold; L1 bid-ask spread unavailable on Yahoo v8 feed.`
      : 'Fails minimum liquidity or spread requirement.',
  };

  // 2. Volatility: ATR(14) daily between 1.5% and 2.5% of price
  const atrPct = indicators.atr14DailyPct;
  const inSweetSpot = atrPct >= config.minAtrPct && atrPct <= config.maxAtrPct;
  const nearSweetSpot =
    atrPct >= Math.max(0.8, config.minAtrPct - 0.5) && atrPct <= config.maxAtrPct + 0.8;

  let volatilityScore: 0 | 1 | 2 = 0;
  if (inSweetSpot) volatilityScore = 2;
  else if (nearSweetSpot) volatilityScore = 1;

  const volatility: CriterionEvaluation = {
    key: 'volatility',
    label: 'Volatility',
    pass: inSweetSpot,
    hardFail: false,
    score: volatilityScore,
    actualValue: `₹${indicators.atr14Daily.toFixed(2)} (${atrPct.toFixed(2)}%)`,
    thresholdNote: `ATR(14) ${config.minAtrPct.toFixed(1)}%–${config.maxAtrPct.toFixed(1)}%`,
    details: inSweetSpot
      ? 'ATR(14) sits inside optimal intraday volatility band.'
      : atrPct < config.minAtrPct
        ? 'Below target volatility range; narrower intraday expansion expected.'
        : 'Above target volatility range; wider stop loss required.',
  };

  // 3. Restrictions: circuit-band-limited, T2T/BE, low free float, min price
  const circuitLimited = snapshot.meta.circuitBandPct <= 5;
  const t2tRestricted = snapshot.meta.isT2T;
  const lowFreeFloat = snapshot.meta.freeFloatPct < config.minFreeFloatPct;
  const underMinPrice = snapshot.price < config.minPrice;

  const restrictionsPass = !circuitLimited && !t2tRestricted && !lowFreeFloat && !underMinPrice;
  const restrictionsHardFail = !restrictionsPass;

  if (circuitLimited) disqualificationReasons.push('Restriction hard-fail: <= 5% circuit band');
  if (t2tRestricted) disqualificationReasons.push('Restriction hard-fail: T2T / BE segment');
  if (lowFreeFloat)
    disqualificationReasons.push(
      `Restriction hard-fail: Free float ${snapshot.meta.freeFloatPct.toFixed(1)}% < ${config.minFreeFloatPct}%`,
    );
  if (underMinPrice)
    disqualificationReasons.push(
      `Restriction hard-fail: Price ₹${snapshot.price.toFixed(2)} < ₹${config.minPrice}`,
    );

  const restrictionsScore: 0 | 1 | 2 = !restrictionsPass
    ? 0
    : snapshot.meta.freeFloatPct >= 35 && snapshot.meta.circuitBandPct >= 20
      ? 2
      : 1;

  const restrictions: CriterionEvaluation = {
    key: 'restrictions',
    label: 'Restrictions',
    pass: restrictionsPass,
    hardFail: restrictionsHardFail,
    score: restrictionsScore,
    actualValue: `${snapshot.meta.circuitBandPct}% band · FF ${snapshot.meta.freeFloatPct.toFixed(0)}%`,
    thresholdNote: `No T2T, >5% band, FF >= ${config.minFreeFloatPct}%, Price >= ₹${config.minPrice}`,
    details: restrictionsPass
      ? `${snapshot.meta.isFnO ? 'F&O eligible' : 'EQ segment'} · Free float ${snapshot.meta.freeFloatPct.toFixed(1)}%`
      : disqualificationReasons.filter((r) => r.startsWith('Restriction')).join('; '),
  };

  // 4. Catalyst: results today, sector news, or unusual volume (>1.5x 20-day avg)
  const hasUnusualVolume = snapshot.volumeRatio >= config.unusualVolumeMultiplier;
  const hasDirectNews = matchedNews.some((n) => !n.isSectorNews);
  const hasResultsNews = matchedNews.some((n) => n.isResultsNews);
  const hasSectorNews = matchedNews.some((n) => n.isSectorNews);
  const hasAnyCatalyst = hasUnusualVolume || matchedNews.length > 0;
  const alreadyMovedOver3 = Math.abs(snapshot.changePct) > config.pricedInMovePct;

  let catalystStatus: CatalystFreshness = 'NONE';
  if (hasAnyCatalyst) {
    catalystStatus = alreadyMovedOver3 ? 'PRICED_IN' : 'FRESH';
  }

  let catalystScore: 0 | 1 | 2 = 0;
  if (catalystStatus === 'FRESH' && (hasUnusualVolume || hasDirectNews || hasResultsNews)) {
    catalystScore = 2;
  } else if (catalystStatus === 'FRESH' && hasSectorNews) {
    catalystScore = 1;
  } else if (catalystStatus === 'PRICED_IN') {
    catalystScore = 1;
  } else if (snapshot.volumeRatio >= 1.2) {
    catalystScore = 1;
  }

  const catalystLabelParts: string[] = [];
  if (hasResultsNews) catalystLabelParts.push('Results');
  else if (hasDirectNews) catalystLabelParts.push('Company News');
  else if (hasSectorNews) catalystLabelParts.push('Sector News');
  if (hasUnusualVolume) catalystLabelParts.push(`Vol ${snapshot.volumeRatio.toFixed(2)}x`);
  if (catalystLabelParts.length === 0) catalystLabelParts.push(`Vol ${snapshot.volumeRatio.toFixed(2)}x`);

  const catalyst: CriterionEvaluation = {
    key: 'catalyst',
    label: 'Catalyst',
    pass: catalystStatus === 'FRESH',
    hardFail: false,
    score: catalystScore,
    actualValue: `${catalystStatus === 'NONE' ? 'None' : catalystStatus === 'FRESH' ? 'Fresh' : 'Priced In'} · ${catalystLabelParts.join(' + ')}`,
    thresholdNote: `News/Results or Vol > ${config.unusualVolumeMultiplier}x; <= ${config.pricedInMovePct}% move`,
    details:
      catalystStatus === 'FRESH'
        ? `Fresh driver (${catalystLabelParts.join(', ')}) with ${snapshot.changePct.toFixed(2)}% move.`
        : catalystStatus === 'PRICED_IN'
          ? `Move already exceeds ${config.pricedInMovePct}% (${snapshot.changePct.toFixed(2)}%); marked priced in.`
          : 'No RSS news match or >1.5x volume surge detected.',
  };

  // 5. Technical setup: Price vs VWAP, ORB (15m high/low), Relative Strength vs Nifty
  const price = snapshot.price;
  const vwap = indicators.vwap;
  const orbHigh = indicators.orbHigh;
  const orbLow = indicators.orbLow;
  const rs = indicators.relativeStrengthVsNifty;

  let bullishVotes = 0;
  let bearishVotes = 0;
  const techNotes: string[] = [];

  if (vwap !== null) {
    if (price > vwap) {
      bullishVotes++;
      techNotes.push(`>VWAP (₹${vwap.toFixed(1)})`);
    } else if (price < vwap) {
      bearishVotes++;
      techNotes.push(`<VWAP (₹${vwap.toFixed(1)})`);
    }
  } else {
    techNotes.push('VWAP N/A');
  }

  if (orbHigh !== null && orbLow !== null) {
    if (price > orbHigh) {
      bullishVotes++;
      techNotes.push(`>ORB High (₹${orbHigh.toFixed(1)})`);
    } else if (price < orbLow) {
      bearishVotes++;
      techNotes.push(`<ORB Low (₹${orbLow.toFixed(1)})`);
    } else {
      techNotes.push('Inside 15m ORB');
    }
  }

  if (rs > 0.25) {
    bullishVotes++;
    techNotes.push(`RS +${rs.toFixed(2)}%`);
  } else if (rs < -0.25) {
    bearishVotes++;
    techNotes.push(`RS ${rs.toFixed(2)}%`);
  } else {
    techNotes.push(`RS ${rs >= 0 ? '+' : ''}${rs.toFixed(2)}%`);
  }

  let direction: TradeDirection = 'NEUTRAL';
  if (bullishVotes > bearishVotes && bullishVotes >= 2) direction = 'LONG';
  else if (bearishVotes > bullishVotes && bearishVotes >= 2) direction = 'SHORT';
  else if (rs > 0.3 && (vwap === null || price >= vwap)) direction = 'LONG';
  else if (rs < -0.3 && (vwap === null || price <= vwap)) direction = 'SHORT';

  const maxAligned = Math.max(bullishVotes, bearishVotes);
  let technicalScore: 0 | 1 | 2 = 0;
  if (maxAligned === 3) technicalScore = 2;
  else if (maxAligned === 2) technicalScore = 1;

  const technical: CriterionEvaluation = {
    key: 'technical',
    label: 'Technical Setup',
    pass: maxAligned >= 2,
    hardFail: false,
    score: technicalScore,
    actualValue: techNotes.join(' · '),
    thresholdNote: 'VWAP + 15m ORB Breakout + RS vs Nifty alignment',
    details:
      maxAligned === 3
        ? `Strong ${direction} alignment across VWAP, 15m ORB, and Relative Strength.`
        : maxAligned === 2
          ? `Partial ${direction} confirmation (2 of 3 technical signals aligned).`
          : 'Mixed intraday structure without clear VWAP/ORB confirmation.',
  };

  return {
    criteria: {
      liquidity,
      volatility,
      restrictions,
      catalyst,
      technical,
    },
    catalystStatus,
    direction,
    disqualificationReasons,
  };
}
