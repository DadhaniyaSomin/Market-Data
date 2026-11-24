import { XMLParser } from 'fast-xml-parser';
import type { NewsItem, UniverseMeta } from './types.ts';

const ALLOWLISTED_RSS_FEEDS = [
  {
    name: 'Economic Times Markets',
    url: 'https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms',
  },
  {
    name: 'LiveMint Markets',
    url: 'https://www.livemint.com/rss/markets',
  },
];

const RESULTS_KEYWORDS = ['q1', 'q2', 'q3', 'q4', 'results', 'earnings', 'profit', 'revenue', 'ebitda', 'dividend', 'margin'];
const SECTOR_KEYWORDS: Record<string, string[]> = {
  Banking: ['rbi', 'banking', 'credit growth', 'psu bank', 'repo rate', 'npa', 'lenders'],
  IT: ['it stocks', 'software', 'nasdaq', 'us tech', 'outsourcing', 'ai deal'],
  Energy: ['oil', 'crude', 'brent', 'ongc', 'refining', 'petchem', 'gas'],
  Auto: ['auto sales', 'ev', 'vehicle', 'suv', 'passenger vehicle'],
  Metals: ['steel', 'metals', 'china stimulus', 'iron ore', 'coal', 'aluminium'],
  Pharma: ['usfda', 'pharma', 'drug', 'fda'],
  Defence: ['defence', 'order win', 'ministry of defence', 'hal', 'bel'],
  Telecom: ['telecom', 'tariff', '5g', 'arpu'],
  Infrastructure: ['infra', 'ports', 'capex', 'order book'],
  FMCG: ['fmcg', 'rural demand', 'monsoon', 'consumer staples'],
  Financials: ['nbfc', 'bajaj', 'lending', 'rbi'],
  Power: ['power', 'thermal', 'renewable', 'electricity'],
  Consumer: ['jewellery', 'gold', 'retail', 'consumer'],
  Retail: ['retail', 'apparel', 'same-store', 'zudio'],
  Diversified: ['adani', 'conglomerate'],
};

function sanitizeHttpUrl(rawUrl: unknown): string {
  if (typeof rawUrl !== 'string') return '';
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    return '';
  }
  return '';
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function textMatchesTerm(haystack: string, term: string): boolean {
  const clean = term.trim().toLowerCase();
  if (!clean) return false;
  if (clean.length <= 4 && /^[a-z0-9&]+$/.test(clean)) {
    const re = new RegExp(`\\b${escapeRegex(clean)}\\b`, 'i');
    return re.test(haystack);
  }
  return haystack.toLowerCase().includes(clean);
}

interface CacheEntry {
  fetchedAt: number;
  items: NewsItem[];
  sourceSummary: string;
}

let newsCache: CacheEntry | null = null;
const NEWS_CACHE_TTL_MS = 5 * 60 * 1000;

export async function fetchMarketRssNews(universe: UniverseMeta[]): Promise<{
  items: NewsItem[];
  sourceSummary: string;
}> {
  if (newsCache && Date.now() - newsCache.fetchedAt < NEWS_CACHE_TTL_MS) {
    return { items: newsCache.items, sourceSummary: newsCache.sourceSummary };
  }

  const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });
  const collected: NewsItem[] = [];
  const activeSources: string[] = [];

  await Promise.all(
    ALLOWLISTED_RSS_FEEDS.map(async (feed) => {
      try {
        const res = await fetch(feed.url, {
          headers: { 'User-Agent': 'PreOpenNSE-Scanner/1.0' },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return;
        const xml = await res.text();
        const parsed = parser.parse(xml);
        const rawItems = parsed?.rss?.channel?.item;
        const list = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
        if (list.length > 0) activeSources.push(feed.name);

        for (const entry of list.slice(0, 40)) {
          const title = typeof entry?.title === 'string' ? entry.title.trim() : '';
          const description = typeof entry?.description === 'string' ? entry.description.trim() : '';
          const link = sanitizeHttpUrl(entry?.link);
          const pubDate = typeof entry?.pubDate === 'string' ? entry.pubDate.trim() : '';
          if (!title) continue;

          const combined = `${title} ${description}`.toLowerCase();
          const matchedSymbols: string[] = [];
          let isSectorNews = false;

          for (const stock of universe) {
            const directMatch =
              textMatchesTerm(combined, stock.ticker) ||
              stock.aliases.some((alias) => textMatchesTerm(combined, alias));

            const sectorTerms = SECTOR_KEYWORDS[stock.sector] ?? [];
            const sectorMatch = sectorTerms.some((kw) => textMatchesTerm(combined, kw));

            if (directMatch) {
              matchedSymbols.push(stock.symbol);
            } else if (sectorMatch) {
              matchedSymbols.push(stock.symbol);
              isSectorNews = true;
            }
          }

          const isResultsNews = RESULTS_KEYWORDS.some((kw) => textMatchesTerm(combined, kw));

          collected.push({
            title,
            link,
            pubDate,
            source: feed.name,
            matchedSymbols,
            isResultsNews,
            isSectorNews,
          });
        }
      } catch {
        // Resilient degradation: skip unreachable feed
      }
    }),
  );

  const sourceSummary =
    activeSources.length > 0 ? activeSources.join(' + ') : 'RSS Feeds Unavailable';

  newsCache = {
    fetchedAt: Date.now(),
    items: collected,
    sourceSummary,
  };

  return { items: collected, sourceSummary };
}
