import type {
  DirectionMode,
  FilterConfig,
  NewsItem,
  SectorBreadthItem,
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
  directionMode: DirectionMode = 'BOTH',
): StockEvaluation[] {
  const clampedMax = Math.max(3, Math.min(5, Math.round(maxStocks)));
  const eligible = evaluations.filter((ev) => ev.eligibleForShortlist);

  if (directionMode === 'LONG_ONLY') {
    return eligible
      .filter((ev) => ev.direction === 'LONG')
      .slice(0, clampedMax);
  }

  return eligible
    .filter((ev) => ev.direction !== 'NEUTRAL')
    .concat(eligible.filter((ev) => ev.direction === 'NEUTRAL'))
    .slice(0, clampedMax);
}

export function computeSectorBreadth(evaluations: StockEvaluation[]): SectorBreadthItem[] {
  const map = new Map<string, StockEvaluation[]>();
  for (const ev of evaluations) {
    const sector = ev.snapshot.meta.sector;
    const list = map.get(sector) ?? [];
    list.push(ev);
    map.set(sector, list);
  }

  const breadth: SectorBreadthItem[] = [];
  for (const [sector, items] of map.entries()) {
    const avgChangePct =
      items.reduce((sum, e) => sum + e.snapshot.changePct, 0) / items.length;
    const advancers = items.filter((e) => e.snapshot.changePct > 0).length;
    const decliners = items.filter((e) => e.snapshot.changePct < 0).length;
    const sortedByChg = [...items].sort((a, b) => b.snapshot.changePct - a.snapshot.changePct);
    const leader = sortedByChg[0];

    breadth.push({
      sector,
      avgChangePct: Number(avgChangePct.toFixed(2)),
      advancers,
      decliners,
      total: items.length,
      leaderTicker: leader.snapshot.meta.ticker,
      leaderChangePct: Number(leader.snapshot.changePct.toFixed(2)),
    });
  }

  return breadth.sort((a, b) => b.avgChangePct - a.avgChangePct);
}
