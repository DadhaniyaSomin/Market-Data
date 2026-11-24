import type { CapitalConfig, PositionSizing, StockEvaluation } from '../data/types.ts';

export const DEFAULT_CAPITAL_CONFIG: CapitalConfig = {
  totalCapital: 500_000,
  riskPerTradePct: 1.0,
  maxStocks: 4,
  directionMode: 'BOTH',
};

export function roundToTick(price: number, tick = 0.05): number {
  return Math.round(price / tick) * tick;
}

/**
 * Computes deterministic intraday position sizing:
 * - risk_amount = capital * risk_pct
 * - stop_loss = entry +/- max(1x ATR(15-min), 0.30x Daily ATR(14), 0.5% min logical buffer)
 *               OR beyond the 15-min opening range (if >= 0.5% away and tighter than the ATR stop)
 * - risk_per_share = |entry - stop_loss|
 * - target = entry +/- 2 * risk_per_share (1:2 R:R)
 * - quantity = floor(risk_amount / risk_per_share)
 * - Cap capital per stock at (capital / number_of_stocks) * 1.5 and reduce quantity if exceeded.
 */
export function computePositionSizing(
  evaluation: StockEvaluation,
  capitalConfig: CapitalConfig,
  shortlistCount: number,
): PositionSizing {
  const { snapshot, indicators } = evaluation;
  const direction: 'LONG' | 'SHORT' =
    evaluation.direction === 'SHORT' ? 'SHORT' : 'LONG';

  // Use indicative pre-open price if available, otherwise current/last session price
  const rawEntry =
    snapshot.preOpenAvailable && snapshot.preOpenIndicativePrice !== null
      ? snapshot.preOpenIndicativePrice
      : snapshot.price;
  const entry = roundToTick(rawEntry);

  // A logical intraday stop must survive normal 15m noise:
  // at least 1x ATR(15m), 0.30x Daily ATR(14), and 0.5% of price
  const minLogicalRisk = roundToTick(Math.max(entry * 0.005, 0.25));
  const atrRiskDist = roundToTick(
    Math.max(indicators.atr14_15m, indicators.atr14Daily * 0.30, minLogicalRisk),
  );
  const usingAtr15mDirectly =
    indicators.atr14_15m >= indicators.atr14Daily * 0.30 && indicators.atr14_15m >= minLogicalRisk;

  let stopLoss: number;
  let stopLossMethod: string;

  if (direction === 'LONG') {
    const atrStop = roundToTick(entry - atrRiskDist);
    const orbStop =
      indicators.orbLow !== null && indicators.orbLow - 0.05 <= entry - minLogicalRisk
        ? roundToTick(indicators.orbLow - 0.05)
        : null;

    if (orbStop !== null && orbStop > atrStop) {
      stopLoss = orbStop;
      stopLossMethod = '15m ORB Low (tighter logical stop)';
    } else {
      stopLoss = atrStop;
      stopLossMethod = usingAtr15mDirectly
        ? '1x ATR(15-min)'
        : '0.3x Daily ATR / 0.5% floor';
    }
  } else {
    const atrStop = roundToTick(entry + atrRiskDist);
    const orbStop =
      indicators.orbHigh !== null && indicators.orbHigh + 0.05 >= entry + minLogicalRisk
        ? roundToTick(indicators.orbHigh + 0.05)
        : null;

    if (orbStop !== null && orbStop < atrStop) {
      stopLoss = orbStop;
      stopLossMethod = '15m ORB High (tighter logical stop)';
    } else {
      stopLoss = atrStop;
      stopLossMethod = usingAtr15mDirectly
        ? '1x ATR(15-min)'
        : '0.3x Daily ATR / 0.5% floor';
    }
  }

  const riskPerShare = Math.max(0.05, Number(Math.abs(entry - stopLoss).toFixed(2)));
  const target = roundToTick(
    direction === 'LONG' ? entry + 2 * riskPerShare : entry - 2 * riskPerShare,
  );

  const capital = Math.max(0, capitalConfig.totalCapital);
  const riskPct = Math.max(0.1, capitalConfig.riskPerTradePct) / 100;
  const numStocks = Math.max(1, shortlistCount || capitalConfig.maxStocks);

  const rawRiskAmount = capital * riskPct;
  const rawQuantity = Math.max(0, Math.floor(rawRiskAmount / riskPerShare));

  const maxCapitalPerStock = (capital / numStocks) * 1.5;
  let quantity = rawQuantity;
  let capitalCapped = false;

  if (entry > 0 && quantity * entry > maxCapitalPerStock) {
    quantity = Math.max(0, Math.floor(maxCapitalPerStock / entry));
    capitalCapped = true;
  }

  const capitalUsed = Number((quantity * entry).toFixed(2));
  const plannedRisk = Number((quantity * riskPerShare).toFixed(2));

  // Approximate Indian equity intraday (MIS) statutory & brokerage charges
  const buyValue = capitalUsed;
  const sellValue = Number((quantity * target).toFixed(2));
  const turnover = buyValue + sellValue;

  const brokeragePerOrder = Math.min(20, buyValue * 0.0003);
  const brokerage = quantity > 0 ? Number((brokeragePerOrder * 2).toFixed(2)) : 0;
  const stt = Number((sellValue * 0.00025).toFixed(2)); // 0.025% on sell side intraday
  const exchangeTxn = Number((turnover * 0.0000297).toFixed(2)); // NSE ~0.00297%
  const sebi = Number((turnover * 0.000001).toFixed(2)); // ₹10/crore
  const stampDuty = Number((buyValue * 0.00003).toFixed(2)); // 0.003% buy side intraday
  const gst = Number(((brokerage + exchangeTxn + sebi) * 0.18).toFixed(2));
  const estimatedCharges = Number(
    (brokerage + stt + exchangeTxn + sebi + stampDuty + gst).toFixed(2),
  );

  return {
    direction,
    entry: Number(entry.toFixed(2)),
    stopLoss: Number(stopLoss.toFixed(2)),
    stopLossMethod,
    target: Number(target.toFixed(2)),
    riskPerShare,
    rawRiskAmount: Number(rawRiskAmount.toFixed(2)),
    rawQuantity,
    maxCapitalPerStock: Number(maxCapitalPerStock.toFixed(2)),
    capitalCapped,
    quantity,
    plannedRisk,
    capitalUsed,
    estimatedCharges,
    chargesBreakdown: {
      brokerage,
      stt,
      exchangeTxn,
      sebi,
      stampDuty,
      gst,
    },
  };
}
