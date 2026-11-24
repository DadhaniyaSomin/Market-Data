import type { MarketSessionPhase, SessionClockInfo } from '../data/types.ts';

/**
 * Evaluates current Indian Standard Time (Asia/Kolkata) against NSE session windows:
 * - 09:00 - 09:08 IST: Pre-open order collection
 * - 09:08 - 09:12 IST: Pre-open price discovery / matching
 * - 09:12 - 09:15 IST: Pre-open to normal market transition
 * - 09:15 - 15:30 IST: Continuous market session (Mon-Fri)
 * - Outside 09:00-15:30 IST or Sat/Sun: Market closed (shows last session)
 */
export function getIstSessionInfo(now: Date = new Date()): SessionClockInfo {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekday = get('weekday');
  const hour = Number(get('hour'));
  const minute = Number(get('minute'));
  const second = get('second');
  const day = get('day');
  const month = get('month');
  const year = get('year');

  const istTimeDisplay = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${second} IST`;
  const istDateDisplay = `${weekday}, ${day} ${month} ${year}`;
  const isWeekend = weekday === 'Sat' || weekday === 'Sun';
  const totalMinutes = hour * 60 + minute;

  let phase: MarketSessionPhase = 'MARKET_CLOSED';
  let label = 'Market Closed';
  let sessionNote = 'NSE is currently closed. Showing data from the most recent completed trading session.';

  if (!isWeekend) {
    if (totalMinutes >= 9 * 60 && totalMinutes < 9 * 60 + 8) {
      phase = 'PRE_OPEN_COLLECTION';
      label = 'Pre-Open Order Collection (09:00–09:08)';
      sessionNote =
        'Order entry and modification window is active. Indicative equilibrium prices update continuously until 09:08 IST.';
    } else if (totalMinutes >= 9 * 60 + 8 && totalMinutes < 9 * 60 + 12) {
      phase = 'PRE_OPEN_DISCOVERY';
      label = 'Pre-Open Price Discovery (09:08–09:12)';
      sessionNote =
        'Order matching and indicative opening price discovery window. No new order modifications permitted.';
    } else if (totalMinutes >= 9 * 60 + 12 && totalMinutes < 9 * 60 + 15) {
      phase = 'PRE_OPEN_TRANSITION';
      label = 'Pre-Open Transition (09:12–09:15)';
      sessionNote = 'Transitioning from pre-open equilibrium matching to normal continuous market open at 09:15 IST.';
    } else if (totalMinutes >= 9 * 60 + 15 && totalMinutes <= 15 * 60 + 30) {
      phase = 'MARKET_OPEN';
      label = 'Live Market Session (09:15–15:30)';
      sessionNote = 'NSE continuous equity trading session is active.';
    }
  }

  return {
    phase,
    label,
    istTimeDisplay,
    istDateDisplay,
    isMarketClosed: phase === 'MARKET_CLOSED',
    isPreOpenWindow:
      phase === 'PRE_OPEN_COLLECTION' ||
      phase === 'PRE_OPEN_DISCOVERY' ||
      phase === 'PRE_OPEN_TRANSITION',
    sessionNote,
  };
}
