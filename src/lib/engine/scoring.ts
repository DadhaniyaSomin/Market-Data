import type {
  FilterConfig,
  NewsItem,
  StockEvaluation,
  StockMarketSnapshot,
} from '../data/types.ts';
import { DEFAULT_FILTER_CONFIG, evaluateFivePointFilter } from './filters.ts';
import { computeStockIndicators } from './indicators.ts';

export function evaluateUniverse(
  snapshots: StockMarketSnapshot[],
  niftyChangePct: number,
  newsItems: NewsItem[],
  filterConfig: FilterConfig = DEFAULT_FILTER_CONFIG,
): StockEvaluation[] {
  const evaluations: StockEvaluation[] = snapshots.map((snapshot) => {
    const indicators = computeStockIndicators(snapshot, niftyChangePct);
    const matchedNews = newsItems.filter((n) => n.matchedSymbols.includes(snapshot.meta.symbol));

    const { criteria, catalystStatus, direction, disqualificationReasons } =
      evaluateFivePointFilter(snapshot, indicators, matchedNews, filterConfig);

    const totalScore =
      criteria.liquidity.score +
      criteria.volatility.score +
      criteria.restrictions.score +
      criteria.catalyst.score +
      criteria.technical.score;

    const hardFailLiquidity = criteria.liquidity.hardFail;
    const hardFailRestrictions = criteria.restrictions.hardFail;
    const eligibleForShortlist = !hardFailLiquidity && !hardFailRestrictions;

    const candidateTags: StockEvaluation['candidateTags'] = [];
    if (snapshot.changePct >= 1.5) candidateTags.push('TOP_GAINER');
    if (snapshot.changePct <= -1.5) candidateTags.push('TOP_LOSER');
    if (snapshot.volumeRatio >= filterConfig.unusualVolumeMultiplier) candidateTags.push('VOLUME_SHOCKER');
    if (snapshot.gapPct >= 0.75) candidateTags.push('GAP_UP');
    if (snapshot.gapPct <= -0.75) candidateTags.push('GAP_DOWN');

    return {
      snapshot,
      indicators,
      catalystStatus,
      matchedNews: matchedNews.slice(0, 5),
      direction,
      criteria,
      totalScore,
      hardFailLiquidity,
      hardFailRestrictions,
      eligibleForShortlist,
      disqualificationReasons,
      candidateTags,
    };
  });

  // Sort all candidates cleanly by score desc, then RS magnitude desc
  return evaluations.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    return (
      Math.abs(b.indicators.relativeStrengthVsNifty) -
      Math.abs(a.indicators.relativeStrengthVsNifty)
    );
  });
}

export function selectTopShortlist(
  evaluations: StockEvaluation[],
  maxStocks: number,
): StockEvaluation[] {
  const clampedMax = Math.max(3, Math.min(5, Math.round(maxStocks)));
  return evaluations
    .filter((ev) => ev.eligibleForShortlist && ev.direction !== 'NEUTRAL')
    .concat(evaluations.filter((ev) => ev.eligibleForShortlist && ev.direction === 'NEUTRAL'))
    .slice(0, clampedMax);
}
